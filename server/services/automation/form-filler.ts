import type { Page, Frame } from "playwright";
import { env } from "../../lib/env.js";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { getArtifact } from "../storage/artifact-storage.js";
import { answerQuestion, type AnswerContext } from "../application/qa-generator.js";
import { effectiveFullName, profileSummary, type CandidateProfile } from "../profile/candidate-profile.js";
import type { ApplicationPackage } from "../application/application-package.js";
import { completeText, hasProvider } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";

// Browser automation form-filler — a TypeScript re-implementation of
// Job_applying_agent/apply/{form_utils,base_handler,*_handler}.py using
// playwright-node. Playwright is imported lazily so the server boots (and unit
// tests run) without the browser stack installed; if it's unavailable the filler
// returns ASSISTED_REQUIRED rather than crashing.
//
// SAFETY MODEL (preserved from the Python engine):
//  - CAPTCHA / login / account-creation / OTP are hard stops — never bypassed.
//  - Submission is gated by AUTO_SUBMIT (default false). With it off the form is
//    filled and left for the user to review + submit ("prepare, user submits").

const SHORT_TIMEOUT = 2500;

const CAPTCHA_SIGNALS = ["recaptcha", "hcaptcha", "g-recaptcha", "cf-turnstile", "captcha"];
const LOGIN_SIGNALS = ["sign in", "log in", "login", "signin"];
const ACCOUNT_SIGNALS = ["create account", "sign up", "signup", "register", "create an account"];
const OTP_SIGNALS = ["one-time", "one time code", "verification code", "otp", "verify your email", "verify your phone"];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Submit application")',
  'button:has-text("Submit Application")',
  'button:has-text("Submit")',
  'button:has-text("Apply")',
  "#submit_app",
];
const SUCCESS_SIGNALS = [
  "thank you", "application submitted", "successfully submitted",
  "received your application", "we have received", "thanks for applying",
];
export type FillBlocker = "captcha" | "login" | "account_creation" | "otp";
export type FillStatus = "submitted" | "needs_user_action" | "assisted_required" | "failed";
// Fine-grained outcome code → maps deterministically to an ApplicationStatus.
export type FillCode =
  | "submitted"
  | "captcha"
  | "login"
  | "account_creation"
  | "otp"
  | "question"
  | "form_filled"
  | "no_submit_button"
  | "no_confirmation"
  | "unavailable"
  | "error";

// Post-fill audit of the form: how many controls exist, how many are filled, and
// which REQUIRED ones are still blank. Drives the "only Submit remains" verdict.
export interface Coverage {
  total: number;
  filled: number;
  requiredTotal: number;
  requiredFilled: number;
  blanks: Array<{ label: string; kind: string }>;
}

export interface FillResult {
  status: FillStatus;
  code: FillCode;
  reason: string;
  blocker?: FillBlocker;
  filledFields: string[];
  submitted: boolean;
  coverage?: Coverage;
}

async function safeFill(page: Page | Frame, selector: string, value: string): Promise<boolean> {
  if (!value) return false;
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: SHORT_TIMEOUT });
    await loc.fill(value);
    return true;
  } catch {
    return false;
  }
}

async function pageText(page: Page): Promise<string> {
  try {
    return ((await page.content()) || "").toLowerCase();
  } catch {
    return "";
  }
}

async function hasApplicationForm(page: Page): Promise<boolean> {
  try {
    if ((await page.locator('input[type="file"]').count()) > 0) return true;
    if (
      (await page
        .locator('input[name*="email"], input[type="email"], input[name="name"], input[name*="first_name"]')
        .count()) > 0
    )
      return true;
  } catch {
    /* ignore */
  }
  return false;
}

// True if ANY frame (top or iframe) currently exposes fillable controls.
async function anyFormPresent(page: Page): Promise<boolean> {
  return (await countFillable(await formFrame(page))) > 0;
}

// Close any open dropdown/autocomplete overlay (e.g. a country combobox) that
// would otherwise obscure other fields and block subsequent fills.
async function dismissOverlays(page: Page): Promise<void> {
  try {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  } catch {
    /* ignore */
  }
}

// Many stored apply URLs are the job POSTING page (description + an "Apply"
// button), not the form itself. If no form is present on load, follow/click an
// apply action to reach the real form before we detect blockers or fill.
async function ensureOnForm(page: Page): Promise<void> {
  if (await anyFormPresent(page)) return;

  // Prefer following an explicit apply link (avoids new-tab/popup issues).
  try {
    const href = await page
      .locator('a[href*="job_app"], a[href*="greenhouse.io/embed"], a[href*="/apply"], a[href*="boards.greenhouse"]')
      .first()
      .getAttribute("href", { timeout: 2000 })
      .catch(() => null);
    if (href) {
      const abs = new URL(href, page.url()).toString();
      await page.goto(abs, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(1200);
      if (await anyFormPresent(page)) return;
    }
  } catch {
    /* fall through to clicking */
  }

  // Otherwise click an in-page "Apply" button and re-check.
  const APPLY_SELECTORS = [
    'a:has-text("Apply for this role")', 'button:has-text("Apply for this role")',
    'a:has-text("Apply now")', 'button:has-text("Apply now")',
    'a:has-text("Apply")', 'button:has-text("Apply")',
  ];
  for (const sel of APPLY_SELECTORS) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) === 0) continue;
      await el.click({ timeout: 4000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      if (await anyFormPresent(page)) return;
    } catch {
      /* try next selector */
    }
  }
}

// ─── Control model ───────────────────────────────────────────────────────────
// We scrape EVERY interactive control (not just text inputs): text/textarea,
// <select>, radio groups, checkboxes, and custom comboboxes (react-select etc.).
// Each carries its human label, current filled-state, and (for selects/radios)
// its options — so the resolver can fill by meaning regardless of vendor markup.

