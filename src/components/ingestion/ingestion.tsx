import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { Play, Clock, CheckCircle, XCircle, Loader2, Zap, CreditCard, Database, DownloadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { formatRelativeDate } from "@/lib/utils";
import {
  activateSubscription, getIngestionRuns, getSubscription, startIngestion, type IngestionRun,
} from "@/services/api";

const ACTIVE_STATUSES = ["CREATED", "DISCOVERING_JOBS", "PARSING_JOBS", "SCORING", "APPLYING"];
export const isIngestActive = (s: string) => ACTIVE_STATUSES.includes(s);
const isActiveStatus = isIngestActive;

// Pipeline stage → % complete, so the bar reflects real progress, not a fake timer.
const STAGE_PCT: Record<string, number> = {
  CREATED: 8, DISCOVERING_JOBS: 35, PARSING_JOBS: 60, SCORING: 85, APPLYING: 95, COMPLETED: 100, FAILED: 100,
};
const STAGE_LABEL: Record<string, string> = {
  CREATED: "Starting…", DISCOVERING_JOBS: "Discovering jobs from ATS boards…",
  PARSING_JOBS: "Parsing & normalizing…", SCORING: "Scoring matches…", APPLYING: "Applying…",
  COMPLETED: "Done", FAILED: "Failed",
};

// Shared mutation success/refresh wiring so the button and history stay in sync.
function useRunInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["subscription"] });
    qc.invalidateQueries({ queryKey: ["ingestionRuns"] });
  };
}

/**
 * Smart run trigger — the ONLY entry point for ingestion (the old /runs page is gone).
 *   • Active subscriber → starts an ingestion run immediately, inline.
 *   • Everyone else → opens a dialog: Subscribe (→ /billing) or start a one-off test run here.
 */
