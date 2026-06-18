// Ingestion orchestrator — the in-process job-ingestion worker.
//
// Flow (base version):
//   load run (T3) -> load user profile/preferences (T1) -> resolve ATS boards
//   from target companies -> fetch raw jobs -> normalize -> filter/dedup ->
//   insert into job_candidates (T2) -> update run metrics + status (T3).
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { resolveBoards, fetchBoard, slugify, type RawJob, type BoardRef } from "./ats-sources.js";
import { normalizeJob, type NormalizedJob } from "./job-normalizer.js";

const MAX_JOBS_PER_RUN = 60;
const MAX_BOARDS_PER_RUN = 12;
const WORKER_NAME = "in-process-ingestion-worker";

type Prefs = {
  targetCompanies: string[];
  targetRoles: string[];
  blockedCompanies: string[];
  excludedKeywords: string[];
  preferredLocations: string[];
  remotePreference: string; // remote | hybrid | onsite | any
  jobsCap: number;
};

async function loadPrefs(userId: string): Promise<Prefs> {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const targetCompanies = ((prefs?.targetCompaniesJson as string[] | undefined) ?? []).filter(Boolean);
  const targetRoles = ((prefs?.targetRolesJson as string[] | undefined) ?? []).filter(Boolean);
  const blockedCompanies = ((prefs?.blockedCompaniesJson as string[] | undefined) ?? []).filter(Boolean);
  const preferredLocations = ((prefs?.locationsJson as string[] | undefined) ?? []).filter(Boolean);
  const remotePreference = prefs?.remotePreference ?? "any";
  // excludedKeywords lives inside atsPreferencesJson for now (no dedicated column).
  const atsPrefs = (prefs?.atsPreferencesJson as Record<string, unknown> | undefined) ?? {};
  const excludedKeywords = Array.isArray(atsPrefs["excludedKeywords"])
    ? (atsPrefs["excludedKeywords"] as string[])
    : [];
  const perDay = prefs?.applicationsPerDay ?? 10;
  const jobsCap = Math.min(MAX_JOBS_PER_RUN, Math.max(20, perDay * 5));
  return { targetCompanies, targetRoles, blockedCompanies, excludedKeywords, preferredLocations, remotePreference, jobsCap };
}

// Seniority / filler words dropped from a target role before matching — they
// shouldn't be REQUIRED (a "Senior AI Engineer" target should still match an
// "AI Engineer" posting). Everything else (ai, machine, engineer, scientist…) is
// a meaningful token that must be present.
const ROLE_FILLER = new Set(
  "senior junior staff lead principal head director sr jr i ii iii iv v of and or for the a an to in at on with".split(" ")
);

// Light stem so engineer/engineering/engineers, developer/developers, etc. all
// compare equal. (Strip common trailing inflections.)
function stem(w: string): string {
  return w.replace(/(ing|ers|er|s)$/, "");
}

function titleWords(title: string): Set<string> {
  return new Set(title.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean).map(stem));
}

// Each target role becomes a "spec": the set of meaningful (non-filler) stemmed
// tokens it requires. "AI Engineer" → {ai, engine}; "Machine Learning Engineer"
// → {machine, learn, engine}; "Gen AI Engineer" → {gen, ai, engine}.
function roleSpecs(roles: string[]): string[][] {
  const specs: string[][] = [];
  for (const r of roles) {
    const toks = r.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean)
      .filter((w) => w.length >= 2 && !ROLE_FILLER.has(w))
      .map(stem);
    if (toks.length) specs.push([...new Set(toks)]);
  }
  return specs;
}

// A job matches if its title contains ALL tokens of AT LEAST ONE target-role spec.
// This keeps "AI Engineer" matching "Backend Engineer, AI Security" but rejects
// "Account Executive, AI Sales" (has "ai" but not the "engineer" function). With
// no target roles set, no role filtering is applied.
function matchesRole(title: string, specs: string[][]): boolean {
  if (specs.length === 0) return true;
  const words = titleWords(title);
  return specs.some((spec) => spec.every((tok) => words.has(tok)));
}

