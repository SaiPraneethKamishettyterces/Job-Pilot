import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Database, ExternalLink, Loader2, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getJobCandidates, type JobCandidate } from "@/services/api";

function formatSalary(j: JobCandidate): string {
  if (!j.salaryMin && !j.salaryMax) return "—";
  const cur = j.salaryCurrency ?? "";
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const range =
    j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax
      ? `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}`
      : fmt((j.salaryMax ?? j.salaryMin)!);
  const period = j.salaryPeriod && j.salaryPeriod !== "unknown" ? `/${j.salaryPeriod.replace("ly", "")}` : "";
  return `${cur} ${range}${period}`.trim();
}

function remoteBadge(remoteType: string | null) {
  if (!remoteType || remoteType === "unknown") return null;
  const variant = remoteType === "remote" ? "success" : remoteType === "hybrid" ? "info" : "secondary";
  return <Badge variant={variant}>{remoteType}</Badge>;
}

export function CandidatesPage() {
  const [params] = useSearchParams();
  const runId = params.get("runId") ?? undefined;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jobCandidates", runId ?? "all"],
    queryFn: () => getJobCandidates(runId),
  });

  const jobs = useMemo(() => data?.jobs ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Job Candidates (T2)</h2>
          <p className="text-sm text-muted-foreground">
            Normalized jobs produced by the ingestion worker.
            {runId && <> Filtered to run <code className="text-xs">{runId.slice(0, 8)}…</code>.</>}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading candidates…
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Could not load candidates. Is the backend / database up?</p>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No candidates yet. Run an ingestion from the{" "}
            <a href="/runs" className="text-primary underline">
              Runs
            </a>{" "}
            page.
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Seniority</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium max-w-[220px]">
                      <div className="truncate">{j.title}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {remoteBadge(j.remoteType)}
                        {j.visaSponsored === true && <Badge variant="success">visa</Badge>}
                        {j.visaSponsored === false && <Badge variant="secondary">no visa</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{j.company}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {j.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {j.location}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{j.seniority ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatSalary(j)}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {j.skills.slice(0, 4).map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {j.skills.length > 4 && (
                          <span className="text-xs text-muted-foreground">+{j.skills.length - 4}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.source ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {j.applyUrl || j.jobUrl ? (
                        <a
                          href={(j.applyUrl ?? j.jobUrl)!}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View job posting for ${j.title} at ${j.company}`}
                          className="inline-flex text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
