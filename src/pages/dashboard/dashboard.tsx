import { Briefcase, Play, CheckSquare, TrendingUp, Clock, Target, DollarSign, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { formatRelativeDate } from "@/lib/utils";

const MOCK_STATS = {
  jobsFoundToday: 47,
  shortlisted: 12,
  applied: 8,
  needsApproval: 3,
  weeklyTotal: 34,
  matchRate: 68,
  tokenCostToday: 0.47,
  planLimit: 100,
  planUsed: 34,
};

const MOCK_RECENT: Array<{
  id: string; company: string; role: string; score: number;
  status: string; date: string; ats: string;
}> = [
  { id: "1", company: "Stripe", role: "Senior Software Engineer", score: 92, status: "APPLIED", date: new Date(Date.now() - 2 * 3600000).toISOString(), ats: "Greenhouse" },
  { id: "2", company: "Linear", role: "Staff Engineer", score: 88, status: "NEEDS_APPROVAL", date: new Date(Date.now() - 4 * 3600000).toISOString(), ats: "Ashby" },
  { id: "3", company: "Vercel", role: "Full Stack Engineer", score: 85, status: "GENERATED", date: new Date(Date.now() - 6 * 3600000).toISOString(), ats: "Lever" },
  { id: "4", company: "Notion", role: "Senior Engineer", score: 79, status: "APPLIED", date: new Date(Date.now() - 86400000).toISOString(), ats: "Greenhouse" },
  { id: "5", company: "Figma", role: "Frontend Engineer", score: 74, status: "SHORTLISTED", date: new Date(Date.now() - 86400000).toISOString(), ats: "Workday" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "info" | "secondary" | "destructive" | "outline" }> = {
  APPLIED: { label: "Applied", variant: "success" },
  NEEDS_APPROVAL: { label: "Needs Review", variant: "warning" },
  GENERATED: { label: "Generated", variant: "info" },
  SHORTLISTED: { label: "Shortlisted", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  DRAFT_ONLY: { label: "Draft", variant: "outline" },
};

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 80 ? "success" : score >= 60 ? "warning" : "destructive";
  return <Badge variant={variant}>{score}%</Badge>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const pctUsed = Math.round((MOCK_STATS.planUsed / MOCK_STATS.planLimit) * 100);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Good morning, {firstName} 👋</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Here's what's happening with your job search today</p>
        </div>
        <Button onClick={() => navigate("/runs")} size="lg">
          <Zap className="h-4 w-4" />
          Start Run
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Jobs Found Today</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Target className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-bold">{MOCK_STATS.jobsFoundToday}</div>
            <p className="text-xs text-success mt-1">↑ 12 from yesterday</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Shortlisted</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
                <TrendingUp className="h-4 w-4 text-warning" />
              </div>
            </div>
            <div className="text-3xl font-bold">{MOCK_STATS.shortlisted}</div>
            <p className="text-xs text-muted-foreground mt-1">{MOCK_STATS.matchRate}% match rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Applied</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
                <Briefcase className="h-4 w-4 text-success" />
              </div>
            </div>
            <div className="text-3xl font-bold">{MOCK_STATS.applied}</div>
            <p className="text-xs text-muted-foreground mt-1">{MOCK_STATS.weeklyTotal} this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Needs Review</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
                <CheckSquare className="h-4 w-4 text-destructive" />
              </div>
            </div>
            <div className="text-3xl font-bold">{MOCK_STATS.needsApproval}</div>
            {MOCK_STATS.needsApproval > 0 && (
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto text-xs text-primary"
                onClick={() => navigate("/review")}
              >
                Review now →
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent applications */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Applications</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("/applications")}>
                  View all
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {MOCK_RECENT.map((app) => {
                  const statusCfg = STATUS_CONFIG[app.status] ?? { label: app.status, variant: "secondary" as const };
                  return (
                    <div key={app.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{app.role}</p>
                          <ScoreBadge score={app.score} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">{app.company}</p>
                          <span className="text-xs text-muted-foreground">·</span>
                          <p className="text-xs text-muted-foreground">{app.ats}</p>
                          <span className="text-xs text-muted-foreground">·</span>
                          <p className="text-xs text-muted-foreground">{formatRelativeDate(app.date)}</p>
                        </div>
                      </div>
                      <Badge variant={statusCfg.variant} className="ml-3 shrink-0">
                        {statusCfg.label}
                      </Badge>
                    </div>
                  );
                })}
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
              <CardDescription>Starter Plan · {MOCK_STATS.planUsed}/{MOCK_STATS.planLimit} applications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={pctUsed} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{MOCK_STATS.planUsed} used</span>
                <span>{MOCK_STATS.planLimit - MOCK_STATS.planUsed} remaining</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  ${MOCK_STATS.tokenCostToday.toFixed(2)} AI cost today
                </span>
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
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/runs")}>
                <Play className="h-4 w-4 text-primary" />
                Start new run
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/resume")}>
                <Briefcase className="h-4 w-4 text-primary" />
                Update resume
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/review")}>
                <CheckSquare className="h-4 w-4 text-warning" />
                Review queue {MOCK_STATS.needsApproval > 0 && `(${MOCK_STATS.needsApproval})`}
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate("/applications")}>
                <Clock className="h-4 w-4 text-muted-foreground" />
                Follow-up tracker
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
