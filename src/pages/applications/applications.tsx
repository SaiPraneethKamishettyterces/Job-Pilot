import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Filter, Search, Loader2, Archive, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeDate } from "@/lib/utils";
import { getApplications, archiveApplication } from "@/services/api";
import type { Application, ApplicationStatus } from "@/types";

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; variant: "default" | "success" | "warning" | "info" | "secondary" | "destructive" | "outline" }> = {
  DISCOVERED: { label: "Discovered", variant: "secondary" },
  SHORTLISTED: { label: "Shortlisted", variant: "info" },
  MATCHED: { label: "Matched", variant: "info" },
  GENERATED: { label: "Generated", variant: "info" },
  TAILORED_RESUME_READY: { label: "Resume Ready", variant: "info" },
  NEEDS_APPROVAL: { label: "Review", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  APPLICATION_STARTED: { label: "Applying", variant: "info" },
  FORM_FILLED_READY_TO_SUBMIT: { label: "Form Filled", variant: "warning" },
  READY_FOR_USER_SUBMIT: { label: "Ready to Submit", variant: "warning" },
  APPLIED: { label: "Applied", variant: "success" },
  ASSISTED_REQUIRED: { label: "Assisted", variant: "warning" },
  CAPTCHA_REQUIRED: { label: "CAPTCHA", variant: "destructive" },
  LOGIN_REQUIRED: { label: "Login Required", variant: "destructive" },
  QUESTION_NEEDS_REVIEW: { label: "Question Review", variant: "warning" },
  DRAFT_ONLY: { label: "Draft", variant: "outline" },
  DECLINED: { label: "Declined", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  FAILED_TECHNICAL: { label: "Failed", variant: "destructive" },
  SKIPPED_UNSUPPORTED: { label: "Skipped", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
  FOLLOW_UP_DUE: { label: "Follow Up", variant: "warning" },
};

export function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["applications", statusFilter, search],
    queryFn: () =>
      getApplications({
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: search.trim() || undefined,
      }),
    staleTime: 30_000,
  });

  const archiveMutation = useMutation({
    mutationFn: archiveApplication,
    onSuccess: () => {
      toast.success("Application archived");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => toast.error("Failed to archive application"),
  });

  const applications: Application[] = data?.applications ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Applications</h2>
          {isLoading ? (
            <Skeleton className="h-4 w-32 mt-1" />
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">{total} total application{total !== 1 ? "s" : ""}</p>
          )}
        </div>
        <Button variant="outline" size="sm" disabled>
          <Filter className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company or role…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
            <SelectItem value="NEEDS_APPROVAL">Needs Review</SelectItem>
            <SelectItem value="GENERATED">Generated</SelectItem>
            <SelectItem value="SHORTLISTED">Shortlisted</SelectItem>
            <SelectItem value="DECLINED">Declined</SelectItem>
            <SelectItem value="FOLLOW_UP_DUE">Follow Up Due</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load applications — make sure the server is running and DATABASE_URL is configured.
        </div>
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company / Role</TableHead>
                <TableHead>ATS</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => {
                const statusCfg = STATUS_CONFIG[app.status];
                return (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{app.company}</p>
                        <p className="text-xs text-muted-foreground">{app.roleTitle}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{app.atsPlatform ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      {app.matchScore != null ? (
                        <Badge variant={app.matchScore >= 80 ? "success" : app.matchScore >= 60 ? "warning" : "destructive"}>
                          {app.matchScore}%
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {app.applyMode?.replace(/_/g, " ").toLowerCase() ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatRelativeDate(app.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      {app.followUpDate ? (
                        <span className="text-xs text-warning">{formatRelativeDate(app.followUpDate)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {app.jobUrl && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a href={app.jobUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted transition-colors">
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>View job posting</TooltipContent>
                          </Tooltip>
                        )}
                        {app.status !== "ARCHIVED" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => archiveMutation.mutate(app.id)}
                                disabled={archiveMutation.isPending}
                              >
                                {archiveMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Archive className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Archive</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {!isLoading && !isError && applications.length === 0 && (
          <div className="py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No applications yet</p>
            <p className="text-xs text-muted-foreground">
              {statusFilter !== "ALL" || search
                ? "Try clearing filters"
                : "Start a run to begin discovering and applying to jobs"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
