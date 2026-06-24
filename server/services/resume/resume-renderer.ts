import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  LineRuleType,
  convertInchesToTwip,
} from "docx";
import type { ResumeContent } from "./resume-content.js";

// Deterministic resume renderer — a TypeScript port of the skill's
// scripts/render_resume.py. The model supplies content; this module owns
// typography so layout is identical on every run. Implements the exact
// formatting spec in server/skills/ats-resume-tailoring/references/formatting_spec.md
// (Calibri, 16pt name, 0.5in margins, bold ALL-CAPS headings with a thin bottom
// rule, the spacing rules, no tables/columns/icons).

const FONT = "Calibri";
const GREY = "808080";
const pt = (n: number) => Math.round(n * 20); // points → twips
const halfPt = (n: number) => Math.round(n * 2); // points → half-points (docx size unit)

// ─── shared content helpers (mirror the Python helpers) ──────────────────────

function contactLine(contact: ResumeContent["contact"]): string {
  const parts: string[] = [];
  if (contact.location) parts.push(contact.location);
  if (contact.phone) parts.push(contact.phone);
  if (contact.email) parts.push(contact.email);
  for (const link of contact.links ?? []) if (link) parts.push(link);
  return parts.join(" | ");
}

function skillLines(skills: ResumeContent["technical_skills"]): string[] {
  const lines: string[] = [];
  for (const cat of skills ?? []) {
    const items = (cat.items ?? []).join(", ");
    if (cat.category && items) lines.push(`${cat.category}: ${items}`);
  }
  return lines;
}

const subLine = (...parts: Array<string | null | undefined>) =>
  parts.filter((p): p is string => Boolean(p)).join(" | ");

// ─── Markdown / plain text ───────────────────────────────────────────────────

export function toMarkdown(content: ResumeContent): string {
  const c = content.contact;
  const out: string[] = [];
  out.push(`# ${c.name ?? ""}`.trimEnd());
  const line = contactLine(c);
  if (line) out.push(line);
  out.push("");

  if (content.professional_summary) {
    out.push("## PROFESSIONAL SUMMARY", content.professional_summary, "");
  }

  const skills = skillLines(content.technical_skills);
  if (skills.length) {
    out.push("## TECHNICAL SKILLS");
    out.push(...skills.map((s) => `- ${s}`));
    out.push("");
  }

  if (content.experience.length) {
    out.push("## PROFESSIONAL EXPERIENCE");
    for (const role of content.experience) {
      out.push(`**${role.title} | ${role.company}**`);
      const sub = subLine(role.location, role.dates);
      if (sub) out.push(`_${sub}_`);
      for (const b of role.bullets ?? []) out.push(`- ${b}`);
      out.push("");
    }
  }

  if (content.projects.length) {
    out.push("## PROJECTS");
    for (const proj of content.projects) {
      const tools = (proj.tools ?? []).join(", ");
      out.push(`**${proj.name}**${tools ? ` | ${tools}` : ""}`);
      if (proj.dates) out.push(`_${proj.dates}_`);
      for (const b of proj.bullets ?? []) out.push(`- ${b}`);
      out.push("");
    }
  }

  if (content.education.length) {
    out.push("## EDUCATION");
    for (const ed of content.education) {
      out.push(`**${ed.degree} | ${ed.institution}**`);
      const sub = subLine(ed.location, ed.dates);
      if (sub) out.push(`_${sub}_`);
      if (ed.details) out.push(ed.details);
      out.push("");
    }
  }

  if (content.certifications.length) {
    out.push("## CERTIFICATIONS");
    out.push(...content.certifications.map((x) => `- ${x}`));
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}

export function toText(content: ResumeContent): string {
  const lines: string[] = [];
  for (const raw of toMarkdown(content).split("\n")) {
    if (raw.startsWith("# ")) {
      const name = raw.slice(2);
      lines.push(name, "=".repeat(name.length));
    } else if (raw.startsWith("## ")) {
      const head = raw.slice(3);
      lines.push("", head, "-".repeat(head.length));
    } else {
      lines.push(raw.replace(/\*\*/g, "").replace(/_/g, ""));
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

const SINGLE = { line: 240, lineRule: LineRuleType.AUTO } as const;

function para(opts: {
  before?: number;
  after?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bottomBorder?: boolean;
  hanging?: boolean;
  children: TextRun[];
}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: pt(opts.before ?? 0), after: pt(opts.after ?? 0), ...SINGLE },
    ...(opts.bottomBorder
      ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: GREY } } }
      : {}),
    ...(opts.hanging
      ? { indent: { left: convertInchesToTwip(0.15), hanging: convertInchesToTwip(0.15) } }
      : {}),
    children: opts.children,
  });
}

