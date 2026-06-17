import { describe, it, expect } from "vitest";
import { answerQuestion } from "./qa-generator.js";
import type { CandidateProfile } from "../profile/candidate-profile.js";

// Ported from Job_applying_agent/tests/test_question_answerer.py. These run with
// no ANTHROPIC_API_KEY, so the AI branch is inert and generic questions escalate.

function profile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    userId: "u1", firstName: "Sai", lastName: "Nithin", fullName: "Sai Nithin",
    email: "sai@example.com", phone: "+1 555 123 4567", location: "Austin, TX",
    city: "Austin", state: "TX", country: "United States",
    availabilityToStart: "Immediately", howHeard: "LinkedIn",
    linkedinUrl: "https://linkedin.com/in/sai", githubUrl: null, portfolioUrl: null, websiteUrl: null,
    currentCompany: "Acme", currentTitle: "Data Engineer", yearsOfExperience: 5,
    highestDegree: null, schoolName: null, major: null, graduationYear: null,
    workAuthorization: "US Citizen", requiresSponsorship: null, visaStatus: null,
    willingToRelocate: null, desiredSalary: null, noticePeriod: null,
    summary: null, skills: ["python", "sql"], education: [], experience: [], projects: [],
    certifications: [], baseResumeText: null, coverLetterTemplate: null,
    customAnswers: {}, ...overrides,
  } as CandidateProfile;
}

const ctx = { userId: "u1" };

describe("answerQuestion", () => {
  it("returns an exact custom answer with full confidence", async () => {
    const p = profile({ customAnswers: { "Why do you want this role?": "Because I love building data platforms." } });
    const r = await answerQuestion("Why do you want this role?", p, ctx);
    expect(r.source).toBe("custom_answers");
    expect(r.answer).toContain("data platforms");
    expect(r.needsUserAction).toBe(false);
  });

  it("maps common questions to profile fields", async () => {
    const p = profile();
    expect((await answerQuestion("What is your email?", p, ctx)).answer).toBe("sai@example.com");
    expect((await answerQuestion("Your LinkedIn profile", p, ctx)).answer).toBe("https://linkedin.com/in/sai");
    expect((await answerQuestion("Current company", p, ctx)).answer).toBe("Acme");
  });

  it("escalates sensitive questions with no stored answer", async () => {
    const p = profile();
    const r = await answerQuestion("Do you now or in the future require visa sponsorship?", p, ctx);
    expect(r.needsUserAction).toBe(true);
    expect(r.isSensitive).toBe(true);
    expect(r.answer).toBeNull();
  });

  it("answers a sensitive question when grounded in the profile", async () => {
    const p = profile({ requiresSponsorship: false });
    const r = await answerQuestion("Will you require sponsorship?", p, ctx);
    expect(r.answer).toBe("No");
  });

  it("escalates generic open-ended questions when AI is unavailable", async () => {
    const p = profile();
    const r = await answerQuestion("Tell us about yourself", p, ctx);
    expect(r.needsUserAction).toBe(true);
  });

  it("flags empty questions", async () => {
    const r = await answerQuestion("   ", profile(), ctx);
    expect(r.needsUserAction).toBe(true);
    expect(r.reason).toBe("empty question");
  });
});

describe("answerQuestion — expanded grounded coverage", () => {
  it("answers availability / start date", async () => {
    expect((await answerQuestion("When can you start?", profile(), ctx)).answer).toBe("Immediately");
  });
  it("answers 'how did you hear about us'", async () => {
    expect((await answerQuestion("How did you hear about this role?", profile(), ctx)).answer).toBe("LinkedIn");
  });
  it("answers city and country", async () => {
    expect((await answerQuestion("City", profile(), ctx)).answer).toBe("Austin");
    expect((await answerQuestion("Country", profile(), ctx)).answer).toBe("United States");
  });
  it("answers a grounded sponsorship question yes/no", async () => {
    const r = await answerQuestion("Do you require sponsorship now or in the future?", profile({ requiresSponsorship: false }), ctx);
    expect(r.answer).toBe("No");
    expect(r.isSensitive).toBe(true);
  });
});
