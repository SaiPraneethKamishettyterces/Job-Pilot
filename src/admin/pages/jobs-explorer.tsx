import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getJobs, getJobDetail, type JobExplorerFilters } from "@/services/api/admin";

function bytes(n: number): string {
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}
function cost(n: number | null): string {
  return n == null ? "—" : n === 0 ? "$0" : `$${n.toFixed(4)}`;
}

const field = "rounded-md border bg-background px-2 py-1 text-sm";

function JobDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin", "job", id], queryFn: () => getJobDetail(id) });
  const d = q.data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l bg-background p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{d?.posting.title ?? "Loading…"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        {!d ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="mt-4 space-y-5 text-sm">
            <div className="text-muted-foreground">
              {d.posting.company} · {d.posting.location ?? "—"} · {String(d.posting.sourceName ?? "—")}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Acquisition</div>
                <div className="font-medium metric">{cost(d.cost.acquisitionCostUsd)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Embedding</div>
                <div className="font-medium metric">{cost(d.cost.embedCostUsd)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Total cost</div>
                <div className="font-medium metric">{cost(d.cost.totalCostUsd)}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">On-disk size</div>
                <div className="font-medium metric">{bytes(d.size.totalBytes)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">rawJson</div>
                <div className="font-medium metric">{bytes(d.size.rawJsonBytes)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Embedding vec</div>
                <div className="font-medium metric">{bytes(d.size.embeddingBytes)}</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provenance</div>
              <div className="mt-1 space-y-0.5">
                <div>Source: {String(d.posting.sourceName ?? "—")} · seen in {String((d.posting as Record<string, unknown>)["sourceCount"] ?? 1)} source(s)</div>
                <div>First seen: {new Date(String((d.posting as Record<string, unknown>)["firstSeenAt"])).toLocaleString()}</div>
                {d.acquiredByRun && <div>Acquiring run: {d.acquiredByRun.sourceTag} · {d.acquiredByRun.id.slice(0, 8)}</div>}
                {(d.posting as Record<string, unknown>)["embeddedAt"] ? (
                  <div>Embedded: {new Date(String((d.posting as Record<string, unknown>)["embeddedAt"])).toLocaleString()} ({String((d.posting as Record<string, unknown>)["embedModel"] ?? "")})</div>
                ) : null}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Matches ({d.matches.length})</div>
              {d.matches.length === 0 ? (
                <div className="mt-1 text-muted-foreground">No matches scored yet.</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.matches.map((m, i) => (
                    <span key={i} className="rounded-full border px-2 py-0.5 text-xs">{m.score}{m.tier ? ` · ${m.tier}` : ""}</span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{d.posting.description || "—"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminJobsExplorerPage() {
  const [filters, setFilters] = useState<JobExplorerFilters>({ page: 1, pageSize: 25, status: "active", sort: "firstSeenAt", order: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<JobExplorerFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const q = useQuery({
    queryKey: ["admin", "jobs", filters],
    queryFn: () => getJobs(filters),
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Job Pool Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Browse the actual postings in the database — filter by source, role, company, freshness; see each
          job&apos;s source, acquisition + embedding cost, on-disk size, and best match score. Click a row for detail.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-muted-foreground">Title contains</span>
          <input className={field} value={filters.q ?? ""} onChange={(e) => set({ q: e.target.value })} placeholder="e.g. engineer" />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Company</span>
          <input className={field} value={filters.company ?? ""} onChange={(e) => set({ company: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Source</span>
          <input className={field} value={filters.source ?? ""} onChange={(e) => set({ source: e.target.value })} placeholder="greenhouse…" />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Remote</span>
          <select className={field} value={filters.remoteType ?? ""} onChange={(e) => set({ remoteType: e.target.value })}>
            <option value="">any</option>
            <option value="remote">remote</option>
            <option value="hybrid">hybrid</option>
            <option value="onsite">onsite</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Status</span>
          <select className={field} value={filters.status ?? "active"} onChange={(e) => set({ status: e.target.value })}>
            <option value="active">active</option>
            <option value="all">all</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Fresh ≤ days</span>
          <input type="number" min={0} className={`${field} w-24`} value={filters.freshnessDays ?? ""} onChange={(e) => set({ freshnessDays: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Sort</span>
          <select className={field} value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="firstSeenAt">first seen</option>
            <option value="acquisitionCostUsd">acquisition cost</option>
            <option value="postedAt">posted date</option>
            <option value="company">company</option>
          </select>
        </label>
      </div>

      <section className="rounded-lg border overflow-x-auto">
        <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
          <span className="font-medium">
            {d ? `${d.total.toLocaleString()} postings` : "…"}
          </span>
          {d && d.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={d.page <= 1} onClick={() => set({ page: d.page - 1 })}>Prev</button>
              <span className="text-muted-foreground">Page {d.page} / {d.totalPages}</span>
              <button className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={d.page >= d.totalPages} onClick={() => set({ page: d.page + 1 })}>Next</button>
            </div>
          )}
        </div>
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 px-4 font-medium">Title</th>
              <th className="py-2 px-4 font-medium">Company</th>
              <th className="py-2 px-4 font-medium">Source</th>
              <th className="py-2 px-4 font-medium">Remote</th>
              <th className="py-2 px-4 font-medium">First seen</th>
              <th className="py-2 px-4 font-medium">Acq $</th>
              <th className="py-2 px-4 font-medium">Total $</th>
              <th className="py-2 px-4 font-medium">Size</th>
              <th className="py-2 px-4 font-medium">Best match</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={9} className="py-4 px-4 text-muted-foreground">Loading…</td></tr>
            ) : !d || d.jobs.length === 0 ? (
              <tr><td colSpan={9} className="py-4 px-4 text-muted-foreground">No postings match.</td></tr>
            ) : (
              d.jobs.map((j) => (
                <tr key={j.id} className="cursor-pointer border-b last:border-0 hover:bg-white/[0.03]" onClick={() => setOpenId(j.id)}>
                  <td className="py-2 px-4 font-medium">{j.title}</td>
                  <td className="py-2 px-4">{j.company}</td>
                  <td className="py-2 px-4">{j.sourceName ?? "—"}</td>
                  <td className="py-2 px-4">{j.remoteType ?? "—"}</td>
                  <td className="py-2 px-4">{new Date(j.firstSeenAt).toLocaleDateString()}</td>
                  <td className="py-2 px-4">{cost(j.acquisitionCostUsd)}</td>
                  <td className="py-2 px-4">{cost(j.totalCostUsd)}</td>
                  <td className="py-2 px-4">{bytes(j.sizeBytes)}</td>
                  <td className="py-2 px-4">{j.bestScore != null ? `${j.bestScore} (${j.matchCount})` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {openId && <JobDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