type ControlKind = "text" | "textarea" | "select" | "radio" | "checkbox" | "combobox";

interface ControlOption {
  jp?: string; // data-jp of the individual radio input (radio options only)
  text: string; // visible option / choice label
  value: string; // underlying value attribute
}

interface Control {
  id: string; // data-jp id of the element (radio: the group's first input)
  domId: string; // the element's stable id attribute ("" if none) — used for
  // comboboxes, whose input node react replaces on selection (dropping data-jp).
  kind: ControlKind;
  label: string;
  required: boolean;
  inputType: string; // raw type (email/tel/url/text/number/checkbox/select/…)
  filled: boolean; // already has a value / a checked option
  options: ControlOption[]; // select & radio choices; [] otherwise
}

// Count fillable controls in a frame (used to find which frame holds the form).
async function countFillable(ctx: Page | Frame): Promise<number> {
  return ctx
    .evaluate(() => document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select",
    ).length)
    .catch(() => 0);
}

// The form often lives in a cross-origin iframe (e.g. Greenhouse embedded in a
// company's /apply page). Pick the frame (main or child) with the most fillable
// controls — that's where the application form actually is.
async function formFrame(page: Page): Promise<Page | Frame> {
  let best: Page | Frame = page;
  let bestCount = await countFillable(page);
  for (const fr of page.frames()) {
    if (fr === page.mainFrame()) continue;
    const c = await countFillable(fr);
    if (c > bestCount) { bestCount = c; best = fr; }
  }
  return best;
}

// Wait until some frame exposes form fields (iframe forms load async).
async function waitForFormFrame(page: Page, timeoutMs = 12_000): Promise<Page | Frame> {
  const deadline = Date.now() + timeoutMs;
  let ctx: Page | Frame = page;
  // Date.now is fine here (runtime), not a workflow script.
  while (Date.now() < deadline) {
    ctx = await formFrame(page);
    if ((await countFillable(ctx)) > 0) return ctx;
    await page.waitForTimeout(500);
  }
  return ctx;
}

