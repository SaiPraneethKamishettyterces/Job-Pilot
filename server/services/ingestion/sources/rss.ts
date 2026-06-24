// Minimal RSS/Atom item parser for free job feeds (WeWorkRemotely, Remote.co, …).
// Regex-based (no XML dep), mirroring the text-parsing approach used elsewhere in
// the ingestion layer. Fails soft: returns [] on fetch error / empty body.
import { logger } from "../../../lib/logger.js";

const FETCH_TIMEOUT_MS = 12000;
const UA = "Mozilla/5.0 (compatible; JobPilot/1.0; +https://jobpilot.local)";

export interface RssItem {
  title: string | null;
  link: string | null;
  pubDate: string | null; // RFC-822 string as published in the feed
  description: string | null; // may contain HTML
  guid: string | null;
}

export async function fetchText(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*", ...headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "RSS fetch non-OK");
      return null;
    }
    return await res.text();
  } catch (err) {
    logger.warn({ url, err: err instanceof Error ? err.message : String(err) }, "RSS fetch failed");
    return null;
  }
}

function tag(block: string, name: string): string | null {
  // <name>…</name> or <name><![CDATA[…]]></name>
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  const raw = m[1] ?? "";
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1]! : raw).trim() || null;
}

/** Parse <item> (RSS) or <entry> (Atom) blocks out of a feed body. */
export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks) {
    // Atom uses <link href="…"/>; RSS uses <link>…</link>.
    const linkHref = block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
    items.push({
      title: tag(block, "title"),
      link: linkHref ?? tag(block, "link"),
      pubDate: tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated"),
      description: tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content"),
      guid: tag(block, "guid") ?? tag(block, "id"),
    });
  }
  return items;
}

/** Convert a feed date string to ISO, or null if unparseable (avoids Date.now fallback). */
export function toIso(pubDate: string | null): string | null {
  if (!pubDate) return null;
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
