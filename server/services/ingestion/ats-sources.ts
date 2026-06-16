// ATS source adapters — fetch jobs from public, structured ATS board JSON APIs.
//
// Priority for the base version (per product direction): structured public ATS
// JSON boards (Greenhouse, Lever) first. These are clean, free, and don't
// require scraping. No LinkedIn/Indeed scraping here.
import { logger } from "../../lib/logger.js";

// A raw job as returned by an ATS adapter, before normalization into T2 shape.
export type RawJob = {
  source: "greenhouse" | "lever";
  atsPlatform: "greenhouse" | "lever";
  sourceJobId: string;
  title: string;
  company: string;
  locationRaw: string | null;
  department: string | null;
  descriptionText: string; // plain-ish text (HTML stripped)
  jobUrl: string | null;
  applyUrl: string | null;
  postedAt: string | null; // ISO
  workplaceType: string | null; // remote | hybrid | onsite | null
  commitment: string | null; // full-time | contract | internship | null
  raw: unknown;
};

const FETCH_TIMEOUT_MS = 12000;
const UA = "Mozilla/5.0 (compatible; JobPilot/1.0; +https://jobpilot.local)";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "ATS fetch non-OK");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, err: msg }, "ATS fetch failed");
    return null;
  }
}

// ─── Greenhouse ────────────────────────────────────────────────────────────────
// https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true

type GhJob = {
  id: number;
  title: string;
  updated_at?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string; // HTML-encoded
  departments?: Array<{ name?: string }>;
};

export async function fetchGreenhouse(token: string): Promise<RawJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
  const data = await getJson<{ jobs?: GhJob[] }>(url);
  if (!data?.jobs?.length) return [];

  return data.jobs.map((j) => ({
    source: "greenhouse" as const,
    atsPlatform: "greenhouse" as const,
    sourceJobId: String(j.id),
    title: j.title?.trim() ?? "Untitled",
    company: token,
    locationRaw: j.location?.name ?? null,
    department: j.departments?.[0]?.name ?? null,
    descriptionText: j.content ? stripHtml(j.content) : "",
    jobUrl: j.absolute_url ?? null,
    applyUrl: j.absolute_url ?? null,
    postedAt: j.updated_at ?? null,
    workplaceType: null,
    commitment: null,
    raw: j,
  }));
}

// ─── Lever ─────────────────────────────────────────────────────────────────────
// https://api.lever.co/v0/postings/{company}?mode=json

type LeverJob = {
  id: string;
  text: string;
  categories?: { commitment?: string; department?: string; location?: string; team?: string };
  descriptionPlain?: string;
  description?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
};

export async function fetchLever(token: string): Promise<RawJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
  const data = await getJson<LeverJob[]>(url);
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map((j) => ({
    source: "lever" as const,
    atsPlatform: "lever" as const,
    sourceJobId: j.id,
    title: j.text?.trim() ?? "Untitled",
    company: token,
    locationRaw: j.categories?.location ?? null,
    department: j.categories?.department ?? j.categories?.team ?? null,
    descriptionText: j.descriptionPlain?.trim() || (j.description ? stripHtml(j.description) : ""),
    jobUrl: j.hostedUrl ?? null,
    applyUrl: j.applyUrl ?? j.hostedUrl ?? null,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    workplaceType: j.workplaceType ?? null,
    commitment: j.categories?.commitment ?? null,
    raw: j,
  }));
}

// ─── Company → board resolution ──────────────────────────────────────────────

export type BoardRef = { ats: "greenhouse" | "lever"; token: string };