// Scrape EVERY interactive control (text/textarea/select/radio/checkbox/combobox)
// with its human label, options, required flag and current filled-state. Tags each
// element (and each radio option) with a stable data-jp id so the resolver can act
// on it later. Runs inside the form frame.
async function scrapeControls(ctx: Page | Frame): Promise<Control[]> {
  // tsx/esbuild `keepNames` wraps the inner named functions in the callback below
  // in __name() calls; that helper isn't defined in the page realm, which throws
  // "__name is not defined". Define a no-op __name on the page first via a STRING
  // eval (strings aren't instrumented), so the serialized callback's bare __name
  // references resolve to it.
  await ctx.evaluate("window.__name = window.__name || function (x) { return x; };").catch(() => {});
  return ctx.evaluate(() => {
    let i = 0;
    const tag = (el: Element): string => {
      let id = el.getAttribute("data-jp");
      if (!id) {
        id = "jp_" + i++;
        el.setAttribute("data-jp", id);
      }
      return id;
    };
    const esc = (s: string): string => {
      const C = (window as unknown as { CSS?: { escape(x: string): string } }).CSS;
      return C && C.escape ? C.escape(s) : s;
    };
    const clean = (s: string): string => (s || "").replace(/\s+/g, " ").trim();
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const st = window.getComputedStyle(el as HTMLElement);
      return st.display !== "none" && st.visibility !== "hidden" && r.width > 1 && r.height > 1;
    };
    const labelOf = (el: Element): string => {
      let t = "";
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${esc(id)}"]`);
        if (l) t = (l as HTMLElement).innerText;
      }
      if (!t) {
        const lb = el.getAttribute("aria-labelledby");
        if (lb) t = lb.split(/\s+/).map((x) => document.getElementById(x)?.innerText ?? "").join(" ");
      }
      if (!t) {
        // Climb ancestors looking for a label/legend that isn't wrapping ANOTHER
        // field. Greenhouse renders the label as an "outside-label" sibling several
        // levels up from the react-select input, so one closest() isn't enough.
        let node: Element | null = el;
        for (let d = 0; d < 6 && !t; d++) {
          node = node.parentElement;
          if (!node) break;
          const l = node.querySelector("label,legend");
          if (l && !l.contains(el)) t = (l as HTMLElement).innerText;
        }
      }
      if (!t) t = el.getAttribute("aria-label") || "";
      if (!t) t = el.getAttribute("placeholder") || "";
      if (!t) t = el.getAttribute("name") || "";
      return clean(t).slice(0, 180);
    };
    const optLabelOf = (el: Element): string => {
      let t = "";
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${esc(id)}"]`);
        if (l) t = (l as HTMLElement).innerText;
      }
      if (!t) {
        const p = el.parentElement;
        if (p && p.tagName === "LABEL") t = (p as HTMLElement).innerText;
      }
      if (!t) t = el.getAttribute("aria-label") || (el as HTMLInputElement).value || "";
      return clean(t).slice(0, 120);
    };
    // A react-select shows its current selection as a `single-value`/`multi-value`
    // node and CLEARS the search input — so input.value is empty even when chosen.
    const comboFilled = (el: Element): boolean => {
      // Climb to the react-select CONTROL/SHELL (NOT the inner input-container,
      // which sits beside the single-value node, not above it).
      const cont = el.closest('.select-shell,[class*="select__control"]');
      if (cont && cont.querySelector('.select__single-value,[class*="singleValue"],.select__multi-value,[class*="multiValue"]')) return true;
      return ((el as HTMLInputElement).value || "").trim() !== "";
    };
    // Greenhouse (and most ATS) mark required fields with a trailing "*" in the
    // visible label; the native `required` attr lives on a hidden phantom input we
    // skip, so fall back to the asterisk marker.
    const isReq = (el: Element, label: string): boolean =>
      (el as HTMLInputElement).required || /\*/.test(label);

    const out: Control[] = [];

    // 1) Radio groups (collapse same-name radios into one logical control).
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    const groups: Record<string, HTMLInputElement[]> = {};
    for (const r of radios) {
      const key = r.name || "__" + tag(r);
      (groups[key] ||= []).push(r);
    }
    for (const els of Object.values(groups)) {
      const first = els[0]!;
      let glabel = "";
      const fs = first.closest("fieldset");
      if (fs) {
        const lg = fs.querySelector("legend");
        if (lg) glabel = clean((lg as HTMLElement).innerText);
      }
      if (!glabel) {
        const lb = first.getAttribute("aria-labelledby");
        if (lb) glabel = clean(lb.split(/\s+/).map((x) => document.getElementById(x)?.innerText ?? "").join(" "));
      }
      if (!glabel) {
        const w = first.closest("div,section,li");
        const l = w?.querySelector("label,legend");
        if (l) glabel = clean((l as HTMLElement).innerText);
      }
      out.push({
        id: tag(first),
        domId: first.getAttribute("id") || "",
        kind: "radio",
        label: glabel.slice(0, 180),
        required: els.some((r) => r.required) || /\*/.test(glabel),
        inputType: "radio",
        filled: els.some((r) => r.checked),
        options: els.map((r) => ({ jp: tag(r), text: optLabelOf(r), value: r.value })),
      });
    }

    // 2) Native selects.
    for (const s of Array.from(document.querySelectorAll("select")) as HTMLSelectElement[]) {
      if (!visible(s)) continue;
      const slabel = labelOf(s);
      const opts = Array.from(s.options)
        .map((o) => ({ text: clean(o.text), value: o.value }))
        .filter((o) => o.text);
      out.push({
        id: tag(s),
        domId: s.getAttribute("id") || "",
        kind: "select",
        label: slabel,
        required: isReq(s, slabel),
        inputType: "select",
        filled: s.selectedIndex > 0 && s.value !== "",
        options: opts,
      });
    }

    // 3) Text-like inputs, textareas, checkboxes, and custom comboboxes.
    const fields = Array.from(document.querySelectorAll("input, textarea")) as HTMLElement[];
    for (const el of fields) {
      const tagName = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || tagName).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "file", "radio"].includes(type)) continue;
      const cls = el.getAttribute("class") || "";
      const nm = el.getAttribute("name") || "";
      // Skip non-fillable companions: react-select's hidden `requiredInput` phantom
      // (type="input"), the intl-tel-input country search box, and the reCAPTCHA
      // textarea. Filling these would mis-fire or leave a phantom "required blank".
      if (type === "input" || /requiredInput/.test(cls)) continue;
      if (/iti__search|iti__tel-input/.test(cls) && type !== "tel") continue;
      if (/recaptcha/i.test(cls) || /recaptcha/i.test(nm)) continue;
      if (!visible(el)) continue;
      const label = labelOf(el);
      if (type === "checkbox") {
        out.push({
          id: tag(el),
          domId: el.getAttribute("id") || "",
          kind: "checkbox",
          label,
          required: isReq(el, label),
          inputType: "checkbox",
          filled: (el as HTMLInputElement).checked,
          options: [],
        });
        continue;
      }
      const role = el.getAttribute("role");
      const isCombo =
        role === "combobox" ||
        !!el.getAttribute("aria-autocomplete") ||
        el.getAttribute("aria-haspopup") === "listbox" ||
        !!el.closest('[class*="select__"]') || // react-select (Greenhouse)
        !!el.closest('[class*="-Select"],[class*="Select-"]');
      out.push({
        id: tag(el),
        domId: el.getAttribute("id") || "",
        kind: isCombo ? "combobox" : tagName === "textarea" ? "textarea" : "text",
        label,
        required: isReq(el, label),
        inputType: type,
        filled: isCombo ? comboFilled(el) : ((el as HTMLInputElement).value || "").trim() !== "",
        options: [],
      });
    }
    return out;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Field-resolution engine. Every control is resolved by MEANING and applied with
// a widget-appropriate action so NOTHING is left blank. The resolution ladder is
// the same one `qa-generator.answerQuestion` runs:
//   • Personal / professional / education / links → deterministic profile match.
//   • Same question reworded                      → semantic match on stored
//                                                    custom answers (embeddings).
//   • Immigration / work-authorization            → grounded ONLY from profile
//                                                    facts (never invented).
//   • Open-ended ("why this company", "describe…") → AI answer using JD + profile.
//   • Demographic / EEO                           → "Decline to self-identify"
//                                                    option (filled, never asserted).
// This module scrapes the controls, asks that ladder per field, and maps the
// answer onto text / select / radio / checkbox / combobox widgets.

// Deterministic label→profile-value mapping for identity/contact text fields. Pure
// regex on the human label (vendor-agnostic) — these fill the SAME way every run,
// no LLM lottery. The reliability backbone for the most common fields.
const LABEL_CONCEPTS: Array<{ re: RegExp; key: keyof CandidateProfile | "fullName" }> = [
  { re: /\bfirst name\b|\bgiven name\b|\bforename\b/i, key: "firstName" },
  { re: /\blast name\b|\bsurname\b|\bfamily name\b/i, key: "lastName" },
  { re: /\bfull name\b|\blegal name\b|^name\b/i, key: "fullName" },
  { re: /e-?mail/i, key: "email" },
  { re: /\bphone\b|\bmobile\b|\bcell\b|telephone/i, key: "phone" },
  { re: /\bcity\b|\btown\b|where.*reside|city and state|location \(city\)|^location\b/i, key: "location" },
  { re: /current.*(employer|company)|present employer/i, key: "currentCompany" },
  { re: /current.*(title|role|position)|\bjob title\b/i, key: "currentTitle" },
  { re: /\bschool\b|university|college/i, key: "schoolName" },
  { re: /\bdegree\b/i, key: "highestDegree" },
  { re: /\bmajor\b|field of study/i, key: "major" },
  { re: /graduat/i, key: "graduationYear" },
  { re: /linkedin/i, key: "linkedinUrl" },
  { re: /github/i, key: "githubUrl" },
  { re: /portfolio|personal website|\bwebsite\b/i, key: "portfolioUrl" },
];

