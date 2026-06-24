// Account bridge — runs ONLY on the JobPilot web-app origin (see manifest
// content_scripts matches). It mirrors the logged-in session (access token + API
// base) from the app's localStorage into the extension's storage, so the user
// NEVER copies a token: log into JobPilot in the browser → the extension is
// connected. Re-syncs on focus/visibility/storage changes, and clears on logout.
//
// Security: the token never leaves the user's browser — it moves from the app's
// localStorage (same origin the user is already authenticated on) into the
// extension's local storage in the same browser. No network egress here.

const TOKEN_KEY = "jp_token";
const API_BASE_KEY = "jp_api_base";

function currentBase(): string {
  const stored = window.localStorage.getItem(API_BASE_KEY);
  if (stored) return stored;
  // Fallback heuristic: dev UI (localhost:5173) talks to the API on :3001; in
  // production the app + API are same-origin (Express serves both).
  return location.hostname === "localhost" ? "http://localhost:3001" : location.origin;
}

function sync(): void {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) {
      chrome.storage.local.set({ token, baseUrl: currentBase(), connectedAt: new Date().toISOString() });
    } else {
      // Logged out in the app → disconnect the extension too.
      chrome.storage.local.remove(["token", "connectedAt"]);
    }
  } catch {
    /* ignore */
  }
}

sync();
window.addEventListener("focus", sync);
window.addEventListener("storage", sync);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sync();
});

// One-click connect handshake with the JobPilot web app (same origin only).
// The app's "Connect extension" button posts {action:"ping"|"connect"}; we reply
// with presence / connection status. `connect` re-runs sync() so the user's
// session lands in the extension immediately — no token copy.
function announce(action: string, extra: Record<string, unknown> = {}): void {
  window.postMessage({ __jobpilot: "ext", action, ...extra }, location.origin);
}

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data as { __jobpilot?: string; action?: string } | null;
  if (!d || d.__jobpilot !== "app") return;
  if (d.action === "ping") {
    announce("pong");
  } else if (d.action === "connect") {
    sync();
    announce("connected", { ok: Boolean(window.localStorage.getItem(TOKEN_KEY)) });
  }
});

// Announce presence on load (in case the app is already listening).
announce("present");
