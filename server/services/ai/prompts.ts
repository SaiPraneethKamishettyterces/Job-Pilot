// Central registry for every Claude prompt in the app. Keeping prompts here
// (instead of inline at call sites) makes them reviewable, diffable, and
// versionable in one place.

export interface CoverLetterProfile {
  name: string;
  skills: string[];
  experience: string;
  targetRole?: string;
}

export const coverLetterSystem = (tone: string) =>
  `You are an expert job-application coach. Write compelling, honest, ${tone} application materials.
Always personalise content to the candidate's actual background — never fabricate experience.
Output only the requested text, no meta-commentary.`;

export const coverLetterUser = (jobDescription: string, p: CoverLetterProfile) =>
  `Job description:
${jobDescription}

Candidate profile:
Name: ${p.name}
Skills: ${p.skills.join(", ")}
Experience: ${p.experience}
${p.targetRole ? `Target role: ${p.targetRole}` : ""}

Write a tailored cover letter paragraph (3-4 sentences) that highlights the strongest match between this candidate and the role.`;

export const RESUME_PARSE_PROMPT = `You are a resume parser. Extract structured information from the resume text below.

Return ONLY valid JSON matching this exact schema:
{
  "name": string,
  "email": string,
  "phone": string,
  "location": string,
  "linkedin": string,
  "github": string,
  "summary": string,
  "skills": string[],
  "experience": [{ "company": string, "title": string, "startDate": string, "endDate": string, "isCurrent": boolean, "description": string }],
  "education": [{ "institution": string, "degree": string, "field": string, "startYear": number, "endYear": number }],
  "projects": [{ "name": string, "description": string, "url": string, "technologies": string[] }],
  "certifications": string[]
}

IMPORTANT: Only extract information that is explicitly stated. Do not invent skills, dates, companies, or degrees.

Resume text:`;

export const JOB_PARSE_PROMPT = `You are a job description parser. Extract structured information from the job posting below.

Return ONLY valid JSON (no markdown fences, no explanation) matching this schema:
{
  "title": string,
  "company": string,
  "location": string | null,
  "isRemote": boolean,
  "salaryMin": number | null,
  "salaryMax": number | null,
  "salaryCurrency": string | null,
  "description": string,
  "requirements": string[],
  "skills": string[],
  "experienceMin": number | null,
  "experienceMax": number | null,
  "atsPlatform": string | null,
  "workAuthorization": string | null
}

Rules:
- "skills": technical/soft skills explicitly stated, max 20 items
- "requirements": must-have qualifications, max 10 items, each ≤ 100 chars
- "experienceMin/Max": years of experience if stated (null if not)
- "atsPlatform": Greenhouse/Lever/Workday/Ashby/Taleo etc if detectable
- "description": first 500 chars of the role description
- "salaryCurrency": USD/GBP/EUR/CAD etc if mentioned
- Only extract explicitly stated info. Do not invent.

Job Posting:`;

// ─── Open-ended application question answering ───────────────────────────────
// Ported from Job_applying_agent/llm/prompts.py. The model drafts FREE-TEXT
// answers to generic questions only ("Why this role?"). It is never asked to
// assert facts about the candidate (work authorization, degrees, demographics) —
// those come only from structured profile data. If it can't answer honestly from
// the given facts it must reply with exactly: NEEDS_USER_ACTION.
export const QUESTION_SYSTEM = [
  "You are an expert application coach drafting short, honest, professional answers",
  "to open-ended job-application questions on behalf of a candidate.",
  "",
  "Best-practice rules — follow ALL of them:",
  "1. Write in the first person as the applicant; natural, confident, not boastful.",
  "2. Be specific: tie the answer to concrete facts from the candidate profile",
  "   (real roles, skills, achievements) and to THIS job/company from the JD.",
  "3. Concise: 2-4 sentences. No clichés, no filler, no buzzword salad.",
  "4. Lead with the most relevant point; show fit between the candidate and the role.",
  "5. Use ONLY the facts provided. NEVER invent employers, titles, dates, degrees,",
  "   numbers, or credentials. Do not exaggerate.",
  "6. If the question needs information that isn't in the profile/JD, or asks for a",
  "   personal opinion/value you can't ground in the facts, reply with exactly:",
  "   NEEDS_USER_ACTION (nothing else).",
  "7. Output only the answer text (or NEEDS_USER_ACTION) — no preamble or quotes.",
].join("\n");

