// Single-call Claude cost probe (Issue #77). Runs EXACTLY ONE resume-tailoring
// request through the real path (skill system prompt + tailor user prompt +
// TASK_MODEL.tailorResume) against Claude, then prints token usage + USD cost and
// a preview of the tailored content so we can judge ATS quality before spending
// more credits. No DB writes. Run: npx tsx server/scripts/claude-cost-probe.ts
//
// Force Claude for this probe regardless of AI_TAILOR_PROVIDER.
process.env.AI_TAILOR_PROVIDER = "anthropic";

import { completeJson, hasProvider } from "../services/ai/ai-service.js";
import { TASK_MODEL } from "../services/ai/model-config.js";
import { buildTailorUserPrompt } from "../services/ai/prompts.js";
import { loadSkillSystemPrompt, skillAvailable } from "../services/resume/skill-loader.js";
import { resumeContentSchema } from "../services/resume/resume-content.js";
import { keywordCoverage } from "../services/resume/coverage.js";
import { toText } from "../services/resume/resume-renderer.js";

// Candidate's real master resume (condensed from the uploaded resumes).
const BASE_RESUME = `SAI PRANEETH KAMISHETTY
Overland Park, KS | +1 (850) 405 4171 | saipraneethk2002@gmail.com | linkedin.com/in/saipraneeth

SUMMARY
Data Scientist with 5+ years of experience building ML models, data pipelines, and AI-powered
applications. Proficient in Python, SQL, R, and modern AI frameworks. Experience with LLMs, RAG,
agentic workflows, prompt engineering, and deploying solutions on cloud platforms.

SKILLS
Python, SQL, R, FastAPI, REST APIs, Git/GitHub, LLMs, Generative AI, Prompt Engineering, RAG,
AI Agents, LangChain, LangGraph, Vector Databases, Semantic Search, Machine Learning, Deep Learning,
NLP, Transformer Architecture, PyTorch, TensorFlow, n8n, Vercel, Supabase, Power BI, Tableau,
PostgreSQL, Snowflake, ETL Pipelines

EXPERIENCE
Applied AI & Data Science Engineer, Kaiser Permanente | Dec 2024 - Present
- Built AI-powered applications using LLMs, RAG, and conversational AI workflows for intelligent automation.
- Developed agentic workflows automating business interactions using prompt engineering and orchestration.
- Designed AI pipelines integrating structured/unstructured healthcare data with semantic search.
- Analyzed large-scale datasets with Python and SQL; built predictive models (regression, classification).
- Built Power BI/Tableau dashboards; reduced manual reporting effort by 65%.

AI Automation Developer, Info Edge | Dec 2021 - Aug 2023
- Developed AI-assisted automation workflows reducing manual operations by 65%.
- Built ML + NLP analytics solutions and automated reporting systems.
- Optimized SQL data pipelines; performed statistical and exploratory data analysis.

Data Analyst, Wipro | May 2020 - Dec 2021
- Built SQL data models and Python workflows; improved operational efficiency by 20%.
- Automated ETL pipelines integrating multiple datasets; built Tableau dashboards.

PROJECTS
AI Voice Receptionist Agent | Python, LLMs, Agentic AI, RAG - May 2025
Agentic RAG Knowledge Assistant | Python, RAG, Vector Search, AI Agents - Mar 2023

EDUCATION
Florida State University - M.S. Data Science (CS & AI) - 2025 - GPA 3.89
VNR VJIET - B.Tech EEE - 2023 - GPA 3.68`;

const JOB_DESCRIPTION = `Generative AI Engineer — Horizon AI
We're hiring a Generative AI Engineer to design and ship LLM-powered products. Requirements:
strong Python; hands-on with LLM application development, retrieval-augmented generation (RAG),
vector databases, and embedding models; prompt engineering and evaluation; building autonomous
agents and multi-agent systems with tool calling; experience with LangChain/LangGraph; FastAPI
for serving; deploying on cloud (Vercel/AWS); familiarity with transformer architecture and NLP.
Bonus: token/cost optimization, conversational AI, production monitoring of LLM apps.`;

async function main() {
  if (!skillAvailable()) throw new Error("ats-resume-tailoring skill not found");
  const task = TASK_MODEL.tailorResume;
  if (task.provider !== "anthropic") throw new Error(`expected anthropic, got ${task.provider}`);
  if (!hasProvider("anthropic")) throw new Error("ANTHROPIC_API_KEY not set in .env");

  console.log(`\nClaude cost probe — ONE tailoring call on ${task.provider}/${task.model}\n`);

  const system = loadSkillSystemPrompt();
  const prompt = buildTailorUserPrompt({
    baseResumeText: BASE_RESUME,
    jobDescription: JOB_DESCRIPTION,
    targetRole: "Generative AI Engineer",
    userInstructions: null,
  });

  const { data, usage } = await completeJson<{ resume?: unknown; analysis?: unknown }>({
    ...task,
    maxTokens: 4000,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = resumeContentSchema.safeParse(data?.resume);
  const cov = parsed.success ? keywordCoverage(toText(parsed.data), JOB_DESCRIPTION) : null;
  const baseCov = keywordCoverage(BASE_RESUME, JOB_DESCRIPTION);

  console.log("── COST ───────────────────────────────────────────");
  console.log(`Input tokens:  ${usage.inputTokens}`);
  console.log(`Output tokens: ${usage.outputTokens}`);
  console.log(`Cost (USD):    $${usage.estimatedCostUSD.toFixed(6)}  (sonnet $3/Mtok in, $15/Mtok out)`);
  console.log("── QUALITY ────────────────────────────────────────");
  console.log(`Schema valid:  ${parsed.success}`);
  if (cov) console.log(`JD keyword coverage:  base ${(baseCov.score * 100).toFixed(1)}% → tailored ${(cov.score * 100).toFixed(1)}%`);
  console.log("── PREVIEW (tailored) ─────────────────────────────");
  if (parsed.success) console.log(toText(parsed.data).slice(0, 1400));
  console.log("\n── projected spend ────────────────────────────────");
  const c = usage.estimatedCostUSD;
  console.log(`Per resume ≈ $${c.toFixed(4)}  →  10 resumes ≈ $${(c * 10).toFixed(2)}  ·  100 ≈ $${(c * 100).toFixed(2)}  ·  1000 ≈ $${(c * 1000).toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
