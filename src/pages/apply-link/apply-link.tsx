import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Link2, ExternalLink, Copy, CheckCircle2, AlertTriangle, Loader2, ArrowLeft, ArrowRight, Puzzle, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { createApplicationFromUrl, type ApplyLinkResult } from "@/services/api/apply-link";
import { generateDocuments, getApplication, submitApplication, markApplied, type ApplicationPackage } from "@/services/api/applications";

const STEPS = ["Paste link", "Review job", "Generate", "Auto-fill"];

function copy(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
}

export function ApplyLinkPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ApplyLinkResult | null>(null);
  const [pkg, setPkg] = useState<ApplicationPackage | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);

  const parseMut = useMutation({
    mutationFn: createApplicationFromUrl,
    onSuccess: (r) => { setResult(r); setStep(2); },
    onError: (e: unknown) => toast.error(errMsg(e, "Couldn't read that link")),
  });

  const generateMut = useMutation({
    mutationFn: async (id: string) => {
      const gen = await generateDocuments(id);
      const { application } = await getApplication(id);
      return { gen, pkg: application.applicationPackage };
    },
    onSuccess: ({ gen, pkg }) => { setGenWarnings(gen.warnings ?? []); setPkg(pkg); setStep(3); },
    onError: (e: unknown) => toast.error(errMsg(e, "Generation failed")),
  });

  const submitMut = useMutation({
    mutationFn: submitApplication,
    onSuccess: (r) => toast.success(`Submitted: ${r.result.reason || r.status}`),
    onError: (e: unknown) => toast.error(errMsg(e, "Auto-fill failed")),
  });

  const appliedMut = useMutation({
    mutationFn: markApplied,
    onSuccess: () => { toast.success("Marked as applied"); navigate("/applications"); },
    onError: (e: unknown) => toast.error(errMsg(e, "Failed to mark applied")),
  });

  const adapter = result?.adapter;
  const runner = adapter?.capabilities.runner;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-2">
      <div>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-brand-blue-soft" />
          <h1 className="text-xl font-bold tracking-tight">Apply with a Link</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a job link — we read the posting, tailor your documents, and help you auto-fill it. You always review and submit.
        </p>
      </div>

      {/* Step indicator */}
      <div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" />
        <div className="mt-2 flex justify-between text-xs font-medium">
          {STEPS.map((s, i) => (
            <span key={s} className={i + 1 <= step ? "text-foreground" : "text-muted-foreground"}>
              {i + 1 < step ? <CheckCircle2 className="mr-1 inline h-3 w-3 text-green-600" /> : `${i + 1}. `}{s}
            </span>
          ))}
        </div>
      </div>

      {/* ── Step 1 — Paste ─────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Paste the job's application link</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Open the job you want and copy the URL from your browser's address bar — ideally the page with the
              <strong className="text-foreground"> Apply</strong> button (a Greenhouse, Lever, Ashby, Workday… posting).
              Company career pages work too. Paste the <strong className="text-foreground">direct posting URL</strong>,
              not a search-results or email-tracking link.
            </p>
            <Input
              autoFocus
              placeholder="https://boards.greenhouse.io/acme/jobs/123"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && isUrl(url)) parseMut.mutate(url.trim()); }}
            />
            <Button className="w-full" disabled={!isUrl(url) || parseMut.isPending} onClick={() => parseMut.mutate(url.trim())}>
              {parseMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Read this job
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2 — Review job + ATS ──────────────────────────────────── */}
      {step === 2 && result && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{result.job.title}</CardTitle>
            <Badge variant={adapter?.capabilities.autofillSupported ? "default" : "secondary"}>{adapter?.vendorLabel}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <p className="font-medium">{result.job.company}</p>
              <p className="text-muted-foreground">
                {[result.job.location, result.job.isRemote ? "Remote" : null].filter(Boolean).join(" · ") || "Location N/A"}
                {result.job.salaryMin ? ` · ${result.job.salaryCurrency ?? ""}${result.job.salaryMin}+` : ""}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{capabilityLine(runner)}</p>
            {result.job.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.job.skills.slice(0, 12).map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}
              </div>
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Next we'll tailor your resume, cover letter, and the autofill package for this role. If your profile has no
              resume, <RouterLink to="/profile" className="text-brand-blue-soft underline">add one</RouterLink> first for best results.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button className="flex-1" disabled={generateMut.isPending} onClick={() => generateMut.mutate(result.applicationId)}>
                {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Generate documents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3 — Generated ─────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Documents ready</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> Tailored resume, cover letter, and autofill package prepared.
            </p>
            <WarningList warnings={genWarnings} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button className="flex-1" onClick={() => setStep(4)}><ArrowRight className="h-4 w-4" /> Continue to auto-fill</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4 — Autofill handoff ──────────────────────────────────── */}
      {step === 4 && result && (
        <Card>
          <CardHeader><CardTitle className="text-base">Auto-fill this application</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {/* Extension path (primary for login-gated; offered everywhere) */}
            {(runner === "extension" || runner === "either") && (
              <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Puzzle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">Finish in your browser with the JobPilot extension</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Works on portals that need a login (Workday, iCIMS…). Open the application page (sign in if asked — we
                      never store your login), click the extension, paste the IDs below, and hit <em>Fill</em>. It fills
                      every field and stops before Submit so you review it.
                    </p>
                    {adapter?.guidance && <p className="mt-1 text-xs text-muted-foreground">{adapter.guidance}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => copy(result.applicationId, "Application ID")}>
                    <Copy className="h-3.5 w-3.5" /> Application ID
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => copy(localStorage.getItem("jp_token") ?? "", "Access token")}>
                    <Copy className="h-3.5 w-3.5" /> Access token
                  </Button>
                </div>
              </section>
            )}

            {/* Server auto-fill path (public no-login boards) */}
            {(runner === "either" || runner === "server") && (
              <section className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Or let JobPilot auto-fill it</p>
                <p className="text-xs text-muted-foreground">
                  For public no-login boards we can drive the form on the server. Requires data-processing consent (set it in
                  your <RouterLink to="/profile" className="text-brand-blue-soft underline">Profile</RouterLink>). We never auto-submit.
                </p>
                <Button size="sm" disabled={submitMut.isPending} onClick={() => submitMut.mutate(result.applicationId)}>
                  {submitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Auto-fill now
                </Button>
              </section>
            )}

            {/* Manual handoff — always available */}
            <section className="space-y-3">
              <p className="text-sm font-medium">Or do it manually</p>
              {pkg?.applyUrl && (
                <a href={pkg.applyUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5" /> Open application form</Button>
                </a>
              )}
              {pkg && pkg.standardFields.filter((f) => f.value).length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your details (copy/paste)</p>
                  <dl className="space-y-1 text-sm">
                    {pkg.standardFields.filter((f) => f.value).map((f) => (
                      <div key={f.key} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{f.label}</dt>
                        <dd className="truncate font-medium">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </section>

            <Separator />
            <div className="flex gap-2">
              <Button variant="success" className="flex-1" disabled={appliedMut.isPending} onClick={() => appliedMut.mutate(result.applicationId)}>
                {appliedMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                I've submitted it
              </Button>
              <Button variant="ghost" onClick={() => { setStep(1); setUrl(""); setResult(null); setPkg(null); }}>Apply to another</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-1.5">
      {warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
        </p>
      ))}
    </div>
  );
}

function capabilityLine(runner: string | undefined): string {
  if (runner === "extension") return "Login-gated portal — auto-fill via the JobPilot browser extension in your own session.";
  if (runner === "server") return "Public form — JobPilot can auto-fill it for you.";
  if (runner === "either") return "Auto-fill supported — via the extension or on the server.";
  return "Auto-fill isn't available for this site — we'll prepare a copy/paste detail sheet.";
}

function isUrl(v: string): boolean {
  try { new URL(v.trim()); return true; } catch { return false; }
}

function errMsg(e: unknown, fallback: string): string {
  if (typeof e === "object" && e && "response" in e) {
    const r = (e as { response?: { data?: { error?: string; message?: string } } }).response;
    return r?.data?.error ?? r?.data?.message ?? fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export default ApplyLinkPage;
