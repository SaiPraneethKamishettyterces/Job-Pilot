// Keyword/requirement coverage scoring for tailored resumes (Issue #77, AC#5).
//
// Pure, deterministic, model-free. Given a job description we extract the
// "important" terms (skills, tools, multi-word tech phrases, meaningful nouns)
// and measure what fraction of them appear in a resume's text. Comparing the
// base resume's coverage against the tailored resume's coverage gives an
// objective, repeatable signal that tailoring improved JD/keyword alignment —
// the same metric the eval harness and tests assert on.

import { toText } from "./resume-renderer.js";
import type { ResumeContent } from "./resume-content.js";

// Multi-word tech phrases must be matched before single-token splitting, else
// "machine learning" becomes two noise tokens.
const PHRASES = [
  "machine learning", "deep learning", "data engineering", "data analysis",
  "data modeling", "data science", "power bi", "ci/cd", "rest api", "restful api",
  "object oriented", "version control", "unit testing", "test automation",
  "natural language processing", "computer vision", "distributed systems",
  "cloud computing", "continuous integration", "continuous deployment",
  "agile", "scrum", "kanban",
];

// Common English + resume/JD boilerplate stopwords — excluded from keyword sets
// so coverage reflects substantive terms, not filler like "the" or "responsible".
const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "our", "will", "have", "has",
  "this", "that", "they", "from", "their", "who", "what", "when", "where", "which",
  "into", "out", "all", "any", "can", "may", "able", "must", "should", "would",
  "work", "working", "role", "team", "teams", "job", "ability", "experience",
  "experiences", "years", "year", "strong", "skills", "skill", "knowledge",
  "responsibilities", "responsible", "requirements", "required", "preferred",
  "plus", "etc", "including", "include", "includes", "such", "across", "within",
  "well", "also", "new", "using", "use", "used", "help", "build", "building",
  "develop", "development", "design", "designing", "looking", "join", "candidate",
  "candidates", "company", "companies", "position", "positions", "opportunity",
  "environment", "business", "world", "high", "great", "good", "best", "more",
  "most", "other", "others", "than", "then", "but", "not", "per", "via", "about",
  "need", "needs", "needed", "looking", "want", "wants", "seeking", "own", "owns",
]);

const TOKEN_RE = /[a-z0-9][a-z0-9+#./-]*/g;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Extract the substantive keyword set from free text (a JD or a resume).
 * Returns lowercased unique terms: known multi-word phrases plus single tokens
 * (length ≥ 3, non-stopword, not purely numeric).
 */
export function extractKeywords(text: string): Set<string> {
  const norm = normalize(text);
  const found = new Set<string>();

  let stripped = norm;
  for (const phrase of PHRASES) {
    if (norm.includes(phrase)) {
      found.add(phrase);
      // Remove so its words aren't also counted as single tokens.
      stripped = stripped.split(phrase).join(" ");
    }
  }

  for (const m of stripped.matchAll(TOKEN_RE)) {
    // Trim trailing punctuation the char class allows mid-token (so "snowflake."
    // → "snowflake") while keeping internal separators ("ci/cd", "node.js").
    const tok = m[0].replace(/[.\-/]+$/, "");
    if (tok.length < 3) continue;
    if (STOPWORDS.has(tok)) continue;
    if (/^\d+$/.test(tok)) continue;
    found.add(tok);
  }
  return found;
}

export interface CoverageResult {
  /** 0–1 fraction of JD keywords present in the resume. */
  score: number;
  covered: string[];
  missing: string[];
  /** Total distinct JD keywords considered. */
  total: number;
}

/** Coverage of a JD's keywords by an arbitrary resume text. */
export function keywordCoverage(resumeText: string, jobDescription: string): CoverageResult {
  const jdKeywords = extractKeywords(jobDescription);
  const resumeKeywords = extractKeywords(resumeText);
  const covered: string[] = [];
  const missing: string[] = [];
  for (const kw of jdKeywords) {
    // A resume "covers" a JD phrase if the phrase (or, for multi-word phrases,
    // the raw substring) appears in the resume's keyword set / text.
    if (resumeKeywords.has(kw) || (kw.includes(" ") && normalize(resumeText).includes(kw))) {
      covered.push(kw);
    } else {
      missing.push(kw);
    }
  }
  const total = jdKeywords.size;
  return {
    score: total === 0 ? 0 : covered.length / total,
    covered: covered.sort(),
    missing: missing.sort(),
    total,
  };
}

/** Convenience: coverage of structured resume content (renders to text first). */
export function coverageOfContent(content: ResumeContent, jobDescription: string): CoverageResult {
  return keywordCoverage(toText(content), jobDescription);
}

export interface CoverageComparison {
  base: CoverageResult;
  tailored: CoverageResult;
  /** tailored.score − base.score (positive = tailoring improved coverage). */
  uplift: number;
  /** Keywords the tailored resume covers that the base did not. */
  gained: string[];
}

/** Compare base-resume coverage to tailored-resume coverage for one (resume, JD). */
export function compareCoverage(
  baseResumeText: string,
  tailoredText: string,
  jobDescription: string,
): CoverageComparison {
  const base = keywordCoverage(baseResumeText, jobDescription);
  const tailored = keywordCoverage(tailoredText, jobDescription);
  const baseCovered = new Set(base.covered);
  return {
    base,
    tailored,
    uplift: tailored.score - base.score,
    gained: tailored.covered.filter((k) => !baseCovered.has(k)),
  };
}
