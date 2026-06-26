import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Sparkles, FileText, Mail, Send, ScanLine, Target, HelpCircle, ArrowRight,
  Info, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Search, ChevronUp, ChevronDown, Lightbulb,
  FileUp, Scale, X,
} from "lucide-react";
import {
  getClaudeUsage, getAdminSettings, updateAdminSettings, reconcileClaudeUsage,
  type ClaudeUsage, type RuntimeSettings,
} from "@/services/api/admin";

// Operational cost dashboard for the Claude API. Design rules from review:
//   • Every number connects to a decision (margin, budget, projection) — not decoration.
//   • Color is semantic only: green = healthy, amber = watch, red = action.
//   • Claude runs in ONE place (resume tailoring); the section breakdown is an explicit
//     MODEL (off by default), never shown with the confidence of measured facts.

// Theme: Claude clay-orange as the brand accent, on the dark console. Semantic
// status colors (green/amber/red) are kept distinct so health still reads instantly.
const OK = "#3fb950";
const WARN = "#d29922";
const BAD = "#f85149";
const CLAUDE = "#d97757";        // Claude clay-orange (brand accent)
const INPUT = "#6ea8d8";         // cool blue — contrasts the warm output
const OUTPUT = "#d97757";        // warm clay
const MUTED = "#8b8378";

