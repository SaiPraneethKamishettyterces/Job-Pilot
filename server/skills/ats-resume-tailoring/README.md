# ats-resume-tailoring (Claude Skill)

A reusable Claude Skill that tailors a base resume to a job description with
strict ATS optimization, truthfulness guarantees, and **identical formatting
every time**. It is the single source of truth for resume tailoring — both
Claude (interactively) and the job-application engine route through it.

## Layout
```
ats-resume-tailoring/
├── SKILL.md                         # entry point: workflow, hard rules, output contract
├── references/
│   ├── tailoring_rules.md           # truthfulness, content, skills, ATS rules
│   ├── formatting_spec.md           # exact page/font/spacing/heading spec
│   ├── analysis_and_output.md       # JD + resume analysis, QA checklist, output format
│   └── resume_content_schema.json   # structured content the skill emits
├── scripts/
│   └── render_resume.py             # deterministic DOCX/PDF/MD/TXT renderer
└── README.md
```

## How it works
The skill splits **content** from **formatting**:
1. The model analyzes the JD + base resume and emits the tailored resume as
   **structured JSON** (`{ "resume": ..., "analysis": ... }`) following every
   truthfulness/ATS/content rule.
2. `scripts/render_resume.py` turns that JSON into a file with the exact
   typography (Calibri, 16pt name, 0.5in margins, bold ALL-CAPS headings with
   bottom borders, the spacing rules, no tables/columns/icons). This is what
   guarantees byte-identical layout on every run.

## Usage

### 1. As a Claude Code / Agent skill
Place (or symlink) this folder under `.claude/skills/` so Claude discovers it,
then ask Claude to tailor a resume — it will follow `SKILL.md`, emit the JSON,
and run `render_resume.py`. For the Anthropic **Skills API** (Managed Agents),
upload this folder as a skill and reference it by id.

### 2. Renderer directly (any structured content JSON)
```bash
python scripts/render_resume.py --content content.json --format docx --out tailored_resume
# formats: docx | pdf | markdown | text
```

### 3. Programmatically via the job engine (the enforced chokepoint)
The engine never tailors resumes ad hoc. `resume/resume_tailor.py::ResumeTailor.tailor`
loads this skill's instructions (`llm/skill_loader.py`) as its system prompt and
renders with `render_resume.py`. Standalone CLI:
```bash
python main.py tailor \
  --base-resume base_resume.txt \
  --job-description jd.txt \
  --target-role "Data Engineer" \
  --output-format docx \
  --out ./tailored_resumes/sai_de
```
Requires `ANTHROPIC_API_KEY` for real tailoring; without it the engine produces
a consistently-formatted but explicitly **un-tailored** passthrough (and says so
in the analysis).

## Truthfulness
The skill never fabricates employers, degrees, certifications, dates, unrelated
job titles, unknown tools, false domains, or impossible achievements. The engine
additionally force-applies verified personal info (name/email/phone/links) after
generation, so personal details can't be altered even if a model tried.
