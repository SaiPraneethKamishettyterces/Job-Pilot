import { Briefcase, CheckSquare, TrendingUp, Clock, Target, DollarSign, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { cn, formatRelativeDate } from "@/lib/utils";
import { getDashboardStats, type DashboardStats } from "@/services/api";
import { StartRunButton, RunHistory, ActiveRunBanner } from "@/components/ingestion/ingestion";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "info" | "secondary" | "destructive" | "outline" }> = {
  APPLIED: { label: "Applied", variant: "success" },
  APPROVED: { label: "Approved", variant: "success" },
  ASSISTED_REQUIRED: { label: "Needs Your Help", variant: "warning" },
  NEEDS_APPROVAL: { label: "Needs Review", variant: "warning" },
  GENERATED: { label: "Generated", variant: "info" },
  SHORTLISTED: { label: "Shortlisted", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  DRAFT_ONLY: { label: "Draft", variant: "outline" },
  DECLINED: { label: "Declined", variant: "secondary" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
};

// Collapse repeats of the same job (same title + company) to one row, keeping the
// first occurrence — the list arrives newest-first, so that's the latest status.
function dedupeRecent<T extends { roleTitle: string; company: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = `${a.roleTitle}|${a.company}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 80 ? "success" : score >= 60 ? "warning" : "destructive";
  return <Badge variant={variant}>{score}%</Badge>;
}

function StatCard({ label, value, sub, icon: Icon, iconBg, isLoading, onClick }: {
  label: string; value: string | number; sub: string | React.ReactNode;
  icon: typeof Target; iconBg: string; isLoading: boolean; onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <Card
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      className={cn("p-5 hover:-translate-y-px", clickable && "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/50")}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="mt-4 h-9 w-16" />
      ) : (
        <div className="mt-4 text-4xl font-bold leading-none tracking-[-0.03em] tabular-nums">{value}</div>
      )}
      <div className="mt-2 text-xs text-muted-foreground">{isLoading ? <Skeleton className="h-3 w-24" /> : sub}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const { data: stats, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ["stats"],
    queryFn: getDashboardStats,
    staleTime: 60_000,
  });

  const pctUsed = stats ? Math.round((stats.plan.used / stats.plan.limit) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden p-6 md:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: "linear-gradient(115deg, rgba(37,99,235,0.16), rgba(139,92,246,0.10) 45%, transparent 70%)" }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-blue-soft">Welcome back</p>
            <h2 className="mt-1 text-3xl font-bold leading-8 tracking-[-0.025em]">
              Good to see you, <span className="text-gradient">{firstName}</span>
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Here's what's happening with your job search today.</p>
          </div>
          <StartRunButton size="lg" className="shrink-0" />
        </div>
      </Card>

      {/* Live fetch progress after Start a Run */}
      <ActiveRunBanner />

      {isError && (
        <div className="rounded-card border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-300 light:text-red-600">
          Could not load live stats — make sure the server is running and DATABASE_URL is configured.
        </div>
      )}

      {/* Metric bento */}
      <div className="bento-grid">
        <StatCard
          label="Jobs Found Today"
          value={stats?.jobsFoundToday ?? 0}
          sub={stats ? `${stats.matchRate}% avg match rate` : ""}
          icon={Target}
          iconBg="bg-brand-blue/12 text-brand-blue-soft"
          isLoading={isLoading}
          onClick={() => navigate("/jobs")}
        />
        <StatCard
          label="Shortlisted"
          value={stats?.shortlisted ?? 0}
          sub="Above your threshold"
          icon={TrendingUp}
          iconBg="bg-amber-500/12 text-amber-300 light:text-amber-600"
          isLoading={isLoading}
          onClick={() => navigate("/jobs")}
        />
        <StatCard
          label="Applied"
          value={stats?.applied ?? 0}
          sub={stats ? `${stats.weeklyTotal} this week` : ""}
          icon={Briefcase}
          iconBg="bg-green-500/12 text-green-300 light:text-green-600"
          isLoading={isLoading}
          onClick={() => navigate("/applied?status=APPLIED")}
        />
        <StatCard
          label="Needs Review"
          value={stats?.needsApproval ?? 0}
          sub={(stats?.needsApproval ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-brand-blue-soft">
              Review now <ArrowRight className="h-3 w-3" />
            </span>
          ) : "All caught up"}
          icon={CheckSquare}
          iconBg="bg-brand-purple/14 text-brand-purple-soft"
          isLoading={isLoading}
          onClick={() => navigate("/review")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent applications */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Applications</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("/applied")}>
                  View all
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="divide-y">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-6 py-3 flex items-center gap-3">
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : (stats?.recentApplications?.length ?? 0) === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                  No applications yet — start a run to get going.
                </div>
              ) : (
                <div className="divide-y">
                  {dedupeRecent(stats!.recentApplications).map((app) => {
                    const statusCfg = STATUS_CONFIG[app.status] ?? { label: app.status, variant: "secondary" as const };
                    return (
                      <div key={app.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{app.roleTitle}</p>
                            {app.matchScore != null && <ScoreBadge score={app.matchScore} />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground">{app.company}</p>
                            {app.atsPlatform && (
                              <>
                                <span className="text-xs text-muted-foreground">·</span>
                                <p className="text-xs text-muted-foreground">{app.atsPlatform}</p>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground">·</span>
                            <p className="text-xs text-muted-foreground">{formatRelativeDate(app.createdAt)}</p>
                          </div>
                        </div>
                        <Badge variant={statusCfg.variant} className="ml-3 shrink-0">
                          {statusCfg.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-border px-6 py-2.5">
                <button
                  onClick={() => navigate("/applied")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View in Applied <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Plan usage */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Plan Usage</CardTitle>
              {isLoading ? (
                <Skeleton className="h-4 w-40" />
              ) : (
                <CardDescription>
                  {stats?.plan.name ?? "Free"} Plan · {stats?.plan.used ?? 0}/{stats?.plan.limit ?? 5} applications
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <Skeleton className="h-2 w-full rounded-full" />
              ) : (
                <Progress value={pctUsed} />
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {isLoading ? (
                  <Skeleton className="h-3 w-32" />
                ) : (
                  <>
                    <span>{stats?.plan.used ?? 0} used</span>
                    <span>{(stats?.plan.limit ?? 5) - (stats?.plan.used ?? 0)} remaining</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                {isLoading ? (
                  <Skeleton className="h-3 w-28" />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    ${(stats?.tokenCostToday ?? 0).toFixed(2)} AI cost today
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/billing")}>
                Upgrade plan
              </Button>
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StartRunButton variant="outline" size="default" className="w-full justify-start gap-3" />
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/resume")}>
                <Briefcase className="h-4 w-4 text-primary" />
                Update resume
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/review")}>
                <CheckSquare className="h-4 w-4 text-warning" />
                Review queue {(stats?.needsApproval ?? 0) > 0 && `(${stats!.needsApproval})`}
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/applied")}>
                <Clock className="h-4 w-4 text-muted-foreground" />
                Follow-up tracker
              </Button>
              {isLoading && (
                <div className="flex items-center justify-center py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Ingestion run history (folded in from the old /runs page) */}
      <RunHistory />
    </div>
  );
}
