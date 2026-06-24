// ATS source adapters — fetch jobs from public, structured ATS board JSON APIs.
//
// Priority for the base version (per product direction): structured public ATS
// JSON boards (Greenhouse, Lever) first. These are clean, free, and don't
// require scraping. No LinkedIn/Indeed scraping here.
import { logger } from "../../lib/logger.js";

export type AtsType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "recruitee"
  | "personio"
  | "smartrecruiters"
  | "workday"
  // Part 1.7 — additional public ATS boards.
  | "breezy"
  | "teamtailor";

// A raw job as returned by an ATS or aggregator adapter, before normalization.
// `source`/`atsPlatform` are free strings so aggregator adapters (remotive,
// remoteok, adzuna, themuse, usajobs, arbeitnow) can identify themselves too.
export type RawJob = {
  source: string;
  atsPlatform: string;
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

export function stripHtml(html: string): string {
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

export async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
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

// ─── Ashby ───────────────────────────────────────────────────────────────────
// https://api.ashbyhq.com/posting-api/job-board/{org}  (public, no auth)

type AshbyJob = {
  id: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  isRemote?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
};

export async function fetchAshby(token: string): Promise<RawJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`;
  const data = await getJson<{ jobs?: AshbyJob[] }>(url);
  if (!data?.jobs?.length) return [];

  return data.jobs.map((j) => ({
    source: "ashby" as const,
    atsPlatform: "ashby" as const,
    sourceJobId: String(j.id),
    title: j.title?.trim() ?? "Untitled",
    company: token,
    locationRaw: j.location ?? null,
    department: j.department ?? j.team ?? null,
    descriptionText: j.descriptionPlain?.trim() || (j.descriptionHtml ? stripHtml(j.descriptionHtml) : ""),
    jobUrl: j.jobUrl ?? null,
    applyUrl: j.applyUrl ?? j.jobUrl ?? null,
    postedAt: j.publishedAt ?? null,
    workplaceType: j.isRemote ? "remote" : null,
    commitment: j.employmentType ?? null,
    raw: j,
  }));
}

// ─── Workable ────────────────────────────────────────────────────────────────
// https://apply.workable.com/api/v1/widget/accounts/{account}?details=true (public)

type WorkableJob = {
  id?: string | number;
  shortcode?: string;
  title?: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url?: string;
  application_url?: string;
  shortlink?: string;
  location?: { city?: string; region?: string; country?: string; telecommuting?: boolean };
  created_at?: string;
  description?: string;
  requirements?: string;
};

export async function fetchWorkable(token: string): Promise<RawJob[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`;
  const data = await getJson<{ jobs?: WorkableJob[] }>(url);
  if (!data?.jobs?.length) return [];

  return data.jobs.map((j) => {
    const loc = j.location
      ? [j.location.city, j.location.region, j.location.country].filter(Boolean).join(", ") || null
      : null;
    const body = [j.description, j.requirements].filter(Boolean).join("\n\n");
    return {
      source: "workable" as const,
      atsPlatform: "workable" as const,
      sourceJobId: String(j.shortcode ?? j.id ?? j.title ?? "unknown"),
      title: j.title?.trim() ?? "Untitled",
      company: token,
      locationRaw: loc,
      department: j.department ?? null,
      descriptionText: body ? stripHtml(body) : "",
      jobUrl: j.url ?? j.shortlink ?? null,
      applyUrl: j.application_url ?? j.url ?? null,
      postedAt: j.created_at ?? null,
      workplaceType: j.telecommuting || j.location?.telecommuting ? "remote" : null,
      commitment: j.employment_type ?? null,
      raw: j,
    };
  });
}

// ─── Recruitee ───────────────────────────────────────────────────────────────
// https://{token}.recruitee.com/api/offers  (public, no auth)

type RecruiteeOffer = {
  id?: number | string;
  title?: string;
  company_name?: string;
  department?: string;
  location?: string;
  city?: string;
  country?: string;
  description?: string; // HTML
  requirements?: string; // HTML
  careers_url?: string;
  careers_apply_url?: string;
  created_at?: string;
  employment_type_code?: string;
  remote?: boolean;
};

export async function fetchRecruitee(token: string): Promise<RawJob[]> {
  const url = `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`;
  const data = await getJson<{ offers?: RecruiteeOffer[] }>(url);
  if (!data?.offers?.length) return [];
  return data.offers.map((j) => ({
    source: "recruitee" as const,
    atsPlatform: "recruitee" as const,
    sourceJobId: String(j.id ?? j.title),
    title: j.title?.trim() ?? "Untitled",
    company: j.company_name?.trim() || token,
    locationRaw: j.location || [j.city, j.country].filter(Boolean).join(", ") || null,
    department: j.department ?? null,
    descriptionText: stripHtml([j.description, j.requirements].filter(Boolean).join("\n\n")),
    jobUrl: j.careers_url ?? null,
    applyUrl: j.careers_apply_url ?? j.careers_url ?? null,
    postedAt: j.created_at ?? null,
    workplaceType: j.remote ? "remote" : null,
    commitment: j.employment_type_code ?? null,
    raw: j,
  }));
}

// ─── Personio ────────────────────────────────────────────────────────────────
// https://{token}.jobs.personio.de/xml  (public XML feed, no auth)

function xmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || null;
}

