import { completeText, hasProvider, hasCompat, compatEmbed } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import { QUESTION_SYSTEM, buildQuestionPrompt } from "../ai/prompts.js";
import { recordUsage } from "../ai/usage-recorder.js";
import { logger } from "../../lib/logger.js";
import { bestSemanticMatch, type StoredVec } from "./semantic-match.js";
import { effectiveFullName, profileSummary, type CandidateProfile } from "../profile/candidate-profile.js";
import { config } from "../../lib/config.js";

// Answer an application question from structured data first, AI only as a last
// resort, and refuse to answer sensitive questions we can't ground in data.
// Ported from Job_applying_agent/llm/question_answerer.py.
//
// Resolution order:
//   1. Exact match in customAnswers.
//   2. Fuzzy match in customAnswers.
//   3. Direct mapping to a profile field.
//   4. AI generation — only for generic open-ended questions.
//   5. Otherwise needsUserAction.
//
// Sensitive/legal/compliance/demographic questions are never sent to the AI; if
// the answer isn't explicitly present we flag needsUserAction so a human decides.
// confidence < 0.75 also flags needsUserAction.

export const CONFIDENCE_THRESHOLD = 0.75;
// Cosine-similarity floor for reusing a stored answer on a re-worded question.
export const SEMANTIC_THRESHOLD = 0.8;

export interface AnswerResult {
  answer: string | null;
  confidence: number;
  source: "custom_answers" | "user_profile" | "ai" | "generated" | "none";
  needsUserAction: boolean;
  reason: string;
  isSensitive: boolean;
}

const SENSITIVE_PATTERNS =
  /(sponsor|sponsorship|visa|work authoriz|authorized to work|right to work|citizen|citizenship|immigration|felon|convict|criminal|background check|gender|sex\b|race|ethnic|hispanic|latino|veteran|military|disab|salary|compensation|desired pay|expected pay|date of birth|birth date|age\b|ssn|social security|security clearance|clearance)/i;

const GENERIC_PATTERNS =
  /(why (are|do) you|why this|why our|why do you want|describe your|tell us|tell me|what makes you|what interests|interested in|good fit|cover letter|motivat|about yourself|your experience)/i;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
}

// Character-level similarity ratio (approximates difflib.SequenceMatcher.ratio
// via normalized Levenshtein distance). Used for fuzzy custom-answer matching.
function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  const dist = dp[m]![n]!;
  return 1 - dist / Math.max(m, n);
}

