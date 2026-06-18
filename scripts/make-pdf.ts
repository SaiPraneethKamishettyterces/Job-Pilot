// Render docs/CHANGES-0.1.0.md to a styled PDF using the installed Chromium.
// Self-contained markdown→HTML (headings, tables, lists, blockquote, bold, code,
// links, hr) — enough for this document.
import { readFileSync } from "fs";
import { chromium } from "playwright";

const SRC = "docs/CHANGES-0.1.0.md";
const OUT = "docs/CHANGES-0.1.0.pdf";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let inList = false, inOl = false;
  const closeLists = () => { if (inList) { out.push("</ul>"); inList = false; } if (inOl) { out.push("</ol>"); inOl = false; } };

  while (i < lines.length) {
    const line = lines[i]!;
    // table
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]!)) {
      closeLists();
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      out.push("<table><thead><tr>" + header.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) {
        const cells = lines[i]!.split("|").slice(1, -1).map((c) => c.trim());
        out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeLists(); out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { closeLists(); out.push("<hr/>"); i++; continue; }
    if (/^>\s?/.test(line)) { closeLists(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if (!inList) { closeLists(); out.push("<ul>"); inList = true; } out.push(`<li>${inline(ul[1]!)}</li>`); i++; continue; }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if (!inOl) { closeLists(); out.push("<ol>"); inOl = true; } out.push(`<li>${inline(ol[1]!)}</li>`); i++; continue; }
    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeLists();
  return out.join("\n");
}

async function main() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;line-height:1.5;max-width:860px;margin:0 auto;padding:32px;font-size:13px}
    h1{font-size:26px;border-bottom:3px solid #6366f1;padding-bottom:8px;margin-top:0}
    h2{font-size:19px;border-bottom:1px solid #e5e7eb;padding-bottom:5px;margin-top:28px;color:#4338ca}
    h3{font-size:15px;margin-top:18px;color:#374151}
    h4{font-size:13px;color:#6b7280}
    table{border-collapse:collapse;width:100%;margin:12px 0;font-size:12px}
    th,td{border:1px solid #d1d5db;padding:6px 9px;text-align:left;vertical-align:top}
    th{background:#f3f4f6}
    code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#be185d}
    blockquote{border-left:4px solid #c7d2fe;margin:10px 0;padding:4px 14px;color:#4b5563;background:#f8fafc}
    hr{border:0;border-top:1px solid #e5e7eb;margin:20px 0}
    a{color:#4f46e5}
    li{margin:3px 0}
  </style></head><body>${mdToHtml(readFileSync(SRC, "utf8"))}</body></html>`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({ path: OUT, format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } });
  await browser.close();
  console.log("wrote", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