export async function fetchPersonio(token: string): Promise<RawJob[]> {
  // Personio serves an XML feed; fetch as text and parse the <position> blocks.
  const url = `https://${encodeURIComponent(token)}.jobs.personio.de/xml?language=en`;
  let xml: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }
  const blocks = xml.match(/<position[\s\S]*?<\/position>/gi) ?? [];
  const jobs: RawJob[] = [];
  for (const b of blocks) {
    const desc = [xmlTag(b, "jobDescriptions") ?? "", b.match(/<value>([\s\S]*?)<\/value>/gi)?.join("\n") ?? ""].join("\n");
    jobs.push({
      source: "personio",
      atsPlatform: "personio",
      sourceJobId: xmlTag(b, "id") ?? xmlTag(b, "name") ?? "unknown",
      title: xmlTag(b, "name") ?? "Untitled",
      company: token,
      locationRaw: xmlTag(b, "office") ?? null,
      department: xmlTag(b, "department") ?? null,
      descriptionText: stripHtml(desc),
      jobUrl: null,
      applyUrl: null,
      postedAt: xmlTag(b, "createdAt") ?? null,
      workplaceType: null,
      commitment: xmlTag(b, "employmentType") ?? null,
      raw: { id: xmlTag(b, "id") },
    });
  }
  return jobs;
}

// ─── SmartRecruiters ─────────────────────────────────────────────────────────
// https://api.smartrecruiters.com/v1/companies/{token}/postings  (public reads)

type SrPosting = {
  id?: string;
  name?: string;
  company?: { name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  department?: { label?: string };
  releasedDate?: string;
  ref?: string; // detail/apply url
  typeOfEmployment?: { label?: string };
};

export async function fetchSmartRecruiters(token: string): Promise<RawJob[]> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`;
  const data = await getJson<{ content?: SrPosting[] }>(url);
  if (!data?.content?.length) return [];
  return data.content.map((j) => {
    const loc = j.location
      ? [j.location.city, j.location.region, j.location.country].filter(Boolean).join(", ") || null
      : null;
    return {
      source: "smartrecruiters" as const,
      atsPlatform: "smartrecruiters" as const,
      sourceJobId: String(j.id ?? j.ref ?? j.name),
      title: j.name?.trim() ?? "Untitled",
      company: j.company?.name?.trim() || token,
      locationRaw: loc,
      department: j.department?.label ?? null,
      descriptionText: "", // SmartRecruiters full text needs a per-posting fetch; title/loc suffice for matching
      jobUrl: j.ref ?? null,
      applyUrl: j.ref ?? null,
      postedAt: j.releasedDate ?? null,
      workplaceType: j.location?.remote ? "remote" : null,
      commitment: j.typeOfEmployment?.label ?? null,
      raw: j,
    };
  });
}

// ─── Workday ─────────────────────────────────────────────────────────────────
// POST https://{host}/wday/cxs/{tenant}/{site}/jobs  (public listings, no auth)

type WorkdayJob = {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

export async function fetchWorkday(ref: BoardRef): Promise<RawJob[]> {
  if (!ref.host || !ref.tenant || !ref.site) return [];
  const url = `https://${ref.host}/wday/cxs/${encodeURIComponent(ref.tenant)}/${encodeURIComponent(ref.site)}/jobs`;
  let data: { jobPostings?: WorkdayJob[] } | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 100, offset: 0, searchText: "" }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    data = (await res.json()) as { jobPostings?: WorkdayJob[] };
  } catch {
    return [];
  }
  if (!data?.jobPostings?.length) return [];
  const base = `https://${ref.host}/${ref.site}`;
  return data.jobPostings.map((j) => ({
    source: "workday" as const,
    atsPlatform: "workday" as const,
    sourceJobId: j.externalPath ?? j.title ?? "unknown",
    title: j.title?.trim() ?? "Untitled",
    company: ref.tenant!,
    locationRaw: j.locationsText ?? null,
    department: null,
    descriptionText: "", // full text needs a per-posting fetch; title/loc suffice for matching
    jobUrl: j.externalPath ? `${base}${j.externalPath}` : null,
    applyUrl: j.externalPath ? `${base}${j.externalPath}` : null,
    postedAt: null,
    workplaceType: null,
    commitment: null,
    raw: j,
  }));
}

// ─── Company → board resolution ──────────────────────────────────────────────

// `token` is the company slug for slug-based ATSs (Greenhouse/Lever/Ashby/Workable/
// Recruitee/Personio/SmartRecruiters). Workday needs the full coordinates instead:
// host (e.g. company.wd5.myworkdayjobs.com), tenant, and site.
export type BoardRef = { ats: AtsType; token: string; host?: string; tenant?: string; site?: string };

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
      // Unknown company: try the public no-login boards with the slug; adapters
      // fail soft (404 → empty), so we cast a wide net across providers.
      add({ ats: "greenhouse", token: slug });
      add({ ats: "lever", token: slug });
      add({ ats: "ashby", token: slug });
    }
  }

  if (refs.length === 0) DEFAULT_BOARDS.forEach(add);
  return refs;
}

