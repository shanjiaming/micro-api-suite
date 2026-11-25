import { validatePublicUrl } from "../security.mjs";

function unwrapCdata(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

function getTagValue(xml, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const m = xml.match(re);
  return m ? unwrapCdata(m[1]) : null;
}

function toIsoDate(raw) {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : raw;
}

/**
 * Parse RSS 2.0 or Atom XML into normalized JSON.
 */
export function parseFeedXml(xml, feedUrl, limit = 30) {
  const isAtom = /<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml) || /<entry\b/i.test(xml);

  if (isAtom) {
    const title = getTagValue(xml, "title");
    const subtitle = getTagValue(xml, "subtitle");
    const linkMatch = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    const items = [];
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRe.exec(xml)) !== null && items.length < limit) {
      const block = m[1];
      const itemLinkMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
      const summary = getTagValue(block, "summary") || getTagValue(block, "content");
      items.push({
        id: getTagValue(block, "id"),
        title: getTagValue(block, "title"),
        url: itemLinkMatch ? itemLinkMatch[1] : null,
        publishedAt: toIsoDate(getTagValue(block, "published") || getTagValue(block, "updated")),
        author: getTagValue(block, "name") || getTagValue(block, "author"),
        summary: summary ? summary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : null
      });
    }
    return {
      format: "atom",
      feedUrl,
      title,
      description: subtitle,
      link: linkMatch ? linkMatch[1] : null,
      itemCount: items.length,
      items
    };
  }

  const channelMatch = xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i);
  const headerXml = channelMatch ? channelMatch[1].split(/<item\b/i)[0] : xml;
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    const categories = [];
    const catRe = /<category\b[^>]*>([\s\S]*?)<\/category>/gi;
    let cm;
    while ((cm = catRe.exec(block)) !== null) {
      const val = unwrapCdata(cm[1]);
      if (val) categories.push(val);
    }
    const desc = getTagValue(block, "description") || getTagValue(block, "content:encoded");
    items.push({
      id: getTagValue(block, "guid") || getTagValue(block, "link"),
      title: getTagValue(block, "title"),
      url: getTagValue(block, "link"),
      publishedAt: toIsoDate(getTagValue(block, "pubDate") || getTagValue(block, "dc:date")),
      author: getTagValue(block, "dc:creator") || getTagValue(block, "author"),
      categories,
      summary: desc ? desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : null
    });
  }

  return {
    format: "rss",
    feedUrl,
    title: getTagValue(headerXml, "title"),
    description: getTagValue(headerXml, "description"),
    link: getTagValue(headerXml, "link"),
    itemCount: items.length,
    items
  };
}

export async function fetchAndParseFeed(urlInput, limit = 30, options = {}) {
  const targetUrl = validatePublicUrl(urlInput);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const res = await fetchImpl(targetUrl, {
    headers: { "User-Agent": "RssToJsonFeedAPI/1.0", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000)
  });
  if (!res.ok) {
    throw new Error(`Upstream feed returned HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseFeedXml(xml, res.url || targetUrl, Math.min(Math.max(1, Number(limit) || 30), 100));
}
