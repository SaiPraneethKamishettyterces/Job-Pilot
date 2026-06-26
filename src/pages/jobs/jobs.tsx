import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Loader2, ExternalLink, MapPin, DollarSign, Briefcase, Heart, X, SlidersHorizontal,
  Building2, Clock, CheckCircle2, Sparkles, DownloadCloud, ArrowDownUp, Download, FileText, FileSignature, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelativeDate } from "@/lib/utils";
import { addJob, getJobs, removeJob, generateDocuments, markApplied, getIngestionRuns, applyToJob, getJobApplication, getApplication, downloadFile, type JobWithMatch, type ApplicationDocument } from "@/services/api";
import { ActiveRunBanner, isIngestActive } from "@/components/ingestion/ingestion";

// ─── Extension detection ──────────────────────────────────────────────────────
// ponytail: a web page can only know the extension is present if the extension
// announces itself. Until it sets this flag/DOM marker, treat as not installed;
// a localStorage override lets you test the "installed" path.
function isExtensionInstalled(): boolean {
  return (
    Boolean((window as unknown as { __JOBPILOT_EXTENSION__?: boolean }).__JOBPILOT_EXTENSION__) ||
    localStorage.getItem("jobpilot:extension") === "installed"
  );
}
const EXTENSION_STORE_URL = "https://chrome.google.com/webstore/"; // ponytail: real listing URL when published.

// Local tally of manual applies — drives the "install the extension?" nudge every 10th.
const APPLY_COUNT_KEY = "jobpilot:applyCount";
const getApplyCount = () => Number(localStorage.getItem(APPLY_COUNT_KEY) || 0);
const bumpApplyCount = () => localStorage.setItem(APPLY_COUNT_KEY, String(getApplyCount() + 1));

// ─── Match score ring ──────────────────────────────────────────────────────────
function matchLabel(score: number) {
  if (score >= 80) return "STRONG MATCH";
  if (score >= 65) return "GOOD MATCH";
  if (score >= 50) return "FAIR MATCH";
  return "LOW MATCH";
}
function matchColor(score: number) {
  if (score >= 80) return "var(--success)";
  if (score >= 65) return "var(--warning)";
  return "#6b7280";
}

function MatchRing({ score }: { score: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" role="img" aria-label={`${score}% match`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border-medium)" strokeWidth="5" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={matchColor(score)} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-foreground text-[15px] font-bold">{score}%</text>
    </svg>
  );
}

