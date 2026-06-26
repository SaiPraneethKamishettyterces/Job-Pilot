// Job normalizer — converts a raw ATS job into the T2 (job_candidates) shape.
//
// Base version uses deterministic, rule-based extraction (no LLM calls): a skill
// taxonomy keyword scan, regex salary parsing, keyword visa/sponsorship signals,
// and title-based seniority. Embeddings are stubbed (see embedding field) and
// wired in the matching milestone.
import { createHash } from "node:crypto";
import type { RawJob } from "./ats-sources.js";

export const PARSER_NAME = "rule-based-normalizer";
export const PARSER_VERSION = "1.0.0";

export type NormalizedJob = {
  source: string;
  sourceJobId: string;
  atsPlatform: string;
  title: string;
  normalizedTitle: string;
  company: string;
  department: string | null;
  location: string | null;
  isRemote: boolean;
  remoteType: "remote" | "hybrid" | "onsite" | "unknown";
  employmentType: "full_time" | "contract" | "internship" | "part_time" | "temporary" | "unknown";
  seniority: "intern" | "entry" | "junior" | "mid" | "senior" | "lead" | "manager" | "unknown";
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "yearly" | "hourly" | "monthly" | "unknown";
  salaryTextRaw: string | null;
  visaSponsored: boolean | null;
  sponsorshipNotes: string | null;
  skills: string[];
  tools: string[];
  descriptionClean: string;
  jobUrl: string | null;
  applyUrl: string | null;
  postedAt: string | null;
  dedupeKey: string;
  // Source-AGNOSTIC key (normalized company + title + location/remote) used to
  // collapse the SAME role seen across different sources (LinkedIn + the company
  // ATS), which the source-scoped dedupeKey cannot. Heuristic by design.
  canonicalKey: string;
  contentHash: string;
  // Paid-scraper cost amortized onto this job (0 for free sources). Carried from
  // RawJob → JobPosting.acquisitionCostUsd for per-job cost tracking.
  acquisitionCostUsd: number;
};

// ─── Skill taxonomy ──────────────────────────────────────────────────────────
// Each entry maps a canonical skill to the regexes that detect it in JD text.
const SKILL_TAXONOMY: Record<string, RegExp> = {
  Python: /\bpython\b/i,
  JavaScript: /\bjavascript\b/i,
  TypeScript: /\btypescript\b/i,
  Java: /\bjava\b(?!script)/i,
  Go: /\b(golang|go lang)\b/i,
  Rust: /\brust\b/i,
  "C++": /\bc\+\+\b/i,
  "C#": /\bc#\b/i,
  Ruby: /\bruby\b/i,
  PHP: /\bphp\b/i,
  Scala: /\bscala\b/i,
  Kotlin: /\bkotlin\b/i,
  Swift: /\bswift\b/i,
  SQL: /\bsql\b/i,
  React: /\breact(\.js|js)?\b/i,
  "Node.js": /\bnode(\.js|js)?\b/i,
  Angular: /\bangular\b/i,
  "Vue.js": /\bvue(\.js)?\b/i,
  Django: /\bdjango\b/i,
  Flask: /\bflask\b/i,
  Spring: /\bspring\b/i,
  GraphQL: /\bgraphql\b/i,
  AWS: /\b(aws|amazon web services)\b/i,
  GCP: /\b(gcp|google cloud)\b/i,
  Azure: /\bazure\b/i,
  Docker: /\bdocker\b/i,
  Kubernetes: /\b(kubernetes|k8s)\b/i,
  Terraform: /\bterraform\b/i,
  PostgreSQL: /\b(postgres|postgresql)\b/i,
  MySQL: /\bmysql\b/i,
  MongoDB: /\bmongodb\b/i,
  Redis: /\bredis\b/i,
  Kafka: /\bkafka\b/i,
  Spark: /\b(apache )?spark\b/i,
  Airflow: /\bairflow\b/i,
  Snowflake: /\bsnowflake\b/i,
  BigQuery: /\bbig\s?query\b/i,
  dbt: /\bdbt\b/i,
  TensorFlow: /\btensorflow\b/i,
  PyTorch: /\bpytorch\b/i,
  Pandas: /\bpandas\b/i,
  "Machine Learning": /\b(machine learning|ml)\b/i,
  "Data Engineering": /\bdata engineer/i,
  Tableau: /\btableau\b/i,
  "Power BI": /\bpower\s?bi\b/i,
};

