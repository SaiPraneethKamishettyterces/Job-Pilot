import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, Users, Cpu, Layers, TrendingUp,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  getCompanyBilling, getUserBilling, getFinancials,
  type CompanyBillingMetrics, type UserBillingRow, type Financials,
} from "@/services/api";

function usd(n: number) {
  return n === 0 ? "$0.00" : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`;
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STEP_COLORS: Record<string, string> = {
  scraping: "#6366f1",
  tailoring: "#f59e0b",
  scoring: "#10b981",
  applying: "#3b82f6",
  queuing: "#8b5cf6",
  other: "#94a3b8",
};

const STEP_LABELS: Record<string, string> = {
  scraping: "Scraping",
  tailoring: "Tailoring",
  scoring: "Scoring",
  applying: "Applying",
  queuing: "Queuing",
  other: "Other",
};

function KpiCard({
  label, value, sub, icon: Icon, iconBg, isLoading,
}: {
  label: string; value: string; sub: string;
  icon: typeof DollarSign; iconBg: string; isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${iconBg}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {isLoading ? <Skeleton className="h-9 w-24 mb-1" /> : <div className="text-2xl font-bold">{value}</div>}
        <div className="text-xs text-muted-foreground mt-1">
          {isLoading ? <Skeleton className="h-3 w-28" /> : sub}
        </div>
      </CardContent>
    </Card>
  );
}

function CompanyTab() {
  const { data, isLoading, isError } = useQuery<CompanyBillingMetrics>({
    queryKey: ["billing", "company"],
    queryFn: getCompanyBilling,
    staleTime: 60_000,
  });

  const { data: fin, isLoading: finLoading } = useQuery<Financials>({
    queryKey: ["billing", "financials"],
    queryFn: getFinancials,
    staleTime: 60_000,
  });

  const ai = data?.aiCosts;
  const usage = data?.usage;
  const chartData = ai?.daily30Days ?? [];

  const pipelineSteps = [
    { key: "scraping", label: "Scraping / Discovery" },
    { key: "tailoring", label: "Tailoring" },
    { key: "scoring", label: "Scoring / Matching" },
    { key: "applying", label: "Applying" },
    { key: "queuing", label: "Queuing" },
  ];

  const stepCostMap = Object.fromEntries((ai?.byStep ?? []).map((s) => [s.step, s.cost]));
  const maxStepCost = Math.max(...Object.values(stepCostMap), 0.0001);
  const totalTokens = (ai?.tokens.totalInput ?? 0) + (ai?.tokens.totalOutput ?? 0);

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load billing data — make sure the server is running and DATABASE_URL is configured.
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financials</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="MRR" value={usd(fin?.revenue.mrr ?? 0)} sub={`${fin?.revenue.activeSubscribers ?? 0} active subscribers · ARR ${usd(fin?.revenue.arr ?? 0)}`} icon={DollarSign} iconBg="bg-success/10 text-success" isLoading={finLoading} />
          <KpiCard label="Gross Margin" value={usd(fin?.margin.grossProfit ?? 0)} sub={`${fin?.margin.marginPct ?? 0}% margin (MRR − AI − infra)`} icon={TrendingUp} iconBg="bg-primary/10 text-primary" isLoading={finLoading} />
          <KpiCard label="Cost This Month" value={usd(fin?.costs.totalThisMonth ?? 0)} sub={`AI ${usd(fin?.costs.aiThisMonth ?? 0)} + infra ${usd(fin?.costs.infraMonthly ?? 0)}`} icon={Cpu} iconBg="bg-warning/10 text-warning" isLoading={finLoading} />
          <KpiCard label="ARPU" value={usd(fin?.perUser.arpu ?? 0)} sub={`cost/active user ${usd(fin?.perUser.totalCostPerActiveUser ?? 0)}`} icon={Users} iconBg="bg-primary/10 text-primary" isLoading={finLoading} />
        </div>
        {(fin?.byPlan?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {fin!.byPlan.map((p) => (
              <Badge key={p.plan} variant="secondary" className="text-xs">
                {p.plan}: {p.subscribers} × ${p.priceMonthly} = {usd(p.mrr)}/mo
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Claude AI Costs</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="All-Time AI Cost" value={usd(ai?.totalAllTime ?? 0)} sub={`${fmtTokens(totalTokens)} tokens total`} icon={DollarSign} iconBg="bg-primary/10 text-primary" isLoading={isLoading} />
          <KpiCard label="This Month" value={usd(ai?.thisMonth ?? 0)} sub="Month-to-date" icon={TrendingUp} iconBg="bg-success/10 text-success" isLoading={isLoading} />
          <KpiCard label="This Week" value={usd(ai?.thisWeek ?? 0)} sub="Last 7 days" icon={Layers} iconBg="bg-warning/10 text-warning" isLoading={isLoading} />
          <KpiCard label="Today" value={usd(ai?.today ?? 0)} sub="Current day" icon={Cpu} iconBg="bg-primary/10 text-primary" isLoading={isLoading} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Platform Usage</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Users" value={String(usage?.totalUsers ?? 0)} sub={`${usage?.activeUsersThisMonth ?? 0} active this month`} icon={Users} iconBg="bg-primary/10 text-primary" isLoading={isLoading} />
          <KpiCard label="Total Applications" value={String(usage?.totalApplications ?? 0)} sub={`${usage?.appliedCount ?? 0} submitted`} icon={Layers} iconBg="bg-success/10 text-success" isLoading={isLoading} />
          <KpiCard label="Avg Cost / User" value={usd(usage?.avgCostPerUser ?? 0)} sub="All-time AI spend" icon={DollarSign} iconBg="bg-warning/10 text-warning" isLoading={isLoading} />
          <KpiCard label="Avg Cost / Application" value={usd(usage?.avgCostPerApplication ?? 0)} sub="AI cost per application" icon={DollarSign} iconBg="bg-primary/10 text-primary" isLoading={isLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI Cost — Last 30 Days</CardTitle>
            <CardDescription>Daily Claude spend across all users</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No AI usage recorded yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={40} />
                  <Tooltip formatter={(v) => [usd(Number(v)), "Cost"]} labelFormatter={(l) => fmtDate(String(l))} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cost" fill="#6366f1" radius={[2, 2, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Token Breakdown</CardTitle>
            <CardDescription>All-time token consumption</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : (
              <>
                {[
                  { label: "Input tokens", value: ai?.tokens.totalInput ?? 0 },
                  { label: "Output tokens", value: ai?.tokens.totalOutput ?? 0 },
                  { label: "Cache read tokens", value: ai?.tokens.totalCacheRead ?? 0 },
                ].map((row) => (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium tabular-nums">{fmtTokens(row.value)}</span>
                    </div>
                    <Progress value={totalTokens > 0 ? (row.value / totalTokens) * 100 : 0} className="h-1.5" />
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total tokens</span>
                  <span className="font-semibold">{fmtTokens(totalTokens)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cost per Pipeline Step</CardTitle>
            <CardDescription>AI spend broken down by application stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : pipelineSteps.every((s) => !stepCostMap[s.key]) ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No AI pipeline calls recorded yet.
                <br />
                <span className="text-xs">Populates once job runs execute (scraping, tailoring, scoring, applying).</span>
              </div>
            ) : (
              pipelineSteps.map((s) => {
                const cost = stepCostMap[s.key] ?? 0;
                const pct = maxStepCost > 0 ? (cost / maxStepCost) * 100 : 0;
                return (
                  <div key={s.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: STEP_COLORS[s.key] }} />
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                      <span className="font-medium tabular-nums">{usd(cost)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: STEP_COLORS[s.key] }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cost by Claude Model</CardTitle>
            <CardDescription>Spend and call count per model tier</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
            ) : (ai?.byModel.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No model usage recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {ai!.byModel.map((m) => (
                  <div key={m.model} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{m.model}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTokens(m.inputTokens)} in · {fmtTokens(m.outputTokens)} out · {m.calls} calls
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{usd(m.cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Application Pipeline Status</CardTitle>
          <CardDescription>Volume across all users by stage</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(usage?.applicationsByStatus ?? []).map((s) => (
                <div key={s.status} className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground capitalize">{s.status.replace(/_/g, " ").toLowerCase()}</p>
                  <p className="text-xl font-bold mt-0.5">{s.count}</p>
                </div>
              ))}
              {(usage?.applicationsByStatus.length ?? 0) === 0 && (
                <p className="col-span-4 text-sm text-muted-foreground py-4 text-center">No applications yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ user }: { user: UserBillingRow }) {
  const [expanded, setExpanded] = useState(false);
  const planVariant = user.plan.name === "Pro" ? "default" : user.plan.name === "Starter" ? "info" : "secondary";

  return (
    <>
      <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded((p) => !p)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-sm">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <div>
              <p className="font-medium">{user.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3"><Badge variant={planVariant}>{user.plan.name}</Badge></td>
        <td className="px-4 py-3 text-sm tabular-nums">{usd(user.aiCost.total)}</td>
        <td className="px-4 py-3 text-sm tabular-nums">{usd(user.aiCost.thisMonth)}</td>
        <td className="px-4 py-3 text-sm tabular-nums">{fmtTokens(user.tokens.totalInput + user.tokens.totalOutput)}</td>
        <td className="px-4 py-3 text-sm">{user.applications.applied} / {user.applications.total}</td>
        <td className="px-4 py-3 text-sm">{user.runs.completed} / {user.runs.total}</td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20 border-b">
          <td colSpan={7} className="px-8 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold mb-2">Tokens</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Input</span><span className="tabular-nums">{fmtTokens(user.tokens.totalInput)}</span></div>
                  <div className="flex justify-between"><span>Output</span><span className="tabular-nums">{fmtTokens(user.tokens.totalOutput)}</span></div>
                  <div className="flex justify-between"><span>Cache reads</span><span className="tabular-nums">{fmtTokens(user.tokens.totalCacheRead)}</span></div>
                  <div className="flex justify-between"><span>Total events</span><span className="tabular-nums">{user.tokens.totalEvents}</span></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Cost by pipeline step</p>
                {user.aiCost.byFeature.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No usage yet</p>
                ) : (
                  <div className="space-y-1">
                    {user.aiCost.byFeature.map((f) => (
                      <div key={f.featureName} className="flex justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: STEP_COLORS[f.step] ?? "#94a3b8" }} />
                          {STEP_LABELS[f.step] ?? f.featureName}
                        </span>
                        <span className="tabular-nums">{usd(f.cost)} ({f.calls} calls)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold mb-2">Subscription</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Plan</span><span>{user.plan.name} · ${user.plan.priceMonthly}/mo</span></div>
                  <div className="flex justify-between"><span>Status</span><span className="capitalize">{user.plan.status}</span></div>
                  {user.plan.periodEnd && <div className="flex justify-between"><span>Renews</span><span>{new Date(user.plan.periodEnd).toLocaleDateString()}</span></div>}
                  <div className="flex justify-between"><span>App limit</span><span>{user.plan.applicationsPerMonth}/mo</span></div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UsersTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["billing", "users"],
    queryFn: getUserBilling,
    staleTime: 60_000,
  });

  const users = data?.users ?? [];
  const totalRevenue = users.reduce((s, u) => s + u.plan.priceMonthly, 0);
  const totalAiCost = users.reduce((s, u) => s + u.aiCost.total, 0);

  return (
    <div className="space-y-5">
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load user billing data.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total users", value: isLoading ? "—" : String(data?.total ?? 0), icon: Users },
          { label: "MRR (plan prices)", value: isLoading ? "—" : usd(totalRevenue), icon: DollarSign },
          { label: "Total AI spend", value: isLoading ? "—" : usd(totalAiCost), icon: Cpu },
          {
            label: "Gross margin (AI)",
            value: isLoading ? "—" : totalRevenue === 0 ? "—" : `${Math.round(((totalRevenue - totalAiCost) / totalRevenue) * 100)}%`,
            icon: TrendingUp,
          },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {isLoading ? <Skeleton className="h-7 w-16" /> : <p className="text-xl font-bold">{m.value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">User Billing Detail</CardTitle>
          <CardDescription>Expand a row to see per-step cost, token breakdown, and subscription info.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {isLoading ? (
            <div className="space-y-2 px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No users yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["User", "Plan", "Total AI Cost", "This Month", "Tokens", "Applied / Total Apps", "Runs"].map((h) => (
                      <th key={h} className="px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => <UserRow key={u.userId} user={u} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ExecutiveBillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Executive Billing Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform-wide AI and infrastructure cost visibility — internal use only.
        </p>
      </div>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company Metrics</TabsTrigger>
          <TabsTrigger value="users">User-Level Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="mt-5"><CompanyTab /></TabsContent>
        <TabsContent value="users" className="mt-5"><UsersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
