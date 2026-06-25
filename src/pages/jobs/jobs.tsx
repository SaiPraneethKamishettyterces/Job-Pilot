import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Loader2,
  ExternalLink,
  Trash2,
  RefreshCw,
  MapPin,
  DollarSign,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Link,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { addJob, getJobs, removeJob, rescoreJob, type JobWithMatch } from "@/services/api";

type DecisionFilter = "ALL" | "SHORTLIST" | "REVIEW" | "SKIP";

const DECISION_CONFIG: Record<
  string,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "default" | "info" | "outline" }
> = {
  SHORTLIST: { label: "Shortlist", variant: "success" },
  REVIEW: { label: "Review", variant: "warning" },
  SKIP: { label: "Skip", variant: "destructive" },
};

function ScoreBadge({ score }: { score: number }) {
  const variant =
    score >= 80 ? "success" : score >= 60 ? "warning" : "destructive";
  return (
    <Badge variant={variant} className="tabular-nums font-mono">
      {score}%
    </Badge>
  );
}

function JobCard({
  item,
  onRemove,
  onRescore,
  isRemoving,
  isRescoring,
}: {
  item: JobWithMatch;
  onRemove: (jobId: string) => void;
  onRescore: (jobId: string) => void;
  isRemoving: boolean;
  isRescoring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { job } = item;
  const decisionCfg = DECISION_CONFIG[item.decision] ?? {
    label: item.decision,
    variant: "secondary" as const,
  };

  const salaryText =
    job.salaryMin && job.salaryMax
      ? `${job.salaryCurrency ?? "USD"} ${(job.salaryMin / 1000).toFixed(0)}k–${(job.salaryMax / 1000).toFixed(0)}k`
      : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{job.title}</p>
                <ScoreBadge score={item.score} />
                <Badge variant={decisionCfg.variant}>{decisionCfg.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{job.company}</p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {job.location && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                    {job.isRemote && " · Remote"}
                  </span>
                )}
                {salaryText && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    {salaryText}
                  </span>
                )}
                {job.experienceMin != null && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3" />
                    {job.experienceMin}
                    {job.experienceMax ? `–${job.experienceMax}` : "+"} yrs
                  </span>
                )}
                {job.atsPlatform && (
                  <span className="text-xs text-muted-foreground">{job.atsPlatform}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {job.jobUrl && (
                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                  <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open job posting for ${job.title} at ${job.company}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRescore(job.id)}
                aria-label={`Re-score ${job.title}`}
                disabled={isRescoring}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRescoring ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onRemove(job.id)}
                aria-label={`Remove ${job.title}`}
                disabled={isRemoving}
              >
                {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse job details" : "Expand job details"}
              >
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {job.skills.slice(0, 8).map((s) => (
                <Badge key={s} variant="outline" className="text-xs py-0 px-1.5 h-5">
                  {s}
                </Badge>
              ))}
              {job.skills.length > 8 && (
                <span className="text-xs text-muted-foreground self-center">
                  +{job.skills.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>

        {expanded && (
          <>
            <Separator />
            <div className="p-4 space-y-3">
              {item.reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-success mb-1">Strengths</p>
                  <ul className="space-y-0.5">
                    {item.reasons.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-success mt-px">✓</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {item.risks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-warning mb-1">Risks</p>
                  <ul className="space-y-0.5">
                    {item.risks.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <span className="text-warning mt-px">!</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {job.requirements.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Requirements</p>
                  <ul className="space-y-0.5">
                    {job.requirements.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AddJobDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [jobUrl, setJobUrl] = useState("");
  const [rawText, setRawText] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      addJob(mode === "url" ? { jobUrl } : { rawText }),
    onSuccess: () => {
      toast.success("Job parsed and scored!");
      setJobUrl("");
      setRawText("");
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add job");
    },
  });

  const canSubmit =
    !isPending &&
    (mode === "url" ? jobUrl.trim().length > 0 : rawText.trim().length > 50);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a Job</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button
              variant={mode === "url" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setMode("url")}
            >
              <Link className="h-3.5 w-3.5" />
              Job URL
            </Button>
            <Button
              variant={mode === "text" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setMode("text")}
            >
              <FileText className="h-3.5 w-3.5" />
              Paste JD
            </Button>
          </div>

          {mode === "url" ? (
            <div className="space-y-1.5">
              <Label htmlFor="job-url">Job Posting URL</Label>
              <Input
                id="job-url"
                placeholder="https://jobs.lever.co/stripe/..."
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && mutate()}
              />
              <p className="text-xs text-muted-foreground">
                JobPilot will fetch and parse the job description automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="job-text">Job Description</Label>
              <Textarea
                id="job-text"
                placeholder="Paste the full job description here…"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Paste from any job board — Claude will extract title, company, skills, and requirements.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={() => mutate()} disabled={!canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing & Scoring…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Add Job
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function JobsPage() {
  const [filter, setFilter] = useState<DecisionFilter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobs", filter],
    queryFn: () =>
      getJobs(filter !== "ALL" ? (filter as "SHORTLIST" | "REVIEW" | "SKIP") : undefined),
  });

  const removeMutation = useMutation({
    mutationFn: removeJob,
    onSuccess: () => {
      toast.success("Job removed");
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: () => toast.error("Failed to remove job"),
  });

  const rescoreMutation = useMutation({
    mutationFn: rescoreJob,
    onSuccess: (result) => {
      toast.success(`Re-scored: ${result.score}% (${result.decision})`);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: () => toast.error("Failed to re-score job"),
  });

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const shortlistCount = jobs.filter((j) => j.decision === "SHORTLIST").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Jobs</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total} job{total !== 1 ? "s" : ""} · {shortlistCount} shortlisted
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Job
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as DecisionFilter)}>
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          <TabsTrigger value="SHORTLIST">Shortlist</TabsTrigger>
          <TabsTrigger value="REVIEW">Review</TabsTrigger>
          <TabsTrigger value="SKIP">Skip</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive mb-2">Failed to load jobs</p>
            <p className="text-xs text-muted-foreground">
              Make sure the server is running and DATABASE_URL is configured.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No jobs yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Add a job URL or paste a job description to get started.
            </p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add your first job
            </Button>
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((item) => (
            <JobCard
              key={item.matchId}
              item={item}
              onRemove={(id) => removeMutation.mutate(id)}
              onRescore={(id) => rescoreMutation.mutate(id)}
              isRemoving={removeMutation.isPending && removeMutation.variables === item.job.id}
              isRescoring={rescoreMutation.isPending && rescoreMutation.variables === item.job.id}
            />
          ))}
        </div>
      )}

      <AddJobDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })}
      />
    </div>
  );
}
