import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getJobAnalytics } from "@/services/api/admin";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="text-2xl font-semibold metric">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn", indeed: "Indeed", hiringcafe: "Hiring Cafe",
  greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", workable: "Workable",
};
const label = (s: string) => SOURCE_LABELS[s] ?? s;

export function AdminJobAnalyticsPage() {
  const q = useQuery({ queryKey: ["admin", "job-analytics"], queryFn: () => getJobAnalytics(14) });
  const d = q.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Job Analytics</h1>
        <p className="text-sm text-muted-foreground">
          The job pool at a glance — volume, novelty, date coverage, de-duplication, sources, and the
          most/least common roles. <strong>Pull date = the date we first saw a posting</strong>{" "}
          (<code>firstSeenAt</code>); a source&apos;s own release date (<code>postedAt</code>) is often missing.
        </p>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : q.error || !d ? (
        <div className="text-sm text-destructive">Failed to load (admin access required).</div>
      ) : (
        <>
          {/* Pool overview */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Active postings" value={d.pool.active.toLocaleString()} sub={`${d.pool.total.toLocaleString()} incl. expired`} />
            <Stat label="Distinct jobs" value={d.pool.distinctJobs.toLocaleString()} sub="unique logical jobs (deduped)" />
            <Stat label="Duplication" value={`${d.pool.duplicationRatio}×`} sub="rows per unique job" />
            <Stat label="New in 24h" value={d.pool.newSeenLast24h.toLocaleString()} sub="first seen by us (pull date)" />
            <Stat label={`Pulled (last ${d.windowDays}d)`} value={d.ingestion.discovered.toLocaleString()} sub={`${d.ingestion.inserted.toLocaleString()} new · ${d.ingestion.updated.toLocaleString()} re-seen · ${d.ingestion.runs} runs`} />
          </div>

          {/* Date coverage */}
          <section className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-3">Posting date coverage (active pool)</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Stat label="Released in last 24h" value={d.dateCoverage.releasedLast24h.toLocaleString()} sub={`real postedAt · ${pct(d.dateCoverage.releasedLast24h, d.pool.active)} of pool`} />
              <Stat label="Released earlier" value={d.dateCoverage.releasedOlder.toLocaleString()} sub={`postedAt > 24h · ${pct(d.dateCoverage.releasedOlder, d.pool.active)}`} />
              <Stat label="Date unknown" value={d.dateCoverage.dateUnknown.toLocaleString()} sub={`no postedAt → uses pull date · ${pct(d.dateCoverage.dateUnknown, d.pool.active)}`} />
            </div>
          </section>

          {/* New jobs per day */}
          <section className="rounded-lg border">
            <header className="border-b px-4 py-3 text-sm font-medium">New jobs per day (by pull date)</header>
            <div className="p-4">
              {d.trend.length === 0 ? (
                <div className="text-sm text-muted-foreground">No data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.trend} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} />
                    <Bar dataKey="newJobs" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* By source */}
          <section className="rounded-lg border">
            <header className="border-b px-4 py-3 text-sm font-medium">Contribution by source</header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-4 font-medium">Source</th>
                  <th className="py-2 px-4 font-medium">Active postings</th>
                  <th className="py-2 px-4 font-medium">New (24h)</th>
                  <th className="py-2 px-4 font-medium">Date unknown</th>
                </tr>
              </thead>
              <tbody>
                {d.bySource.map((s) => (
                  <tr key={s.source} className="border-b last:border-0">
                    <td className="py-2 px-4 font-medium">{label(s.source)}</td>
                    <td className="py-2 px-4">{s.total.toLocaleString()}</td>
                    <td className="py-2 px-4">{s.new24h.toLocaleString()}</td>
                    <td className="py-2 px-4 text-muted-foreground">{s.dateUnknown.toLocaleString()} ({pct(s.dateUnknown, s.total)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Roles: most vs least common */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border">
              <header className="border-b px-4 py-3 text-sm font-medium">Most common roles</header>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={Math.max(160, d.topRoles.length * 22)}>
                  <BarChart layout="vertical" data={d.topRoles} margin={{ left: 8, right: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="role" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => Number(v).toLocaleString()} />
                    <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                      {d.topRoles.map((_, i) => <Cell key={i} fill="#22c55e" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-lg border">
              <header className="border-b px-4 py-3 text-sm font-medium">Least common roles (niche / scarce)</header>
              <table className="w-full text-sm">
                <tbody>
                  {d.bottomRoles.map((r, i) => (
                    <tr key={`${r.role}-${i}`} className="border-b last:border-0">
                      <td className="py-2 px-4">{r.role}</td>
                      <td className="py-2 px-4 text-right text-muted-foreground">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {/* Top companies */}
          <section className="rounded-lg border">
            <header className="border-b px-4 py-3 text-sm font-medium">Top companies</header>
            <div className="flex flex-wrap gap-2 p-4">
              {d.topCompanies.map((c) => (
                <span key={c.company} className="rounded-full border px-3 py-1 text-sm">
                  {c.company} <span className="text-muted-foreground">· {c.count}</span>
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
