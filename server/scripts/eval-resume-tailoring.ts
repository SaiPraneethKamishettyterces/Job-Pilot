// Resume-tailoring quality eval (Issue #77, AC#5).
//
// For each (base resume, JD) fixture: run the real tailoring path
// (`tailorResumeContent`) and measure keyword/requirement coverage of the
// tailored output vs the base resume. Reports per-fixture and average uplift and
// EXITS NON-ZERO if tailoring does not measurably improve coverage — so it can
// gate CI / a release once a real model (Claude or local) is configured.
//
// Run:  npx tsx server/scripts/eval-resume-tailoring.ts
// Uses whatever provider TASK_MODEL.tailorResume points at (Claude or local
// compat). With no provider key it still runs via the deterministic fallback,
// which surfaces JD skills — useful as a smoke test, flagged in the output.

import { tailorResumeContent } from "../services/resume/tailor-service.js";
import { compareCoverage } from "../services/resume/coverage.js";
import { toText } from "../services/resume/resume-renderer.js";
import { hasProvider } from "../services/ai/ai-service.js";
import { TASK_MODEL } from "../services/ai/model-config.js";
import { RESUME_JD_PAIRS } from "../services/resume/__fixtures__/resume-jd-pairs.js";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const task = TASK_MODEL.tailorResume;
  const live = hasProvider(task.provider);
  console.log(`\nResume-tailoring quality eval — ${RESUME_JD_PAIRS.length} fixtures`);
  console.log(`Provider: ${task.provider}/${task.model} — ${live ? "LIVE model" : "NO key → deterministic fallback (smoke only)"}\n`);

  let upliftSum = 0;
  let aiCount = 0;
  const rows: Array<[string, string, string, string, string]> = [];

  for (const pair of RESUME_JD_PAIRS) {
    const { resume, usedAi } = await tailorResumeContent({
      baseResumeText: pair.baseResumeText,
      jobDescription: pair.jobDescription,
      targetRole: pair.targetRole,
      userId: "eval",
    });
    if (usedAi) aiCount++;
    const cmp = compareCoverage(pair.baseResumeText, toText(resume), pair.jobDescription);
    upliftSum += cmp.uplift;
    rows.push([
      pair.id,
      pct(cmp.base.score),
      pct(cmp.tailored.score),
      (cmp.uplift >= 0 ? "+" : "") + pct(cmp.uplift),
      cmp.gained.slice(0, 6).join(", ") || "(none)",
    ]);
  }

  console.log(["fixture", "base", "tailored", "uplift", "keywords gained"].join("\t"));
  console.log("-".repeat(80));
  for (const r of rows) console.log(r.join("\t"));

  const avg = upliftSum / RESUME_JD_PAIRS.length;
  console.log("-".repeat(80));
  console.log(`AI-tailored: ${aiCount}/${RESUME_JD_PAIRS.length}   Average coverage uplift: ${(avg >= 0 ? "+" : "") + pct(avg)}\n`);

  if (avg <= 0) {
    console.error("FAIL: tailoring did not improve average keyword coverage.");
    process.exit(1);
  }
  console.log("PASS: tailoring improves average keyword coverage.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
