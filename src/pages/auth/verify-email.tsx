import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, Loader2, CheckCircle, XCircle } from "lucide-react";
import { verifyEmail } from "@/services/api";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"verifying" | "ok" | "error">("verifying");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    verifyEmail(token).then(() => setState("ok")).catch(() => setState("error"));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold">JobPilot</span>
        </div>

        {state === "verifying" && (
          <div className="space-y-3" role="status" aria-live="polite">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Verifying your email…</p>
          </div>
        )}
        {state === "ok" && (
          <div className="space-y-3">
            <CheckCircle className="h-10 w-10 text-success mx-auto" />
            <h1 className="text-xl font-bold">Email verified</h1>
            <p className="text-sm text-muted-foreground">Your email address has been confirmed.</p>
            <Link to="/dashboard" className="inline-block text-sm text-primary hover:underline">Go to dashboard</Link>
          </div>
        )}
        {state === "error" && (
          <div className="space-y-3">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">Verification failed</h1>
            <p className="text-sm text-muted-foreground">This link is invalid or has expired.</p>
            <Link to="/login" className="inline-block text-sm text-primary hover:underline">Back to sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}
