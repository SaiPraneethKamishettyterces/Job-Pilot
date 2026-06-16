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
- Skill overlap (40%): how many required skills does the candidate have?
- Experience (25%): does years of experience fit the range?
- Location/remote (15%): does remote preference and location align?
- Role fit (10%): is the role in their target roles?
- Work auth + salary (10%): hard requirements met?

Be realistic. Most strong applications score 65-85. Reserve 90+ for near-perfect.`;
