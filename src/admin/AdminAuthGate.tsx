import { useEffect, useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { api, TOKEN_KEY } from "@/services/api/client";
import { getIngestionStatus } from "@/services/api/admin";

type Phase = "checking" | "login" | "authed" | "notAdmin";

// Lightweight auth gate for the (separate) admin app. The admin app has no global
// AuthProvider; this gate handles login + the admin check itself. Authorization is
// enforced server-side (requireAdmin) — we just surface a clean message on 403.
export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Verify the current token actually has admin access (admin endpoints 403 otherwise).
  async function verifyAdmin(): Promise<void> {
    try {
      await getIngestionStatus();
      setPhase("authed");
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) setPhase("login");
      else if (status === 403) setPhase("notAdmin");
      else setPhase("authed"); // transient/server error — let the dashboard show its own error
    }
  }

  useEffect(() => {
    if (localStorage.getItem(TOKEN_KEY)) void verifyAdmin();
    else setPhase("login");
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<{ token: string }>("/api/auth/login", { email, password });
      if (!data?.token) throw new Error("No token returned");
      localStorage.setItem(TOKEN_KEY, data.token);
      setPhase("checking");
      await verifyAdmin();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(status === 401 ? "Invalid email or password." : "Login failed. Is the server running?");
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setPhase("login");
    setEmail("");
    setPassword("");
  }

  if (phase === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (phase === "authed") {
    return (
      <div className="relative">
        <button
          onClick={logout}
          className="absolute right-6 top-3 z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Log out"
        >
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
        {children}
      </div>
    );
  }

  // login | notAdmin
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border p-6">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="font-semibold">Terces Admin</span>
        </div>

        {phase === "notAdmin" ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">This account is not an administrator.</p>
            <p className="text-xs text-muted-foreground">
              Ask an admin to add your email to <code>ADMIN_EMAILS</code> (or set <code>isAdmin</code>).
            </p>
            <button onClick={logout} className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              Sign in as a different account
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3">
            <p className="text-sm text-muted-foreground">Sign in with an administrator account.</p>
            <input
              type="email" required placeholder="Email" autoComplete="username"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password" required placeholder="Password" autoComplete="current-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit" disabled={submitting}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
