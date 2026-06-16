import { describe, it, expect } from "vitest";
import { toMarkdown, toText, toDocx } from "./resume-renderer.js";
import { resumeContentSchema } from "./resume-content.js";

// Ported from Job_applying_agent/tests/test_resume_renderer.py.
const content = resumeContentSchema.parse({
  contact: { name: "Sai Nithin", location: "Austin, TX", email: "sai@example.com", links: ["https://linkedin.com/in/sai"] },
  professional_summary: "Data engineer with 5 years building pipelines.",
  technical_skills: [{ category: "Programming", items: ["Python", "SQL"] }],
  experience: [{ title: "Data Engineer", company: "Acme", dates: "2020–2025", bullets: ["Built ETL pipelines", "Cut cost 40%"] }],
  education: [{ degree: "BSc CS", institution: "UT Austin" }],
});

describe("resume renderer", () => {
  it("renders deterministic markdown with standard headings", () => {
    const md = toMarkdown(content);
    expect(md).toContain("# Sai Nithin");
    expect(md).toContain("## PROFESSIONAL SUMMARY");
    expect(md).toContain("## TECHNICAL SKILLS");
    expect(md).toContain("Programming: Python, SQL");
    expect(md).toContain("- Built ETL pipelines");
    // deterministic: same input → same output
    expect(toMarkdown(content)).toBe(md);
  });

  it("renders plain text with underlined headings and no markdown marks", () => {
    const txt = toText(content);
    expect(txt).toContain("Sai Nithin");
    expect(txt).not.toContain("**");
    expect(txt).toContain("PROFESSIONAL SUMMARY");
  });

  it("produces a non-empty DOCX buffer", async () => {
    const buf = await toDocx(content);
    expect(buf.length).toBeGreaterThan(1000);
    // DOCX is a zip → starts with PK.
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