const run = (text: string, sizePt: number, bold = false) =>
  new TextRun({ text, font: FONT, size: halfPt(sizePt), bold });

function heading(text: string): Paragraph {
  return para({ before: 6, after: 2, bottomBorder: true, children: [run(text.toUpperCase(), 11, true)] });
}

function bullet(text: string, last: boolean): Paragraph {
  return para({ after: last ? 3 : 0, hanging: true, children: [run(`•  ${text}`, 10)] });
}

function buildChildren(content: ResumeContent): Paragraph[] {
  const ps: Paragraph[] = [];
  const c = content.contact;

  ps.push(para({ align: AlignmentType.CENTER, children: [run(c.name ?? "", 16, true)] }));
  const ct = contactLine(c);
  if (ct) ps.push(para({ after: 2, align: AlignmentType.CENTER, children: [run(ct, 9.5)] }));

  if (content.professional_summary) {
    ps.push(heading("Professional Summary"));
    ps.push(para({ after: 3, children: [run(content.professional_summary, 10)] }));
  }

  const skills = skillLines(content.technical_skills);
  if (skills.length) {
    ps.push(heading("Technical Skills"));
    skills.forEach((line, i) => {
      const [cat, ...rest] = line.split(": ");
      const items = rest.join(": ");
      ps.push(
        para({
          after: i === skills.length - 1 ? 3 : 0,
          children: [run(`${cat}: `, 10, true), run(items, 10)],
        }),
      );
    });
  }

  if (content.experience.length) {
    ps.push(heading("Professional Experience"));
    for (const role of content.experience) {
      ps.push(para({ before: 4, children: [run(role.title, 10.5, true), run(` | ${role.company}`, 10.5, true)] }));
      const sub = subLine(role.location, role.dates);
      if (sub) ps.push(para({ children: [run(sub, 10)] }));
      const bullets = role.bullets ?? [];
      bullets.forEach((b, i) => ps.push(bullet(b, i === bullets.length - 1)));
    }
  }

  if (content.projects.length) {
    ps.push(heading("Projects"));
    for (const proj of content.projects) {
      const tools = (proj.tools ?? []).join(", ");
      const head = [run(proj.name, 10.5, true)];
      if (tools) head.push(run(` | ${tools}`, 10));
      ps.push(para({ before: 4, children: head }));
      if (proj.dates) ps.push(para({ children: [run(proj.dates, 10)] }));
      const bullets = proj.bullets ?? [];
      bullets.forEach((b, i) => ps.push(bullet(b, i === bullets.length - 1)));
    }
  }

  if (content.education.length) {
    ps.push(heading("Education"));
    for (const ed of content.education) {
      ps.push(para({ before: 4, children: [run(ed.degree, 10.5, true), run(` | ${ed.institution}`, 10.5, true)] }));
      const sub = subLine(ed.location, ed.dates);
      if (sub) ps.push(para({ children: [run(sub, 10)] }));
      if (ed.details) ps.push(para({ after: 3, children: [run(ed.details, 10)] }));
    }
  }

  if (content.certifications.length) {
    ps.push(heading("Certifications"));
    content.certifications.forEach((x, i) => ps.push(bullet(x, i === content.certifications.length - 1)));
  }

  return ps;
}

// ─── PDF ───────────────────────────────────────────────────────────────────
// Mirrors the DOCX typography from buildChildren so DOCX and PDF look the same.
// pdfkit ships only the standard-14 fonts, so we use Helvetica (a clean sans
// the same family as Calibri for ATS purposes); the bytes stay fully
// text-selectable so ATS parsers read every word. Letter, 0.5in margins.
const PDF_MARGIN = 36; // 0.5in in points (72pt/in)
const PDF_GREY = "#808080";

