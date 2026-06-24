// Popup logic — vanilla TS (no framework, keeps the build trivial). Stores config
// in chrome.storage.local, sends fill / mark-applied messages to the content
// script in the active tab, and renders the report (incl. items needing review).

import type { ApiConfig } from "../lib/api.js";
import type { FillReport } from "../../../shared/autofill/package-types.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  appId: $("appId") as HTMLInputElement,
  baseUrl: $("baseUrl") as HTMLInputElement,
  token: $("token") as HTMLInputElement,
  fill: $("fill") as HTMLButtonElement,
  applied: $("applied") as HTMLButtonElement,
  save: $("save") as HTMLButtonElement,
  status: $("status") as HTMLDivElement,
};

interface Stored extends ApiConfig {
  lastAppId?: string;
}

async function load(): Promise<Stored> {
  const s = (await chrome.storage.local.get(["baseUrl", "token", "lastAppId"])) as Partial<Stored>;
  return { baseUrl: s.baseUrl ?? "http://localhost:3001", token: s.token ?? "", lastAppId: s.lastAppId };
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

function renderReport(r: FillReport): void {
  const lines: string[] = [`<span class="ok">✓ Filled ${r.filledCount} field(s).</span>`];
  if (r.stepsAdvanced) lines.push(`Advanced ${r.stepsAdvanced} step(s).`);
  if (r.blocker) {
    lines.push(`<span class="err">Stopped: ${r.blocker.replace("_", " ")} — handle it yourself, then re-run.</span>`);
  }
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
  if (cfg.lastAppId) els.appId.value = cfg.lastAppId;

  els.save.onclick = async () => {
    await chrome.storage.local.set({ baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim() });
    setStatus('<span class="ok">Settings saved.</span>');
  };

  els.fill.onclick = async () => {
    const applicationId = els.appId.value.trim();
    if (!applicationId) return setStatus('<span class="err">Enter an Application ID.</span>', "err");
    const config: ApiConfig = { baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim() };
    if (!config.token) return setStatus('<span class="err">Set an access token in Settings.</span>', "err");
    await chrome.storage.local.set({ lastAppId: applicationId });
    setStatus("Filling…");
    try {
      const res = await chrome.tabs.sendMessage(await activeTabId(), { type: "JP_FILL", applicationId, config });
      if (res?.ok) renderReport(res.report as FillReport);
      else setStatus(`<span class="err">${escapeHtml(res?.error ?? "Fill failed")}</span>`, "err");
    } catch (e) {
      setStatus(`<span class="err">${escapeHtml(String(e))}. Open the application page first.</span>`, "err");
    }
  };

  els.applied.onclick = async () => {
    const applicationId = els.appId.value.trim();
    const config: ApiConfig = { baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim() };
    if (!applicationId || !config.token) return setStatus('<span class="err">Need Application ID + token.</span>', "err");
    try {
      const res = await chrome.tabs.sendMessage(await activeTabId(), { type: "JP_MARK_APPLIED", applicationId, config });
      setStatus(res?.ok ? '<span class="ok">Marked as applied in JobPilot.</span>' : `<span class="err">${escapeHtml(res?.error ?? "Failed")}</span>`);
    } catch (e) {
      setStatus(`<span class="err">${escapeHtml(String(e))}</span>`, "err");
    }
  };
}

void init();
