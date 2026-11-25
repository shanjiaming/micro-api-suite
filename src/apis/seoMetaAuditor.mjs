import { validatePublicUrl } from "../security.mjs";

function parseAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Audit HTML content for technical SEO, OpenGraph, JSON-LD, headings, and image alt tags.
 */
export function auditSeoHtml(html, pageUrl) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : "";

  const meta = {};
  const metaRegex = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    const attrs = parseAttrs(m[0]);
    const key = (attrs.name || attrs.property || "").toLowerCase();
    if (key && attrs.content !== undefined && meta[key] === undefined) {
      meta[key] = attrs.content.trim();
    }
  }

  let canonical = null;
  const linkRegex = /<link\b[^>]*>/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    const attrs = parseAttrs(m[0]);
    if ((attrs.rel || "").toLowerCase() === "canonical" && attrs.href) {
      try {
        canonical = new URL(attrs.href, pageUrl).toString();
      } catch {
        canonical = attrs.href;
      }
      break;
    }
  }

  const headings = { h1: [], h2: [], h3: [] };
  for (const level of ["h1", "h2", "h3"]) {
    const re = new RegExp(`<${level}\\b[^>]*>([\\s\\S]*?)<\\/${level}>`, "gi");
    while ((m = re.exec(html)) !== null) {
      const text = stripTags(m[1]);
      if (text) headings[level].push(text);
    }
  }

  let totalImages = 0;
  let missingAltImages = 0;
  const imgRegex = /<img\b[^>]*>/gi;
  while ((m = imgRegex.exec(html)) !== null) {
    totalImages += 1;
    const attrs = parseAttrs(m[0]);
    if (!attrs.alt || !attrs.alt.trim()) {
      missingAltImages += 1;
    }
  }

  let internalLinks = 0;
  let externalLinks = 0;
  const baseHost = new URL(pageUrl).hostname.toLowerCase();
  const anchorRegex = /<a\b[^>]*>/gi;
  while ((m = anchorRegex.exec(html)) !== null) {
    const attrs = parseAttrs(m[0]);
    if (!attrs.href || attrs.href.startsWith("#") || attrs.href.startsWith("javascript:")) continue;
    try {
      const target = new URL(attrs.href, pageUrl);
      if (target.hostname.toLowerCase() === baseHost) internalLinks += 1;
      else externalLinks += 1;
    } catch {
      // Ignore malformed hrefs.
    }
  }

  const jsonLd = [];
  const ldRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRegex.exec(html)) !== null) {
    try {
      jsonLd.push(JSON.parse(m[1].trim()));
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  const issues = [];
  let score = 100;
  const description = meta.description || "";

  if (!title) {
    issues.push("Missing <title> tag");
    score -= 20;
  } else if (title.length < 20 || title.length > 65) {
    issues.push(`Title length (${title.length}) outside recommended 20-65 chars`);
    score -= 8;
  }

  if (!description) {
    issues.push("Missing meta description");
    score -= 15;
  } else if (description.length < 70 || description.length > 165) {
    issues.push(`Meta description length (${description.length}) outside recommended 70-165 chars`);
    score -= 7;
  }

  if (!canonical) {
    issues.push("Missing canonical link");
    score -= 10;
  }
  if (headings.h1.length === 0) {
    issues.push("Missing <h1> heading");
    score -= 15;
  } else if (headings.h1.length > 1) {
    issues.push(`Multiple <h1> headings (${headings.h1.length})`);
    score -= 5;
  }
  if (!meta["og:title"] || !meta["og:description"]) {
    issues.push("Incomplete OpenGraph metadata (og:title / og:description)");
    score -= 8;
  }
  if (missingAltImages > 0) {
    issues.push(`${missingAltImages} of ${totalImages} images missing alt text`);
    score -= Math.min(15, missingAltImages * 3);
  }
  if (jsonLd.length === 0) {
    issues.push("No JSON-LD structured data found");
    score -= 7;
  }

  return {
    url: pageUrl,
    score: Math.max(0, score),
    issues,
    title: { text: title || null, length: title.length },
    description: { text: description || null, length: description.length },
    canonical,
    robots: meta.robots || null,
    openGraph: {
      title: meta["og:title"] || null,
      description: meta["og:description"] || null,
      image: meta["og:image"] || null,
      type: meta["og:type"] || null
    },
    headings,
    images: { total: totalImages, missingAlt: missingAltImages },
    links: { internal: internalLinks, external: externalLinks },
    jsonLdCount: jsonLd.length,
    jsonLd
  };
}

export async function runSeoAudit(urlInput, options = {}) {
  const targetUrl = validatePublicUrl(urlInput);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const res = await fetchImpl(targetUrl, {
    headers: { "User-Agent": "SeoMetaAuditorAPI/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000)
  });
  if (!res.ok) {
    throw new Error(`Upstream returned HTTP ${res.status}`);
  }
  const html = await res.text();
  return auditSeoHtml(html, res.url || targetUrl);
}