const TOOLS_TAXONOMY: Record<string, RegExp> = {
  Git: /\bgit\b/i,
  Jira: /\bjira\b/i,
  Figma: /\bfigma\b/i,
  Jenkins: /\bjenkins\b/i,
  "GitHub Actions": /\bgithub actions\b/i,
  Datadog: /\bdatadog\b/i,
  Grafana: /\bgrafana\b/i,
};

function extractFromTaxonomy(text: string, taxonomy: Record<string, RegExp>): string[] {
  const found: string[] = [];
  for (const [name, re] of Object.entries(taxonomy)) {
    if (re.test(text)) found.push(name);
  }
  return found;
}

// ─── Salary parsing ──────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR" };

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[, ]/g, "").toLowerCase();
  const k = /k$/.test(cleaned);
  const n = parseFloat(cleaned.replace(/k$/, ""));
  if (Number.isNaN(n)) return NaN;
  return Math.round(k ? n * 1000 : n);
}

function extractSalary(text: string): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: NormalizedJob["salaryPeriod"];
  raw: string | null;
} {
  // Matches: "$120,000 - $150,000", "$120k–$150k", "£90,000", "$55/hour"
  const rangeRe =
    /([$£€])\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?k?)\s?(?:-|–|to)\s?([$£€])?\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?k?)/i;
  const singleRe = /([$£€])\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?k?)/i;
  const periodRe = /\b(per hour|\/hour|hourly|per year|\/year|annually|per month|\/month|monthly)\b/i;

  let min: number | null = null;
  let max: number | null = null;
  let currency: string | null = null;
  let rawMatch: string | null = null;

  const range = text.match(rangeRe);
  if (range) {
    rawMatch = range[0];
    currency = CURRENCY_SYMBOLS[range[1]] ?? null;
    min = parseAmount(range[2]);
    max = parseAmount(range[4]);
  } else {
    const single = text.match(singleRe);
    if (single) {
      const amt = parseAmount(single[2]);
      // Ignore tiny numbers that are unlikely to be salaries (e.g. "$5 lunch").
      if (amt >= 1000) {
        rawMatch = single[0];
        currency = CURRENCY_SYMBOLS[single[1]] ?? null;
        min = amt;
        max = amt;
      }
    }
  }

  let period: NormalizedJob["salaryPeriod"] = "unknown";
  const p = text.match(periodRe)?.[1]?.toLowerCase() ?? "";
  if (/hour/.test(p)) period = "hourly";
  else if (/month/.test(p)) period = "monthly";
  else if (/year|annual/.test(p)) period = "yearly";
  else if (min && min >= 10000) period = "yearly";

  if (Number.isNaN(min as number)) min = null;
  if (Number.isNaN(max as number)) max = null;
  return { min, max, currency, period, raw: rawMatch };
}

// ─── Visa / sponsorship signals ──────────────────────────────────────────────

function extractVisa(text: string): { sponsored: boolean | null; notes: string | null } {
  const t = text.toLowerCase();
  const noSponsor =
    /(no (visa )?sponsorship|not able to sponsor|unable to sponsor|without sponsorship|do(es)? not sponsor|no h-?1b)/i;
  const yesSponsor = /(sponsorship (is )?available|will sponsor|visa sponsorship|h-?1b sponsorship|we sponsor)/i;
  const authRequired = /(must be authorized to work|legally authorized to work|work authorization required)/i;

  if (noSponsor.test(t)) return { sponsored: false, notes: "JD states sponsorship not available" };
  if (yesSponsor.test(t)) return { sponsored: true, notes: "JD states sponsorship available" };
  if (authRequired.test(t)) return { sponsored: false, notes: "JD requires existing work authorization" };
  return { sponsored: null, notes: null };
}

// ─── Seniority / employment / remote ─────────────────────────────────────────

function extractSeniority(title: string): NormalizedJob["seniority"] {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(principal|staff|distinguished)\b/.test(t)) return "lead";
  if (/\b(lead|head of)\b/.test(t)) return "lead";
  if (/\b(manager|director|vp|head)\b/.test(t)) return "manager";
  if (/\b(sr\.?|senior)\b/.test(t)) return "senior";
  if (/\b(jr\.?|junior|entry|associate|new grad|graduate)\b/.test(t)) return "junior";
  if (/\bmid(-|\s)?level\b/.test(t)) return "mid";
  return "unknown";
}

