// Content script — runs in the ATS application tab (the user's authenticated
// session). Orchestrates: load config → fetch package → pick adapter → fill →
// report. NEVER submits. Triggered by a message from the popup.

import { fillForm, type AnswerFn } from "../lib/dom-engine.js";
import { fillWorkday } from "../lib/adapters/workday.js";
import { fetchPackage, answerQuestions, markApplied, type ApiConfig } from "../lib/api.js";
import type { FillReport } from "../../../shared/autofill/package-types.js";

interface FillMessage {
  type: "JP_FILL";
  applicationId: string;
  config: ApiConfig;
}
interface MarkAppliedMessage {
  type: "JP_MARK_APPLIED";
  applicationId: string;
  config: ApiConfig;
}
type Message = FillMessage | MarkAppliedMessage;

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

async function runFill(msg: FillMessage): Promise<FillReport> {
  const pkg = await fetchPackage(msg.config, msg.applicationId);
  const answer = makeAnswerFn(msg.config, msg.applicationId);

  if (pkg.adapterId === "workday") {
    return fillWorkday(pkg, answer);
  }
  return fillForm({ pkg, answer });
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === "JP_FILL") {
    runFill(msg)
      .then((report) => sendResponse({ ok: true, report }))
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true; // async response.
  }
  if (msg.type === "JP_MARK_APPLIED") {
    markApplied(msg.config, msg.applicationId)
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
