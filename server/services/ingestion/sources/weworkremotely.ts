// We Work Remotely — free public category RSS feeds (syndication; never scrape HTML).
// https://weworkremotely.com/categories/<category>.rss
// Titles are "Company: Role"; <pubDate> is RFC-822.
import { stripHtml, type RawJob } from "../ats-sources.js";
import { fetchText, parseRssItems, toIso } from "./rss.js";

const CATEGORIES = [
  "remote-programming-jobs",
  "remote-devops-sysadmin-jobs",
  "remote-design-jobs",
  "remote-product-jobs",
  "remote-customer-support-jobs",
  "remote-sales-and-marketing-jobs",
];

function splitTitle(raw: string): { company: string; title: string } {
  const idx = raw.indexOf(":");
  if (idx > 0) return { company: raw.slice(0, idx).trim(), title: raw.slice(idx + 1).trim() };
  return { company: "Unknown", title: raw.trim() };
}

export async function fetchWeWorkRemotely(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const cat of CATEGORIES) {
    const xml = await fetchText(`https://weworkremotely.com/categories/${cat}.rss`);
    if (!xml) continue;
    for (const item of parseRssItems(xml)) {
      if (!item.title) continue;
      const { company, title } = splitTitle(item.title);
      out.push({
        source: "weworkremotely",
        atsPlatform: "weworkremotely",
        sourceJobId: item.guid ?? item.link ?? item.title,
        title,
        company,
        locationRaw: "Remote",
        department: cat.replace(/^remote-|-jobs$/g, "").replace(/-/g, " "),
        descriptionText: item.description ? stripHtml(item.description) : "",
        jobUrl: item.link,
        applyUrl: item.link,
        postedAt: toIso(item.pubDate),
        workplaceType: "remote",
        commitment: null,
        raw: item,
      });
    }
  }
  return out;
}