// Curated map of well-known companies to their public board tokens, so a user's
// free-text target companies resolve to a real board. Extend as needed.
const CURATED: Record<string, BoardRef> = {
  stripe: { ats: "greenhouse", token: "stripe" },
  airbnb: { ats: "greenhouse", token: "airbnb" },
  databricks: { ats: "greenhouse", token: "databricks" },
  coinbase: { ats: "greenhouse", token: "coinbase" },
  robinhood: { ats: "greenhouse", token: "robinhood" },
  gitlab: { ats: "greenhouse", token: "gitlab" },
  figma: { ats: "greenhouse", token: "figma" },
  discord: { ats: "greenhouse", token: "discord" },
  dropbox: { ats: "greenhouse", token: "dropbox" },
  cloudflare: { ats: "greenhouse", token: "cloudflare" },
  netflix: { ats: "lever", token: "netflix" },
  plaid: { ats: "greenhouse", token: "plaid" },
  // Additional well-known boards.
  reddit: { ats: "greenhouse", token: "reddit" },
  instacart: { ats: "greenhouse", token: "instacart" },
  brex: { ats: "greenhouse", token: "brex" },
  ramp: { ats: "greenhouse", token: "ramp" },
  notion: { ats: "greenhouse", token: "notion" },
  retool: { ats: "greenhouse", token: "retool" },
  scaleai: { ats: "lever", token: "scaleai" },
  ramppayments: { ats: "greenhouse", token: "ramp" },
  benchling: { ats: "greenhouse", token: "benchling" },
  affirm: { ats: "greenhouse", token: "affirm" },
  doordash: { ats: "greenhouse", token: "doordash" },
  asana: { ats: "greenhouse", token: "asana" },
};

// Map common company/careers HOSTNAMES to a board, so a user who types a URL or
// domain (e.g. "stripe.com", "https://careers.stripe.com/...") still resolves to
// a real board instead of falling through to the slug guess.
const DOMAIN_TO_BOARD: Record<string, BoardRef> = {
  "stripe.com": { ats: "greenhouse", token: "stripe" },
  "figma.com": { ats: "greenhouse", token: "figma" },
  "databricks.com": { ats: "greenhouse", token: "databricks" },
  "coinbase.com": { ats: "greenhouse", token: "coinbase" },
  "gitlab.com": { ats: "greenhouse", token: "gitlab" },
  "cloudflare.com": { ats: "greenhouse", token: "cloudflare" },
  "netflix.com": { ats: "lever", token: "netflix" },
  "plaid.com": { ats: "greenhouse", token: "plaid" },
  "reddit.com": { ats: "greenhouse", token: "reddit" },
  "notion.so": { ats: "greenhouse", token: "notion" },
  "doordash.com": { ats: "greenhouse", token: "doordash" },
  "asana.com": { ats: "greenhouse", token: "asana" },
};

// Extract a bare hostname from a free-text entry that may be a URL, a domain, or
// neither. Returns null when the entry doesn't look like a domain/URL.
function extractHost(entry: string): string | null {
  const trimmed = entry.trim().toLowerCase();
  if (!trimmed) return null;
  let host: string | null = null;
  if (/^https?:\/\//.test(trimmed)) {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      host = null;
    }
  } else if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) {
    host = trimmed;
  }
  if (!host) return null;
  return host.replace(/^www\./, "").replace(/^(careers|jobs|boards|apply|job-boards)\./, "");
}

// Default boards used when the user has no target companies (or none resolve),
// so an ingestion run still returns real jobs in the base version.
const DEFAULT_BOARDS: BoardRef[] = [
  { ats: "greenhouse", token: "stripe" },
  { ats: "greenhouse", token: "databricks" },
  { ats: "greenhouse", token: "figma" },
];

export function slugify(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/\b(inc|llc|ltd|corp|co)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Resolve a list of target company names to candidate board refs.
// Each unresolved company is tried on greenhouse first, then lever, via its slug.
export function resolveBoards(targetCompanies: string[]): BoardRef[] {
  const refs: BoardRef[] = [];
  const seen = new Set<string>();
  const add = (ref: BoardRef) => {
    const key = `${ref.ats}:${ref.token}`;
    if (ref.token && !seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  };

  for (const company of targetCompanies) {
    // If the entry is a URL/domain, resolve it via the careers-domain map first.
    const host = extractHost(company);
    if (host && DOMAIN_TO_BOARD[host]) {
      add(DOMAIN_TO_BOARD[host]);
      continue;
    }

    // For an unmapped host, use its first label (acme.com → "acme") as the slug.
    const slug = slugify(host ? host.split(".")[0]! : company);
    if (!slug) continue;
    if (CURATED[slug]) {
      add(CURATED[slug]);
    } else {
      // Unknown company: try both platforms with the slug; adapters fail soft.
      add({ ats: "greenhouse", token: slug });
      add({ ats: "lever", token: slug });
    }
  }

  if (refs.length === 0) DEFAULT_BOARDS.forEach(add);
  return refs;
}

export async function fetchBoard(ref: BoardRef): Promise<RawJob[]> {
  return ref.ats === "greenhouse" ? fetchGreenhouse(ref.token) : fetchLever(ref.token);
}
