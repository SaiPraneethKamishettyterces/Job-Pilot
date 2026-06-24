// Autofill V2 — DOM fill engine (browser extension).
//
// A DOM port of the server-side resolution ladder in
// server/services/automation/form-filler.ts (the golden Greenhouse reference).
// Runs in the user's authenticated tab, so it works on login-gated portals the
// server cannot reach. PRIMARY RULES, enforced here:
//   - NEVER auto-submit. Fill, then the user reviews + clicks Submit.
//   - NEVER fill EEO/demographic fields; NEVER fabricate sensitive answers.
//   - Hard stop on CAPTCHA / login / account-creation / OTP.
//
// Dependency-free except for shared wire types.

import type {
  WireApplicationPackage,
  FillReport,
} from "../../../shared/autofill/package-types.js";

export interface AnswerFn {
  // Resolve a free-text/question label to an answer via the server QA endpoint
  // (which keeps all the never-fabricate + sensitive-escalation guardrails).
  (label: string): Promise<{ answer: string | null; needsUserAction: boolean; isSensitive: boolean; confidence: number }>;
}

type Kind = "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "unknown";

interface Control {
  el: HTMLElement;
  kind: Kind;
  label: string;
  required: boolean;
  filled: boolean;
}

const MAX_LOOPS = 4; // re-scrape for conditional fields that unhide after a fill.

// ── React-compatible value setting ───────────────────────────────────────────
// React tracks the input's value via a descriptor; setting el.value directly is
// ignored on re-render. Use the native setter, then dispatch input+change so
// React (Greenhouse new UI, Workday, Ashby) registers the change.
function reactSet(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

// ── Label derivation (priority mirrors the server scraper) ───────────────────
function deriveLabel(el: HTMLElement): string {
  const id = el.getAttribute("id");
  if (id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (lbl?.textContent?.trim()) return clean(lbl.textContent);
  }
  const aria = el.getAttribute("aria-labelledby");
  if (aria) {
    const txt = aria
      .split(/\s+/)
      .map((x) => document.getElementById(x)?.textContent ?? "")
      .join(" ")
      .trim();
    if (txt) return clean(txt);
  }
  const wrap = el.closest("label, fieldset");
  if (wrap?.textContent?.trim()) return clean(wrap.textContent);
  return clean(
    el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("name") ||
      "",
  );
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\*+$/, "").trim();
}

// ── Sensitive / EEO policy (mirror server SENSITIVE_PATTERNS + EEO_KEYS) ──────
const EEO_PATTERNS = [/gender/i, /\brace\b/i, /ethnic/i, /veteran/i, /disab/i, /hispanic|latino/i, /sexual orientation/i];
const SENSITIVE_PATTERNS = [
  /sponsor/i, /visa/i, /work authoriz/i, /criminal|felony|conviction/i, /salary|compensation expectation/i,
  /social security|ssn/i, /date of birth|dob/i, /citizen/i,
];

function isEeo(label: string): boolean {
  return EEO_PATTERNS.some((re) => re.test(label));
}
function isSensitive(label: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(label));
}

// ── Deterministic identity/contact fill by label concept ─────────────────────
// Mirrors LABEL_CONCEPTS in form-filler.ts — the reliable, no-LLM backbone.
const LABEL_CONCEPTS: Array<{ re: RegExp; key: string }> = [
  { re: /first name|given name/i, key: "firstName" },
  { re: /last name|surname|family name/i, key: "lastName" },
  { re: /full name|^name$|your name/i, key: "effectiveFullName" },
  { re: /preferred name/i, key: "firstName" },
  { re: /e-?mail/i, key: "email" },
  { re: /phone|mobile|telephone/i, key: "phone" },
  { re: /linkedin/i, key: "linkedinUrl" },
  { re: /github/i, key: "githubUrl" },
  { re: /portfolio/i, key: "portfolioUrl" },
  { re: /website|personal site/i, key: "websiteUrl" },
  { re: /current (company|employer)|company name/i, key: "currentCompany" },
  { re: /current (title|role|position)/i, key: "currentTitle" },
  { re: /city|location/i, key: "location" },
];

function profileValue(pkg: WireApplicationPackage, key: string): string | null {
  const v = pkg.profile[key];
  return typeof v === "string" && v.trim() ? v.trim() : v != null ? String(v) : null;
}

// ── Control scraping ─────────────────────────────────────────────────────────
function scrape(root: ParentNode): Control[] {
  const out: Control[] = [];
  const els = root.querySelectorAll<HTMLElement>("input, textarea, select");
  els.forEach((el) => {
    if (!(el as HTMLElement).offsetParent && el.getAttribute("type") !== "hidden") {
      // skip not-rendered, but keep going for selects which can lack offsetParent
    }
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "hidden") return;
    let kind: Kind = "unknown";
    if (tag === "textarea") kind = "textarea";
    else if (tag === "select") kind = "select";
    else if (type === "radio") kind = "radio";
    else if (type === "checkbox") kind = "checkbox";
    else if (type === "file") kind = "file";
    else kind = "text";

    const input = el as HTMLInputElement;
    const filled =
      kind === "select"
        ? (el as HTMLSelectElement).selectedIndex > 0
        : kind === "radio" || kind === "checkbox"
          ? input.checked
          : Boolean(input.value && input.value.trim());

    out.push({
      el,
      kind,
      label: deriveLabel(el),
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      filled,
    });
  });
  return out;
}