function profileVal(p: CandidateProfile, key: keyof CandidateProfile | "fullName"): string | null {
  if (key === "fullName") return effectiveFullName(p);
  const v = p[key];
  return v == null || v === "" ? null : String(v);
}

const CONSENT_LABEL = /agree|consent|terms|privacy|acknowledge|certify|i confirm|gdpr|opt.?in|authorize.*(contact|process)/i;
const EEO_LABEL = /gender|sex\b|\brace\b|ethnic|hispanic|latino|veteran|military|disab/i;

// The candidate's OWN voluntary self-identification value for a demographic field,
// or null if they didn't provide it. Used only to fill what the user explicitly set
// (never to invent a demographic). Checked most-specific-first to avoid overlap.
function eeoValue(label: string, p: CandidateProfile): string | null {
  const q = label.toLowerCase();
  if (/disab/.test(q)) return p.disabilityStatus;
  if (/veteran|military/.test(q)) return p.veteranStatus;
  // "Are you Hispanic/Latino?" is a yes/no derived from race, not the raw race
  // string ("Asian" → "No"). A full race/ethnicity dropdown gets the value itself.
  if (/hispanic|latino/.test(q)) {
    if (!p.raceEthnicity) return null;
    return /hispanic|latino/i.test(p.raceEthnicity) ? "Yes" : "No";
  }
  if (/\brace\b|ethnic/.test(q)) return p.raceEthnicity;
  if (/gender|\bsex\b/.test(q)) return p.gender;
  return null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Levenshtein-ratio similarity (mirrors qa-generator's fuzzy matcher).
function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  return 1 - dp[m]![n]! / Math.max(m, n);
}

const DECLINE_RE = /decline|prefer not|do not wish|don.?t wish|choose not|not.*(identify|disclose|answer)/i;
const PLACEHOLDER_RE = /^(select|choose|please|--|-$)/i;
// Negative/safe answers — preferred for an unresolved required option field so the
// testing last-resort never asserts a false affirmative (e.g. "Yes, employed here").
const NEGATIVE_RE = /^(no|none|never|n\/a|not |i (do not|don.?t|have not|haven.?t|am not))\b/i;

// Match a resolved string answer to the closest option TEXT (handles yes/no,
// exact, substring, fuzzy). Skips placeholder options ("Select…"). Returns the
// matched option text, or null if nothing is close enough.
function matchOptionText(value: string, texts: string[]): string | null {
  const v = norm(value);
  if (!v) return null;
  const cands = texts.filter((t) => t && !PLACEHOLDER_RE.test(t.trim()) && norm(t) !== "");
  const yes = /^(yes|y|true)$/.test(v);
  const no = /^(no|n|false)$/.test(v);
  let best: string | null = null;
  let score = 0;
  for (const t0 of cands) {
    const t = norm(t0);
    if (t === v) return t0;
    if (yes && /^yes\b/.test(t)) return t0;
    if (no && /^no\b/.test(t)) return t0;
    const s = t.includes(v) || v.includes(t) ? 0.85 : similarity(v, t);
    if (s > score) { score = s; best = t0; }
  }
  return score >= 0.62 ? best : null;
}

function mapOption(value: string, options: ControlOption[]): ControlOption | null {
  const text = matchOptionText(value, options.map((o) => o.text));
  return text ? options.find((o) => o.text === text) ?? null : null;
}

// "Decline to self-identify" / "Prefer not to say" option, if the field offers one.
function declineOption(options: ControlOption[]): ControlOption | null {
  return options.find((o) => DECLINE_RE.test(o.text)) ?? null;
}

// Option-constrained LLM pick: when a select/radio/combobox answer can't be derived
// from profile facts or fuzzy-matched, let the model pick the single best option
// FROM THE REAL LIST (it can only choose what the form offers — no free text).
async function chooseOptionLLM(
  label: string,
  options: string[],
  profile: CandidateProfile,
  hint?: string | null,
): Promise<string | null> {
  const opts = options.filter((o) => o && !PLACEHOLDER_RE.test(o.trim()));
  if (!opts.length || !hasProvider(TASK_MODEL.questionAnswer.provider)) return null;
  const prompt = [
    "Choose the SINGLE best option that answers this job-application field for the candidate.",
    `FIELD: ${label}`,
    ...(hint ? [`CANDIDATE'S ANSWER/VALUE: ${hint} (map it to the closest option — e.g. "United States" → "US")`] : []),
    "OPTIONS:",
    ...opts.map((o, i) => `${i + 1}. ${o}`),
    "",
    `CANDIDATE:\n${profileSummary(profile)}`,
    "",
    "Reply with ONLY the exact text of the chosen option (copy it verbatim). If none truly apply, reply NONE.",
  ].join("\n");
  try {
    const { text } = await completeText({
      ...TASK_MODEL.questionAnswer,
      maxTokens: 60,
      messages: [{ role: "user", content: prompt }],
    });
    const ans = text.trim();
    if (!ans || /^none\b/i.test(ans)) return null;
    return matchOptionText(ans, opts) ?? null;
  } catch {
    return null;
  }
}

// ── Widget apply helpers (each returns whether the value stuck) ───────────────
async function applyText(ctx: Page | Frame, jp: string, value: string): Promise<boolean> {
  const loc = ctx.locator(`[data-jp="${jp}"]`).first();
  try { await loc.fill(value, { timeout: SHORT_TIMEOUT }); return true; } catch { return false; }
}

async function applySelect(ctx: Page | Frame, jp: string, opt: ControlOption): Promise<boolean> {
  const loc = ctx.locator(`[data-jp="${jp}"]`).first();
  if (opt.value) {
    const ok = await loc.selectOption({ value: opt.value }).then(() => true).catch(() => false);
    if (ok) return true;
  }
  return loc.selectOption({ label: opt.text }).then(() => true).catch(() => false);
}

async function applyRadio(ctx: Page | Frame, opt: ControlOption): Promise<boolean> {
  if (!opt.jp) return false;
  const loc = ctx.locator(`[data-jp="${opt.jp}"]`).first();
  return loc.check({ force: true, timeout: SHORT_TIMEOUT }).then(() => true).catch(() => false);
}

async function applyCheckbox(ctx: Page | Frame, jp: string, on: boolean): Promise<boolean> {
  const loc = ctx.locator(`[data-jp="${jp}"]`).first();
  const act = on ? loc.check({ force: true, timeout: SHORT_TIMEOUT }) : loc.uncheck({ force: true, timeout: SHORT_TIMEOUT });
  return act.then(() => true).catch(() => false);
}

// react-select option selector. Role-based queries (getByRole "option") came back
// empty inside the form's cross-origin iframe, so we target the option CLASS and
// explicitly exclude the intl-tel-input country list (which also uses role=option).
const OPTION_SEL =
  '.select__option, [class*="select__option"], [role="option"]:not(.iti__country):not([class*="iti__"])';

// Read the currently-rendered listbox option texts (menu must be open). Polls
// since the menu mounts asynchronously after focus/typing.
async function readMenuOptions(ctx: Page | Frame): Promise<string[]> {
  const loc = ctx.locator(OPTION_SEL);
  for (let attempt = 0; attempt < 5; attempt++) {
    const n = await loc.count().catch(() => 0);
    if (n > 0) {
      const out: string[] = [];
      const lim = Math.min(n, 80);
      for (let i = 0; i < lim; i++) {
        const t = await loc.nth(i).innerText().catch(() => "");
        if (t) out.push(t.replace(/\s+/g, " ").trim());
      }
      if (out.length) return out;
    }
    await ctx.waitForTimeout(300);
  }
  return [];
}

// Click the open menu's option whose text matches `target` (exact first, then
// substring). Returns whether a click happened.
async function clickMenuOption(ctx: Page | Frame, target: string): Promise<boolean> {
  const loc = ctx.locator(OPTION_SEL);
  const n = Math.min(await loc.count().catch(() => 0), 80);
  let fallback = -1;
  for (let i = 0; i < n; i++) {
    const t = (await loc.nth(i).innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (t === target) { await loc.nth(i).click({ timeout: SHORT_TIMEOUT }).catch(() => {}); return true; }
    if (fallback < 0 && (t.includes(target) || target.includes(t))) fallback = i;
  }
  if (fallback >= 0) { await loc.nth(fallback).click({ timeout: SHORT_TIMEOUT }).catch(() => {}); return true; }
  return false;
}

// Locate a control's input by its STABLE DOM id when available — react-select
// replaces the input node (and its data-jp) when a value is selected, so data-jp
// can't be relied on after interaction.
function controlLocator(ctx: Page | Frame, c: Control) {
  return c.domId
    ? ctx.locator(`[id="${c.domId.replace(/"/g, '\\"')}"]`).first()
    : ctx.locator(`[data-jp="${c.id}"]`).first();
}

// Whether the react-select widget now shows a selection (truth for "filled").
async function comboHasValue(ctx: Page | Frame, c: Control): Promise<boolean> {
  return controlLocator(ctx, c)
    .evaluate((el) => {
      const cont = el.closest('.select-shell,[class*="select__control"]');
      if (cont && cont.querySelector('.select__single-value,[class*="singleValue"],.select__multi-value,[class*="multiValue"]')) return true;
      return ((el as HTMLInputElement).value || "").trim() !== "";
    })
    .catch(() => false);
}

// Drive a custom combobox (react-select etc.) by MEANING:
//   1. open the menu and read its real options;
//   2. for big lists (country) type to filter, then re-read;
//   3. pick the decline option (EEO), else fuzzy-match the desired value, else let
//      the model choose from the real options;
//   4. click the chosen option (keyboard fallback).
async function fillCombobox(
  ctx: Page | Frame,
  c: Control,
  desired: string | null,
  declineWanted: boolean,
  profile: CandidateProfile,
): Promise<boolean> {
  const loc = controlLocator(ctx, c);
  // Open the menu by clicking the react-select CONTROL container — clicking the
  // 1px search input does NOT open the listbox on newer Greenhouse (job-boards),
  // so options never render. The container reliably toggles the menu open.
  const control = loc.locator("xpath=ancestor-or-self::*[contains(@class,'select__control')][1]");
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    if ((await control.count().catch(() => 0)) > 0) await control.first().click({ timeout: SHORT_TIMEOUT });
    else await loc.click({ timeout: SHORT_TIMEOUT });
  } catch {
    return false;
  }
  await ctx.waitForTimeout(450);
  let options = await readMenuOptions(ctx);

  // Large/empty lists: type the desired term to filter, then re-read. If the
  // filter yields NOTHING (e.g. a curated static list that labels the US as "US",
  // not "United States"), clear it and restore the full list so we can still pick.
  if ((options.length === 0 || options.length > 25) && desired && !declineWanted) {
    await loc.fill("").catch(() => {});
    await loc.type(desired, { delay: 15 }).catch(() => {});
    await ctx.waitForTimeout(550);
    const filtered = await readMenuOptions(ctx);
    if (filtered.length) {
      options = filtered;
    } else {
      await loc.fill("").catch(() => {});
      await ctx.waitForTimeout(350);
      const restored = await readMenuOptions(ctx);
      if (restored.length) options = restored;
    }
  }

  let target: string | null = null;
  if (declineWanted) target = options.find((o) => DECLINE_RE.test(o)) ?? null;
  if (!target && desired) target = matchOptionText(desired, options);
  // Constrained model pick from the REAL options (handles synonyms/abbreviations
  // the fuzzy matcher misses, e.g. "United States" → "US", verbose yes/no answers).
  if (!target && !declineWanted && options.length) target = await chooseOptionLLM(c.label, options, profile, desired);
  // TESTING last-resort (config.qa.answerAll): for a required option field the
  // model couldn't resolve (e.g. an unknowable yes/no), pick the first real option
  // so nothing is left blank while validating the pipeline. PROD leaves it for the
  // user. See update_0.1.0.md backlog (Q&A thresholds).
  if (!target && !declineWanted && config.qa.answerAll && c.required && options.length) {
    const real = options.filter((o) => !PLACEHOLDER_RE.test(o.trim()));
    target = real.find((o) => NEGATIVE_RE.test(o.trim())) ?? real[0] ?? null;
  }

  if (target) {
    await clickMenuOption(ctx, target);
  } else if (desired && !declineWanted) {
    // last resort: commit the first/highlighted suggestion
    await loc.press("ArrowDown").catch(() => {});
    await loc.press("Enter").catch(() => {});
  }

  await ctx.waitForTimeout(250);
  const ok = await comboHasValue(ctx, c);
  // ALWAYS close the menu (multi-selects and filtered lists stay open after a pick)
  // so it can't overlay and block the next field. Escape keeps committed values.
  await controlLocator(ctx, c).press("Escape").catch(() => {});
  return ok;
}

// STEP 2 — deterministic identity/contact text fill (pure regex, zero LLM).
async function deterministicFill(ctx: Page | Frame, controls: Control[], profile: CandidateProfile): Promise<string[]> {
  const filled: string[] = [];
  for (const c of controls) {
    if (c.filled || c.kind !== "text" || !c.label) continue;
    const concept = LABEL_CONCEPTS.find((x) => x.re.test(c.label));
    if (!concept) continue;
    const val = profileVal(profile, concept.key);
    if (!val) continue;
    if (await applyText(ctx, c.id, val)) filled.push(c.label);
  }
  return filled;
}

interface Blank {
  label: string;
  required: boolean;
  reason: string;
  kind: ControlKind;
}

// STEP 3 — resolve every still-empty control by meaning and apply per widget type.
async function fillControls(
  ctx: Page | Frame,
  controls: Control[],
  profile: CandidateProfile,
  qa: AnswerContext,
): Promise<{ filled: string[]; blanks: Blank[] }> {
  const filled: string[] = [];
  const blanks: Blank[] = [];

  for (const c of controls) {
    if (c.filled) continue;

    // Consent / agreement checkboxes: tick them (TESTING — answerAll). A single
    // unlabeled checkbox in a form is almost always a consent/agree box.
    if (c.kind === "checkbox") {
      if (CONSENT_LABEL.test(c.label) || (config.qa.answerAll && c.required) || (config.qa.answerAll && !c.label)) {
        if (await applyCheckbox(ctx, c.id, true)) { filled.push(c.label || "consent"); continue; }
      }
      if (c.required) blanks.push({ label: c.label || c.id, required: true, reason: "unconfirmed checkbox", kind: c.kind });
      continue;
    }

    if (!c.label) {
      if (c.required) blanks.push({ label: c.id, required: true, reason: "no detectable label", kind: c.kind });
      continue;
    }

    const res = await answerQuestion(c.label, profile, qa);
    let value = !res.needsUserAction && res.answer ? res.answer.trim() : "";
    const isOption = c.kind === "select" || c.kind === "radio" || c.kind === "combobox";
    const isEeo = EEO_LABEL.test(c.label);

    // Demographic / EEO option fields. POLICY: voluntary, so we use the candidate's
    // OWN provided self-identification if they set it (the right answer they chose),
    // and ONLY fall back to "Decline to self-identify" when they left it blank — we
    // never invent a demographic. The provided value flows into the normal option
    // fill below (matched/LLM-mapped to the form's exact options across vendors).
    if (!value && isOption && (res.isSensitive || isEeo)) {
      const provided = isEeo ? eeoValue(c.label, profile) : null;
      if (provided) {
        value = provided;
      } else {
        let ok = false;
        if (c.kind === "combobox") ok = await fillCombobox(ctx, c, null, true, profile);
        else {
          const dec = declineOption(c.options);
          if (dec) ok = c.kind === "radio" ? await applyRadio(ctx, dec) : await applySelect(ctx, c.id, dec);
        }
        if (ok) { filled.push(c.label + " (declined)"); continue; }
        // Voluntary (rarely required) — leave blank rather than guess.
        if (c.required) blanks.push({ label: c.label, required: true, reason: "no decline option", kind: c.kind });
        continue;
      }
    }

    // Option fields with no grounded answer (and not sensitive): let the model pick
    // from the REAL options so nothing is left blank during testing.
    if (!value && (c.kind === "select" || c.kind === "radio") && c.options.length) {
      value = (await chooseOptionLLM(c.label, c.options.map((o) => o.text), profile)) ?? "";
      // TESTING last-resort: prefer a negative/safe option for a required field
      // (never a blind affirmative). See fillCombobox.
      if (!value && config.qa.answerAll && c.required) {
        const real = c.options.map((o) => o.text).filter((t) => !PLACEHOLDER_RE.test(t.trim()));
        value = real.find((t) => NEGATIVE_RE.test(t.trim())) ?? real[0] ?? "";
      }
    }

    if (!value && c.kind === "combobox") {
      // No grounded value but the combobox may still offer a sensible pick.
      const ok = await fillCombobox(ctx, c, null, false, profile);
      if (ok) { filled.push(c.label); continue; }
    }

    if (!value) {
      if (c.required) blanks.push({ label: c.label, required: true, reason: res.reason || "no value", kind: c.kind });
      continue;
    }

    let ok = false;
    switch (c.kind) {
      case "text":
      case "textarea":
        ok = await applyText(ctx, c.id, value);
        break;
      case "combobox":
        ok = await fillCombobox(ctx, c, value, false, profile);
        break;
      case "select": {
        const opt = mapOption(value, c.options);
        if (opt) ok = await applySelect(ctx, c.id, opt);
        break;
      }
      case "radio": {
        const opt = mapOption(value, c.options);
        if (opt) ok = await applyRadio(ctx, opt);
        break;
      }
    }
    if (ok) filled.push(c.label);
    else if (c.required) blanks.push({ label: c.label, required: true, reason: `could not apply "${value}"`, kind: c.kind });
  }
  return { filled, blanks };
}

// Re-scrape and audit the form: total/filled counts and which REQUIRED controls
// are still blank. This is the source of truth for "only Submit remains".
async function computeCoverage(ctx: Page | Frame): Promise<Coverage> {
  const controls = (await scrapeControls(ctx)).filter((c) => c.label || c.required);
  const requiredTotal = controls.filter((c) => c.required).length;
  const requiredFilled = controls.filter((c) => c.required && c.filled).length;
  const blanks = controls
    .filter((c) => c.required && !c.filled)
    .map((c) => ({ label: c.label || c.id, kind: c.kind }));
  return {
    total: controls.length,
    filled: controls.filter((c) => c.filled).length,
    requiredTotal,
    requiredFilled,
    blanks,
  };
}

async function detectBlocker(page: Page): Promise<FillBlocker | null> {
  const html = await pageText(page);
  if (CAPTCHA_SIGNALS.some((s) => html.includes(s))) return "captcha";
  try {
    if (
      (await page
        .locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="captcha"]')
        .count()) > 0
    )
      return "captcha";
  } catch {
    /* ignore */
  }
  const hasForm = await hasApplicationForm(page);
  let passwordCount = 0;
  try {
    passwordCount = await page.locator('input[type="password"]').count();
  } catch {
    /* ignore */
  }
  // A real login/signup wall has password field(s). We must NOT treat the words
  // "sign in"/"log in" sitting in a site header/footer nav as a wall — almost
  // every careers site has such a link, which previously caused false "login
  // blocker" bails on pages that actually had (or could reach) an apply form.
  if (passwordCount >= 2) return "account_creation"; // password + confirm = signup
  if (passwordCount === 1) return "login";
  // Keyword-only login/account detection is intentionally dropped (too broad).
  // OTP only when there's no application form to fill (real OTP gates have no form).
  if (!hasForm && OTP_SIGNALS.some((s) => html.includes(s))) return "otp";
  return null;
}