function MatchWidget({ score, reasons }: { score: number; reasons: string[] }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-foreground/[0.03] p-3 sm:w-44">
      <MatchRing score={score} />
      <span className="text-[11px] font-bold tracking-wide" style={{ color: matchColor(score) }}>{matchLabel(score)}</span>
      {reasons.length > 0 && (
        <ul className="w-full space-y-0.5">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-success" /> <span className="truncate">{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Company logo (initials — no logo data in API) ──────────────────────────────
function CompanyLogo({ company, size = "h-12 w-12" }: { company: string; size?: string }) {
  const initial = company.trim()[0]?.toUpperCase() ?? "?";
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-brand-blue/12 text-base font-bold text-brand-blue-soft`}>
      {initial}
    </div>
  );
}

function salaryText(j: JobWithMatch["job"]) {
  return j.salaryMin && j.salaryMax
    ? `${j.salaryCurrency ?? "USD"} ${(j.salaryMin / 1000).toFixed(0)}k–${(j.salaryMax / 1000).toFixed(0)}k`
    : null;
}

// ─── Job list card ───────────────────────────────────────────────────────────
function JobCard({
  item, selected, liked, onSelect, onLike, onHide, onApply,
}: {
  item: JobWithMatch; selected: boolean; liked: boolean;
  onSelect: () => void; onLike: () => void; onHide: () => void; onApply: () => void;
}) {
  const { job } = item;
  const salary = salaryText(job);
  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={`group relative cursor-pointer rounded-card border bg-card p-4 transition-colors hover:bg-foreground/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary/60" : "border-border"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 gap-3">
          <CompanyLogo company={job.company} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate pr-1 text-base font-bold">{job.title}</p>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  aria-label={liked ? "Unlike job" : "Like job"}
                  onClick={(e) => { e.stopPropagation(); onLike(); }}>
                  <Heart className={`h-3.5 w-3.5 ${liked ? "fill-red-500 text-red-500" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  aria-label="Hide job"
                  onClick={(e) => { e.stopPropagation(); onHide(); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="truncate text-xs text-muted-foreground">{job.company}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {job.location && <Badge variant="secondary" className="rounded-full gap-1"><MapPin className="h-3 w-3" />{job.location}</Badge>}
              {job.isRemote != null && <Badge variant="outline" className="rounded-full">{job.isRemote ? "Remote" : "Onsite"}</Badge>}
              {salary && <Badge variant="outline" className="rounded-full gap-1"><DollarSign className="h-3 w-3" />{salary}</Badge>}
              {job.atsPlatform && <Badge variant="outline" className="rounded-full capitalize">{job.atsPlatform}</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {job.postedAt && (
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Posted {formatRelativeDate(job.postedAt)}</span>
              )}
              <span className="flex items-center gap-1"><DownloadCloud className="h-3 w-3" /> Fetched {formatRelativeDate(item.matchedAt)}</span>
            </div>
          </div>
        </div>
        <MatchWidget score={item.score} reasons={item.reasons} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm" variant="success" className="gap-1.5"
          disabled={!job.jobUrl}
          onClick={(e) => { e.stopPropagation(); onApply(); }}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Apply
        </Button>
        {job.jobUrl && (
          <a
            href={job.jobUrl} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            View posting
          </a>
        )}
        {!job.jobUrl && <span className="text-xs text-muted-foreground">No application URL</span>}
      </div>
    </div>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ item, onApply, onClose }: { item: JobWithMatch; onApply: () => void; onClose: () => void }) {
  const { job } = item;
  const salary = salaryText(job);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div className="flex min-w-0 gap-3">
          <CompanyLogo company={job.company} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{job.title}</p>
            <p className="truncate text-sm text-muted-foreground">{job.company}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 xl:hidden" aria-label="Close details" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        {job.location && <Badge variant="secondary" className="rounded-full gap-1"><MapPin className="h-3 w-3" />{job.location}</Badge>}
        {job.isRemote != null && <Badge variant="outline" className="rounded-full">{job.isRemote ? "Remote" : "Onsite"}</Badge>}
        {salary && <Badge variant="outline" className="rounded-full">{salary}</Badge>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="overview">
          <TabsList className="mb-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-3">
            {item.reasons.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-success">Why you match</p>
                <ul className="space-y-1">{item.reasons.map((r, i) => <li key={i} className="flex gap-1.5 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />{r}</li>)}</ul>
              </div>
            )}
            {item.risks.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-warning">Watch-outs</p>
                <ul className="space-y-1">{item.risks.map((r, i) => <li key={i} className="text-sm text-muted-foreground">· {r}</li>)}</ul>
              </div>
            )}
            {job.jobUrl && (
              <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                View original posting <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </TabsContent>
          <TabsContent value="requirements" className="space-y-3">
            {job.skills.length > 0 && (
              <div><p className="mb-1.5 text-xs font-semibold">Required skills</p><div className="flex flex-wrap gap-1.5">{job.skills.map((s) => <Badge key={s} variant="outline" className="rounded-full">{s}</Badge>)}</div></div>
            )}
            {job.requirements.length > 0 && (
              <ul className="space-y-1">{job.requirements.map((r, i) => <li key={i} className="text-sm text-muted-foreground">· {r}</li>)}</ul>
            )}
            {job.skills.length === 0 && job.requirements.length === 0 && <p className="text-sm text-muted-foreground">No requirements parsed.</p>}
          </TabsContent>
          <TabsContent value="company" className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Building2 className="h-4 w-4" /> {job.company}</p>
            {job.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {job.location}</p>}
            {(job.experienceMin != null) && <p className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> {job.experienceMin}{job.experienceMax ? `–${job.experienceMax}` : "+"} yrs experience</p>}
          </TabsContent>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
        <Button variant="outline" onClick={() => toast.success("Saved")}>Save</Button>
        <Button variant="success" onClick={onApply} disabled={!job.jobUrl}>Apply</Button>
      </div>
    </div>
  );
}

// ─── Add Job dialog ─────────────────────────────────────────────────────────
function AddJobDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [jobUrl, setJobUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const { mutate, isPending } = useMutation({
    mutationFn: () => addJob(mode === "url" ? { jobUrl } : { rawText }),
    onSuccess: () => { toast.success("Job parsed and scored!"); setJobUrl(""); setRawText(""); onSuccess(); onClose(); },
    onError: (err: Error) => toast.error(err.message || "Failed to add job"),
  });
  const canSubmit = !isPending && (mode === "url" ? jobUrl.trim().length > 0 : rawText.trim().length > 50);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add a Job</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button variant={mode === "url" ? "default" : "outline"} size="sm" onClick={() => setMode("url")}>Job URL</Button>
            <Button variant={mode === "text" ? "default" : "outline"} size="sm" onClick={() => setMode("text")}>Paste JD</Button>
          </div>
          {mode === "url" ? (
            <div className="space-y-1.5">
              <Label htmlFor="job-url">Job Posting URL</Label>
              <Input id="job-url" placeholder="https://jobs.lever.co/stripe/..." value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canSubmit && mutate()} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="job-text">Job Description</Label>
              <Textarea id="job-text" placeholder="Paste the full job description here…" value={rawText} onChange={(e) => setRawText(e.target.value)} rows={8} className="resize-none" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button onClick={() => mutate()} disabled={!canSubmit}>
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Parsing…</> : <><Search className="h-4 w-4" />Add Job</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export function JobsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set()); // ponytail: local only — no like endpoint yet.
  const [banner, setBanner] = useState<{ appId: string; title: string; company: string } | null>(null);
  const [pendingReturn, setPendingReturn] = useState<{ appId: string; title: string; company: string } | null>(null);
  // Multi-step apply flow: extension nudge → check existing → docs choice → generating → ready.
  type ApplyStep = "extension" | "checking" | "documents" | "generating" | "ready";
  const [applyFlow, setApplyFlow] = useState<
    { job: JobWithMatch["job"]; step: ApplyStep; appId?: string; docs?: ApplicationDocument[] } | null
  >(null);

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("ALL");
  const [remote, setRemote] = useState("ALL");
  const [posted, setPosted] = useState("ALL");
  const [sort, setSort] = useState<"newest" | "oldest" | "score">("newest");
  const [allFiltersOpen, setAllFiltersOpen] = useState(false);

  // Poll while an ingestion run is active so freshly fetched jobs stream in live.
  const runsQuery = useQuery({
    queryKey: ["ingestionRuns"],
    queryFn: getIngestionRuns,
    refetchInterval: (q) => (q.state.data?.runs.some((r) => isIngestActive(r.status)) ? 2500 : false),
  });
  const hasActiveRun = Boolean(runsQuery.data?.runs.some((r) => isIngestActive(r.status)));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => getJobs(),
    refetchInterval: hasActiveRun ? 3000 : false,
  });
  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  const removeMutation = useMutation({
    mutationFn: removeJob,
    onSuccess: () => { toast.success("Job hidden"); queryClient.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: () => toast.error("Failed to hide job"),
  });
  const appliedMutation = useMutation({
    mutationFn: markApplied,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Moved to Applied ✓");
    },
    onError: () => toast.error("Could not update status"),
  });

  // Entry point. Extension nudge shows only every 10th apply (and only if it isn't
  // installed) — otherwise we go straight to checking for existing documents.
  const handleApply = (job: JobWithMatch["job"]) => {
    if (!job.jobUrl) { toast.error("This job has no application URL."); return; }
    const needExt = !isExtensionInstalled() && (getApplyCount() + 1) % 10 === 0;
    if (needExt) setApplyFlow({ job, step: "extension" });
    else checkExisting(job);
  };

  // After the extension nudge (or directly): reuse already-generated docs for this job
  // instead of asking to generate again. If none exist yet, offer to generate.
  const checkExisting = async (job: JobWithMatch["job"]) => {
    setApplyFlow({ job, step: "checking" });
    try {
      const { applicationId, documents } = await getJobApplication(job.id);
      if (applicationId && documents.length > 0) {
        setApplyFlow({ job, step: "ready", appId: applicationId, docs: documents });
      } else {
        setApplyFlow({ job, step: "documents" });
      }
    } catch {
      setApplyFlow({ job, step: "documents" }); // lookup failed → let them generate
    }
  };

  // Open the posting (a user gesture from the clicked button → no popup block), count
  // the apply, and arm the "Did you apply?" prompt. Nothing is APPLIED until confirmed.
  const openPosting = (job: JobWithMatch["job"], appId: string) => {
    bumpApplyCount();
    window.open(job.jobUrl!, "_blank", "noopener,noreferrer");
    setPendingReturn({ appId, title: job.title, company: job.company });
    setApplyFlow(null);
  };

  // "Do it later" — apply without generating docs: open posting now, create the app in
  // the background, then arm the confirm prompt.
  const applyWithoutDocs = (job: JobWithMatch["job"]) => {
    bumpApplyCount();
    window.open(job.jobUrl!, "_blank", "noopener,noreferrer");
    setApplyFlow(null);
    applyToJob(job.id)
      .then(({ applicationId }) => setPendingReturn({ appId: applicationId, title: job.title, company: job.company }))
      .catch((e: Error) => toast.error(e.message || "Could not start application"));
  };

  // Generate the 3 tailored docs for THIS job, then show the "ready" step (Download +
  // Continue). The posting opens only when the user clicks Continue — so it never sits
  // on a blank page while documents are still being generated.
  const generateDocsThen = async (job: JobWithMatch["job"]) => {
    setApplyFlow({ job, step: "generating" });
    try {
      const { applicationId } = await applyToJob(job.id);
      await generateDocuments(applicationId); // resume + cover letter + cold email, tied to this job
      const { application } = await getApplication(applicationId);
      const docs = (application.documents ?? []).filter((d) =>
        ["resume", "cover_letter", "cold_email"].includes(d.type),
      );
      // Hand the freshly tailored resume to the autofill extension (best-effort).
      window.postMessage({ __jobpilot: "app", action: "prefill", applicationId }, window.location.origin);
      setApplyFlow({ job, step: "ready", appId: applicationId, docs });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate documents");
      setApplyFlow(null);
    }
  };

  const downloadDoc = (doc: ApplicationDocument, job: JobWithMatch["job"]) => {
    const base = `${job.company}_${job.title}_${doc.type}`.replace(/[^a-z0-9._-]/gi, "_");
    if (doc.fileUrl) {
      downloadFile(doc.fileUrl, `${base}.docx`).catch(() => toast.error("Download failed"));
    } else if (doc.content) {
      const url = URL.createObjectURL(new Blob([doc.content], { type: "text/markdown;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${base}.md`; a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.error("Nothing to download");
    }
  };

  const DOC_META: Record<string, { label: string; icon: typeof FileText }> = {
    resume: { label: "Tailored Resume", icon: FileText },
    cover_letter: { label: "Cover Letter", icon: FileSignature },
    cold_email: { label: "Cold Email", icon: Mail },
  };

  // "Did you apply?" — fires when the user returns to this tab after we opened the posting.
  useEffect(() => {
    if (!pendingReturn) return;
    const onReturn = () => {
      if (document.visibilityState === "visible") {
        setBanner(pendingReturn);
        setPendingReturn(null);
      }
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => { document.removeEventListener("visibilitychange", onReturn); window.removeEventListener("focus", onReturn); };
  }, [pendingReturn]);

  const locations = useMemo(
    () => [...new Set(jobs.map((j) => j.job.location).filter(Boolean) as string[])].sort(),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const windows: Record<string, number> = { "24h": 864e5, week: 7 * 864e5, month: 30 * 864e5 };
    const result = jobs.filter(({ job }) => {
      if (q && !`${job.title} ${job.company}`.toLowerCase().includes(q)) return false;
      if (location !== "ALL" && job.location !== location) return false;
      if (remote === "remote" && !job.isRemote) return false;
      if (remote === "onsite" && job.isRemote) return false;
      if (posted !== "ALL" && job.postedAt && now - new Date(job.postedAt).getTime() > windows[posted]) return false;
      return true;
    });
    const fetchedAt = (j: JobWithMatch) => new Date(j.matchedAt).getTime();
    result.sort((a, b) =>
      sort === "score" ? b.score - a.score
        : sort === "oldest" ? fetchedAt(a) - fetchedAt(b)
        : fetchedAt(b) - fetchedAt(a),
    );
    return result;
  }, [jobs, search, location, remote, posted, sort]);

  const selected = filtered.find((j) => j.job.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Jobs Found</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{filtered.length} of {jobs.length} jobs</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />Add Job</Button>
      </div>

      {/* Live fetch progress (shows while an ingestion run is active) */}
      <ActiveRunBanner />

      {/* Filter chip bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search title or company…" className="h-9 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="h-9 w-auto gap-1 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All locations</SelectItem>{locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={remote} onValueChange={setRemote}>
          <SelectTrigger className="h-9 w-auto gap-1 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any location type</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
            <SelectItem value="onsite">Onsite</SelectItem>
          </SelectContent>
        </Select>
        <Select value={posted} onValueChange={setPosted}>
          <SelectTrigger className="h-9 w-auto gap-1 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any time</SelectItem>
            <SelectItem value="24h">Past 24h</SelectItem>
            <SelectItem value="week">Past week</SelectItem>
            <SelectItem value="month">Past month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full"><ArrowDownUp className="h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest fetched</SelectItem>
            <SelectItem value="oldest">Oldest fetched</SelectItem>
            <SelectItem value="score">Best match</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-full" onClick={() => setAllFiltersOpen(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> All Filters
        </Button>
      </div>

      {isLoading && <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {isError && <Card><CardContent className="py-10 text-center text-sm text-destructive">Failed to load jobs.</CardContent></Card>}

      {!isLoading && !isError && filtered.length === 0 && (
        <Card><CardContent className="py-16 text-center">
          <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium">No jobs match</p>
          <p className="mb-4 text-xs text-muted-foreground">Adjust filters or add a job.</p>
          <Button variant="outline" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />Add a job</Button>
        </CardContent></Card>
      )}

      {/* Two-pane: list + detail */}
      {filtered.length > 0 && (
        <div className="flex gap-4">
          <div className={`min-w-0 space-y-3 ${selected ? "hidden xl:block xl:w-[62%]" : "w-full"}`}>
            {filtered.map((item) => (
              <JobCard
                key={item.matchId}
                item={item}
                selected={item.job.id === selectedId}
                liked={liked.has(item.job.id)}
                onSelect={() => setSelectedId(item.job.id)}
                onLike={() => setLiked((s) => { const n = new Set(s); if (n.has(item.job.id)) n.delete(item.job.id); else n.add(item.job.id); return n; })}
                onHide={() => { if (item.job.id === selectedId) setSelectedId(null); removeMutation.mutate(item.job.id); }}
                onApply={() => handleApply(item.job)}
              />
            ))}
          </div>
          {selected && (
            <div className="w-full xl:w-[38%]">
              <Card className="sticky top-4 h-[calc(100vh-7rem)] overflow-hidden p-0 transition-opacity duration-200">
                <DetailPanel item={selected} onApply={() => handleApply(selected.job)} onClose={() => setSelectedId(null)} />
              </Card>
            </div>
          )}
        </div>
      )}

      <AddJobDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })} />

      {/* All filters drawer */}
      <Dialog open={allFiltersOpen} onOpenChange={setAllFiltersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>All filters</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label htmlFor="visa-filter">Visa sponsorship</Label><Switch id="visa-filter" aria-label="Visa sponsorship" /></div>
            <p className="text-xs text-muted-foreground">Job type, experience level and visa filters activate as the pipeline captures those fields.</p>
          </div>
          <div className="flex justify-end"><Button onClick={() => setAllFiltersOpen(false)}>Done</Button></div>
        </DialogContent>
      </Dialog>

      {/* Multi-step apply flow: extension nudge → generate docs → generating */}
      <Dialog open={!!applyFlow} onOpenChange={(o) => { if (!o && applyFlow?.step !== "generating") setApplyFlow(null); }}>
        <DialogContent className="sm:max-w-md">
          {applyFlow?.step === "extension" && (
            <>
              <DialogHeader><DialogTitle>Add the auto-apply extension?</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">
                The JobPilot Chrome extension autofills application forms and loads your tailored
                resume on the job page. Add it once, or do it later.
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <Button onClick={() => { window.open(EXTENSION_STORE_URL, "_blank", "noopener,noreferrer"); checkExisting(applyFlow.job); }}>
                  <Sparkles className="h-4 w-4" /> Add Chrome extension
                </Button>
                <Button variant="ghost" onClick={() => checkExisting(applyFlow.job)}>
                  Do it later
                </Button>
              </div>
            </>
          )}

          {applyFlow?.step === "checking" && (
            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Checking for existing documents…
            </div>
          )}

          {applyFlow?.step === "documents" && (
            <>
              <DialogHeader><DialogTitle>Generate tailored documents?</DialogTitle></DialogHeader>
              <p className="text-sm">
                <span className="font-semibold">{applyFlow.job.title}</span>
                <span className="text-muted-foreground"> · {applyFlow.job.company}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll create a resume, cover letter, and cold email tailored to <em>this</em> job,
                attach them to it, and show them before you head to the posting.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Button onClick={() => generateDocsThen(applyFlow.job)}>
                  <Sparkles className="h-4 w-4" /> Generate documents
                </Button>
                <Button variant="outline" onClick={() => applyWithoutDocs(applyFlow.job)}>
                  <ExternalLink className="h-4 w-4" /> Do it later — just open posting
                </Button>
              </div>
            </>
          )}

          {applyFlow?.step === "generating" && (
            <>
              <DialogHeader><DialogTitle>Tailoring your documents…</DialogTitle></DialogHeader>
              <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Generating resume, cover letter &amp; cold email for {applyFlow.job.company}…
              </div>
            </>
          )}

          {applyFlow?.step === "ready" && (
            <>
              <DialogHeader><DialogTitle>Documents ready</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">
                Tailored for <span className="font-medium text-foreground">{applyFlow.job.title}</span> at {applyFlow.job.company}.
                Download them, then continue to the posting to apply.
              </p>
              <div className="mt-3 space-y-2">
                {(applyFlow.docs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents were produced (check your resume is uploaded).</p>
                ) : (
                  (applyFlow.docs ?? []).map((d) => {
                    const meta = DOC_META[d.type] ?? { label: d.type, icon: FileText };
                    const Icon = meta.icon;
                    return (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{meta.label}</span>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => downloadDoc(d, applyFlow.job)}>
                          <Download className="h-3.5 w-3.5" /> Download
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <Button onClick={() => openPosting(applyFlow.job, applyFlow.appId!)}>
                  <ExternalLink className="h-4 w-4" /> Continue to apply
                </Button>
                <Button variant="ghost" size="sm" onClick={() => generateDocsThen(applyFlow.job)}>
                  <Sparkles className="h-3.5 w-3.5" /> Regenerate documents
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* "Did you apply?" return banner (non-blocking) */}
      {banner && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-popover p-3 shadow-panel">
          <p className="text-sm">Did you apply to <span className="font-semibold">{banner.title}</span> at {banner.company}?</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="success" className="flex-1"
              onClick={() => { appliedMutation.mutate(banner.appId); setBanner(null); }}>
              Yes, I applied
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setBanner(null)}>Not yet</Button>
          </div>
        </div>
      )}
    </div>
  );
}
