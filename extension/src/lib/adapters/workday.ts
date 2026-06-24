// Workday adapter (extension-only). Workday is a multi-step SPA wizard, each
// employer is its own tenant requiring an account, and forms are customized per
// tenant — so we detect fields by data-automation-id + visible label (survives
// per-tenant variation) and advance step-by-step, STOPPING before the final
// Submit. The user is logged into their own Workday session; we never touch
// credentials and never submit. (See AUTOFILL_V2_PLAN.md §B4.)

import { fillForm, type AnswerFn } from "../dom-engine.js";
import type { WireApplicationPackage, FillReport } from "../../../../shared/autofill/package-types.js";

const MAX_STEPS = 12; // safety bound on wizard pages.

// Buttons that ADVANCE a step (safe to click) vs SUBMIT (never click).
const NEXT_SELECTORS = [
  '[data-automation-id="pageFooterNextButton"]',
  '[data-automation-id="bottom-navigation-next-button"]',
  'button[data-automation-id="continueButton"]',
];
const SUBMIT_SELECTORS = [
  '[data-automation-id="pageFooterSubmitButton"]',
  'button[data-automation-id="submitButton"]',
];

function visible(el: HTMLElement | null): el is HTMLElement {
  return Boolean(el && el.offsetParent !== null && !(el as HTMLButtonElement).disabled);
}

function findNext(): HTMLElement | null {
  for (const s of NEXT_SELECTORS) {
    const el = document.querySelector<HTMLElement>(s);
    if (visible(el)) return el;
  }
  // Text fallback (Workday localizes/renames automation ids occasionally).
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'));
  return buttons.find((b) => visible(b) && /^(next|continue|save and continue)$/i.test((b.textContent || "").trim())) ?? null;
}

function hasSubmit(): boolean {
  if (SUBMIT_SELECTORS.some((s) => visible(document.querySelector<HTMLElement>(s)))) return true;
  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]')).some(
    (b) => visible(b) && /^submit( application)?$/i.test((b.textContent || "").trim()),
  );
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fillWorkday(pkg: WireApplicationPackage, answer: AnswerFn): Promise<FillReport> {
  const agg: FillReport = {
    adapterId: pkg.adapterId,
    filledCount: 0,
    filledLabels: [],
    blanks: [],
    needsReview: [],
    blocker: null,
    submitted: false,
    stepsAdvanced: 0,
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await fillForm({ pkg, answer });

    // Merge this step's results into the aggregate.
    agg.filledCount += r.filledCount;
    agg.filledLabels.push(...r.filledLabels);
    agg.blanks.push(...r.blanks);
    for (const nr of r.needsReview) if (!agg.needsReview.some((x) => x.label === nr.label)) agg.needsReview.push(nr);

    // Hard stops are never bypassed (login wall, captcha, OTP, account creation).
    if (r.blocker) {
      agg.blocker = r.blocker;
      return agg;
    }

    // If we're on the final step (Submit present, no Next), STOP. The user submits.
    if (hasSubmit() && !findNext()) return agg;

    const next = findNext();
    if (!next) return agg; // nothing to advance — done filling what we can.

    // Don't advance if required blanks remain on THIS step — let the user resolve.
    if (r.blanks.length > 0) return agg;

    next.click();
    agg.stepsAdvanced++;
    await wait(900); // let the next page render (Workday is a slow SPA).
  }

  return agg;
}