function passesFilters(raw: RawJob, prefs: Prefs): boolean {
  const companySlug = slugify(raw.company);
  if (prefs.blockedCompanies.some((b) => slugify(b) === companySlug)) return false;
  if (prefs.excludedKeywords.length > 0) {
    const title = raw.title.toLowerCase();
    if (prefs.excludedKeywords.some((kw) => kw && title.includes(kw.toLowerCase()))) return false;
  }
  return true;
}

// ─── Location filtering ──────────────────────────────────────────────────────
// Heuristic geo-filter: ATS location strings are free-form, so we match the
// user's preferred locations (substring) plus a US-aware matcher for country
// preferences like "United States". Empty/unknown job locations are dropped when
// the user specified concrete places (we can't confirm they fit).
const US_STATE_CODES = new Set(
  "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(" ")
);

function isUSToken(p: string): boolean {
  const t = p.replace(/\./g, "").replace(/\s+/g, " ").trim();
  return ["united states", "united states of america", "usa", "us", "u s a", "u s", "america"].includes(t);
}

function looksUS(loc: string): boolean {
  if (/\b(united states(?: of america)?|u\.?s\.?a\.?|america)\b/.test(loc)) return true;
  if (/\bus\b/.test(loc) && /\bremote\b/.test(loc)) return true; // "US Remote", "Remote, US"
  const usPrefix = loc.match(/\bus[-\s]([a-z]{2})\b/); // "US-CA", "US NY"
  if (usPrefix && US_STATE_CODES.has(usPrefix[1])) return true;
  const comma = loc.match(/,\s*([a-z]{2})\b/); // "Seattle, WA"
  if (comma && US_STATE_CODES.has(comma[1])) return true;
  return false;
}

function matchesLocation(norm: NormalizedJob, prefs: Prefs): boolean {
  const locs = prefs.preferredLocations.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const wantsRemote = prefs.remotePreference === "remote" || locs.includes("remote");
  const places = locs.filter((l) => l !== "remote");
  const L = (norm.location ?? "").toLowerCase();

  // No geographic constraint at all → keep everything.
  if (places.length === 0 && (prefs.remotePreference === "any" || prefs.remotePreference === "")) return true;

  // A remote job satisfies a remote preference.
  if (wantsRemote && (norm.remoteType === "remote" || /\bremote\b/.test(L))) return true;

  if (places.length === 0) {
    // Only a work-mode preference, no specific places.
    if (prefs.remotePreference === "remote") return false; // wanted remote; this isn't
    return true; // hybrid/onsite with no place list → don't geo-filter
  }

  for (const p of places) {
    if (isUSToken(p)) {
      if (looksUS(L)) return true;
    } else if (L && L.includes(p)) {
      return true;
    }
  }
  return false;
}

async function fetchAll(boards: BoardRef[]): Promise<RawJob[]> {
  const limited = boards.slice(0, MAX_BOARDS_PER_RUN);
  const results = await Promise.allSettled(limited.map((b) => fetchBoard(b)));
  const jobs: RawJob[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
  }
  return jobs;
}

/**
 * Execute an ingestion run end-to-end. Updates the T3 run row as it progresses
 * and never throws — failures are recorded on the run as status=FAILED.
 */