export async function toPdf(content: ResumeContent): Promise<Buffer> {
  // pdfkit is CJS; default import works under the repo's interop settings.
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: PDF_MARGIN, bottom: PDF_MARGIN, left: PDF_MARGIN, right: PDF_MARGIN },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const REG = "Helvetica";
  const BOLD = "Helvetica-Bold";
  const left = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const pdfHeading = (text: string) => {
    doc.moveDown(0.4);
    doc.font(BOLD).fontSize(11).fillColor("black").text(text.toUpperCase(), left, doc.y);
    const y = doc.y + 1;
    doc.moveTo(left, y).lineTo(left + usableWidth, y).lineWidth(0.75).strokeColor(PDF_GREY).stroke();
    doc.moveDown(0.3);
  };

  const pdfBullet = (text: string) => {
    const indent = 11;
    doc.font(REG).fontSize(10).fillColor("black")
      .text(`•  ${text}`, left, doc.y, { width: usableWidth, indent, lineGap: 0.5 });
  };

  const c = content.contact;
  doc.font(BOLD).fontSize(16).fillColor("black").text(c.name ?? "", { align: "center" });
  const ct = contactLine(c);
  if (ct) doc.font(REG).fontSize(9.5).fillColor("black").text(ct, { align: "center" });

  if (content.professional_summary) {
    pdfHeading("Professional Summary");
    doc.font(REG).fontSize(10).fillColor("black").text(content.professional_summary, { width: usableWidth });
  }

  const skills = skillLines(content.technical_skills);
  if (skills.length) {
    pdfHeading("Technical Skills");
    for (const line of skills) {
      const [cat, ...rest] = line.split(": ");
      const items = rest.join(": ");
      doc.fontSize(10).fillColor("black")
        .font(BOLD).text(`${cat}: `, left, doc.y, { continued: true })
        .font(REG).text(items);
    }
  }

  if (content.experience.length) {
    pdfHeading("Professional Experience");
    for (const role of content.experience) {
      doc.moveDown(0.2);
      doc.font(BOLD).fontSize(10.5).fillColor("black").text(`${role.title} | ${role.company}`, left, doc.y);
      const sub = subLine(role.location, role.dates);
      if (sub) doc.font(REG).fontSize(10).fillColor("black").text(sub);
      for (const b of role.bullets ?? []) pdfBullet(b);
    }
  }

  if (content.projects.length) {
    pdfHeading("Projects");
    for (const proj of content.projects) {
      doc.moveDown(0.2);
      const tools = (proj.tools ?? []).join(", ");
      doc.fontSize(10.5).fillColor("black")
        .font(BOLD).text(proj.name, left, doc.y, { continued: Boolean(tools) });
      if (tools) doc.font(REG).fontSize(10).text(` | ${tools}`);
      if (proj.dates) doc.font(REG).fontSize(10).fillColor("black").text(proj.dates, left, doc.y);
      for (const b of proj.bullets ?? []) pdfBullet(b);
    }
  }

  if (content.education.length) {
    pdfHeading("Education");
    for (const ed of content.education) {
      doc.moveDown(0.2);
      doc.font(BOLD).fontSize(10.5).fillColor("black").text(`${ed.degree} | ${ed.institution}`, left, doc.y);
      const sub = subLine(ed.location, ed.dates);
      if (sub) doc.font(REG).fontSize(10).fillColor("black").text(sub);
      if (ed.details) doc.font(REG).fontSize(10).fillColor("black").text(ed.details);
    }
  }

  if (content.certifications.length) {
    pdfHeading("Certifications");
    for (const x of content.certifications) pdfBullet(x);
  }

  doc.end();
  return done;
}

export async function toDocx(content: ResumeContent): Promise<Buffer> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: halfPt(10) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) },
            margin: {
              top: convertInchesToTwip(0.5),
              right: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
            },
          },
        },
        children: buildChildren(content),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** Build the section-13 analysis report markdown (everything except the file). */
export function analysisReportMarkdown(analysis: {
  ats_match_estimate?: Record<string, unknown>;
  strongest_matches?: string[];
  weak_or_missing?: string[];
  changes_made?: string[];
  recommendations?: string[];
}): string {
  const est = analysis.ats_match_estimate ?? {};
  const pct = est["percent"];
  const reasoning = (est["reasoning"] as string) ?? "";
  const bullets = (items?: string[]) =>
    items && items.length ? items.map((x) => `- ${x}`).join("\n") : "- (none)";
  return [
    "## ATS Match Estimate",
    `${pct != null ? pct : "N/A"}% — ${reasoning || "no reasoning provided"}`,
    "",
    "## Strongest Matches",
    bullets(analysis.strongest_matches),
    "",
    "## Weak or Missing Areas",
    bullets(analysis.weak_or_missing),
    "",
    "## Changes Made",
    bullets(analysis.changes_made),
    "",
    "## Recommendations",
    bullets(analysis.recommendations),
    "",
  ].join("\n");
}