function yn(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

function fromCustomAnswers(question: string, p: CandidateProfile): AnswerResult | null {
  const answers = p.customAnswers ?? {};
  const entries = Object.entries(answers);
  if (!entries.length) return null;

  const normQ = normalize(question);
  const normalized = entries.map(([k, v]) => ({ key: normalize(k), value: v }));

  const exact = normalized.find((e) => e.key === normQ);
  if (exact) {
    return mk(exact.value, 1.0, "custom_answers", "exact custom-answer match", false);
  }

  let best: { value: string; ratio: number } | null = null;
  for (const e of normalized) {
    const ratio = similarity(normQ, e.key);
    if (ratio >= 0.82 && (!best || ratio > best.ratio)) best = { value: e.value, ratio };
  }
  if (best) {
    return mk(best.value, Math.round(best.ratio * 100) / 100, "custom_answers", "fuzzy custom-answer match", false);
  }
  return null;
}

// Semantic match: when the same question is asked in different words, reuse the
// user's stored answer via embeddings (the fuzzy step only catches near-identical
// wording). Gated on the embeddings provider; silently skips if unavailable.
async function fromSemantic(question: string, p: CandidateProfile): Promise<AnswerResult | null> {
  if (!hasCompat()) return null;
  const entries = Object.entries(p.customAnswers ?? {});
  if (!entries.length) return null;
  try {
    const inputs = [question, ...entries.map(([k]) => k)];
    const vecs = await compatEmbed(inputs);
    if (vecs.length !== inputs.length) return null;
    const qVec = vecs[0]!;
    const stored: StoredVec[] = entries.map(([k, v], i) => ({ question: k, answer: v, vec: vecs[i + 1]! }));
    const best = bestSemanticMatch(qVec, stored);
    if (best && best.score >= SEMANTIC_THRESHOLD) {
      return mk(best.answer, Math.round(best.score * 100) / 100, "custom_answers", "semantic custom-answer match", false);
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "semantic question match failed");
  }
  return null;
}

function fromProfile(question: string, p: CandidateProfile): AnswerResult | null {
  const q = question.toLowerCase();
  const mapping: Array<[RegExp, string | null]> = [
    [/preferred name|nickname|what.*go by/, p.preferredName],
    [/full name|legal name|your name/, effectiveFullName(p)],
    [/first name/, p.firstName],
    [/last name|surname|family name/, p.lastName],
    [/e-?mail/, p.email],
    [/phone|mobile|contact number/, p.phone],
    [/linkedin/, p.linkedinUrl],
    [/github/, p.githubUrl],
    [/portfolio/, p.portfolioUrl],
    [/website|personal site/, p.websiteUrl],
    [/current (company|employer)|present employer|current.*employer/, p.currentCompany],
    [/current title|current role|job title|current position/, p.currentTitle],
    [/years.*experience|experience.*years/, p.yearsOfExperience != null ? String(p.yearsOfExperience) : null],
    [/degree|education level/, p.highestDegree],
    [/school|university|college/, p.schoolName],
    [/major|field of study/, p.major],
    [/graduat/, p.graduationYear],
    [/notice period|notice|how soon.*resign/, p.noticePeriod],
    [/(available|availability|start date|when can you start|earliest start)/, p.availabilityToStart],
    [/work authoriz|authorized to work|right to work/, p.workAuthorization],
    [/visa status/, p.visaStatus],
    [/(require|need).*sponsor|sponsor.*(require|need|now or in the future)|sponsor/, yn(p.requiresSponsorship)],
    [/desired salary|salary expect|expected (salary|compensation)|compensation expect/, p.desiredSalary],
    [/relocat|willing to move/, yn(p.willingToRelocate)],
    [/how did you hear|hear about (us|this|the)|referral source/, p.howHeard ?? p.referralSource],
    [/who referred|referr(ed|al) (by|name)|referrer/, p.referralName],
    [/address line ?1|street address|^address|mailing address/, p.addressLine1],
    [/address line ?2|apt|suite|unit/, p.addressLine2],
    [/city|town/, p.city ?? p.location],
    [/state|province|region/, p.state],
    [/zip|postal code/, p.zipCode],
    [/country/, p.country],
    [/location|where.*located|based/, p.location],
  ];
  for (const [pattern, value] of mapping) {
    if (pattern.test(q)) {
      if (value) return mk(String(value), 0.9, "user_profile", `matched profile field for ${pattern}`, false);
      // Pattern matched but value missing → let caller decide.
      return mk(null, 0.0, "user_profile", `profile field for ${pattern} is empty`, false);
    }
  }
  return null;
}

// Binary "Have you ever been employed by / worked at <company>?" questions are
// answerable from the candidate's actual work history: "Yes" only if the named
// employer is among their past/current employers, otherwise "No". Never guess
// affirmatively (claiming a job they didn't hold is a false statement).
function fromEmploymentHistory(question: string, p: CandidateProfile): AnswerResult | null {
  const q = question.toLowerCase();
  if (!/\b(have|did|were|are|do)\s+you\b/.test(q)) return null;
  if (!/(employed (by|at|with)|work(ed)?\s+(at|for)|been employed|affiliate|employee of)/.test(q)) return null;

  const employers: string[] = [];
  if (p.currentCompany) employers.push(p.currentCompany);
  for (const e of p.experience) {
    const c = e["company"] ?? e["employer"] ?? e["organization"];
    if (typeof c === "string" && c.trim()) employers.push(c);
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const mentioned = employers.some((e) => {
    const n = norm(e);
    return n.length > 2 && q.includes(n);
  });
  return mk(mentioned ? "Yes" : "No", 0.9, "user_profile", "derived from employment history", false);
}

function mk(
  answer: string | null,
  confidence: number,
  source: AnswerResult["source"],
  reason: string,
  isSensitive: boolean,
): AnswerResult {
  return { answer, confidence, source, reason, isSensitive, needsUserAction: false };
}

function finalize(result: AnswerResult): AnswerResult {
  // Threshold is env-configurable (config.qa.confidenceThreshold). Prod default
  // 0.75 surfaces AI drafts for review; testing lowers it so drafts auto-fill.
  if (!result.answer) {
    result.needsUserAction = true;
    if (!result.reason) result.reason = "no answer produced";
  } else if (result.confidence < config.qa.confidenceThreshold) {
    result.needsUserAction = true;
    result.reason = result.reason || "low confidence";
  }
  return result;
}

export interface AnswerContext {
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
  userId: string;
  runId?: string | null;
  applicationId?: string | null;
}

/** Answer a single application question. */
export async function answerQuestion(
  questionText: string,
  profile: CandidateProfile,
  ctx: AnswerContext,
): Promise<AnswerResult> {
  const question = questionText.trim();
  if (!question) {
    return { answer: null, confidence: 0, source: "none", needsUserAction: true, reason: "empty question", isSensitive: false };
  }

  // 1 + 2: custom answers (exact, then fuzzy).
  const custom = fromCustomAnswers(question, profile);
  if (custom) return finalize(custom);

  // 2b: semantic match — same question, different wording → reuse stored answer.
  const semantic = await fromSemantic(question, profile);
  if (semantic) return finalize(semantic);

  const isSensitive = SENSITIVE_PATTERNS.test(question);

  // 3: direct profile-field mapping.
  const fromProf = fromProfile(question, profile);
  if (fromProf && fromProf.answer) return finalize({ ...fromProf, isSensitive });

  // 3b: employment-history yes/no, derived from the candidate's actual employers.
  const emp = fromEmploymentHistory(question, profile);
  if (emp) return finalize({ ...emp, isSensitive });

  // Sensitive question with no grounded answer → human in the loop.
  if (isSensitive) {
    return {
      answer: null, confidence: 0, source: "none", needsUserAction: true, isSensitive: true,
      reason: "sensitive/legal/compliance question with no stored answer",
    };
  }

  // 4: AI for generic open-ended questions (or ALL non-sensitive open questions
  // when config.qa.answerAll is on, e.g. during testing). The model analyses the JD
  // (what the employer wants) against the résumé (what the candidate did) and writes
  // a grounded answer. If it punts with NEEDS_USER_ACTION on a question we DO have
  // résumé grounding for, retry once with a firmer instruction (weak local models
  // over-trigger the refusal); only then surface to the user.
  if ((config.qa.answerAll || GENERIC_PATTERNS.test(question)) && hasProvider(TASK_MODEL.questionAnswer.provider)) {
    const hasResume = Boolean(profile.baseResumeText && profile.baseResumeText.trim().length > 50);
    const basePrompt = buildQuestionPrompt({
      question,
      jobTitle: ctx.jobTitle ?? null,
      company: ctx.company ?? null,
      jobDescription: ctx.jobDescription ?? null,
      profileSummary: profileSummary(profile),
      resumeText: profile.baseResumeText,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const content = attempt === 0
        ? basePrompt
        : basePrompt +
          "\n\nThe résumé above DOES contain relevant material. Do NOT reply NEEDS_USER_ACTION — " +
          "give your best specific, honest answer grounded in the most relevant résumé experience.";
      try {
        const { text, usage } = await completeText({
          ...TASK_MODEL.questionAnswer,
          maxTokens: 300,
          system: QUESTION_SYSTEM,
          messages: [{ role: "user", content }],
        });
        await recordUsage({
          userId: ctx.userId, runId: ctx.runId ?? null, applicationId: ctx.applicationId ?? null,
          featureName: "question_answering", usage,
        });
        const answer = text.trim();
        if (answer && !answer.toUpperCase().startsWith("NEEDS_USER_ACTION")) {
          // AI free-text answers are inherently uncertain; cap confidence below the
          // gate so they always surface for review.
          return finalize(mk(answer, 0.7, "generated", "AI-drafted answer grounded in JD + résumé", false));
        }
        // Refused: retry only if there's résumé grounding worth a firmer second try.
        if (!hasResume || attempt === 1) {
          return { answer: null, confidence: 0, source: "ai", needsUserAction: true, isSensitive: false,
            reason: "model could not answer from available data" };
        }
      } catch (err) {
        logger.warn({ err: String(err) }, "question answering LLM call failed");
        break;
      }
    }
  }

  // 5: give up safely.
  return { answer: null, confidence: 0, source: "none", needsUserAction: true, isSensitive,
    reason: "no confident answer available" };
}

/** Answer a batch of questions, returning one result per question. */
export async function answerQuestions(
  questions: string[],
  profile: CandidateProfile,
  ctx: AnswerContext,
): Promise<Array<{ question: string; result: AnswerResult }>> {
  const out: Array<{ question: string; result: AnswerResult }> = [];
  for (const q of questions) {
    out.push({ question: q, result: await answerQuestion(q, profile, ctx) });
  }
  return out;
}
