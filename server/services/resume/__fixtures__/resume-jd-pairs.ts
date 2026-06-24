// Sample (base resume, job description) pairs for resume-tailoring quality eval
// and tests (Issue #77, AC#5/#6). Realistic but synthetic — no real PII. Each
// JD intentionally names skills/tools the base resume under-emphasizes so a good
// tailoring run measurably lifts keyword coverage.

export interface ResumeJdPair {
  id: string;
  targetRole: string;
  baseResumeText: string;
  jobDescription: string;
  /** Skills/tools that are genuinely in the base resume (so tailoring may surface
   *  them) — used by the no-fabrication test to assert nothing outside this set
   *  (plus profile data) is invented. */
  groundTruthSkills: string[];
}

export const RESUME_JD_PAIRS: ResumeJdPair[] = [
  {
    id: "data-engineer",
    targetRole: "Senior Data Engineer",
    baseResumeText: `Alex Carter
alex.carter@example.com | +1 555 0100 | Austin, TX | linkedin.com/in/alexcarter

PROFESSIONAL SUMMARY
Data engineer with 6 years building batch and streaming pipelines for analytics teams.

EXPERIENCE
Data Engineer | Northstar Analytics | Austin, TX | 2020 - Present
- Built ETL pipelines in Python loading 2TB/day into a Postgres warehouse.
- Migrated nightly jobs to Airflow, cutting failures by 40%.
- Wrote SQL transformations feeding BI dashboards used by 200 stakeholders.
Data Analyst | Retailly | Austin, TX | 2018 - 2020
- Modeled retail sales data and automated weekly reporting.

EDUCATION
B.S. Computer Science | University of Texas | 2018

SKILLS
Python, SQL, Airflow, Postgres, ETL, Git`,
    jobDescription: `Senior Data Engineer — CloudScale
We are looking for a Senior Data Engineer to build distributed systems on AWS.
Requirements: strong Python and SQL; experience with Spark and Kafka for streaming;
dbt for transformations; Airflow orchestration; Snowflake or BigQuery data warehouse;
Docker and CI/CD; data modeling for analytics. You will design ETL pipelines and
own data quality across the medallion architecture.`,
    groundTruthSkills: ["python", "sql", "airflow", "postgres", "etl", "git"],
  },
  {
    id: "frontend-engineer",
    targetRole: "Frontend Engineer",
    baseResumeText: `Jordan Lee
jordan.lee@example.com | Seattle, WA | github.com/jordanlee

SUMMARY
Frontend developer with 4 years building web apps.

EXPERIENCE
Frontend Developer | Brightline | Seattle, WA | 2021 - Present
- Built responsive React interfaces with TypeScript and Tailwind.
- Improved page load by 35% via code splitting and lazy loading.
- Wrote unit tests and set up CI for the UI codebase.
Junior Developer | Webworks | 2019 - 2021
- Maintained a jQuery legacy app and migrated parts to React.

EDUCATION
B.A. Design | Washington State University | 2019

SKILLS
React, TypeScript, JavaScript, Tailwind, HTML, CSS, Git`,
    jobDescription: `Frontend Engineer — Pixelworks
Build performant, accessible UIs. Requirements: expert React and TypeScript;
experience with Vite and modern build tooling; unit testing and test automation;
REST API integration; CI/CD; accessibility best practices; state management.
Bonus: Plotly or charting libraries, design systems.`,
    groundTruthSkills: ["react", "typescript", "javascript", "tailwind", "html", "css", "git"],
  },
  {
    id: "ml-engineer",
    targetRole: "Machine Learning Engineer",
    baseResumeText: `Priya Nair
priya.nair@example.com | Remote | linkedin.com/in/priyanair

SUMMARY
ML practitioner with 5 years shipping models to production.

EXPERIENCE
Machine Learning Engineer | DeepData | Remote | 2020 - Present
- Trained and deployed deep learning models for image classification with PyTorch.
- Built data pipelines in Python and served models behind a REST API.
- Ran experiments tracking with MLflow and containerized training with Docker.
Data Scientist | Insightly | 2019 - 2020
- Built NLP models for ticket classification.

EDUCATION
M.S. Computer Science | Georgia Tech | 2019

SKILLS
Python, PyTorch, Machine Learning, Deep Learning, Docker, REST API, NLP`,
    jobDescription: `Machine Learning Engineer — VisionAI
Own the ML lifecycle. Requirements: Python; deep learning with PyTorch or TensorFlow;
computer vision and natural language processing; distributed systems for training;
Kubernetes and Docker; cloud computing on GCP; CI/CD for model deployment;
experience with feature stores and model monitoring.`,
    groundTruthSkills: ["python", "pytorch", "machine learning", "deep learning", "docker", "rest api", "nlp"],
  },
];
