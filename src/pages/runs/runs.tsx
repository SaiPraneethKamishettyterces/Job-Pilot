import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Clock, CheckCircle, XCircle, Loader2, Zap, CreditCard, Database } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatRelativeDate } from "@/lib/utils";
import {
  activateSubscription,
  getIngestionRuns,
  getSubscription,
  startIngestion,
  type IngestionRun,
} from "@/services/api";

const ACTIVE_STATUSES = ["CREATED", "DISCOVERING_JOBS", "PARSING_JOBS", "SCORING", "APPLYING"];

function isActiveStatus(s: string) {
  return ACTIVE_STATUSES.includes(s);
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
            <p className="font-medium text-sm">
              Ingestion run · {formatRelativeDate(run.createdAt)}
            </p>
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
          <p className="mt-3 text-xs text-destructive bg-destructive/5 rounded-md px-3 py-2">
            {run.errorMessage}
          </p>
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

export function RunsPage() {
  const qc = useQueryClient();

  const subQuery = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });
  const runsQuery = useQuery({
    queryKey: ["ingestionRuns"],
    queryFn: getIngestionRuns,
    // Poll while any run is still in flight so the UI updates live.
    refetchInterval: (q) =>
      q.state.data?.runs.some((r) => isActiveStatus(r.status)) ? 2500 : false,
  });

  const isActive = subQuery.data?.status === "active";

  const activateMut = useMutation({
    mutationFn: () => activateSubscription(),
    onSuccess: (res) => {
      toast.success(`Subscription active — ingestion started (${res.run.id.slice(0, 8)}…)`);
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["ingestionRuns"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Activation failed"),
  });

  const startMut = useMutation({
    mutationFn: startIngestion,
    onSuccess: () => {
      toast.success("Ingestion run started — discovering jobs…");
      qc.invalidateQueries({ queryKey: ["ingestionRuns"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not start ingestion"),
  });

  const runs = runsQuery.data?.runs ?? [];

  return (
    <div className="space-y-6">
      {/* Subscription + trigger card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Job Ingestion
          </CardTitle>
          <CardDescription>
            Activating your subscription triggers a backend ingestion run: JobPilot fetches jobs from
            public ATS boards based on your target companies, normalizes them, and stores them as
            candidates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-background p-3">
            <div>
              <p className="text-sm font-medium">Subscription</p>
              <p className="text-xs text-muted-foreground">
                {subQuery.isLoading ? "Checking…" : subQuery.data?.planName ?? "No plan"}
              </p>
            </div>
            <Badge variant={isActive ? "success" : "info"}>
              {subQuery.data?.status ?? "…"}
            </Badge>
          </div>

          <div className="flex gap-3">
            {!isActive ? (
              <Button
                onClick={() => activateMut.mutate()}
                disabled={activateMut.isPending}
                size="lg"
                className="flex-1"
              >
                {activateMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Activating…</>
                ) : (
                  <><CreditCard className="h-4 w-4" /> Activate subscription (test) & ingest</>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => startMut.mutate()}
                disabled={startMut.isPending}
                size="lg"
                className="flex-1"
              >
                {startMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
                ) : (
                  <><Play className="h-4 w-4" /> Start new ingestion run</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Run history */}
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
              No ingestion runs yet. Activate your subscription above to start the first one.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      </div>
    </div>
  );
}
