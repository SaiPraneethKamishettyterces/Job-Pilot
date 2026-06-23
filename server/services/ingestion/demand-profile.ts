// Demand aggregation — the union of what the user base is actually looking for,
// used to STEER demand-driven ingestion (search APIs + ATS board discovery). Only
// active subscribers count (they're the ones the daily scheduler dispatches runs
// for), so the pool tracks paying demand. Roles drive ingestion; skills/tools are
// intentionally excluded here — they make noisy search keywords and already shape
// per-user ranking in stage B (rerank.ts).
import { prisma } from "../../lib/db.js";
import { config } from "../../lib/config.js";

export type DemandProfile = {
  roleKeywords: string[]; // distinct target roles, frequency-ranked, capped
  locations: string[]; // distinct non-"remote" locations, capped (reserved for future use)
  companies: string[]; // distinct target companies, for ATS board resolution
};

function jsonStrings(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [];
}

/** Distinct values ranked by frequency (desc), normalized (lowercase/trim), capped. */
function rankByFrequency(values: string[], cap: number): string[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([v]) => v);
}

/**
 * Build the demand profile from ACTIVE subscribers' preferences. Returns empty
 * arrays when there are no active subscribers (callers then fall back to baseline
 * full-dump ingestion), so the pipeline still works on a fresh deploy.
 */
export async function buildDemandProfile(): Promise<DemandProfile> {
  const prefs = await prisma.userPreference.findMany({
    where: { user: { subscription: { is: { status: "active" } } } },
    select: { targetRolesJson: true, locationsJson: true, targetCompaniesJson: true },
  });

  const roles: string[] = [];
  const locations: string[] = [];
  const companies: string[] = [];
  for (const p of prefs) {
    roles.push(...jsonStrings(p.targetRolesJson));
    locations.push(...jsonStrings(p.locationsJson).filter((l) => l.trim().toLowerCase() !== "remote"));
    companies.push(...jsonStrings(p.targetCompaniesJson));
  }

  return {
    roleKeywords: rankByFrequency(roles, config.sources.maxKeywords),
    locations: rankByFrequency(locations, config.sources.maxLocations),
    companies: rankByFrequency(companies, 100),
  };
}