// ── Blocker detection (hard stops, never bypassed) ───────────────────────────
function detectBlocker(): FillReport["blocker"] {
  const html = document.documentElement.innerHTML.toLowerCase();
  if (/recaptcha|hcaptcha|g-recaptcha|cf-turnstile/.test(html)) return "captcha";
  const pw = document.querySelectorAll('input[type="password"]');
  if (pw.length >= 2) return "account_creation";
  if (pw.length === 1) return "login";
  if (/one-time code|verification code|verify your email|verify your phone|\botp\b/.test(html) && scrape(document).length < 3) {
    return "otp";
  }
  return null;
}

// ── Apply helpers ─────────────────────────────────────────────────────────────
function applyText(el: HTMLElement, value: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    reactSet(el, value);
    return true;
  }
  return false;
}

function applySelect(el: HTMLSelectElement, value: string): boolean {
  const want = norm(value);
  for (const opt of Array.from(el.options)) {
    if (norm(opt.textContent || "") === want || norm(opt.value) === want || norm(opt.textContent || "").includes(want)) {
      el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  return false;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Try a list of CSS selectors against root; return the first visible element.
function firstBySelectors(root: ParentNode, selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector<HTMLElement>(sel);
      if (el) return el;
    } catch {
      /* invalid selector — skip */
    }
  }
  return null;
}

export interface EngineOptions {
  pkg: WireApplicationPackage;
  answer: AnswerFn;
  root?: ParentNode; // defaults to document; Workday adapter may pass a step root.
}

// ── Main: fill the current form. Returns a report. NEVER submits. ────────────
export async function fillForm(opts: EngineOptions): Promise<FillReport> {
  const { pkg, answer } = opts;
  const root = opts.root ?? document;
  const report: FillReport = {
    adapterId: pkg.adapterId,
    filledCount: 0,
    filledLabels: [],
    blanks: [],
    needsReview: [],
    blocker: null,
    submitted: false,
    stepsAdvanced: 0,
  };

  const blocker = detectBlocker();
  if (blocker) {
    report.blocker = blocker;
    return report; // hard stop — surface to the user, never bypass.
  }

  const markFilled = (label: string) => {
    report.filledCount++;
    report.filledLabels.push(label);
  };

  // STEP 1 — stable per-ATS selectors from the package (cheap, deterministic).
  for (const f of pkg.standardFields) {
    if (!f.value) continue;
    if (isEeo(f.label)) continue; // policy: never fill EEO.
    const el = firstBySelectors(root, f.selectors);
    if (el && !controlFilled(el)) {
      if (el instanceof HTMLSelectElement ? applySelect(el, f.value) : applyText(el, f.value)) {
        markFilled(f.label);
      }
    }
  }

  // STEP 2 + 3 — re-loop: deterministic label fill, then QA for the rest.
  for (let pass = 0; pass < MAX_LOOPS; pass++) {
    const before = report.filledCount;
    const controls = scrape(root).filter((c) => !c.filled && c.kind !== "file");

    for (const c of controls) {
      if (!c.label) continue;

      // POLICY: never auto-fill EEO; surface for the user to handle.
      if (isEeo(c.label)) {
        pushReview(report, c.label, "eeo");
        continue;
      }

      // STEP 2 — deterministic identity/contact fill (no LLM).
      const concept = LABEL_CONCEPTS.find((x) => x.re.test(c.label));
      if (concept && (c.kind === "text" || c.kind === "textarea")) {
        const val = profileValue(pkg, concept.key);
        if (val && applyText(c.el, val)) {
          markFilled(c.label);
          continue;
        }
      }

      // STEP 3 — semantic / question answering via the server (guardrailed).
      if (c.kind === "text" || c.kind === "textarea" || c.kind === "select") {
        const res = await answer(c.label);
        if (res.isSensitive || res.needsUserAction || (res.answer && res.confidence < 0.75)) {
          pushReview(report, c.label, res.isSensitive ? "sensitive" : "low_confidence");
          continue;
        }
        if (res.answer) {
          const ok = c.kind === "select" ? applySelect(c.el as HTMLSelectElement, res.answer) : applyText(c.el, res.answer);
          if (ok) markFilled(c.label);
        }
      }
    }

    if (report.filledCount === before) break; // no progress → stop looping.
  }

  // Coverage: required controls still blank.
  for (const c of scrape(root)) {
    if (c.required && !c.filled && c.kind !== "file") {
      report.blanks.push({ label: c.label, kind: c.kind });
    }
  }

  // NOTE: we deliberately do NOT locate or click any submit button. The user
  // reviews the filled form and submits. This is a primary, non-negotiable rule.
  return report;
}

function controlFilled(el: HTMLElement): boolean {
  if (el instanceof HTMLSelectElement) return el.selectedIndex > 0;
  if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) return el.checked;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return Boolean(el.value?.trim());
  return false;
}

function pushReview(report: FillReport, label: string, reason: FillReport["needsReview"][number]["reason"]): void {
  if (!report.needsReview.some((r) => r.label === label)) report.needsReview.push({ label, reason });
}

export const __test = { deriveLabel, isEeo, isSensitive, norm, scrape, detectBlocker };
