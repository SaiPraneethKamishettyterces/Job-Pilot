import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getScraperSources,
  updateScraperSource,
  getIngestionStatus,
  runIngestion,
  type ScraperSource,
} from "@/services/api/admin";

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  hiringcafe: "Hiring Cafe",
  jobright: "Jobright",
};

function ScraperRow({ source }: { source: ScraperSource }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(source.enabled);
  const [maxJobs, setMaxJobs] = useState(source.maxJobsPerRun);

  const save = useMutation({
    mutationFn: () => updateScraperSource(source.sourceKey, { enabled, maxJobsPerRun: maxJobs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "scrapers"] }),
  });

  const dirty = enabled !== source.enabled || maxJobs !== source.maxJobsPerRun;

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 px-4 font-medium">
        {SOURCE_LABELS[source.sourceKey] ?? source.sourceKey}
        {source.note && <span className="block text-xs text-muted-foreground">{source.note}</span>}
      </td>
      <td className="py-3 px-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={enabled}
            disabled={!source.hasActor}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </td>
      <td className="py-3 px-4">
        <input
          type="number"
          min={0}
          max={1000}
          className="w-24 rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50"
          value={maxJobs}
          disabled={!source.hasActor}
          onChange={(e) => setMaxJobs(Number(e.target.value))}
        />
      </td>
      <td className="py-3 px-4">
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
          disabled={!source.hasActor || !dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

export function AdminSourcesPage() {
  const qc = useQueryClient();
  const scrapers = useQuery({ queryKey: ["admin", "scrapers"], queryFn: getScraperSources });
  const status = useQuery({ queryKey: ["admin", "ingestion"], queryFn: getIngestionStatus });

  const trigger = useMutation({
    mutationFn: runIngestion,
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["admin", "ingestion"] }), 1500),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Sources &amp; Scrapers</h1>
        <p className="text-sm text-muted-foreground">
          Free ATS boards and aggregators run automatically. Paid Apify scrapers below are off by
          default — enable a source and set how many jobs to pull per run (cost cap).
        </p>
      </div>

      {/* Paid scrapers config */}
      <section className="rounded-lg border">
        <header className="border-b px-4 py-3 font-medium text-sm">Paid scrapers (Apify)</header>
        {scrapers.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : scrapers.error ? (
          <div className="p-4 text-sm text-destructive">Failed to load (admin access required).</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 px-4 font-medium">Source</th>
                <th className="py-2 px-4 font-medium">Status</th>
                <th className="py-2 px-4 font-medium">Max jobs / run</th>
                <th className="py-2 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {scrapers.data?.map((s) => <ScraperRow key={s.sourceKey} source={s} />)}
            </tbody>
          </table>
        )}
      </section>

      {/* Ingestion status */}
      <section className="rounded-lg border">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-medium text-sm">Ingestion status</span>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate()}
          >
            {trigger.isPending ? "Starting…" : "Run ingestion now"}
          </button>
        </header>
        <div className="grid grid-cols-3 gap-4 p-4 text-sm">
          <div>
            <div className="text-muted-foreground">Company registry</div>
            <div className="text-lg font-semibold">{status.data?.registry.active ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {status.data?.registry.verified ?? "—"} verified · {status.data?.registry.total ?? "—"} total
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Global pool</div>
            <div className="text-lg font-semibold">{status.data?.pool.postings ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {status.data?.pool.newLast24h ?? "—"} new in last 24h
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Recent runs</div>
            <div className="text-lg font-semibold">{status.data?.runs.length ?? "—"}</div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y text-left text-muted-foreground">
              <th className="py-2 px-4 font-medium">Track</th>
              <th className="py-2 px-4 font-medium">Status</th>
              <th className="py-2 px-4 font-medium">Discovered</th>
              <th className="py-2 px-4 font-medium">Inserted</th>
              <th className="py-2 px-4 font-medium">Embedded</th>
              <th className="py-2 px-4 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {status.data?.runs.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 px-4">{r.sourceTag}</td>
                <td className="py-2 px-4">{r.status}</td>
                <td className="py-2 px-4">{r.postingsDiscovered}</td>
                <td className="py-2 px-4">{r.postingsInserted}</td>
                <td className="py-2 px-4">{r.postingsEmbedded}</td>
                <td className="py-2 px-4 text-muted-foreground">
                  {r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