export function buildQuestionPrompt(args: {
  question: string;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
  profileSummary: string;
}): string {
  let desc = (args.jobDescription ?? "").trim();
  if (desc.length > 2000) desc = desc.slice(0, 2000) + " ...";
  return [
    `JOB TITLE: ${args.jobTitle ?? "N/A"}`,
    `COMPANY: ${args.company ?? "N/A"}`,
    `JOB DESCRIPTION:\n${desc || "N/A"}`,
    "",
    `CANDIDATE PROFILE:\n${args.profileSummary}`,
    "",
    `QUESTION: ${args.question}`,
    "",
    "Answer (first person, 2-4 sentences), or NEEDS_USER_ACTION:",
  ].join("\n");
}

// ─── Resume tailoring (skill chokepoint) ─────────────────────────────────────
// NOTE: the SYSTEM prompt for tailoring is NOT defined here — it is loaded from
// the `ats-resume-tailoring` skill (server/skills/) by skill-loader.ts so there
// is one source of truth. This is only the user-prompt builder.
export function buildTailorUserPrompt(args: {
  baseResumeText: string;
  jobDescription: string;
  userInstructions?: string | null;
  targetRole?: string | null;
}): string {
  return (
    `TARGET ROLE/TITLE: ${args.targetRole || "(infer from job description)"}\n\n` +
    `USER INSTRUCTIONS: ${args.userInstructions || "(none)"}\n\n` +
    "===== JOB DESCRIPTION =====\n" +
    `${args.jobDescription.trim() || "(none provided)"}\n\n` +
    "===== BASE RESUME =====\n" +
    `${args.baseResumeText.trim()}\n\n` +
    "Tailor the base resume to the job description following every skill rule, " +
    "and return the single JSON object specified in the output contract " +
    "(keys: resume, analysis)."
  );
}

// ─── Cold outreach email ─────────────────────────────────────────────────────
export const COLD_EMAIL_SYSTEM =
  "You are an expert job-application coach writing a short, honest cold outreach " +
  "email from a candidate to a hiring manager or recruiter. Be specific, warm, and " +
  "concise (max ~120 words). Personalise to the candidate's real background — never " +
  "fabricate experience. Output only the email body (no subject line, no meta-commentary).";

export function buildColdEmailPrompt(args: {
  jobTitle: string;
  company: string;
  jobDescription?: string | null;
  profileSummary: string;
}): string {
  let desc = (args.jobDescription ?? "").trim();
  if (desc.length > 1500) desc = desc.slice(0, 1500) + " ...";
  return [
    `ROLE: ${args.jobTitle} at ${args.company}`,
    `JOB DESCRIPTION:\n${desc || "N/A"}`,
    "",
    `CANDIDATE PROFILE:\n${args.profileSummary}`,
    "",
    "Write the cold outreach email body now.",
  ].join("\n");
}

export const SCORE_PROMPT = `You are a job-fit evaluator. Score how well a candidate matches a job posting.

Return ONLY valid JSON (no markdown, no explanation):
{
  "score": number (0-100),
  "decision": "SHORTLIST" | "REVIEW" | "SKIP",
  "reasons": string[] (max 4 strengths),
  "risks": string[] (max 3 concerns or gaps)
}

Decision thresholds (threshold = candidate's matchThreshold setting):
- SHORTLIST: score >= threshold AND strong skill alignment
- REVIEW: score >= threshold - 15, moderate alignment
- SKIP: score < threshold - 15, OR blocked company, OR hard disqualification

Scoring guidance:
- Skill overlap (40%): how many required skills does the candidate have? Use the
  candidate's detailed experience, projects, and certifications — not just the
  skills list — as evidence of a skill.
- Experience (25%): do the years AND the actual roles/achievements fit the job?
- Location/remote (15%): does remote preference and location align?
- Role fit (10%): is the role in their target roles / career trajectory?
- Work auth + salary (10%): hard requirements met?

Base the score on the full candidate context provided (summary, experience
entries, projects, education), not only the skills line.
Be realistic. Most strong applications score 65-85. Reserve 90+ for near-perfect.`;
