import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getStorage, snapshotStorage } from "@/services/api/admin";

function bytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}
function usd(n: number): string {
  return `$${n.toFixed(2)}`;
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

function SizeTable({
  title, rows, cols,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  cols: Array<{ key: string; label: string; fmt?: (v: unknown) => string; bold?: boolean }>;
}) {
  return (
    <section className="rounded-lg border overflow-x-auto">
      <header className="border-b px-4 py-3 text-sm font-medium">{title}</header>
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {cols.map((c) => <th key={c.key} className="py-2 px-4 font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="py-4 px-4 text-muted-foreground">No data yet.</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {cols.map((c) => (
                  <td key={c.key} className={`py-2 px-4 ${c.bold ? "font-medium" : ""}`}>
                    {c.fmt ? c.fmt(r[c.key]) : String(r[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export function AdminStoragePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "storage"], queryFn: () => getStorage(30) });
  const snap = useMutation({
    mutationFn: snapshotStorage,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "storage"] }),
  });
  const d = q.data;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Storage &amp; Infrastructure</h1>
          <p className="text-sm text-muted-foreground">
            On-disk footprint of the single Postgres (DB tables, per-source job bytes, generated-document
            blobs) with growth rate and projected GCP cost (Cloud SQL for the DB, GCS for blobs) on cloud migration.
          </p>
        </div>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          disabled={snap.isPending}
          onClick={() => snap.mutate()}
        >
          {snap.isPending ? "Snapshotting…" : "Snapshot now"}
        </button>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : q.error || !d ? (
        <div className="text-sm text-destructive">Failed to load (admin access required).</div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">As of {d.asOf ?? "—"}</div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Database size" value={`${d.database.gb} GB`} sub={bytes(d.database.bytesTotal)} />
            <Stat label="Document blobs" value={`${d.blob.gb} GB`} sub={`${bytes(d.blob.bytesTotal)} (in-DB Artifacts)`} />
            <Stat
              label="Projected DB cost"
              value={`${usd(d.projection.dbUsdPerMonth)}/mo`}
              sub={`Cloud SQL @ $${d.projection.dbRateUsdPerGbMonth}/GB-mo`}
            />
            <Stat
              label="Projected blob cost"
              value={`${usd(d.projection.blobUsdPerMonth)}/mo`}
              sub={`GCS @ $${d.projection.blobRateUsdPerGbMonth}/GB-mo`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="Growth" value={`${d.growth.gbPerDay} GB/day`} sub={bytes(d.growth.bytesPerDay) + " / day"} />
            <Stat label="Projected size (30d)" value={`${d.growth.projectedGb30d} GB`} sub="at current growth" />
            <Stat label="Tables tracked" value={String(d.tables.length)} sub="public schema" />
          </div>

          {/* DB size trend */}
          <section className="rounded-lg border">
            <header className="border-b px-4 py-3 text-sm font-medium">Database size over time</header>
            <div className="p-4">
              {d.trend.length < 2 ? (
                <div className="text-sm text-muted-foreground">Need at least two daily snapshots to chart growth.</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={d.trend.map((t) => ({ date: t.date, gb: Number((t.bytesTotal / 1e9).toFixed(3)) }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}GB`} />
                    <Tooltip formatter={(v) => `${v} GB`} />
                    <Area dataKey="gb" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <SizeTable
            title="Largest tables"
            rows={d.tables.slice(0, 15)}
            cols={[
              { key: "key", label: "Table", bold: true },
              { key: "bytesTotal", label: "Total", fmt: (v) => bytes(Number(v)) },
              { key: "bytesHeap", label: "Heap", fmt: (v) => bytes(Number(v)) },
              { key: "bytesIndex", label: "Indexes", fmt: (v) => bytes(Number(v)) },
              { key: "bytesToast", label: "TOAST", fmt: (v) => bytes(Number(v)) },
              { key: "rowCount", label: "Rows (est.)", fmt: (v) => Number(v).toLocaleString() },
            ]}
          />

          <SizeTable
            title="Job bytes by source"
            rows={d.sources}
            cols={[
              { key: "key", label: "Source", bold: true },
              { key: "bytesTotal", label: "Bytes", fmt: (v) => bytes(Number(v)) },
              { key: "rowCount", label: "Postings", fmt: (v) => Number(v).toLocaleString() },
            ]}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <SizeTable
              title="Document blobs by type"
              rows={d.artifactTypes}
              cols={[
                { key: "key", label: "Type", bold: true },
                { key: "bytesTotal", label: "Bytes", fmt: (v) => bytes(Number(v)) },
                { key: "rowCount", label: "Files", fmt: (v) => Number(v).toLocaleString() },
              ]}
            />
            <SizeTable
              title="Top users by blob storage"
              rows={d.topUsers}
              cols={[
                { key: "key", label: "User ID", bold: true },
                { key: "bytesTotal", label: "Bytes", fmt: (v) => bytes(Number(v)) },
                { key: "rowCount", label: "Files", fmt: (v) => Number(v).toLocaleString() },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
