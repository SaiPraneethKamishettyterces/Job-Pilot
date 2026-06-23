import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, Users, Cpu, Database, Sparkles } from "lucide-react";
import { getFinancials, getCompanyBilling } from "@/services/api";
import { getIngestionStatus } from "@/services/api/admin";

function money(n: number | undefined) {
  if (n == null) return "—";
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;
}
function num(n: number | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function Kpi({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="metric mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function AdminOverviewPage() {
  const fin = useQuery({ queryKey: ["admin", "financials"], queryFn: getFinancials });
  const co = useQuery({ queryKey: ["admin", "company"], queryFn: getCompanyBilling });
  const ing = useQuery({ queryKey: ["admin", "ingestion"], queryFn: getIngestionStatus });

  const daily = co.data?.aiCosts.daily30Days ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">How the product is performing — revenue, cost, usage, and pipeline health.</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={DollarSign} label="MRR" value={money(fin.data?.revenue.mrr)} sub={`ARR ${money(fin.data?.revenue.arr)}`} />
        <Kpi icon={TrendingUp} label="Gross margin" value={fin.data ? `${fin.data.margin.marginPct.toFixed(0)}%` : "—"} sub={`profit ${money(fin.data?.margin.grossProfit)}`} />
        <Kpi icon={Users} label="Active users" value={num(co.data?.usage.activeUsersThisMonth)} sub={`${num(fin.data?.revenue.activeSubscribers)} paying`} />
        <Kpi icon={Cpu} label="AI cost (mo)" value={money(co.data?.aiCosts.thisMonth)} sub={`ARPU ${money(fin.data?.perUser.arpu)}`} />
        <Kpi icon={Database} label="Job pool" value={num(ing.data?.pool.postings)} sub={`${num(ing.data?.pool.newLast24h)} new / 24h`} />
        <Kpi icon={Sparkles} label="Registry" value={num(ing.data?.registry.active)} sub={`${num(ing.data?.registry.verified)} verified live`} />
        <Kpi icon={Cpu} label="Applications" value={num(co.data?.usage.totalApplications)} sub={`${num(co.data?.usage.appliedCount)} applied`} />
        <Kpi icon={TrendingUp} label="Runs" value={num(co.data?.usage.totalRuns)} sub={`${num(co.data?.usage.completedRuns)} completed`} />
      </div>

      {/* AI cost trend */}
      <div className="rounded-lg border bg-card p-4" style={{ borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-medium">AI spend — last 30 days</div>
        {daily.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No spend recorded yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, "cost"]}
              />
              <Area type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} fill="url(#spend)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent ingestion runs */}
      <div className="rounded-lg border bg-card" style={{ borderColor: "var(--border)" }}>
        <div className="border-b px-4 py-3 text-sm font-medium" style={{ borderColor: "var(--border)" }}>Recent ingestion</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-2 font-medium">Track</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Discovered</th>
              <th className="px-4 py-2 font-medium">Inserted</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {(ing.data?.runs ?? []).slice(0, 8).map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-2">{r.sourceTag}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="metric px-4 py-2">{r.postingsDiscovered.toLocaleString()}</td>
                <td className="metric px-4 py-2">{r.postingsInserted.toLocaleString()}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {(ing.data?.runs ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No runs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