export async function runIngestion(runId: string): Promise<void> {
  const run = await prisma.applicationRun.findUnique({ where: { id: runId } });
  if (!run) {
    logger.error({ runId }, "Ingestion run not found");
    return;
  }
  const userId = run.userId;

  try {
    const prefs = await loadPrefs(userId);
    const boards = resolveBoards(prefs.targetCompanies);

    await prisma.applicationRun.update({
      where: { id: runId },
      data: {
        status: "DISCOVERING_JOBS",
        startedAt: run.startedAt ?? new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requestedSourcesJson: boards.map((b) => `${b.ats}:${b.token}`) as any,
      },
    });

    logger.info({ runId, userId, boards: boards.length }, "Ingestion: discovering jobs");
    const rawJobs = await fetchAll(boards);

    await prisma.applicationRun.update({
      where: { id: runId },
      data: { status: "PARSING_JOBS", jobsDiscovered: rawJobs.length },
    });

    // Filter, normalize, and dedup within this batch.
    const specs = roleSpecs(prefs.targetRoles);
    const seen = new Set<string>();
    const rows: ReturnType<typeof toJobRow>[] = [];
    let locationFiltered = 0;
    let roleFiltered = 0;
    for (const raw of rawJobs) {
      if (!passesFilters(raw, prefs)) continue;
      // Role gate: drop postings whose title doesn't match a target role. This is
      // deterministic (independent of the match-scoring model) so off-target roles
      // (e.g. "AML Lead" or "AI Sales" when the user wants "AI Engineer") never get ingested.
      if (!matchesRole(raw.title, specs)) { roleFiltered++; continue; }
      const norm = normalizeJob(raw);
      if (!matchesLocation(norm, prefs)) { locationFiltered++; continue; }
      if (seen.has(norm.dedupeKey)) continue;
      seen.add(norm.dedupeKey);
      rows.push(toJobRow(userId, runId, norm));
      if (rows.length >= prefs.jobsCap) break;
    }
    logger.info(
      { runId, roleFiltered, locationFiltered, kept: rows.length,
        prefs: { roles: prefs.targetRoles, locations: prefs.preferredLocations, remote: prefs.remotePreference } },
      "Ingestion: role + location filtering applied"
    );

    // Insert into T2. skipDuplicates respects @@unique([userId, dedupeKey]) so
    // re-runs don't create duplicate candidate rows for the same user.
    const insertResult =
      rows.length > 0
        ? await prisma.job.createMany({ data: rows, skipDuplicates: true })
        : { count: 0 };

    const inserted = insertResult.count;
    const duplicates = rows.length - inserted;

    await prisma.applicationRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        jobsInserted: inserted,
        duplicatesSkipped: duplicates,
        completedAt: new Date(),
      },
    });

    logger.info(
      { runId, userId, found: rawJobs.length, inserted, duplicates },
      "Ingestion completed"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ runId, userId, err: msg }, "Ingestion failed");
    await prisma.applicationRun
      .update({
        where: { id: runId },
        data: { status: "FAILED", errorMessage: msg, completedAt: new Date() },
      })
      .catch(() => {});
  }
}

function toJobRow(userId: string, runId: string, n: ReturnType<typeof normalizeJob>) {
  return {
    userId,
    runId,
    sourceName: n.source,
    sourceJobId: n.sourceJobId,
    atsPlatform: n.atsPlatform,
    title: n.title,
    normalizedTitle: n.normalizedTitle,
    company: n.company,
    department: n.department,
    location: n.location,
    isRemote: n.isRemote,
    remoteType: n.remoteType,
    employmentType: n.employmentType,
    seniority: n.seniority,
    salaryMin: n.salaryMin,
    salaryMax: n.salaryMax,
    salaryCurrency: n.salaryCurrency,
    salaryPeriod: n.salaryPeriod,
    salaryTextRaw: n.salaryTextRaw,
    visaSponsored: n.visaSponsored,
    sponsorshipNotes: n.sponsorshipNotes,
    workAuthorization: n.sponsorshipNotes,
    description: n.descriptionClean.slice(0, 2000),
    descriptionClean: n.descriptionClean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skillsJson: n.skills as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolsJson: n.tools as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embeddingJson: n.embedding as any,
    jobUrl: n.jobUrl,
    applyUrl: n.applyUrl,
    postedAt: n.postedAt ? new Date(n.postedAt) : null,
    dedupeKey: n.dedupeKey,
    contentHash: n.contentHash,
    postingStatus: "active",
    ingestedAt: new Date(),
  };
}

/**
 * Create a new ingestion run (T3) in CREATED state. Callers then call
 * triggerIngestion(run.id) to start the worker.
 */
export async function createIngestionRun(
  userId: string,
  triggerType: "payment_activated" | "manual_test" | "scheduled" | "retry"
) {
  return prisma.applicationRun.create({
    data: { userId, status: "CREATED", triggerType },
  });
}

/**
 * Fire-and-forget trigger for the worker. Returns immediately; the run row is
 * updated asynchronously as ingestion progresses.
 */
export function triggerIngestion(runId: string): void {
  void runIngestion(runId).catch((err) => {
    logger.error({ runId, err: String(err), worker: WORKER_NAME }, "Unhandled ingestion error");
  });
}
