// Background service worker (MV3). Intentionally thin: the content script does
// the filling (it must run in the page's DOM) and the popup drives the flow.
// Kept as an explicit entry so the manifest module worker resolves cleanly and
// so future cross-tab coordination (e.g. auto-detecting the application for the
// current tab) has a home.

chrome.runtime.onInstalled.addListener(() => {
  console.info("[JobPilot] extension installed — open a job application and click the toolbar icon.");
});
