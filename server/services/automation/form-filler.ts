import type { Page } from "playwright";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { getArtifact } from "../storage/artifact-storage.js";
import { answerQuestion, type AnswerContext } from "../application/qa-generator.js";
import type { CandidateProfile } from "../profile/candidate-profile.js";
import type { ApplicationPackage } from "../application/application-package.js";

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
const IDENTITY_HINTS = [
  "name", "email", "phone", "resume", "cv", "cover", "linkedin",
  "github", "portfolio", "website", "url", "location", "company", "org",
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

export interface FillResult {
  status: FillStatus;
  code: FillCode;
  reason: string;
  blocker?: FillBlocker;
  filledFields: string[];
  submitted: boolean;
}

async function safeFill(page: Page, selector: string, value: string): Promise<boolean> {
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
  if ((ACCOUNT_SIGNALS.some((s) => html.includes(s)) && !hasForm) || passwordCount >= 2) return "account_creation";
  if (passwordCount > 0 || (LOGIN_SIGNALS.some((s) => html.includes(s)) && !hasForm)) return "login";
  if (OTP_SIGNALS.some((s) => html.includes(s))) return "otp";
  return null;
}

async function uploadResume(page: Page, pkg: ApplicationPackage): Promise<boolean> {
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

async function answerOpenQuestions(
  page: Page,
  profile: CandidateProfile,
  ctx: AnswerContext,
): Promise<{ block: FillResult | null }> {
  let controls;
  try {
    controls = page.locator("textarea, input[type='text']");
  } catch {
    return { block: null };
  }
  const count = Math.min(await controls.count().catch(() => 0), 40);
  for (let i = 0; i < count; i++) {
    const el = controls.nth(i);
    try {
      if (!(await el.isVisible())) continue;
      if (((await el.inputValue()) || "").trim()) continue;
    } catch {
      continue;
    }
    const label = await labelFor(page, el);
    if (!label || IDENTITY_HINTS.some((h) => label.toLowerCase().includes(h))) continue;

    const required = await isRequired(el);
    const result = await answerQuestion(label, profile, ctx);
    if (result.needsUserAction || !result.answer) {
      if (required) {
        return {
          block: {
            status: "needs_user_action",
            code: "question",
            reason: `Cannot confidently answer required question: "${label}" (${result.reason})`,
            filledFields: [],
            submitted: false,
          },
        };
      }
      continue;
    }
    try {
      await el.fill(result.answer);
    } catch {
      /* ignore individual fill failure */
    }
  }
  return { block: null };
}

async function labelFor(page: Page, el: ReturnType<Page["locator"]>): Promise<string | null> {
  for (const attr of ["aria-label", "placeholder", "name", "id"]) {
    try {
      const val = await el.getAttribute(attr);
      if (val && val.length > 2) return val.replace(/_/g, " ").trim();
    } catch {
      continue;
    }
  }
  try {
    const id = await el.getAttribute("id");
    if (id) {
      const text = await page.locator(`label[for="${id}"]`).first().innerText({ timeout: SHORT_TIMEOUT });
      if (text) return text.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function isRequired(el: ReturnType<Page["locator"]>): Promise<boolean> {
  try {
    if ((await el.getAttribute("required")) !== null) return true;
    if (((await el.getAttribute("aria-required")) || "").toLowerCase() === "true") return true;
  } catch {
    /* ignore */
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
    browser = await chromium.launch({ headless: true });
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

    // Fill standard fields using the package selectors (priority order).
    for (const field of pkg.standardFields) {
      if (!field.value) continue;
      for (const selector of field.selectors) {
        if (await safeFill(page, selector, field.value)) {
          filled.push(field.key);
          break;
        }
      }
    }

    await uploadResume(page, pkg);

    const { block } = await answerOpenQuestions(page, profile, ctx);
    if (block) return { ...block, filledFields: filled };

    if (!env.AUTO_SUBMIT) {
      return {
        status: "needs_user_action",
        code: "form_filled",
        reason: "Form filled successfully; AUTO_SUBMIT is disabled (review + submit required).",
        filledFields: filled,
        submitted: false,
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
    await browser.close().catch(() => {});
  }
}
