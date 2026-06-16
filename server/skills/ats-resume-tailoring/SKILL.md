---
name: ats-resume-tailoring
description: >-
  Tailor a base resume to a specific job description with strict ATS
  optimization, truthfulness guarantees, and identical formatting every time.
  Use this skill WHENEVER a resume must be tailored, customized, optimized, or
  rewritten for a job posting / target role, or when producing an ATS-friendly
  DOCX, PDF, Markdown, or plain-text resume. All resume tailoring must route
  through this skill — never tailor a resume ad hoc.
---

# ATS Resume Tailoring

Tailor a base resume to a target job description so the result is **ATS-optimized,
job-matched, truthful, and formatted identically every time**.

This skill separates two concerns:
1. **Content** — you (the model) produce the tailored resume as *structured data*
   following the rules below. You never emit final typography as free text.
2. **Formatting** — the bundled `scripts/render_resume.py` turns that structured
   data into a DOCX/PDF/Markdown/plain-text file applying the exact formatting
   spec. This is what guarantees byte-identical layout on every run.

## Inputs
- **Base resume** (required) — the candidate's real resume text.
- **Job description** (required).
- **User instructions** (optional) — extra preferences/constraints.
- **Target role/title** (optional).
- **Output format** (optional) — `docx` (default), `pdf`, `markdown`, or `text`.

## Workflow (always in this order)
1. **Analyze the job description** → role type, required vs preferred skills,
   tools/platforms, domain, seniority, core responsibilities, repeated keywords,
   collaboration expectations. See `references/analysis_and_output.md`.
2. **Analyze the base resume** → personal info, titles, companies, locations,
   dates, education, projects, certifications, tools, domains, quantified
   achievements, strongest/weakest match areas. Lose no real content.
3. **Identify match gaps** between resume and JD.
4. **Rewrite only the allowed sections** per `references/tailoring_rules.md`.
5. **Emit structured content** matching `references/resume_content_schema.json`.
6. **Render** via `scripts/render_resume.py` to the requested format.
7. **Return** the final resume plus the analysis report (section 13 format in
   `references/analysis_and_output.md`).

## Hard rules (NON-NEGOTIABLE — see `references/tailoring_rules.md` for detail)
- **Never fabricate** employers, degrees, certifications, dates, unrelated job
  titles, tools the candidate doesn't know, domains they didn't work in, or
  impossible achievements.
- **Do not change** personal info, education, or dates (fix spacing/capitalization only).
- **Do not rewrite job titles into unrelated roles.** Small, supported optimizations
  only (e.g. Data Engineer → Analytics Engineer); never Data Engineer → Web Developer.
- **Do not change the business domain** of past roles (retail analytics stays retail).
- Improve **wording, emphasis, ordering, and keyword alignment** within the truth.
- If a metric isn't in the base resume, only add a **conservative, believable** one
  when clearly supported by context — otherwise leave the bullet non-quantified.

## Output contract
Produce a single JSON object with two top-level keys, then render the `resume` part:

```json
{ "resume": { ...matches references/resume_content_schema.json... },
  "analysis": { "ats_match_estimate": {"percent": 0, "reasoning": ""},
                "role_type": "", "strongest_matches": [], "weak_or_missing": [],
                "matched_keywords": [], "missing_keywords": [],
                "changes_made": [], "recommendations": [] } }
```

Render the resume deterministically (do not hand-format DOCX/PDF):

```bash
python scripts/render_resume.py --content content.json --format docx --out tailored_resume
```

The renderer enforces every formatting rule (Calibri, 16pt name, 0.5in margins,
bold ALL-CAPS headings with bottom borders, the spacing rules, no tables/columns/
icons). See `references/formatting_spec.md` for the full spec it implements.

## Reference files (read as needed)
- `references/tailoring_rules.md` — truthfulness, content improvement, skills, ATS.
- `references/formatting_spec.md` — exact page/font/spacing/heading/layout spec.
- `references/analysis_and_output.md` — JD + resume analysis, output structure, QA checklist.
- `references/resume_content_schema.json` — the structured content shape to emit.

## Final response format (always)
1. **Tailored Resume** (the rendered file path, plus a Markdown preview).
2. **ATS Match Estimate** (a realistic % with reasoning — never an unexplained 95%).
3. **Strongest Matches**.
4. **Weak or Missing Areas**.
5. **Changes Made**.
6. **Recommendations**.