export function StartRunButton(
  { size = "lg", className, variant = "default" }:
  { size?: "lg" | "default" | "sm"; className?: string; variant?: "default" | "outline" },
) {
  const navigate = useNavigate();
  const refresh = useRunInvalidation();
  const [open, setOpen] = useState(false);

  const subQuery = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });
  const isActive = subQuery.data?.status === "active";

  const startMut = useMutation({
    mutationFn: startIngestion,
    onSuccess: () => { toast.success("Ingestion run started — discovering jobs…"); refresh(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not start ingestion"),
  });

  const activateMut = useMutation({
    mutationFn: () => activateSubscription(),
    onSuccess: (res) => {
      toast.success(`Test run started (${res.run.id.slice(0, 8)}…)`);
      setOpen(false);
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not start test run"),
  });

  const handleClick = () => {
    if (subQuery.isLoading) return;
    if (isActive) startMut.mutate();
    else setOpen(true);
  };

  return (
    <>
      <Button onClick={handleClick} size={size} variant={variant} className={className} disabled={startMut.isPending || subQuery.isLoading}>
        {startMut.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
          : <><Zap className={`h-4 w-4 ${variant === "outline" ? "text-primary" : ""}`} /> Start a Run</>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscribe to start ingestion</DialogTitle>
            <DialogDescription>
              Job ingestion fetches and scores jobs from public ATS boards. It needs an active subscription —
              subscribe to run it for real, or start a one-off test run right here.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Current plan</span>
            <Badge variant={isActive ? "success" : "info"}>
              {subQuery.data?.planName ?? subQuery.data?.status ?? "No plan"}
            </Badge>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button className="w-full" onClick={() => { setOpen(false); navigate("/billing"); }}>
              <CreditCard className="h-4 w-4" /> Subscribe
            </Button>
            <Button variant="outline" className="w-full" disabled={activateMut.isPending} onClick={() => activateMut.mutate()}>
              {activateMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting test run…</>
                : <><Play className="h-4 w-4" /> Start test ingestion run</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Live progress banner for an in-flight ingestion run. Polls every 2s while a run
 * is active, shows the pipeline stage + live found/stored counts, and — when the run
 * finishes — refreshes the Jobs list so the new jobs appear where the user expects.
 */
export function ActiveRunBanner() {
  const qc = useQueryClient();
  const prevStatus = useRef<string | null>(null);
  const [justDone, setJustDone] = useState<IngestionRun | null>(null);

  const q = useQuery({
    queryKey: ["ingestionRuns"],
    queryFn: getIngestionRuns,
    refetchInterval: (query) => (query.state.data?.runs.some((r) => isActiveStatus(r.status)) ? 2000 : false),
  });
  const latest = q.data?.runs?.[0];

  useEffect(() => {
    if (!latest) return;
    const was = prevStatus.current;
    if (was && isActiveStatus(was) && !isActiveStatus(latest.status)) {
      qc.invalidateQueries({ queryKey: ["jobs"] }); // surface the freshly fetched jobs
      if (latest.status === "COMPLETED") {
        toast.success(`Fetched ${latest.jobsInserted} new job${latest.jobsInserted === 1 ? "" : "s"} — see Jobs Found`);
        setJustDone(latest);
      }
    }
    prevStatus.current = latest.status;
  }, [latest, qc]);

  const active = latest && isActiveStatus(latest.status);
  const run = active ? latest : justDone;
  if (!run) return null;

  const failed = run.status === "FAILED";
  const pct = STAGE_PCT[run.status] ?? 5;
  const accent = failed ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5";

  return (
    <Card className={accent}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {active ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
              : failed ? <XCircle className="h-4 w-4 text-destructive" />
              : <CheckCircle className="h-4 w-4 text-success" />}
            {active ? "Fetching jobs…" : failed ? "Ingestion failed" : "Ingestion complete"}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{STAGE_LABEL[run.status] ?? run.status}</span>
            {!active && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setJustDone(null)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <Progress value={pct} className="mt-3 h-2" />

        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-background/60 p-2">
            <p className="text-base font-semibold">{run.jobsDiscovered}</p>
            <p className="text-[11px] text-muted-foreground">found</p>
          </div>
          <div className="rounded-lg bg-background/60 p-2">
            <p className="text-base font-semibold text-success">{run.jobsInserted}</p>
            <p className="text-[11px] text-muted-foreground">added to Jobs Found</p>
          </div>
          <div className="rounded-lg bg-background/60 p-2">
            <p className="text-base font-semibold text-muted-foreground">{run.duplicatesSkipped}</p>
            <p className="text-[11px] text-muted-foreground">duplicates</p>
          </div>
        </div>

        {run.errorMessage && (
          <p className="mt-2 text-xs text-destructive bg-destructive/5 rounded-md px-3 py-2">{run.errorMessage}</p>
        )}
        {!active && !failed && run.jobsInserted > 0 && (
          <Link to={`/jobs`} className="mt-3 block">
            <Button variant="outline" size="sm" className="w-full">
              <DownloadCloud className="h-3.5 w-3.5" /> View {run.jobsInserted} new jobs
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const Icon =
    status === "COMPLETED" ? CheckCircle : status === "FAILED" ? XCircle : isActiveStatus(status) ? Loader2 : Clock;
  const variant = status === "COMPLETED" ? "success" : status === "FAILED" ? "destructive" : "info";
  return (
    <Badge variant={variant} className="shrink-0 gap-1.5">
      <Icon className={`h-3 w-3 ${isActiveStatus(status) ? "animate-spin" : ""}`} />
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

function RunCard({ run }: { run: IngestionRun }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm">Ingestion run · {formatRelativeDate(run.createdAt)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Trigger: {run.triggerType ?? "—"}
              {run.requestedSources.length > 0 && <> · {run.requestedSources.length} sources</>}
            </p>
          </div>
          <StatusBadge status={run.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="text-lg font-semibold">{run.jobsDiscovered}</p>
            <p className="text-xs text-muted-foreground">found</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="text-lg font-semibold text-success">{run.jobsInserted}</p>
            <p className="text-xs text-muted-foreground">stored (T2)</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5">
            <p className="text-lg font-semibold text-muted-foreground">{run.duplicatesSkipped}</p>
            <p className="text-xs text-muted-foreground">duplicates</p>
          </div>
        </div>

        {run.errorMessage && (
          <p className="mt-3 text-xs text-destructive bg-destructive/5 rounded-md px-3 py-2">{run.errorMessage}</p>
        )}

        {run.status === "COMPLETED" && run.jobsInserted > 0 && (
          <div className="mt-3">
            <Link to={`/candidates?runId=${run.id}`}>
              <Button variant="outline" size="sm" className="w-full">
                <Database className="h-3.5 w-3.5" /> View {run.jobsInserted} candidates
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Ingestion run history — polls live while a run is in flight. */
export function RunHistory() {
  const runsQuery = useQuery({
    queryKey: ["ingestionRuns"],
    queryFn: getIngestionRuns,
    refetchInterval: (q) => (q.state.data?.runs.some((r) => isActiveStatus(r.status)) ? 2500 : false),
  });
  const runs = runsQuery.data?.runs ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">Run History</h3>
        {runsQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {runsQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {runsQuery.isError && (
        <p className="text-sm text-destructive">Could not load runs. Is the backend / database up?</p>
      )}

      {!runsQuery.isLoading && runs.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No ingestion runs yet. Click “Start a Run” above to begin.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {runs.map((run) => <RunCard key={run.id} run={run} />)}
      </div>
    </div>
  );
}