// ─── Breezy HR ─────────────────────────────────────────────────────────────────
// https://{token}.breezy.hr/json  (public, no auth)
type BreezyJob = {
  id?: string;
  name?: string;
  friendly_id?: string;
  type?: { name?: string } | string;
  location?: { name?: string; city?: string; country?: { name?: string } } | string;
  description?: string; // HTML
  url?: string;
  published_date?: string;
  creation_date?: string;
  department?: string;
};

export async function fetchBreezy(token: string): Promise<RawJob[]> {
  const data = await getJson<BreezyJob[]>(`https://${encodeURIComponent(token)}.breezy.hr/json`);
  if (!Array.isArray(data) || !data.length) return [];
  return data.map((j) => {
    const loc =
      typeof j.location === "string"
        ? j.location
        : [j.location?.name, j.location?.city, j.location?.country?.name].filter(Boolean).join(", ") || null;
    const type = typeof j.type === "string" ? j.type : j.type?.name;
    return {
      source: "breezy" as const,
      atsPlatform: "breezy" as const,
      sourceJobId: String(j.id ?? j.friendly_id ?? j.name ?? "unknown"),
      title: j.name?.trim() ?? "Untitled",
      company: token,
      locationRaw: loc,
      department: j.department ?? null,
      descriptionText: j.description ? stripHtml(j.description) : "",
      jobUrl: j.url ?? null,
      applyUrl: j.url ?? null,
      postedAt: j.published_date ?? j.creation_date ?? null,
      workplaceType: null,
      commitment: type ?? null,
      raw: j,
    };
  });
}

// ─── Teamtailor ──────────────────────────────────────────────────────────────
// Best-effort public board JSON: https://{token}.teamtailor.com/jobs.json
// Fails soft (404 → []); recordBoardHealth() auto-deactivates boards with no jobs.
type TeamtailorJob = {
  id?: string | number;
  title?: string;
  body?: string; // HTML
  "created-at"?: string;
  createdAt?: string;
  "apply-url"?: string;
  applyUrl?: string;
  url?: string;
  location?: string;
};

export async function fetchTeamtailor(token: string): Promise<RawJob[]> {
  const data = await getJson<{ data?: Array<{ id?: string; attributes?: TeamtailorJob }>; jobs?: TeamtailorJob[] }>(
    `https://${encodeURIComponent(token)}.teamtailor.com/jobs.json`,
  );
  const rows = data?.data?.map((d) => ({ id: d.id, ...(d.attributes ?? {}) })) ?? data?.jobs ?? [];
  if (!rows.length) return [];
  return rows.map((j) => {
    const apply = j["apply-url"] ?? j.applyUrl ?? j.url ?? null;
    return {
      source: "teamtailor" as const,
      atsPlatform: "teamtailor" as const,
      sourceJobId: String(j.id ?? apply ?? j.title ?? "unknown"),
      title: j.title?.trim() ?? "Untitled",
      company: token,
      locationRaw: j.location ?? null,
      department: null,
      descriptionText: j.body ? stripHtml(j.body) : "",
      jobUrl: apply,
      applyUrl: apply,
      postedAt: j["created-at"] ?? j.createdAt ?? null,
      workplaceType: null,
      commitment: null,
      raw: j,
    };
  });
}

export async function fetchBoard(ref: BoardRef): Promise<RawJob[]> {
  switch (ref.ats) {
    case "greenhouse":
      return fetchGreenhouse(ref.token);
    case "lever":
      return fetchLever(ref.token);
    case "ashby":
      return fetchAshby(ref.token);
    case "workable":
      return fetchWorkable(ref.token);
    case "recruitee":
      return fetchRecruitee(ref.token);
    case "personio":
      return fetchPersonio(ref.token);
    case "smartrecruiters":
      return fetchSmartRecruiters(ref.token);
    case "workday":
      return fetchWorkday(ref);
    case "breezy":
      return fetchBreezy(ref.token);
    case "teamtailor":
      return fetchTeamtailor(ref.token);
  }
}

// ─── Global board registry ───────────────────────────────────────────────────
// The user-agnostic union of every ATS board we know about — consumed by the
// scheduled global ingestor (NOT by per-user runs). Seeded from the curated map +
// defaults above; grow this to hundreds of slugs over time (or back it with the
// JobSource table). Deduped by `${ats}:${token}`.
export function globalBoardRegistry(): BoardRef[] {
  const refs: BoardRef[] = [];
  const seen = new Set<string>();
  const add = (ref: BoardRef) => {
    const key = `${ref.ats}:${ref.token}`;
    if (ref.token && !seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  };
  for (const ref of Object.values(CURATED)) add(ref);
  for (const ref of DEFAULT_BOARDS) add(ref);
  return refs;
}