function extractEmploymentType(
  title: string,
  text: string,
  commitment: string | null
): NormalizedJob["employmentType"] {
  const t = `${commitment ?? ""} ${title} ${text}`.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "internship";
  if (/\b(contract|contractor|c2c|1099)\b/.test(t)) return "contract";
  if (/\bpart[-\s]?time\b/.test(t)) return "part_time";
  if (/\b(temp|temporary|seasonal)\b/.test(t)) return "temporary";
  if (/\bfull[-\s]?time\b/.test(t)) return "full_time";
  return "unknown";
}

function extractRemote(
  locationRaw: string | null,
  text: string,
  workplaceType: string | null
): { remoteType: NormalizedJob["remoteType"]; isRemote: boolean } {
  const hay = `${workplaceType ?? ""} ${locationRaw ?? ""} ${text.slice(0, 1500)}`.toLowerCase();
  if (/\bhybrid\b/.test(hay)) return { remoteType: "hybrid", isRemote: false };
  if (/\b(remote|work from home|wfh|distributed)\b/.test(hay)) return { remoteType: "remote", isRemote: true };
  if (/\b(on-?site|in-?office|in person)\b/.test(hay)) return { remoteType: "onsite", isRemote: false };
  return { remoteType: "unknown", isRemote: false };
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[（(].*?[)）]/g, "")
    .replace(/[-–—|,].*$/, "")
    .replace(/\b(sr\.?|jr\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** Normalize a company name for the canonical key (drop legal suffixes/punct). */
function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp|co|gmbh|plc|company|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Source-agnostic canonical key: same role on LinkedIn and on the company's
 * Greenhouse board → same key, so they collapse to one. Heuristic (platform title
 * strings vary) — tuned conservative so distinct roles ("backend" vs "frontend")
 * never falsely merge; the cost of a miss is a near-duplicate, not a wrong drop.
 */
/**
 * Canonical role for the dedup key. Unlike normalizeTitle, it does NOT truncate at
 * the first comma/dash (so "Engineer, Backend" ≠ "Engineer, Frontend") and it
 * NORMALIZES seniority abbreviations rather than stripping them — "Sr."→"senior",
 * "Jr."→"junior" — KEEPING the seniority word. So "Sr. Data Engineer" ≡ "Senior
 * Data Engineer" (same job, different source spelling) but "Senior Data Engineer"
 * ≠ "Data Engineer" (genuinely different reqs → respects experience-level matching).
 */
function canonicalRole(title: string): string {
  return title
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, " ") // drop parentheticals
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/[^a-z0-9+#]+/g, " ") // punctuation (incl. commas/dashes) → space, NO truncation
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalKeyFor(
  company: string,
  title: string,
  location: string | null,
  isRemote: boolean,
): string {
  const loc = isRemote ? "remote" : (location ?? "").toLowerCase().split(/[,/|]/)[0]!.trim();
  return `${normalizeCompany(company)}|${canonicalRole(title)}|${loc}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function normalizeJob(raw: RawJob): NormalizedJob {
  const text = `${raw.title}\n${raw.descriptionText}`;
  const salary = extractSalary(text);
  const visa = extractVisa(text);
  const remote = extractRemote(raw.locationRaw, raw.descriptionText, raw.workplaceType);

  const descriptionClean = raw.descriptionText.slice(0, 20000);
  const dedupeKey = `${raw.source}:${raw.company}:${raw.sourceJobId}`.toLowerCase();
  const canonicalKey = canonicalKeyFor(raw.company, raw.title, raw.locationRaw, remote.isRemote);
  const contentHash = sha1(`${raw.title}|${raw.company}|${raw.locationRaw ?? ""}|${descriptionClean}`);

  return {
    source: raw.source,
    sourceJobId: raw.sourceJobId,
    atsPlatform: raw.atsPlatform,
    title: raw.title,
    normalizedTitle: normalizeTitle(raw.title),
    company: raw.company,
    department: raw.department,
    location: raw.locationRaw,
    isRemote: remote.isRemote,
    remoteType: remote.remoteType,
    employmentType: extractEmploymentType(raw.title, raw.descriptionText, raw.commitment),
    seniority: extractSeniority(raw.title),
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    salaryPeriod: salary.period,
    salaryTextRaw: salary.raw,
    visaSponsored: visa.sponsored,
    sponsorshipNotes: visa.notes,
    skills: extractFromTaxonomy(text, SKILL_TAXONOMY),
    tools: extractFromTaxonomy(text, TOOLS_TAXONOMY),
    descriptionClean,
    jobUrl: raw.jobUrl,
    applyUrl: raw.applyUrl,
    postedAt: raw.postedAt,
    dedupeKey,
    canonicalKey,
    contentHash,
    acquisitionCostUsd: raw.acquisitionCostUsd ?? 0,
  };
}
