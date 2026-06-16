# Formatting Spec (implemented by ../scripts/render_resume.py)

This is the single source of truth for resume typography. The renderer enforces
it so output is identical every run. The model supplies content only; it must NOT
hand-format DOCX/PDF.

## Page setup
- Size: **US Letter** (8.5in × 11in). Orientation: portrait.
- Margins: **0.5in** on all four sides.
- Length: ideally **1 page** for <5 years' experience; **max 2 pages**.
- **No** tables, images, icons, text boxes, columns, colored backgrounds, or
  decorative elements. No critical info in headers/footers.

## Font
- Default **Calibri** (override only on explicit user request).
- ATS-safe alternatives: Arial, Aptos, Times New Roman.
- Never below 9.5pt.

## Font sizes
| Element | Size | Weight |
|---|---|---|
| Candidate name | 16pt | bold |
| Contact line | 9.5pt | normal |
| Section headings | 11pt | bold, ALL CAPS |
| Job titles | 10.5pt | bold |
| Company names | 10.5pt | bold |
| Dates & locations | 10pt | normal |
| Bullet points | 10pt | normal |
| Skills text | 10pt | normal |
| Education text | 10pt | normal |

## Line spacing
- Single line spacing throughout.
- Before section heading: **6pt**. After section heading: **2pt**.
- Between roles: **4pt**. Between bullets: **0pt**. After a bullet group: **3pt**.
- No excessive blank lines. Compact, clean, readable.

## Section headings
ALL CAPS, bold, 11pt, left-aligned, **followed by a thin horizontal rule**. In
DOCX this is a paragraph **bottom border** (not a row of dashes/decorative chars).
Standard headings, in order:
```
PROFESSIONAL SUMMARY
TECHNICAL SKILLS
PROFESSIONAL EXPERIENCE
PROJECTS
EDUCATION
CERTIFICATIONS   (only if present)
```

## Contact header
Centered, two lines, no icons, no "Phone:"/"Email:" labels (unless already in the
base resume), plain readable links:
```
Candidate Name
City, State | Phone | Email | LinkedIn | GitHub/Portfolio
```

## Experience block
```
Job Title | Company Name          (10.5pt bold)
Location | Dates                  (10pt)
• bullet ...                       (10pt)
```
- 4–6 bullets (recent role), 3–5 (older). Each starts with a strong action verb.
- Bullet length 1–2 lines. Modern style: **no terminal periods on bullets**
  (unless the base resume consistently uses them — keep one consistent choice).

## Project block
```
Project Name | Tools Used
• bullet ...
```
- 2–4 bullets, job-relevant, keywords woven in, showing role + technical work +
  outcome. Not faked as enterprise experience unless truly professional.

## Skills block
Clean categories, one per line, `Category: item, item, item`:
```
Programming & Querying: SQL, Python, PySpark
Data Engineering: ETL/ELT, Data Modeling, Data Validation, Pipelines
Cloud & Databases: BigQuery, Snowflake, Redshift, PostgreSQL
BI & Visualization: Power BI, Tableau, Looker
Tools & Workflow: Git, Jira, Agile, Stakeholder Reporting
```
Keep categories job-relevant and compact; do not include every possible tool.
