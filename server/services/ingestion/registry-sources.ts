// Seed-source importers — turn the public GitHub company datasets into registry
// entries. Each importer is fail-soft (returns [] on error). Only the ATS platforms
// we have adapters for are kept; everything else is dead weight and dropped.
//
//   stapply-ai/ats-scrapers   per-ATS CSV `name,slug,url` (~63k, 29 ATS) — primary
//   Feashliaa/job-board-aggregator  per-ATS JSON arrays of slugs (~95k)
//   outscal/OpenJobs          companies_v2.json, ATS inferred from `ats_links`
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import type { AtsType } from "./ats-sources.js";
import type { RegistryEntry } from "./registry.js";
import { detectAtsFromUrl } from "./url-detect.js";

const SUPPORTED: AtsType[] = [
  "greenhouse", "lever", "ashby", "workable", "recruitee", "personio", "smartrecruiters", "workday",
  "breezy", "teamtailor",
];
const FETCH_TIMEOUT_MS = 30_000;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "Seed source fetch non-OK");
      return null;
    }
    return await res.text();
  } catch (err) {
    logger.warn({ url, err: String(err) }, "Seed source fetch failed");
    return null;
  }
}

/** Minimal quote-aware CSV line splitter (handles commas inside quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// ─── stapply-ai/ats-scrapers (CSV per ATS) ───────────────────────────────────
const STAPPLY_BASE = "https://raw.githubusercontent.com/stapply-ai/ats-scrapers/main/ats-companies";

async function importStapply(): Promise<RegistryEntry[]> {
  const out: RegistryEntry[] = [];
  for (const ats of SUPPORTED) {
    const csv = await fetchText(`${STAPPLY_BASE}/${ats}.csv`);
    if (!csv) continue;
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.toLowerCase() ?? "";
    const cols = splitCsvLine(header);
    const slugIdx = cols.indexOf("slug");
    const urlIdx = cols.indexOf("url");
    for (const line of lines) {
      const f = splitCsvLine(line);
      const slug = (slugIdx >= 0 ? f[slugIdx] : f[1])?.trim();
      const url = (urlIdx >= 0 ? f[urlIdx] : f[2])?.trim();
      // Prefer URL detection (gets Workday host/tenant/site); fall back to slug.
      const fromUrl = url ? detectAtsFromUrl(url) : null;
      if (fromUrl && fromUrl.ats === ats) out.push(fromUrl);
      else if (slug && ats !== "workday") out.push({ ats, token: slug }); // workday needs coords
    }
    logger.info({ ats, total: out.length }, "stapply import progress");
  }
  return out;
}

// ─── Feashliaa/job-board-aggregator (JSON arrays of slugs) ────────────────────
const FEASHLIAA_BASE = "https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data";
// Files are slugs-only, so only ATSs whose adapter needs just a slug are usable.
const FEASHLIAA_ATS: AtsType[] = ["greenhouse", "lever", "ashby"];

async function importFeashliaa(): Promise<RegistryEntry[]> {
  const out: RegistryEntry[] = [];
  for (const ats of FEASHLIAA_ATS) {
    const txt = await fetchText(`${FEASHLIAA_BASE}/${ats}_companies.json`);
    if (!txt) continue;
    try {
      const slugs = JSON.parse(txt) as unknown[];
      for (const s of slugs) if (typeof s === "string" && s.trim()) out.push({ ats, token: s.trim() });
    } catch (err) {
      logger.warn({ ats, err: String(err) }, "Feashliaa parse failed");
    }
  }
  return out;
}

// ─── outscal/OpenJobs (companies_v2.json, ATS inferred from ats_links) ────────
const OPENJOBS_URL = "https://raw.githubusercontent.com/outscal/OpenJobs/main/data/companies_v2.json";

async function importOpenJobs(): Promise<RegistryEntry[]> {
  const txt = await fetchText(OPENJOBS_URL);
  if (!txt) return [];
  const out: RegistryEntry[] = [];
  try {
    const companies = JSON.parse(txt) as Array<{ ats_links?: unknown }>;
    for (const c of companies) {
      const links = Array.isArray(c.ats_links) ? (c.ats_links as unknown[]) : [];
      for (const link of links) {
        if (typeof link !== "string") continue;
        const e = detectAtsFromUrl(link);
        if (e) out.push(e);
      }
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "OpenJobs parse failed");
  }
  return out;
}

/** Run all enabled seed importers and return the combined, supported-only entries. */
export async function importAllSeedSources(): Promise<RegistryEntry[]> {
  const tasks: Array<Promise<RegistryEntry[]>> = [];
  if (config.registry.seedStapply) tasks.push(importStapply());
  if (config.registry.seedFeashliaa) tasks.push(importFeashliaa());
  if (config.registry.seedOpenjobs) tasks.push(importOpenJobs());
  const results = await Promise.allSettled(tasks);
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Keep only supported ATS platforms.
  const supported = new Set<string>(SUPPORTED);
  return all.filter((e) => supported.has(e.ats) && e.token);
}
