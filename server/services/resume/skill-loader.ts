import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Loads the ATS resume-tailoring skill so the pipeline routes through it. This is
// the enforcement mechanism (ported from Job_applying_agent/llm/skill_loader.py):
// the engine has NO resume prompt of its own — it loads SKILL.md + reference files
// and uses that text as the system prompt for every tailoring call. Update the
// skill, and tailoring behaviour updates with it. One source of truth.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the skill dir robustly: next to the compiled/source file
// (server/services/resume -> server/skills) with a CWD fallback, so it works
// under tsx (dev), node dist/ (prod, assets copied by `copy:assets`), and tests.
function resolveSkillDir(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "skills", "ats-resume-tailoring"),
    path.resolve(process.cwd(), "server", "skills", "ats-resume-tailoring"),
    path.resolve(process.cwd(), "dist", "server", "skills", "ats-resume-tailoring"),
  ];
  return candidates.find((c) => existsSync(path.join(c, "SKILL.md"))) ?? candidates[0]!;
}

const SKILL_DIR = resolveSkillDir();
const SKILL_MD = path.join(SKILL_DIR, "SKILL.md");
const REFERENCES = path.join(SKILL_DIR, "references");

// Order in which the skill files are concatenated into the system prompt.
const REFERENCE_FILES = [
  "tailoring_rules.md",
  "formatting_spec.md",
  "analysis_and_output.md",
  "resume_content_schema.json",
];

let cachedPrompt: string | null = null;

function read(p: string): string {
  if (!existsSync(p)) throw new Error(`Skill file missing: ${p}`);
  return readFileSync(p, "utf-8");
}

/** True if the skill instruction files are present. */
export function skillAvailable(): boolean {
  return existsSync(SKILL_MD) && existsSync(path.join(REFERENCES, "resume_content_schema.json"));
}

/** Assemble the full skill instruction set into one system prompt (cached). */
export function loadSkillSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  const parts: string[] = [
    "You are operating as the ATS Resume Tailoring skill. Follow these " +
      "instructions exactly. All resume tailoring MUST obey them.\n",
    "===== SKILL.md =====\n" + read(SKILL_MD),
  ];
  for (const name of REFERENCE_FILES) {
    parts.push(`===== references/${name} =====\n` + read(path.join(REFERENCES, name)));
  }
  parts.push(
    "\n===== OUTPUT CONTRACT =====\n" +
      "Return ONLY a single JSON object with exactly two top-level keys, " +
      '"resume" and "analysis". The "resume" object must match ' +
      "resume_content_schema.json. Do not include code fences, prose, or any " +
      "text outside the JSON.",
  );
  cachedPrompt = parts.join("\n\n");
  return cachedPrompt;
}
