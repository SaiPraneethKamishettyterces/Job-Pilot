// Content script — runs in the ATS application tab (the user's authenticated
// session). Orchestrates: read the page URL → resolve/create the matching
// application (NO manual Application ID) → fetch its package → fill → report.
// NEVER submits. Triggered by a message from the popup.

import { fillForm, type AnswerFn } from "../lib/dom-engine.js";
import { fillWorkday } from "../lib/adapters/workday.js";
import { resolveByUrl, answerQuestions, markApplied, type ApiConfig } from "../lib/api.js";
import type { FillReport } from "../../../shared/autofill/package-types.js";

interface FillMessage {
  type: "JP_FILL";
  config: ApiConfig;
}
interface MarkAppliedMessage {
  type: "JP_MARK_APPLIED";
  applicationId: string;
  config: ApiConfig;
}
type Message = FillMessage | MarkAppliedMessage;

const isTopFrame = window === window.top;

// Build an AnswerFn backed by the server QA endpoint, with a per-run cache so the
// re-scrape loops don't re-request the same label.
function makeAnswerFn(cfg: ApiConfig, applicationId: string): AnswerFn {
  const cache = new Map<string, Awaited<ReturnType<AnswerFn>>>();
  return async (label: string) => {
    const hit = cache.get(label);
    if (hit) return hit;
    try {
      const results = await answerQuestions(cfg, applicationId, [label]);
      const r = results.get(label) ?? { answer: null, needsUserAction: true, isSensitive: false, confidence: 0 };
      cache.set(label, r);
      return r;
    } catch {
      const fallback = { answer: null, needsUserAction: true, isSensitive: false, confidence: 0 };
      cache.set(label, fallback);
      return fallback;
    }
  };
}

interface FillOutcome {
  report: FillReport;
  applicationId: string;
  created: boolean;
}

async function runFill(msg: FillMessage): Promise<FillOutcome> {
  // Resolve the application from the page the user is on — no pasted ID needed.
  const { applicationId, created, package: pkg } = await resolveByUrl(msg.config, window.location.href);
  const answer = makeAnswerFn(msg.config, applicationId);
  const report = pkg.adapterId === "workday" ? await fillWorkday(pkg, answer) : await fillForm({ pkg, answer });
  return { report, applicationId, created };
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === "JP_FILL") {
    // Only the top frame resolves+fills, so the application is matched against the
    // page URL the user sees (not an embedded ad/recaptcha iframe).
    if (!isTopFrame) return false;
    runFill(msg)
      .then((out) => sendResponse({ ok: true, ...out }))
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response.
  }
  if (msg.type === "JP_MARK_APPLIED") {
    if (!isTopFrame) return false;
    markApplied(msg.config, msg.applicationId)
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
