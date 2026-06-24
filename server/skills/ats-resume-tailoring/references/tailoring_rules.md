# Tailoring Rules (truthfulness, content, skills, ATS)

These rules govern WHAT goes into the tailored resume. Formatting is handled
separately by `../scripts/render_resume.py` (see `formatting_spec.md`).

## 1. Truthfulness (the line you never cross)
Never fabricate any of: employers, degrees, certifications, dates, job titles
unrelated to the originals, tools the candidate clearly doesn't know, domains
they didn't work in, or impossible/unsupported achievements. You may improve
wording, emphasize relevant work, reorganize content, and use reasonable
business-impact language — but always within the truth of the base resume.

**Named-tool hard rule:** a specific named tool/platform/library (e.g. AWS, BigQuery,
Kubernetes, LangGraph) may appear in the tailored resume ONLY if that exact name —
or an unambiguous equivalent the candidate clearly used — is present in the base
resume. If the JD demands a tool the base resume does not contain, do NOT add the
tool name; instead surface the closest TRUE capability the candidate has (rule 9),
or list the gap under `weak_or_missing`/`missing_keywords` in the analysis. Reaching
JD keyword coverage NEVER justifies inventing a tool the candidate doesn't have.

## 2. Do not change
- **Personal information** — name, phone, email, LinkedIn/GitHub/portfolio URLs,
  location, work authorization. Fix only obvious spacing/alignment/capitalization.
- **Education** — degree, university, graduation dates, GPA. Coursework may get
  *minor* keyword alignment only if the original meaning stays true.
- **Dates** — work, education, projects, certifications, internships. Verbatim.

## 3. Job titles — small optimizations only
Allowed (when the work supports it): Data Engineer → Analytics Engineer / BI
Engineer / ML Data Engineer; Data Analyst → BI Analyst; Business Analyst → Data/
Product Analyst. **Not allowed:** Data Engineer → Web Developer; Data Analyst →
Cybersecurity Engineer; BI Developer → ML Scientist (unless strongly supported).
Keep the revised title close to the original and backed by the experience.

## 4. Domain — never falsely changed
Retail analytics stays retail; finance reporting stays finance; business
dashboards don't become computer-vision deployment. You MAY adjust descriptions
of teams, stakeholders, workflows, business use cases, and tools, as long as it
stays realistic and aligned with the original resume.

## 5. Professional summary
3–4 lines, role-specific, recruiter-friendly. **Open with the exact target
role/title + years of experience** (e.g. "Generative AI Engineer with 5+ years…"),
matching the JD's title where the candidate's background supports it. Then position
the candidate as a direct fit: strongest relevant experience + the most important
JD tools/platforms/skills the candidate actually has. No generic filler
("hard-working", "motivated", "team player") unless backed by specific work.

## 6. Bullet points
Structure: **Action verb + work performed + tools/methods + business/technical
outcome.** Avoid weak bullets ("Worked on dashboards", "Responsible for ETL").
- Good: "Built automated Power BI dashboards using SQL and Python to track weekly
  product performance across retail stores, improving visibility into sales trends."
- Better (quantified): "Automated weekly sales reporting using SQL, Python, and
  Power BI, reducing manual reporting time by 40% and helping teams flag
  underperforming stores faster."

### Quantified vs non-quantified mix
Aim ~50–70% quantified, ~30–50% non-quantified (technical depth, collaboration,
ownership, business context). Quantifiable angles: time saved, manual effort
reduced, reporting speed, data volume, # dashboards, # stakeholders, revenue/cost/
operational impact, accuracy, SLA. **Never invent unrealistic numbers**; only add
conservative, believable metrics when reasonable from context.

## 7. Work experience tailoring
Per role: keep company, location, dates unchanged; title unchanged or slightly
optimized (rule 3). Rewrite bullets to emphasize the most relevant
responsibilities, weave JD keywords naturally, and match the role's business +
technical expectations. Each role should convey: what problem was solved, what
data/tools/systems were used, who benefited, what outcome was achieved. Keep
bullets use-case based, not just tool lists. 4–6 bullets for the most recent
role; 3–5 for older roles; prioritize recent + relevant.

## 8. Project tailoring
Modify existing projects to highlight job-relevant use cases — never invent fake
projects. Keep each project's **dates verbatim** and re-tailor its name/tools/
bullets toward the JD. Emphasis by role type:
- **Data Engineering** → ETL/ELT, data modeling, data-quality checks, cloud,
  orchestration, SQL/Python/PySpark, scalable workflows.
- **Analytics / BI** → dashboarding, KPI definition, stakeholder reporting,
  insights, recommendations, SQL analysis, visualization.
- **ML Data Engineer / MLOps** → model-support, feature pipelines, preprocessing,
  batch inference, cloud deployment, K8s/OpenShift (only if resume supports it),
  collaboration with data scientists.

## 9. Skills & tools
Target ~90% match to the JD's required tools. Use exact JD tool names where the
candidate has that tool or a true equivalent. Equivalents must be honest:
- JD wants BigQuery, resume has Snowflake/Redshift → include "cloud data
  warehousing"; do NOT claim BigQuery unless actually known.
- JD wants Power BI, resume has Tableau → include Tableau + BI dashboards; do NOT
  fabricate Power BI unless supported.
- JD wants PySpark, resume has Python + Spark exposure → include PySpark only if
  reasonably supported.
Organize into clean categories (Programming & Querying / Data Engineering / Cloud
& Databases / BI & Visualization / Analytics & Business Tools / ML & AI Tools (if
relevant) / Workflow & Collaboration). Prioritize job-relevant tools; do not dump
every tool.

## 10. ATS optimization (target ~90–95%, honestly)
- Use exact JD keywords naturally; include required tools in BOTH skills and
  experience bullets where truthful.
- Use standard section headings (see formatting_spec.md): PROFESSIONAL SUMMARY,
  TECHNICAL SKILLS, PROFESSIONAL EXPERIENCE, PROJECTS, EDUCATION, CERTIFICATIONS.
- Include both technical keywords and responsibility-based keywords.
- Avoid abbreviations unless the full form appears nearby. No keyword stuffing.
- The renderer guarantees ATS-safe structure (no tables/columns/icons/images/
  text boxes, no header/footer-critical info, simple bullets) — you only supply content.

## 11. Tense & voice
Present role → present tense; previous roles → past tense. No first person
("I/me/my"). No exaggeration.

## 12. Calibrate to the candidate (profile + preferences)
Tailoring depth must fit THIS candidate, not a generic template:
- **Seniority** — match the language to the candidate's real level implied by their
  years and scope (don't inflate a junior into a staff engineer, or flatten a
  senior into an entry profile).
- **User instructions/preferences** — when provided (target role, emphasis,
  tone, roles to foreground/background, relocation, etc.), treat them as binding
  constraints and shape ordering + emphasis accordingly, still within the truth.
- **Relevance ordering** — lead with the experience, skills, and projects closest
  to the JD; de-emphasize (don't delete) unrelated history. The most JD-relevant
  evidence should be visible in the top third of the resume.
