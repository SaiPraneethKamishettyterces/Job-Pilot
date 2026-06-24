// Shared "apply from a job URL" logic, used by:
//   - POST /api/applications/from-url   (paste-a-link guided flow)
//   - POST /api/applications/resolve-by-url (extension auto-detect from open tab)
// Composes existing pieces: fetchUrlText + parseJobDescription, jobRepository,
// detectAdapter, buildApplicationPackage. No new external behavior.
import { prisma } from "../../lib/db.js";
import { badRequest } from "../../lib/errors.js";
import { jobRepository } from "../../repositories/job-repository.js";
import { fetchUrlText, parseJobDescription } from "../job-discovery/job-parser.js";
import { detectAdapter, type PlatformAdapterMeta } from "../../../shared/autofill/adapter.js";
import { loadCandidateProfile } from "../profile/candidate-profile.js";
import { buildApplicationPackage, type ApplicationPackage } from "./application-package.js";

/** Canonicalize a URL for matching: drop protocol, www, query, hash, trailing slash. */
export function normalizeUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  try {
    const u = new URL(s);
    s = u.host.replace(/^www\./, "") + u.pathname;
  } catch {
    s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[?#]/)[0]!;
  }
  return s.replace(/\/+$/, "");
}

export interface ParsedJobData {
  title: string;
  company: string;
  location: string | null;
  isRemote: boolean | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  skills: string[];
  requirements: string[];
  atsPlatform: string | null;
}

export interface CreatedFromUrl {
  applicationId: string;
  jobData: ParsedJobData;
  adapter: PlatformAdapterMeta;
}

/**
 * Fetch + parse a job posting URL and create a Job + Application for the user.
 * Throws friendly badRequest on fetch/parse failure. Does NOT generate documents
 * (that's a separate step) — but the autofill package can be built on demand via
 * ensurePackage().
 */
export async function parseAndCreateApplication(userId: string, url: string): Promise<CreatedFromUrl> {
  const adapter = detectAdapter(url);

  let jobData;
  try {
    const text = await fetchUrlText(url);
    jobData = await parseJobDescription(text, url);
  } catch {
    throw badRequest("We couldn't read that link. Open the public job posting URL (the page with the Apply button) and try again.");
  }
  if (!jobData?.title || !jobData?.company) {
    throw badRequest("That page didn't look like a job posting. Use the direct posting URL.");
  }

  // Same parsed→Job mapping as POST /api/jobs. No JobMatch/scoring — user chose this job.
  const job = await jobRepository.createJob({
    jobUrl: jobData.jobUrl ?? url,
    title: jobData.title,
    company: jobData.company,
    location: jobData.location,
    isRemote: jobData.isRemote,
    salaryMin: jobData.salaryMin,
    salaryMax: jobData.salaryMax,
    salaryCurrency: jobData.salaryCurrency,
    description: jobData.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requirementsJson: jobData.requirements as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skillsJson: jobData.skills as any,
    experienceMin: jobData.experienceMin,
    experienceMax: jobData.experienceMax,
    atsPlatform: jobData.atsPlatform,
    workAuthorization: jobData.workAuthorization,
  });

  const application = await prisma.application.create({
    data: {
      userId,
      jobId: job.id,
      company: jobData.company,
      roleTitle: jobData.title,
      jobUrl: jobData.jobUrl ?? url,
      status: "DISCOVERED" as never,
    },
  });
  await prisma.applicationEvent.create({
    data: { applicationId: application.id, type: "created_from_link", description: `Created from link (${adapter.vendorLabel})` },
  });

  return {
    applicationId: application.id,
    adapter,
    jobData: {
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      isRemote: jobData.isRemote,
      salaryMin: jobData.salaryMin,
      salaryMax: jobData.salaryMax,
      salaryCurrency: jobData.salaryCurrency,
      skills: jobData.skills ?? [],
      requirements: jobData.requirements ?? [],
      atsPlatform: jobData.atsPlatform,
    },
  };
}

/**
 * Find the user's existing application matching a job URL (normalized). Prefers a
 * match that already has a generated autofill package. Returns the id or null.
 */
export async function findApplicationByUrl(userId: string, url: string): Promise<string | null> {
  const target = normalizeUrl(url);
  if (!target) return null;
  const apps = await prisma.application.findMany({
    where: { userId, status: { not: "ARCHIVED" as never } },
    include: { job: { select: { jobUrl: true, applyUrl: true } }, documents: { where: { type: "application_package" }, select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  let firstMatch: string | null = null;
  for (const a of apps) {
    const urls = [a.jobUrl, a.job?.jobUrl, a.job?.applyUrl].map(normalizeUrl);
    if (urls.includes(target)) {
      if (a.documents.length) return a.id; // prefer one with a package already
      if (!firstMatch) firstMatch = a.id;
    }
  }
  return firstMatch;
}

/**
 * Return the application's autofill package, building it on the fly from the
 * profile + field maps if no package document exists yet (fast, no LLM). The rich
 * package (with tailored resume) is produced by document generation elsewhere.
 */
export async function ensurePackage(applicationId: string, userId: string): Promise<ApplicationPackage> {
  const doc = await prisma.applicationDocument.findFirst({
    where: { applicationId, type: "application_package" },
    orderBy: { createdAt: "desc" },
  });
  if (doc?.content) {
    try {
      return JSON.parse(doc.content) as ApplicationPackage;
    } catch {
      /* fall through and rebuild */
    }
  }
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { job: true } });
  if (!app) throw badRequest("Application not found");
  const profile = await loadCandidateProfile(userId);
  if (!profile) throw badRequest("Complete your profile before autofilling.");
  const pkg = buildApplicationPackage({
    jobId: app.jobId ?? "",
    applyUrl: app.jobUrl ?? app.job?.applyUrl ?? app.job?.jobUrl ?? null,
    profile,
    resume: null, // tailored resume comes from doc generation; manual attach otherwise
  });
  // Persist so subsequent fills/answers reuse it.
  await prisma.applicationDocument
    .create({ data: { applicationId, type: "application_package", content: JSON.stringify(pkg) } })
    .catch(() => {});
  return pkg;
}