const FEATURE_LABELS: Record<string, string> = {
  resume_tailoring: "Resume Tailoring",
  cover_letter_generation: "Cover Letter",
  cold_email_generation: "Cold Email",
  question_answering: "Q&A Autofill",
};
const featureLabel = (k: string) => FEATURE_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function usd(n: number, dp = 4): string {
  if (n === 0) return "$0";
  const a = Math.abs(n);
  if (a < 0.01) return `${n < 0 ? "-" : ""}$${a.toFixed(dp)}`;
  return `${n < 0 ? "-" : ""}$${a.toFixed(2)}`;
}
const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// ── Hero metric with semantic status ──
function Hero({ label, value, sub, status, icon: Icon }: {
  label: string; value: string; sub?: React.ReactNode;
  status?: "ok" | "warn" | "bad"; icon?: typeof FileText;
}) {
  const color = status === "bad" ? BAD : status === "warn" ? WARN : status === "ok" ? OK : undefined;
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: color ? `${color}55` : "var(--border)", background: color ? `${color}0d` : undefined }}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <div className="mt-1 text-3xl font-bold metric" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Card({ title, desc, right, children }: {
  title: string; desc?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground/80">{desc}</p>}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Bar2({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

// ── Margin analysis: the reason this dashboard exists ──
function MarginPanel({ d }: { d: ClaudeUsage }) {
  return (
    <Card
      title="Margin per application"
      desc="Plan revenue per application vs the cost to tailor one resume on Claude. Red = the Claude call alone loses money."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 pr-3 font-medium">Plan</th>
              <th className="py-2 px-3 font-medium">Revenue / app</th>
              <th className="py-2 px-3 font-medium">Claude resume cost</th>
              <th className="py-2 px-3 font-medium">Margin (Claude resume)</th>
              <th className="py-2 pl-3 font-medium text-right">Margin (blended app)</th>
            </tr>
          </thead>
          <tbody>
            {d.margins.map((m) => {
              const claudeColor = m.marginClaudeResume >= 0 ? OK : BAD;
              const blendColor = m.marginBlendedApp >= 0 ? OK : BAD;
              return (
                <tr key={m.slug} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 font-medium">{m.name}<span className="ml-1.5 text-xs text-muted-foreground">${m.priceMonthly}/mo</span></td>
                  <td className="py-2 px-3">{usd(m.revenuePerApp, 4)}</td>
                  <td className="py-2 px-3">{usd(d.resume.avgCostUsd, 4)}</td>
                  <td className="py-2 px-3 font-semibold metric" style={{ color: claudeColor }}>
                    {m.marginClaudeResume >= 0 ? "+" : ""}{usd(m.marginClaudeResume, 4)}
                  </td>
                  <td className="py-2 pl-3 text-right font-semibold metric" style={{ color: blendColor }}>
                    {m.marginBlendedApp >= 0 ? "+" : ""}{usd(m.marginBlendedApp, 4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: `${BAD}40`, background: `${BAD}0d`, color: BAD }}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          A single Claude resume ({usd(d.resume.avgCostUsd)}) costs more than the per-application revenue on every plan.
          It only stays profitable <em>blended</em> because {(100 - d.totals.claudePct).toFixed(0)}% of resumes fall back to the
          free local model — so the routing rate below is a cost-control lever, not a detail.
        </span>
      </div>
    </Card>
  );
}

// ── Budget + alerts (editable, persisted via runtime settings) ──
function BudgetPanel({ d }: { d: ClaudeUsage }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getAdminSettings });
  const [edits, setEdits] = useState<{ budget?: number; warn?: number }>({});
  const save = useMutation({
    mutationFn: (patch: Partial<RuntimeSettings>) => updateAdminSettings(patch),
    onSuccess: () => {
      setEdits({});
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["admin", "claude-usage"] });
    },
  });

  const b = d.budget;
  const monthStatus = b.monthPct >= 100 ? BAD : b.monthPct >= 75 ? WARN : OK;
  const projStatus = b.projectedMonthlyUsd > b.monthlyBudgetUsd ? BAD : b.projectedMonthlyUsd > b.monthlyBudgetUsd * 0.75 ? WARN : OK;
  const field = "w-24 rounded-md border bg-background px-2 py-1 text-sm";
  const curBudget = edits.budget ?? settings.data?.claudeMonthlyBudgetUsd ?? b.monthlyBudgetUsd;
  const curWarn = edits.warn ?? settings.data?.claudeCostPerResumeWarnUsd ?? b.costPerResumeWarnUsd;
  const dirty = edits.budget !== undefined || edits.warn !== undefined;

  return (
    <Card title="Budget & alerts" desc="Month-to-date Claude spend against your budget. Editable inline — saves live.">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted-foreground">This month</span>
            <span className="metric" style={{ color: monthStatus }}>{usd(b.monthToDateUsd)} / {usd(b.monthlyBudgetUsd)}</span>
          </div>
          <Bar2 pct={b.monthPct} color={monthStatus} />
          <div className="mt-1 text-xs text-muted-foreground">{b.monthPct}% of monthly budget used</div>

          <div className="mt-4 mb-1 flex justify-between text-sm">
            <span className="text-muted-foreground">Projected month-end</span>
            <span className="metric" style={{ color: projStatus }}>{usd(b.projectedMonthlyUsd)}</span>
          </div>
          <Bar2 pct={(b.projectedMonthlyUsd / Math.max(0.01, b.monthlyBudgetUsd)) * 100} color={projStatus} />
          <div className="mt-1 text-xs text-muted-foreground">at the current resume rate</div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Monthly Claude budget ($)</span>
            <input type="number" min={0} step={5} className={field + " mt-1"} value={curBudget}
              onChange={(e) => setEdits((x) => ({ ...x, budget: Number(e.target.value) }))} />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Cost-per-resume warn at ($)</span>
            <input type="number" min={0} step={0.01} className={field + " mt-1"} value={curWarn}
              onChange={(e) => setEdits((x) => ({ ...x, warn: Number(e.target.value) }))} />
          </label>
          <button
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate({ claudeMonthlyBudgetUsd: curBudget, claudeCostPerResumeWarnUsd: curWarn })}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Routing strip: compact pipeline + live rate (replaces the static diagram) ──
const PIPELINE = [
  { label: "Resume Parse", icon: ScanLine, claude: false },
  { label: "Job Parse", icon: ScanLine, claude: false },
  { label: "Match", icon: Target, claude: false },
  { label: "Resume Tailoring", icon: FileText, claude: true },
  { label: "Cover Letter", icon: Mail, claude: false },
  { label: "Cold Email", icon: Send, claude: false },
  { label: "Q&A", icon: HelpCircle, claude: false },
];
function RoutingStrip({ d }: { d: ClaudeUsage }) {
  const localPct = 100 - d.totals.claudePct;
  return (
    <Card
      title="Claude routing rate"
      desc="What share of applications actually call Claude. The rest run on the free local model — watch this for routing changes."
    >
      <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:items-center">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold metric" style={{ color: CLAUDE }}>{d.totals.claudePct}%</span>
            <span className="text-sm text-muted-foreground">on Claude</span>
          </div>
          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div style={{ width: `${d.totals.claudePct}%`, background: CLAUDE }} />
            <div style={{ width: `${localPct}%`, background: OK }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
            <span>{d.totals.appsWithClaude} Claude</span>
            <span>{localPct.toFixed(0)}% local · {d.totals.appsTotal - d.totals.appsWithClaude} apps</span>
          </div>
        </div>
        {/* one-row pipeline — only step 4 is paid */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPELINE.map((s, i) => {
            const Icon = s.icon;
            const c = s.claude ? CLAUDE : MUTED;
            return (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                  style={{ borderColor: s.claude ? CLAUDE : "var(--border)", color: c, background: s.claude ? `${CLAUDE}14` : undefined }}>
                  <Icon className="h-3.5 w-3.5" /> {s.label}
                </span>
                {i < PIPELINE.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ── Spend over time (handles sparse data) ──
function SpendCard({ d }: { d: ClaudeUsage }) {
  const [metric, setMetric] = useState<"cost" | "calls">("cost");
  const empty = d.trend.length === 0;
  const Toggle = (
    <div className="flex rounded-md border text-xs" style={{ borderColor: "var(--border)" }}>
      {(["cost", "calls"] as const).map((m) => (
        <button key={m} onClick={() => setMetric(m)}
          className={`px-2.5 py-1 ${metric === m ? "text-foreground" : "text-muted-foreground"}`}
          style={metric === m ? { background: `${CLAUDE}26` } : undefined}>
          {m === "cost" ? "$/day" : "Calls/day"}
        </button>
      ))}
    </div>
  );
  return (
    <Card title="Daily spend" desc="Claude spend per day across the window." right={!empty ? Toggle : undefined}>
      {empty ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center" style={{ borderColor: "var(--border)" }}>
          <TrendingUp className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm">No spend in this window yet</div>
          <div className="text-xs text-muted-foreground">
            Projected at the current rate: <span className="metric text-foreground">{usd(d.budget.projectedMonthlyUsd)}/mo</span>.
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={d.trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (metric === "cost" ? `$${v}` : `${v}`)} allowDecimals={false} />
            <Tooltip
              formatter={(v) => [metric === "cost" ? usd(Number(v)) : `${v} calls`, metric === "cost" ? "spend" : "calls"]}
              labelFormatter={(l) => day(String(l))}
              contentStyle={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey={metric === "cost" ? "costUsd" : "calls"} fill={CLAUDE} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ── Spend per user — who is driving Claude cost ──
function SpendPerUserCard({ d }: { d: ClaudeUsage }) {
  const rows = d.spendPerUser;
  return (
    <Card title="Spend per user" desc="Claude cost attributed to each user (top 20).">
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No per-user Claude spend in this window.</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 28)}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value, _n, item) => {
                const c = (item as { payload?: { calls: number } }).payload;
                return [`${usd(Number(value))}${c ? ` · ${c.calls} calls` : ""}`, "spend"];
              }}
                contentStyle={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="costUsd" fill={CLAUDE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <table className="w-full self-start text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 px-3 font-medium">Calls</th>
                <th className="py-2 px-3 font-medium">Avg</th>
                <th className="py-2 pl-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.userId} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 font-medium">{u.name}</td>
                  <td className="py-2 px-3 text-muted-foreground">{u.calls}</td>
                  <td className="py-2 px-3 text-muted-foreground">{usd(u.avgCostUsd, 5)}</td>
                  <td className="py-2 pl-3 text-right metric">{usd(u.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Cost composition: click Input or Output to drill into MEASURED cost factors ──
function FactorBars({ factors, color, pricePerMtok }: {
  factors: ClaudeUsage["costFactors"]["input"]; color: string; pricePerMtok: number;
}) {
  if (factors.length === 0) return <div className="py-3 text-sm text-muted-foreground">No measured calls yet — generate a resume to populate this.</div>;
  const data = factors.map((f) => ({ ...f, name: f.factor }));
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(3)}`} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(_value, _n, item) => {
              const f = (item as { payload?: { costUsd: number; pct: number; avgTokens: number } }).payload;
              return [f ? `${usd(f.costUsd)} · ${f.pct}% · ~${tok(f.avgTokens)} tok/call` : "", "cost"];
            }}
            contentStyle={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="costUsd" radius={[0, 3, 3, 0]} fill={color} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-muted-foreground">${pricePerMtok}/1M tokens · measured per call, apportioned to billed totals.</p>
    </>
  );
}

function CompositionCard({ d }: { d: ClaudeUsage }) {
  const [drill, setDrill] = useState<"none" | "input" | "output">("none");
  const r = d.resume;
  const total = r.inputCostUsd + r.outputCostUsd || 1;
  const inPct = Math.round((r.inputCostUsd / total) * 100);
  const cf = d.costFactors;
  const hasMeasured = cf.measuredCalls > 0;

  return (
    <Card
      title="What drives the cost of one resume"
      desc={hasMeasured ? `Click Input or Output to drill in. Measured across ${cf.measuredCalls} call${cf.measuredCalls === 1 ? "" : "s"}.` : "Click Input or Output to drill into cost factors."}
    >
      {/* Clickable input vs output split */}
      <div className="mb-1 flex justify-between text-xs">
        <button onClick={() => setDrill((x) => (x === "input" ? "none" : "input"))}
          className="hover:underline" style={{ color: INPUT, fontWeight: drill === "input" ? 700 : 400 }}>
          ▸ Input {inPct}% · {usd(r.inputCostUsd)} · ~{tok(r.avgInputTokens)} tok
        </button>
        <button onClick={() => setDrill((x) => (x === "output" ? "none" : "output"))}
          className="hover:underline" style={{ color: OUTPUT, fontWeight: drill === "output" ? 700 : 400 }}>
          Output {100 - inPct}% · {usd(r.outputCostUsd)} · ~{tok(r.avgOutputTokens)} tok ◂
        </button>
      </div>
      <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <button aria-label="Drill into input cost" onClick={() => setDrill((x) => (x === "input" ? "none" : "input"))}
          style={{ width: `${inPct}%`, background: INPUT, opacity: drill === "output" ? 0.5 : 1 }} />
        <button aria-label="Drill into output cost" onClick={() => setDrill((x) => (x === "output" ? "none" : "output"))}
          style={{ width: `${100 - inPct}%`, background: OUTPUT, opacity: drill === "input" ? 0.5 : 1 }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Output tokens cost {(d.pricing.outputPerMtok / d.pricing.inputPerMtok).toFixed(0)}× input
        (${d.pricing.outputPerMtok} vs ${d.pricing.inputPerMtok}/1M). {hasMeasured ? "Click a bar to see which factors cost most." : ""}
      </p>

      {drill !== "none" && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: drill === "input" ? INPUT : OUTPUT }}>
              {drill === "input" ? "Input cost factors" : "Output cost factors"}
            </span>
            {hasMeasured
              ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: OK }}><CheckCircle2 className="h-3 w-3" /> measured</span>
              : <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: WARN }}><AlertTriangle className="h-3 w-3" /> awaiting data</span>}
          </div>
          <FactorBars
            factors={drill === "input" ? cf.input : cf.output}
            color={drill === "input" ? INPUT : OUTPUT}
            pricePerMtok={drill === "input" ? d.pricing.inputPerMtok : d.pricing.outputPerMtok}
          />
        </div>
      )}
    </Card>
  );
}

// ── Optimization recommendations from real data ──
function OptimizationCard({ d }: { d: ClaudeUsage }) {
  if (d.recommendations.length === 0) {
    return (
      <Card title="Cost optimization">
        <div className="flex items-center gap-2 text-sm" style={{ color: OK }}>
          <CheckCircle2 className="h-4 w-4" /> No obvious savings — caching active and output sizes are lean.
        </div>
      </Card>
    );
  }
  const annual = d.recommendations.reduce((s, r) => s + r.estSavingPerResumeUsd, 0);
  return (
    <Card title="Cost optimization" desc="Specific, data-driven savings. Figures are estimates.">
      <div className="grid gap-3 md:grid-cols-2">
        {d.recommendations.map((r) => (
          <div key={r.id} className="rounded-lg border p-4" style={{ borderColor: `${WARN}40`, background: `${WARN}08` }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: WARN }}>
              <Lightbulb className="h-4 w-4" /> {r.title}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{r.detail}</p>
            <div className="mt-2 text-sm">
              Est. save <span className="metric font-semibold" style={{ color: OK }}>{usd(r.estSavingPerResumeUsd, 5)}</span> / resume
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Combined: ~<span className="metric text-foreground">{usd(annual, 5)}</span> / resume
        ({((annual / Math.max(0.0001, d.resume.avgCostUsd)) * 100).toFixed(0)}% of current cost).
      </div>
    </Card>
  );
}

// ── Recent calls: sortable, searchable, joined to job + status ──
type SortKey = "createdAt" | "costUsd" | "outputTokens" | "inputTokens" | "cacheReadTokens";
function statusColor(s: string | null): string {
  if (!s) return MUTED;
  const u = s.toUpperCase();
  if (u.includes("APPLIED") || u.includes("SUBMIT") || u.includes("APPROV")) return OK;
  if (u.includes("REJECT") || u.includes("FAIL") || u.includes("ERROR")) return BAD;
  if (u.includes("REQUIRED") || u.includes("PENDING") || u.includes("REVIEW")) return WARN;
  return MUTED;
}
type RecentRow = ClaudeUsage["recent"][number];

function RecentTable({ d }: { d: ClaudeUsage }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [minCost, setMinCost] = useState(0);
  const [sort, setSort] = useState<SortKey>("costUsd");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const statuses = useMemo(
    () => [...new Set(d.recent.map((r) => r.status).filter(Boolean) as string[])].sort(),
    [d.recent],
  );

  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    const filtered = d.recent.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (r.costUsd < minCost) return false;
      if (f && !(`${r.jobTitle ?? ""} ${r.company ?? ""} ${r.status ?? ""}`.toLowerCase().includes(f))) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const av = sort === "createdAt" ? a.createdAt : (a[sort] as number);
      const bv = sort === "createdAt" ? b.createdAt : (b[sort] as number);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
  }, [d.recent, q, status, minCost, sort, dir]);

  const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);

  const exportCsv = () => {
    const head = ["when", "job", "company", "status", "input_tokens", "output_tokens", "cache_read", "cost_usd"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [r.createdAt, r.jobTitle, r.company, r.status, r.inputTokens, r.outputTokens, r.cacheReadTokens, r.costUsd].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "claude-calls.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const SortTh = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`py-2 px-3 font-medium ${right ? "text-right" : ""}`}>
      <button className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => { if (sort === k) setDir((x) => (x === "asc" ? "desc" : "asc")); else { setSort(k); setDir("desc"); } }}>
        {label}
        {sort === k && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  const fieldStyle = { borderColor: "var(--border)" };
  return (
    <Card
      title="Recent Claude calls"
      desc="Each resume-tailoring call, joined to job + status. Filter, sort, export."
      right={
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:text-foreground" style={fieldStyle}>
          <FileUp className="h-3.5 w-3.5" /> Export CSV
        </button>
      }
    >
      {/* filter bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-1" style={fieldStyle}>
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job / company"
            className="w-44 bg-transparent text-sm outline-none" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm" style={fieldStyle}>
          <option value="ALL">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select value={minCost} onChange={(e) => setMinCost(Number(e.target.value))} className="rounded-md border bg-background px-2 py-1 text-sm" style={fieldStyle}>
          <option value={0}>Any cost</option>
          <option value={0.09}>≥ $0.09</option>
          <option value={0.095}>≥ $0.095</option>
          <option value={0.1}>≥ $0.10</option>
        </select>
        {(q || status !== "ALL" || minCost > 0) && (
          <button onClick={() => { setQ(""); setStatus("ALL"); setMinCost(0); }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground" style={fieldStyle}>
              <SortTh k="createdAt" label="When" />
              <th className="py-2 px-3 font-medium">Job</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <SortTh k="inputTokens" label="Input" />
              <SortTh k="outputTokens" label="Output" />
              <SortTh k="cacheReadTokens" label="Cache" />
              <SortTh k="costUsd" label="Cost" right />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="py-4 px-3 text-muted-foreground">No matching calls.</td></tr>
            ) : rows.map((r: RecentRow, i) => (
              <tr key={i} className="border-b last:border-0 transition-colors hover:bg-white/[0.03]" style={fieldStyle}>
                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{day(r.createdAt)}</td>
                <td className="py-2 px-3">
                  <div className="font-medium">{r.jobTitle ?? "—"}</div>
                  {r.company && <div className="text-xs text-muted-foreground">{r.company}</div>}
                </td>
                <td className="py-2 px-3">
                  {r.status ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                      style={{ color: statusColor(r.status), background: `${statusColor(r.status)}1a` }}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{tok(r.inputTokens)}</td>
                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{tok(r.outputTokens)}</td>
                <td className="py-2 px-3 whitespace-nowrap" style={{ color: r.cacheReadTokens > 0 ? OK : MUTED }}>{tok(r.cacheReadTokens)}</td>
                <td className="py-2 px-3 text-right metric">{usd(r.costUsd, 5)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t font-medium" style={fieldStyle}>
                <td className="py-2 px-3 text-muted-foreground" colSpan={6}>{rows.length} of {d.recent.length} calls</td>
                <td className="py-2 px-3 text-right metric" style={{ color: CLAUDE }}>{usd(totalCost)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

// Reconcile the tracked estimate (this app's key) against the real Anthropic bill
// (all keys), by importing the billing CSV export. Explains any gap by API key.
function ReconcileCard({ d }: { d: ClaudeUsage }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [open, setOpen] = useState(false);
  const recon = d.reconciliation;
  const imp = useMutation({
    mutationFn: () => reconcileClaudeUsage(csv),
    onSuccess: () => { setCsv(""); setOpen(false); qc.invalidateQueries({ queryKey: ["admin", "claude-usage"] }); },
  });
  const gap = recon ? recon.actualBilledUsd - d.budget.monthToDateUsd : 0;

  return (
    <Card
      title="Reconcile with Anthropic (optional)"
      desc="The dashboard already tracks live cost from this app's API key — no import needed. Import the Anthropic billing CSV only to also count usage from OTHER keys (e.g. resume-parsing/eval runs)."
      right={
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:text-foreground" style={{ borderColor: "var(--border)" }}>
          <FileUp className="h-3.5 w-3.5" /> {open ? "Close" : "Import CSV"}
        </button>
      }
    >
      {recon && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Billed (Anthropic)</div>
            <div className="mt-1 text-xl font-semibold metric" style={{ color: CLAUDE }}>{usd(recon.actualBilledUsd)}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Tracked (app key)</div>
            <div className="mt-1 text-xl font-semibold metric">{usd(d.budget.monthToDateUsd)}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: `${WARN}40`, background: `${WARN}0d` }}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Untracked gap</div>
            <div className="mt-1 text-xl font-semibold metric" style={{ color: WARN }}>{usd(gap)}</div>
          </div>
        </div>
      )}

      {recon && recon.byKey.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                <th className="py-2 pr-3 font-medium">API key</th>
                <th className="py-2 px-3 font-medium">Input</th>
                <th className="py-2 px-3 font-medium">Output</th>
                <th className="py-2 pl-3 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {recon.byKey.map((k) => (
                <tr key={k.key} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 font-medium">{k.key}</td>
                  <td className="py-2 px-3 text-muted-foreground">{tok(k.input)}</td>
                  <td className="py-2 px-3 text-muted-foreground">{tok(k.output)}</td>
                  <td className="py-2 pl-3 text-right metric">{usd(k.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Imported {new Date(recon.importedAt).toLocaleString()} · {recon.periodStart}–{recon.periodEnd}.
            The gap is usage from keys other than this app (e.g. resume-parsing/eval runs).
          </p>
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={csv} onChange={(e) => setCsv(e.target.value)}
            placeholder="Paste the Anthropic usage CSV export (with the header row)…"
            className="h-32 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none"
            style={{ borderColor: "var(--border)" }}
          />
          {imp.isError && <p className="text-xs text-destructive">{(imp.error as Error)?.message ?? "Import failed"}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={() => imp.mutate()} disabled={!csv.trim() || imp.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
            >
              {imp.isPending ? "Importing…" : "Import & reconcile"}
            </button>
            <span className="text-xs text-muted-foreground">From console.anthropic.com → Usage → Export.</span>
          </div>
        </div>
      )}

      {!recon && !open && (
        <p className="text-sm text-muted-foreground">No bill imported yet — showing the tracked estimate only. Import the CSV to see the true total.</p>
      )}
    </Card>
  );
}

export function AdminClaudeUsagePage() {
  const [days, setDays] = useState(30);
  // Live: every call recorded during resume tailoring shows up on the next poll —
  // no CSV, no manual refresh. (Reconciliation against other API keys is separate.)
  const q = useQuery({
    queryKey: ["admin", "claude-usage", days],
    queryFn: () => getClaudeUsage(days),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
  const d = q.data;
  const starter = d?.margins.find((m) => m.slug === "starter") ?? d?.margins[1] ?? d?.margins[0];

  return (
    <div className="space-y-6">
      <div
        className="flex items-start justify-between rounded-xl border p-4"
        style={{ borderColor: `${CLAUDE}33`, background: `linear-gradient(120deg, ${CLAUDE}14, transparent 60%)` }}
      >
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${CLAUDE}26`, color: CLAUDE }}>
              <Sparkles className="h-5 w-5" />
            </span>
            Claude API Cost
          </h1>
          <p className="mt-1 flex items-center gap-2 max-w-2xl text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs" style={{ background: `${OK}1a`, color: OK }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: OK }} /> Live · updates every 10s
            </span>
            Claude is used for resume tailoring only; every other AI step runs on the free local model.
          </p>
        </div>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" style={{ borderColor: "var(--border)" }}
          value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : q.error || !d ? (
        <div className="text-sm text-destructive">Failed to load (admin access required).</div>
      ) : (
        <>
          {/* Hero — each tile is a decision signal */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Hero
              label="Cost / resume" icon={FileText}
              value={usd(d.resume.avgCostUsd)}
              status={d.budget.costPerResumeOverWarn ? "warn" : "ok"}
              sub={<>range {usd(d.resume.minCostUsd)}–{usd(d.resume.maxCostUsd)}</>}
            />
            <Hero
              label={`Margin / resume · ${starter?.name ?? "plan"}`} icon={starter && starter.marginClaudeResume >= 0 ? TrendingUp : TrendingDown}
              value={`${starter && starter.marginClaudeResume >= 0 ? "+" : ""}${usd(starter?.marginClaudeResume ?? 0)}`}
              status={starter && starter.marginClaudeResume >= 0 ? "ok" : "bad"}
              sub={<>vs {usd(starter?.revenuePerApp ?? 0)} revenue / app</>}
            />
            <Hero
              label="Claude routing rate" icon={Target}
              value={`${d.totals.claudePct}%`}
              sub={<>{d.totals.appsWithClaude} of {d.totals.appsTotal} apps · rest local (free)</>}
            />
            {d.reconciliation ? (
              <Hero
                label="Billed · Anthropic" icon={Scale}
                value={usd(d.reconciliation.actualBilledUsd)}
                status={d.budget.monthPct >= 100 ? "bad" : d.budget.monthPct >= 75 ? "warn" : "ok"}
                sub={<>tracked {usd(d.budget.monthToDateUsd)} · gap {usd(d.reconciliation.actualBilledUsd - d.budget.monthToDateUsd)}</>}
              />
            ) : (
              <Hero
                label="Month-to-date · tracked" icon={Sparkles}
                value={usd(d.budget.monthToDateUsd)}
                status={d.budget.monthPct >= 100 ? "bad" : d.budget.monthPct >= 75 ? "warn" : "ok"}
                sub={<>of {usd(d.budget.monthlyBudgetUsd)} budget · proj {usd(d.budget.projectedMonthlyUsd)}</>}
              />
            )}
          </div>

          <ReconcileCard d={d} />

          <MarginPanel d={d} />

          <div className="grid gap-6 lg:grid-cols-2">
            <BudgetPanel d={d} />
            <OptimizationCard d={d} />
          </div>

          <RoutingStrip d={d} />

          <div className="grid gap-6 lg:grid-cols-2">
            <CompositionCard d={d} />
            <SpendCard d={d} />
          </div>

          <SpendPerUserCard d={d} />

          {/* Per-feature — friendly labels, semantic provider color */}
          <Card title="Every AI feature, by cost" desc="Each AI touchpoint and the model behind it.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    <th className="py-2 px-3 font-medium">Runs on</th>
                    <th className="py-2 px-3 font-medium">Calls</th>
                    <th className="py-2 px-3 font-medium">Tokens (in/out)</th>
                    <th className="py-2 px-3 font-medium">Avg / call</th>
                    <th className="py-2 pl-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.perFeature.map((f) => (
                    <tr key={`${f.featureName}-${f.model}`} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-3 font-medium">{featureLabel(f.featureName)}</td>
                      <td className="py-2 px-3">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: f.isClaude ? CLAUDE : OK, background: `${f.isClaude ? CLAUDE : OK}1a` }}>
                          {f.isClaude ? "Claude" : "Local · free"}
                        </span>
                      </td>
                      <td className="py-2 px-3">{f.calls}</td>
                      <td className="py-2 px-3 text-muted-foreground">{tok(f.inputTokens)} / {tok(f.outputTokens)}</td>
                      <td className="py-2 px-3">{usd(f.avgCostUsd, 5)}</td>
                      <td className="py-2 pl-3 text-right metric font-medium">{usd(f.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <RecentTable d={d} />

          {/* Method footnote */}
          <div className="rounded-lg border px-4 py-3 text-xs text-muted-foreground" style={{ borderColor: "var(--border)" }}>
            <span className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Costs are <strong>estimates</strong>: token counts × {d.pricing.model} pricing
                (${d.pricing.inputPerMtok}/${d.pricing.outputPerMtok} per 1M in/out, cache reads at 10%). Not the Anthropic invoice.
                Cache-creation tokens are not priced. Anthropic&apos;s own usage API reports per org/key/day and cannot
                attribute cost to a single application — per-app cost only exists here.
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
