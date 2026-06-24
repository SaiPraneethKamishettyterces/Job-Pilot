// Popup logic — vanilla TS (no framework, keeps the build trivial). Stores config
// in chrome.storage.local, tells the content script to fill the CURRENT tab (the
// content script auto-detects which application matches the page — no ID to paste),
// and renders the report. "Mark applied" uses the application id returned by the fill.

import type { ApiConfig } from "../lib/api.js";
import type { FillReport } from "../../../shared/autofill/package-types.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  baseUrl: $("baseUrl") as HTMLInputElement,
  token: $("token") as HTMLInputElement,
  fill: $("fill") as HTMLButtonElement,
  applied: $("applied") as HTMLButtonElement,
  save: $("save") as HTMLButtonElement,
  status: $("status") as HTMLDivElement,
};

let lastApplicationId: string | null = null;

async function load(): Promise<ApiConfig> {
  const s = (await chrome.storage.local.get(["baseUrl", "token"])) as Partial<ApiConfig>;
  return { baseUrl: s.baseUrl ?? "http://localhost:3001", token: s.token ?? "" };
}

function setStatus(html: string, cls = ""): void {
  els.status.className = cls;
  els.status.innerHTML = html;
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return tab.id;
}

function renderReport(r: FillReport, created: boolean): void {
  const lines: string[] = [`<span class="ok">✓ Filled ${r.filledCount} field(s).</span>`];
  if (created) lines.push(`<span class="sub">New application created for this page.</span>`);
  if (r.stepsAdvanced) lines.push(`Advanced ${r.stepsAdvanced} step(s).`);
  if (r.blocker) lines.push(`<span class="err">Stopped: ${r.blocker.replace("_", " ")} — handle it yourself, then re-run.</span>`);
  if (r.blanks.length) {
    lines.push(`<div class="review"><b>${r.blanks.length} required field(s) still blank:</b><ul>${r.blanks.map((b) => `<li>${escapeHtml(b.label)}</li>`).join("")}</ul></div>`);
  }
  if (r.needsReview.length) {
    lines.push(`<div class="review"><b>Review these (not auto-filled by policy):</b><ul>${r.needsReview.map((n) => `<li>${escapeHtml(n.label)} <i>(${n.reason})</i></li>`).join("")}</ul></div>`);
  }
  lines.push(`<p class="sub">Review the form, then click the site's Submit button. When done, hit "mark applied".</p>`);
  setStatus(lines.join("\n"));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function init(): Promise<void> {
  const cfg = await load();
  els.baseUrl.value = cfg.baseUrl;
  els.token.value = cfg.token;

  // The bridge content script auto-connects the extension whenever you're logged
  // into JobPilot in the browser — so normally no manual token entry is needed.
  if (cfg.token) {
    setStatus('<span class="ok">✓ Connected to JobPilot.</span> Open a job application page and click Fill.');
  } else {
    setStatus('Not connected yet — open JobPilot and log in, then reopen this. (Or paste a token in Settings.)');
  }

  els.save.onclick = async () => {
    await chrome.storage.local.set({ baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim() });
    setStatus('<span class="ok">Settings saved.</span>');
  };

  els.fill.onclick = async () => {
    const config: ApiConfig = { baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim() };
    if (!config.token) return setStatus('<span class="err">Set an access token in Settings first.</span>', "err");
    setStatus("Detecting this job & filling…");
    els.fill.disabled = true;
    try {
      const res = await chrome.tabs.sendMessage(await activeTabId(), { type: "JP_FILL", config });
      if (res?.ok) {
        lastApplicationId = res.applicationId ?? null;
        els.applied.disabled = !lastApplicationId;
        renderReport(res.report as FillReport, Boolean(res.created));
      } else {
        setStatus(`<span class="err">${escapeHtml(res?.error ?? "Fill failed")}</span>`, "err");
      }
    } catch (e) {
      setStatus(`<span class="err">${escapeHtml(String(e))}. Open the job application page first, then click Fill.</span>`, "err");
    } finally {
      els.fill.disabled = false;
    }
  };

  els.applied.onclick = async () => {
    if (!lastApplicationId) return;
    const config: ApiConfig = { baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim() };
    try {
      const res = await chrome.tabs.sendMessage(await activeTabId(), { type: "JP_MARK_APPLIED", applicationId: lastApplicationId, config });
      setStatus(res?.ok ? '<span class="ok">Marked as applied in JobPilot.</span>' : `<span class="err">${escapeHtml(res?.error ?? "Failed")}</span>`);
    } catch (e) {
      setStatus(`<span class="err">${escapeHtml(String(e))}</span>`, "err");
    }
  };
}

void init();
