import { useState } from "react";
import { Play, Clock, CheckCircle, XCircle, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatRelativeDate } from "@/lib/utils";
import type { ApplicationRun, RunStatus } from "@/types";

const MOCK_RUNS: ApplicationRun[] = [
  { id: "r1", userId: "u1", status: "COMPLETED", jobsDiscovered: 47, jobsShortlisted: 12, applicationsTotal: 12, applicationsDone: 8, startedAt: new Date(Date.now() - 3600000).toISOString(), completedAt: new Date(Date.now() - 1800000).toISOString(), createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "r2", userId: "u1", status: "COMPLETED", jobsDiscovered: 31, jobsShortlisted: 8, applicationsTotal: 8, applicationsDone: 8, startedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 84000000).toISOString(), createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "r3", userId: "u1", status: "FAILED", jobsDiscovered: 12, jobsShortlisted: 3, applicationsTotal: 3, applicationsDone: 1, errorMessage: "Job source timeout — Greenhouse API rate limited", startedAt: new Date(Date.now() - 2 * 86400000).toISOString(), createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
];

const STATUS_ICONS: Record<RunStatus, React.ElementType> = {
  CREATED: Clock,
  DISCOVERING_JOBS: Loader2,
  PARSING_JOBS: Loader2,
  SCORING: Loader2,
  GENERATING_DOCUMENTS: Loader2,
  WAITING_FOR_APPROVAL: Clock,
  APPLYING: Loader2,
  COMPLETED: CheckCircle,
  FAILED: XCircle,
  CANCELLED: XCircle,
};

const STATUS_COLORS: Record<RunStatus, string> = {
  CREATED: "text-muted-foreground",
  DISCOVERING_JOBS: "text-primary",
  PARSING_JOBS: "text-primary",
  SCORING: "text-primary",
  GENERATING_DOCUMENTS: "text-primary",
  WAITING_FOR_APPROVAL: "text-warning",
  APPLYING: "text-primary",
  COMPLETED: "text-success",
  FAILED: "text-destructive",
  CANCELLED: "text-muted-foreground",
};

function RunCard({ run }: { run: ApplicationRun }) {
  const Icon = STATUS_ICONS[run.status];
  const color = STATUS_COLORS[run.status];
  const pct = run.applicationsTotal > 0 ? Math.round((run.applicationsDone / run.applicationsTotal) * 100) : 0;
  const isRunning = ["DISCOVERING_JOBS", "PARSING_JOBS", "SCORING", "GENERATING_DOCUMENTS", "APPLYING"].includes(run.status);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 shrink-0 ${color} ${isRunning ? "animate-spin" : ""}`} />
            <div>
              <p className="font-medium text-sm">Run · {formatRelativeDate(run.createdAt)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {run.jobsDiscovered} jobs found · {run.jobsShortlisted} shortlisted
              </p>
            </div>
          </div>
          <Badge
            variant={run.status === "COMPLETED" ? "success" : run.status === "FAILED" ? "destructive" : "info"}
            className="shrink-0"
          >
            {run.status.replace(/_/g, " ").toLowerCase()}
          </Badge>
        </div>

        {run.status !== "CREATED" && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{run.applicationsDone} applied</span>
              <span>{run.applicationsTotal} total</span>
            </div>
            <Progress value={pct} />
          </div>
        )}

        {run.errorMessage && (
          <p className="mt-3 text-xs text-destructive bg-destructive/5 rounded-md px-3 py-2">
            {run.errorMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function RunsPage() {
  const [isStarting, setIsStarting] = useState(false);

  const startRun = async () => {
    setIsStarting(true);
    try {
      const res = await fetch("/api/runs/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start run");
      toast.success("Run started! Discovering jobs…");
    } catch {
      toast.error("Could not start run. Check your profile and preferences.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Start Run card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Start a New Run
          </CardTitle>
          <CardDescription>
            JobPilot will discover jobs, score them against your profile, generate tailored documents,
            and apply based on your approval mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-background p-3 border">
              <p className="text-2xl font-bold text-primary">10</p>
              <p className="text-xs text-muted-foreground mt-1">Apps per day</p>
            </div>
            <div className="rounded-lg bg-background p-3 border">
              <p className="text-2xl font-bold text-warning">70%</p>
              <p className="text-xs text-muted-foreground mt-1">Min match score</p>
            </div>
            <div className="rounded-lg bg-background p-3 border">
              <p className="text-2xl font-bold text-success">Review</p>
              <p className="text-xs text-muted-foreground mt-1">Approval mode</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={startRun} disabled={isStarting} size="lg" className="flex-1">
              {isStarting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
              ) : (
                <><Play className="h-4 w-4" /> Start Run</>
              )}
            </Button>
            <Button variant="outline" size="lg">
              Configure
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Run history */}
      <div>
        <h3 className="text-base font-semibold mb-4">Run History</h3>
        <div className="space-y-3">
          {MOCK_RUNS.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      </div>
    </div>
  );
}
