# Analysis & Output Requirements

## Job-description analysis (do this first)
Extract and hold in mind:
- **Target role title** and **role type** — one of: Data Engineer, Data Analyst,
  BI Engineer, Analytics Engineer, Business Analyst, ML Data Engineer, MLOps
  Engineer, Product Analyst, Operations Analyst, Other.
- Required technical skills; preferred technical skills.
- Business/domain skills; tools & platforms.
- Years-of-experience expectation; seniority level.
- Core responsibilities; repeated keywords.
- Soft-skill / collaboration expectations.

Use the role type to decide tailoring emphasis (see `tailoring_rules.md` §8).

## Base-resume analysis
Extract: personal info; current + previous titles; companies; locations; dates;
education; projects; certifications; tools; technical skills; domains; business
use cases; existing quantified achievements; experience level; strongest and
weakest job-match areas. **Do not drop real content** unless clearly irrelevant,
repetitive, outdated, or harmful to the target job.

## Output object
Emit one JSON object (see `resume_content_schema.json` for the `resume` shape):
```json
{
  "resume": { "...": "see resume_content_schema.json" },
  "analysis": {
    "role_type": "Data Engineer",
    "ats_match_estimate": { "percent": 92, "reasoning": "why this number" },
    "strongest_matches": ["..."],
    "weak_or_missing": ["..."],
    "matched_keywords": ["..."],
    "missing_keywords": ["..."],
    "changes_made": ["..."],
    "recommendations": ["..."]
  }
}
```
The **ATS match estimate must be realistic and explained** — never an unexplained
95%. Base it on keyword coverage, tool overlap, responsibility alignment, and any
true gaps.

## Quality checklist (verify before returning)
- [ ] Personal info unchanged.
- [ ] Education unchanged.
- [ ] Dates unchanged.
- [ ] Job titles not falsely changed.
- [ ] Domain not falsely changed.
- [ ] Professional summary tailored to the job.
- [ ] Skills section matches the JD (~90%).
- [ ] Bullets are strong, use-case based, ATS-friendly.
- [ ] Natural mix of quantified / non-quantified bullets.
- [ ] Formatting consistent (renderer-enforced).
- [ ] Readable, not overcrowded; no tables/columns/icons/images.
- [ ] Keywords included naturally (no stuffing).
- [ ] Everything truthful and recruiter-friendly.
- [ ] ATS match estimate supported by reasoning.

## Final response structure (to the user)
1. **Tailored Resume** — rendered file path + a Markdown preview.
2. **ATS Match Estimate** — % with reasoning.
3. **Strongest Matches**.
4. **Weak or Missing Areas**.
5. **Changes Made**.
6. **Recommendations**.