async function uploadResume(page: Page | Frame, pkg: ApplicationPackage): Promise<boolean> {
  if (!pkg.resume.storageKey) return false;
  const bytes = await getArtifact(pkg.resume.storageKey);
  if (!bytes) return false;
  const file = {
    name: pkg.resume.filename ?? "resume.docx",
    mimeType: pkg.resume.mimeType ?? "application/octet-stream",
    buffer: bytes,
  };
  for (const selector of [
    'input[type="file"][name*="resume"]',
    'input[type="file"][name*="cv"]',
    'input[type="file"][id*="resume"]',
    'input[type="file"]',
  ]) {
    try {
      const loc = page.locator(selector).first();
      await loc.waitFor({ state: "attached", timeout: SHORT_TIMEOUT });
      await loc.setInputFiles(file);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function confirmSubmission(page: Page): Promise<boolean> {
  const html = await pageText(page);
  if (SUCCESS_SIGNALS.some((s) => html.includes(s))) return true;
  try {
    const url = (page.url() || "").toLowerCase();
    if (["thank", "confirm", "success", "submitted"].some((t) => url.includes(t))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Drive a browser to fill (and optionally submit) an application form using a
 * prepared ApplicationPackage. Returns a structured result; never throws on the
 * automation path. Requires Playwright browsers installed in the runtime.
 */
export async function fillApplication(args: {
  pkg: ApplicationPackage;
  profile: CandidateProfile;
  ctx: AnswerContext;
}): Promise<FillResult> {
  const { pkg, profile, ctx } = args;
  if (!pkg.applyUrl) {
    return { status: "failed", code: "error", reason: "No apply URL", filledFields: [], submitted: false };
  }

  // Assisted mode (default, supported in production): we deliberately do NOT
  // launch a headless browser. The prepared autofill package (standard fields +
  // selectors), tailored resume, and answers are ready for the user (or a future
  // browser extension) to submit in one assisted step. This keeps the prod image
  // small and Cloud Run memory low. Set AUTOMATION_MODE=auto to enable headless
  // Playwright form-filling (requires Chromium in the runtime image).
  if (config.automation.mode !== "auto") {
    return {
      status: "assisted_required",
      code: "unavailable",
      reason: "Assisted mode: your application is prepared — open the apply link and submit using the autofill package (resume + answers ready).",
      filledFields: [],
      submitted: false,
    };
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return {
      status: "assisted_required",
      code: "unavailable",
      reason: "Playwright is not available in this runtime; manual application required.",
      filledFields: [],
      submitted: false,
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: !config.automation.headed });
  } catch (err) {
    logger.warn({ err: String(err) }, "Playwright browser launch failed (browsers not installed?)");
    return {
      status: "assisted_required",
      code: "unavailable",
      reason: "Browser could not launch (browsers not installed); manual application required.",
      filledFields: [],
      submitted: false,
    };
  }

  const filled: string[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(pkg.applyUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // If we landed on a posting page, navigate to the actual application form.
    await ensureOnForm(page);

    const blocker = await detectBlocker(page);
    if (blocker) {
      return {
        status: "needs_user_action",
        code: blocker,
        reason: `Blocker detected: ${blocker}. Cannot proceed automatically.`,
        blocker,
        filledFields: filled,
        submitted: false,
      };
    }

    await page.bringToFront().catch(() => {}); // focus the window (multi-desktop reliability)

    // Resolve the frame that actually holds the form (the form is often inside a
    // cross-origin iframe, e.g. Greenhouse embedded in a company's /apply page —
    // operating on the top frame alone would fill nothing). All fill steps below
    // run against this frame.
    let formCtx = await waitForFormFrame(page);

    // The form often lives in an ATS child-iframe (e.g. Stripe embeds Greenhouse).
    // Some hosts render that iframe COLLAPSED — the fields exist in the DOM (text
    // `.fill()` still works) but the react-select widgets aren't laid out, so their
    // menus never open and option/dropdown fields can't be filled. Promote the
    // embed to a TOP-LEVEL navigation so every widget is fully interactive.
    if (typeof (formCtx as Frame).parentFrame === "function" && (formCtx as Frame).parentFrame()) {
      const embedUrl = (formCtx as Frame).url();
      if (/^https?:/.test(embedUrl) && /greenhouse|lever|ashby|workable|job_app|embed|boards/i.test(embedUrl)) {
        try {
          await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await page.waitForTimeout(1500);
          await page.bringToFront().catch(() => {});
        } catch {
          /* keep the iframe context if the promotion navigation fails */
        }
        formCtx = await waitForFormFrame(page);
      }
    }

    // STEP 1 — stable per-ATS selectors (cheap fast path for classic forms).
    for (const field of pkg.standardFields) {
      if (!field.value) continue;
      for (const selector of field.selectors) {
        if (await safeFill(formCtx, selector, field.value)) {
          if (!filled.includes(field.key)) filled.push(field.key);
          break;
        }
      }
    }

    // STEP 2 — DETERMINISTIC identity/contact text fill (pure regex, no LLM): the
    // reliability backbone — these fill the SAME way every run. Scrape first so we
    // see what STEP 1 already filled.
    let controls = (await scrapeControls(formCtx)).filter((c) => c.label || c.required);
    const detFilled = await deterministicFill(formCtx, controls, profile);
    for (const k of detFilled) if (!filled.includes(k)) filled.push(k);
    await dismissOverlays(page);

    // STEP 3 — resolve EVERY remaining control by meaning and apply per widget type
    // (text/select/radio/checkbox/combobox). Re-scrape EACH pass: answering a field
    // can REVEAL conditional follow-ups (e.g. "Are you Hispanic/Latino?" unhides
    // "Please identify your race"). Loop until a pass fills nothing new (max 4).
    let blanks: Blank[] = [];
    for (let pass = 0; pass < 4; pass++) {
      controls = (await scrapeControls(formCtx)).filter((c) => c.label || c.required);
      if (controls.every((c) => c.filled)) break;
      const r = await fillControls(formCtx, controls, profile, ctx);
      for (const k of r.filled) if (!filled.includes(k)) filled.push(k);
      blanks = r.blanks; // last pass's unresolved set is the real remainder
      await dismissOverlays(page);
      if (r.filled.length === 0) break; // no progress → stop (no new conditional fields)
    }

    await uploadResume(formCtx, pkg);

    // VERIFY — re-scrape and confirm coverage (especially required fields).
    const coverage = await computeCoverage(formCtx);
    logger.info(
      { fillsApplied: filled.length, ...coverage, unresolvedRequired: blanks.length },
      "auto-fill coverage",
    );

    if (!env.AUTO_SUBMIT) {
      const allRequiredDone = coverage.requiredFilled >= coverage.requiredTotal;
      const reason = allRequiredDone
        ? `All ${coverage.requiredTotal} required field(s) filled (${coverage.filled}/${coverage.total} total). ` +
          "Only Submit remains — review + click Submit in your browser."
        : `Filled ${coverage.filled}/${coverage.total} fields; ${coverage.blanks.length} required field(s) still need input: ` +
          coverage.blanks.map((b) => b.label).slice(0, 8).join("; ") +
          (coverage.blanks.length > 8 ? " …" : "") +
          ".";
      return {
        status: "needs_user_action",
        code: "form_filled",
        reason,
        filledFields: filled,
        submitted: false,
        coverage,
      };
    }

    let clicked = false;
    for (const selector of SUBMIT_SELECTORS) {
      try {
        const loc = page.locator(selector).first();
        await loc.waitFor({ state: "visible", timeout: SHORT_TIMEOUT });
        await loc.click();
        clicked = true;
        break;
      } catch {
        continue;
      }
    }
    if (!clicked) {
      return { status: "failed", code: "no_submit_button", reason: "Could not locate a submit button", filledFields: filled, submitted: false };
    }
    try {
      await page.waitForLoadState("networkidle", { timeout: 20_000 });
    } catch {
      /* ignore */
    }
    if (await confirmSubmission(page)) {
      return { status: "submitted", code: "submitted", reason: "Application submitted", filledFields: filled, submitted: true };
    }
    return { status: "failed", code: "no_confirmation", reason: "Submit clicked but no confirmation detected", filledFields: filled, submitted: false };
  } catch (err) {
    return { status: "failed", code: "error", reason: `Automation error: ${String(err)}`, filledFields: filled, submitted: false };
  } finally {
    // In headed/testing mode leave the window OPEN so the user can see the filled
    // form (it's purely visual — Greenhouse doesn't persist fields until submit, so
    // a closed window or a freshly-opened tab both look empty). Closed normally in
    // headless/prod. The user closes the inspection window manually.
    if (config.automation.headed) {
      logger.info("Headed mode: leaving the filled browser window open for review (close it manually).");
    } else {
      await browser.close().catch(() => {});
    }
  }
}
