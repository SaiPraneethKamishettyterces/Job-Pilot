import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { notFound } from "../../lib/errors.js";
import { loadCandidateProfile } from "../profile/candidate-profile.js";
import { tailorResume, contactFromProfile } from "../resume/tailor-service.js";
import { analysisReportMarkdown } from "../resume/resume-renderer.js";
import { buildApplicationPackage } from "./application-package.js";
import { generateCoverLetter, generateColdEmail } from "./outreach.js";
import { detectPlatform } from "../automation/platform-detector.js";

// Generate every AI document for one application — the GENERATING_DOCUMENTS step.
// Ties together resume tailoring, cover letter, cold email, and the autofill
// package, persists them to ApplicationDocument + the Application's summary
// fields, and computes the next lifecycle status from the user's approval mode.
//
// Safety model preserved from the Python engine: nothing is auto-submitted here;
// the pipeline only PREPARES. Submission happens later via the automation route
// (gated by AUTO_SUBMIT) or the user's own browser/extension.

type ApprovalMode = "AUTO_APPLY" | "ASSISTED_APPLY" | "ALWAYS_REVIEW" | "DRAFT_ONLY";
type AppStatus =
  | "GENERATED" | "NEEDS_APPROVAL" | "APPROVED" | "ASSISTED_REQUIRED" | "DRAFT_ONLY";

export interface GenerateResult {
  applicationId: string;
  status: AppStatus;
  usedAi: boolean;
  warnings: string[];
  documentTypes: string[];
}

/** Decide the post-generation status from approval mode + readiness signals. */
function nextStatus(mode: ApprovalMode, autoFillable: boolean): AppStatus {
  switch (mode) {
    case "DRAFT_ONLY":
      return "DRAFT_ONLY";
    case "ALWAYS_REVIEW":
      return "NEEDS_APPROVAL";
    case "ASSISTED_APPLY":
      return "ASSISTED_REQUIRED";
    case "AUTO_APPLY":
      // Auto-apply only when we can actually drive the form; otherwise the user
      // must assist (unsupported ATS, custom uploader, etc.).
      return autoFillable ? "APPROVED" : "ASSISTED_REQUIRED";
    default:
      return "NEEDS_APPROVAL";
  }
}

export async function generateApplicationDocuments(applicationId: string): Promise<GenerateResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true },
  });
  if (!application) throw notFound("Application not found");

  const userId = application.userId;
  const profile = await loadCandidateProfile(userId);
  if (!profile) throw notFound("User profile not found");

  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const approvalMode = (prefs?.approvalMode as ApprovalMode | undefined) ?? "ALWAYS_REVIEW";

  const job = application.job;
  const jobDescription = job?.descriptionClean || job?.description || "";
  const applyUrl = application.jobUrl ?? job?.applyUrl ?? job?.jobUrl ?? null;
  const company = application.company;
  const roleTitle = application.roleTitle;
  const platform = detectPlatform(applyUrl);

  const warnings: string[] = [];
  const documentTypes: string[] = [];
  let usedAi = false;
  const genCtx = { userId, runId: application.runId, applicationId };

  // 1) Tailor the resume (skill chokepoint). Non-fatal if it fails.
  let resumeRef: { storageKey: string | null; downloadUrl: string | null; filename: string | null } | null = null;
  if (profile.baseResumeText?.trim()) {
    try {
      const tailored = await tailorResume({
        baseResumeText: profile.baseResumeText,
        jobDescription,
        targetRole: roleTitle,
        userInstructions: profile.coverLetterTemplate ?? null,
        contactOverrides: contactFromProfile(profile),
        storageJobKey: ["applications", userId, applicationId].join("/"),
        ...genCtx,
      });
      if (tailored) {
        usedAi = usedAi || tailored.usedAi;
        resumeRef = {
          storageKey: tailored.artifact.key,
          downloadUrl: tailored.artifact.downloadPath,
          filename: "tailored_resume.docx",
        };
        await prisma.applicationDocument.create({
          data: {
            applicationId,
            type: "resume",
            // fileUrl stays the DOCX (autofill/extension upload it). PDF is the
            // human-friendly download surfaced in the UI alongside it.
            fileUrl: tailored.artifact.downloadPath,
            content: tailored.markdown,
            metadataJson: {
              analysis: tailored.analysis,
              report: analysisReportMarkdown(tailored.analysis),
              files: {
                docxUrl: tailored.artifact.downloadPath,
                pdfUrl: tailored.pdfArtifact.downloadPath,
              },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          },
        });
        documentTypes.push("resume");
        await prisma.application.update({
          where: { id: applicationId },
          data: { tailoredResumeUrl: tailored.artifact.downloadPath },
        });
      }
    } catch (err) {
      logger.warn({ applicationId, err: String(err) }, "resume_tailor_failed");
      warnings.push("Resume tailoring failed; user must attach a resume.");
    }
  } else {
    warnings.push("No base resume text on file; user must upload/attach a resume.");
  }

  // 2) Cover letter (text).
  try {
    const cover = await generateCoverLetter(jobDescription, profile, genCtx);
    if (cover) {
      usedAi = true;
      await prisma.applicationDocument.create({
        data: { applicationId, type: "cover_letter", content: cover },
      });
      await prisma.application.update({ where: { id: applicationId }, data: { coverLetterUrl: null } });
      documentTypes.push("cover_letter");
    }
  } catch (err) {
    logger.warn({ applicationId, err: String(err) }, "cover_letter_failed");
  }

  // 3) Cold outreach email (text on the application).
  try {
    const email = await generateColdEmail(roleTitle, company, jobDescription, profile, genCtx);
    if (email) {
      usedAi = true;
      await prisma.application.update({ where: { id: applicationId }, data: { coldEmailText: email } });
      await prisma.applicationDocument.create({ data: { applicationId, type: "cold_email", content: email } });
      documentTypes.push("cold_email");
    }
  } catch (err) {
    logger.warn({ applicationId, err: String(err) }, "cold_email_failed");
  }

  // 4) Autofill package (the extension/automation contract).
  const pkg = buildApplicationPackage({
    jobId: application.jobId ?? applicationId,
    applyUrl,
    profile,
    resume: resumeRef,
  });
  warnings.push(...pkg.warnings);
  await prisma.applicationDocument.create({
    data: { applicationId, type: "application_package", content: JSON.stringify(pkg) },
  });
  documentTypes.push("application_package");

  // 5) Compute status and finalize.
  const autoFillable = platform !== "unsupported" && Boolean(resumeRef?.storageKey);
  const status = nextStatus(approvalMode, autoFillable);
  await prisma.application.update({
    where: { id: applicationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { status: status as any, applyMode: approvalMode as any, atsPlatform: platform },
  });
  await prisma.applicationEvent.create({
    data: {
      applicationId,
      type: "documents_generated",
      description: `Generated ${documentTypes.join(", ")} (${usedAi ? "AI" : "fallback"})`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: { warnings, platform, status } as any,
    },
  });

  logger.info({ applicationId, status, documentTypes, usedAi }, "application_documents_generated");
  return { applicationId, status, usedAi, warnings, documentTypes };
}
