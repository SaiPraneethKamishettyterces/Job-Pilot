import { describe, it, expect } from "vitest";
import { buildApplicationPackage } from "./application-package.js";
import type { CandidateProfile } from "../profile/candidate-profile.js";

// Ported from Job_applying_agent/tests/test_application_packager.py.
function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    userId: "u1", firstName: "Sai", lastName: "Nithin", fullName: "Sai Nithin",
    email: "sai@example.com", phone: "+1 555 123 4567", location: "Austin, TX",
    linkedinUrl: "https://linkedin.com/in/sai", githubUrl: null, portfolioUrl: null, websiteUrl: null,
    currentCompany: "Acme", currentTitle: "Data Engineer", yearsOfExperience: 5,
    highestDegree: null, schoolName: null, major: null, graduationYear: null,
    workAuthorization: null, requiresSponsorship: null, visaStatus: null,
    willingToRelocate: null, desiredSalary: null, noticePeriod: null,
    summary: null, skills: [], education: [], experience: [], projects: [],
    certifications: [], baseResumeText: null, coverLetterTemplate: null,
    customAnswers: {}, ...overrides,
  };
}

describe("buildApplicationPackage", () => {
  it("builds greenhouse standard fields with selectors", () => {
    const pkg = buildApplicationPackage({
      jobId: "job1",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
      profile: profile(),
      resume: { storageKey: "applications/u1/job1/r.docx", downloadUrl: "/api/files/applications/u1/job1/r.docx", filename: "r.docx" },
    });
    expect(pkg.platform).toBe("greenhouse");
    const first = pkg.standardFields.find((f) => f.key === "first_name");
    expect(first?.value).toBe("Sai");
    expect(first?.selectors).toContain("#first_name");
    // CAPTCHA note surfaced for greenhouse.
    expect(pkg.warnings.some((w) => w.toLowerCase().includes("recaptcha"))).toBe(true);
  });

  it("warns about missing required fields", () => {
    const pkg = buildApplicationPackage({
      jobId: "job1",
      applyUrl: "https://jobs.lever.co/acme/1",
      profile: profile({ email: null }),
      resume: { storageKey: "k", downloadUrl: "/x", filename: "r.docx" },
    });
    expect(pkg.platform).toBe("lever");
    expect(pkg.warnings.some((w) => w.includes("Missing required") && w.includes("Email"))).toBe(true);
  });

  it("warns when no resume was produced", () => {
    const pkg = buildApplicationPackage({
      jobId: "job1", applyUrl: "https://boards.greenhouse.io/acme/1", profile: profile(), resume: null,
    });
    expect(pkg.warnings.some((w) => w.includes("No tailored resume"))).toBe(true);
  });

  it("excludes demographics from the profile subset", () => {
    const pkg = buildApplicationPackage({
      jobId: "j", applyUrl: "https://boards.greenhouse.io/a/1", profile: profile(), resume: null,
    });
    expect(pkg.profile).not.toHaveProperty("gender");
    expect(pkg.profile).toHaveProperty("email");
  });
});
