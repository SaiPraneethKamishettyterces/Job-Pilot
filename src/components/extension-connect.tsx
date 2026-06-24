import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Puzzle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// One-click "Connect autofill extension" card. Talks to the extension's bridge
// content script via a same-origin postMessage handshake (no extension-ID wiring):
//  - ping/pong → detect whether the extension is installed
//  - connect   → the bridge mirrors this logged-in session into the extension
// Clicking Connect logs the extension in by itself — no token to copy.

type State = "checking" | "not_installed" | "installed" | "connecting" | "connected";

interface ExtMessage {
  __jobpilot?: string;
  action?: string;
  ok?: boolean;
}

export function ExtensionConnect() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as ExtMessage | null;
      if (!d || d.__jobpilot !== "ext") return;
      if (d.action === "present" || d.action === "pong") {
        setState((s) => (s === "connected" ? s : "installed"));
      } else if (d.action === "connected") {
        setState(d.ok ? "connected" : "installed");
        if (d.ok) toast.success("Extension connected — autofill is ready");
        else toast.error("Connected, but you don't appear to be logged in here");
      }
    }
    window.addEventListener("message", onMsg);
    // Detect presence; if no reply shortly, assume not installed.
    window.postMessage({ __jobpilot: "app", action: "ping" }, location.origin);
    const t = window.setTimeout(() => setState((s) => (s === "checking" ? "not_installed" : s)), 1200);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(t);
    };
  }, []);

  const connect = () => {
    setState("connecting");
    window.postMessage({ __jobpilot: "app", action: "connect" }, location.origin);
    // Fallback if the extension never answers (e.g., not installed).
    window.setTimeout(() => setState((s) => (s === "connecting" ? "not_installed" : s)), 1500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Puzzle className="h-4 w-4" /> Autofill Browser Extension
        </CardTitle>
        <CardDescription>Fill job applications on any site in your own browser. Connect once — no token to copy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "connected" ? (
          <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" /> Connected. Open a job application page and click the extension's <strong>Fill</strong> button.
          </p>
        ) : (
          <>
            {(state === "not_installed") && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Extension not detected. Add it once:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Open <code>chrome://extensions</code> → enable <b>Developer mode</b>.</li>
                  <li>Click <b>Load unpacked</b> → select the <code>extension-dist</code> folder.</li>
                  <li>Return here and click <b>Connect</b>.</li>
                </ol>
              </div>
            )}
            <Button size="sm" onClick={connect} disabled={state === "connecting" || state === "checking"}>
              {state === "connecting" || state === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Puzzle className="h-4 w-4" />
              )}
              {state === "connecting" ? "Connecting…" : "Connect extension"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
