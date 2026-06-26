import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  getExpenses,
  runIngestion,
  getAdminSettings,
  updateAdminSettings,
  type RuntimeSettings,
} from "@/services/api/admin";

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  hiringcafe: "Hiring Cafe",
};

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function SettingsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: getAdminSettings });
  // Local edits overlay the server value (no effect → no cascading renders).
  const [edits, setEdits] = useState<Partial<RuntimeSettings>>({});

  const save = useMutation({
    mutationFn: (patch: Partial<RuntimeSettings>) => updateAdminSettings(patch),
    onSuccess: () => {
      setEdits({});
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["admin", "expenses"] });
    },
  });

  if (!q.data) return null;
  const form: RuntimeSettings = { ...q.data, ...edits };
  const set = <K extends keyof RuntimeSettings>(k: K, v: RuntimeSettings[K]) => setEdits((e) => ({ ...e, [k]: v }));
  const field = "w-full rounded-md border bg-background px-2 py-1 text-sm";

  return (
    <section className="rounded-lg border">
      <header className="border-b px-4 py-3 text-sm font-medium">Settings (live — no redeploy)</header>
      <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        <label className="text-sm">
          <span className="text-muted-foreground">Hard cap $/day</span>
          <input type="number" min={0} step={0.5} className={field}
            value={form.apifySpendHardUsdPerDay}
            onChange={(e) => set("apifySpendHardUsdPerDay", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Soft warn $/day</span>
          <input type="number" min={0} step={0.5} className={field}
            value={form.apifySpendSoftUsdPerDay}
            onChange={(e) => set("apifySpendSoftUsdPerDay", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Apify split %</span>
          <input type="number" min={0} max={100} className={field}
            value={form.apifySplitPercent}
            onChange={(e) => set("apifySplitPercent", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Global run</span>
          <select className={field} value={form.globalRunMode}
            onChange={(e) => set("globalRunMode", e.target.value as RuntimeSettings["globalRunMode"])}>
            <option value="manual">Manual</option>
            <option value="auto">Auto</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Auto run hour (0–23)</span>
          <input type="number" min={0} max={23} className={field}
            value={form.globalRunHour}
            onChange={(e) => set("globalRunHour", Number(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Timezone</span>
          <input className={field} value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)} />
        </label>
        <label className="text-sm flex items-center gap-2 pt-5">
          <input type="checkbox" className="h-4 w-4" checked={form.weekendIngest}
            onChange={(e) => set("weekendIngest", e.target.checked)} />
          <span className="text-muted-foreground">Weekend ingest</span>
        </label>
        <div className="flex items-end">
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
            disabled={save.isPending}
            onClick={() => save.mutate(form)}
          >
            {save.isPending ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="text-2xl font-semibold metric">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function AdminExpensesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "expenses"], queryFn: () => getExpenses(14) });
  const trigger = useMutation({
    mutationFn: runIngestion,
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["admin", "expenses"] }), 2000),
  });

  const d = q.data;
  const budgetPct = d ? Math.min(100, Math.round((d.budget.spentUsd / Math.max(0.01, d.budget.hardUsd)) * 100)) : 0;
  const barColor = d?.budget.hardExceeded ? "#ef4444" : d?.budget.softExceeded ? "#f59e0b" : "#22c55e";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Job-Pulling Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Unified cost per source: paid Apify spend <em>plus</em> the embedding cost every posting
            incurs — so &ldquo;free&rdquo; ATS/aggregator sources show their real (embedding) cost too.
            Includes dedup-waste, cost-per-new-job, per-run drill, and a month projection.
          </p>
        </div>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          disabled={trigger.isPending || d?.budget.hardExceeded}
          onClick={() => trigger.mutate()}
          title={d?.budget.hardExceeded ? "Daily spend cap reached — paid pull is blocked" : "Run a pull now"}
        >
          {trigger.isPending ? "Starting…" : "Run global ingestion now"}
        </button>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : q.error || !d ? (
        <div className="text-sm text-destructive">Failed to load (admin access required).</div>
      ) : (
        <>
          {/* Budget guard */}
          <section className="rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Today&apos;s Apify spend</span>
              <span className="text-muted-foreground">
                {usd(d.budget.spentUsd)} of {usd(d.budget.hardUsd)} hard cap · {usd(d.budget.remainingUsd)} left
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${budgetPct}%`, background: barColor }} />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              Soft warn at {usd(d.budget.softUsd)}.{" "}
              {d.budget.hardExceeded
                ? "Hard cap reached — paid pulls are blocked until tomorrow."
                : d.budget.softExceeded
                  ? "Soft threshold crossed."
                  : "Within budget."}
            </div>
          </section>

          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat
              label={`Unified spend (${d.windowDays}d)`}
              value={usd(d.unifiedTotalUsd)}
              sub={`${usd(d.totalCostUsd)} Apify + ${usd(d.totalEmbedCostUsd)} embed`}
            />
            <Stat
              label="Month to date"
              value={usd(d.projection.monthToDateUsd)}
              sub={`projected ${usd(d.projection.projectedMonthUsd)} / mo`}
            />
            <Stat label="Active pool" value={String(d.pool.activePostings)} sub="postings" />
            <Stat
              label="Last global run"
              value={d.pool.lastGlobalRunAt ? new Date(d.pool.lastGlobalRunAt).toLocaleDateString() : "—"}
              sub={d.pool.lastGlobalRunStatus ?? undefined}
            />
          </div>

          {!d.tokenConfigured && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm text-amber-600">
              No Apify token configured — paid scrapers will self-skip. Set <code>APIFY_TOKEN</code> to run them.
            </div>
          )}

          {/* Daily cost trend */}
          <section className="rounded-lg border">
            <header className="border-b px-4 py-3 text-sm font-medium">Daily Apify spend</header>
            <div className="p-4">
              {d.trend.length === 0 ? (
                <div className="text-sm text-muted-foreground">No spend recorded yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={d.trend} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(value) => usd(Number(value))} />
                    <Bar dataKey="costUsd" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <SettingsCard />

          {/* Per-source breakdown */}
          <section className="rounded-lg border overflow-x-auto">
            <header className="border-b px-4 py-3 text-sm font-medium">Cost by source ({d.windowDays}d)</header>
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-4 font-medium">Source</th>
                  <th className="py-2 px-4 font-medium">Apify $</th>
                  <th className="py-2 px-4 font-medium">Embed $</th>
                  <th className="py-2 px-4 font-medium">Total $</th>
                  <th className="py-2 px-4 font-medium">Scraped</th>
                  <th className="py-2 px-4 font-medium">New</th>
                  <th className="py-2 px-4 font-medium">Dedup</th>
                  <th className="py-2 px-4 font-medium">Cost / new</th>
                  <th className="py-2 px-4 font-medium">80+ matches</th>
                  <th className="py-2 px-4 font-medium">Cost / match</th>
                </tr>
              </thead>
              <tbody>
                {d.sources.length === 0 ? (
                  <tr><td colSpan={10} className="py-4 px-4 text-muted-foreground">No source activity yet.</td></tr>
                ) : (
                  d.sources.map((s) => (
                    <tr key={s.source} className="border-b last:border-0">
                      <td className="py-2 px-4 font-medium">{SOURCE_LABELS[s.source] ?? s.source}</td>
                      <td className="py-2 px-4">{usd(s.costUsd)}</td>
                      <td className="py-2 px-4">{usd(s.embedCostUsd)}</td>
                      <td className="py-2 px-4 font-medium">{usd(s.totalCostUsd)}</td>
                      <td className="py-2 px-4">{s.totalScraped}</td>
                      <td className="py-2 px-4">{s.totalNew}</td>
                      <td className="py-2 px-4">{s.dedupRatio != null ? `${Math.round(s.dedupRatio * 100)}%` : "—"}</td>
                      <td className="py-2 px-4">{s.costPerNewJob != null ? usd(s.costPerNewJob) : "—"}</td>
                      <td className="py-2 px-4">{s.jobsHighMatch}</td>
                      <td className="py-2 px-4">{s.costPerHighMatchJob != null ? usd(s.costPerHighMatchJob) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Per-run drill-down */}
          <section className="rounded-lg border overflow-x-auto">
            <header className="border-b px-4 py-3 text-sm font-medium">Recent runs</header>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-4 font-medium">When</th>
                  <th className="py-2 px-4 font-medium">Track</th>
                  <th className="py-2 px-4 font-medium">Status</th>
                  <th className="py-2 px-4 font-medium">Apify $</th>
                  <th className="py-2 px-4 font-medium">Embed $</th>
                  <th className="py-2 px-4 font-medium">Calls</th>
                  <th className="py-2 px-4 font-medium">Discovered</th>
                  <th className="py-2 px-4 font-medium">New</th>
                  <th className="py-2 px-4 font-medium">Embedded</th>
                </tr>
              </thead>
              <tbody>
                {d.runs.length === 0 ? (
                  <tr><td colSpan={9} className="py-4 px-4 text-muted-foreground">No runs yet.</td></tr>
                ) : (
                  d.runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 px-4">{r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</td>
                      <td className="py-2 px-4">{r.sourceTag === "apify" ? "Apify (paid)" : "Free"}</td>
                      <td className="py-2 px-4">{r.status}</td>
                      <td className="py-2 px-4">{usd(r.costUsd)}</td>
                      <td className="py-2 px-4">{usd(r.embedCostUsd)}</td>
                      <td className="py-2 px-4">{r.callCount}</td>
                      <td className="py-2 px-4">{r.postingsDiscovered}</td>
                      <td className="py-2 px-4">{r.postingsInserted}</td>
                      <td className="py-2 px-4">{r.postingsEmbedded}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
