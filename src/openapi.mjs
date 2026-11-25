export const API_PRODUCTS = {
  "seo-meta-auditor": {
    title: "SEO & AEO Meta Auditor API",
    description:
      "Audit any public webpage for technical SEO score, title/description length, canonical, headings, OpenGraph, JSON-LD structured data, image alt coverage, and link counts.",
    category: "Tools"
  },
  "dns-ssl-intel": {
    title: "DNS & SSL Certificate Inspector API",
    description:
      "Inspect any domain's DNS records (A, AAAA, MX, NS, TXT), email security (SPF & DMARC), and live TLS/SSL certificate issuer, expiration, and protocol version.",
    category: "Cybersecurity"
  },
  "rss-to-json-feed": {
    title: "RSS & Atom Feed to JSON API",
    description:
      "Convert any RSS 2.0 or Atom XML feed URL into clean, normalized JSON items with ISO timestamps, authors, categories, and summaries.",
    category: "Data"
  },
  "cron-timezone-utils": {
    title: "Cron Schedule & Timezone Converter API",
    description:
      "Parse 5-field cron expressions to compute next execution timestamps in any IANA timezone, and convert ISO timestamps across timezones.",
    category: "Tools"
  }
};

export function buildProductOpenApi(slug, baseOrigin = "https://micro-api-suite.onrender.com") {
  const serverUrl = `${baseOrigin}/apis/${slug}`;
  if (slug === "seo-meta-auditor") {
    return {
      openapi: "3.0.3",
      info: { title: API_PRODUCTS[slug].title, version: "1.0.0", description: API_PRODUCTS[slug].description },
      servers: [{ url: serverUrl }],
      paths: {
        "/v1/audit": {
          get: {
            summary: "Run SEO & OpenGraph audit on a URL",
            parameters: [{ name: "url", in: "query", required: true, schema: { type: "string", example: "https://stripe.com" } }],
            responses: { "200": { description: "SEO audit JSON" }, "400": { description: "Invalid URL" } }
          }
        }
      }
    };
  }
  if (slug === "dns-ssl-intel") {
    return {
      openapi: "3.0.3",
      info: { title: API_PRODUCTS[slug].title, version: "1.0.0", description: API_PRODUCTS[slug].description },
      servers: [{ url: serverUrl }],
      paths: {
        "/v1/inspect": {
          get: {
            summary: "Inspect DNS records, SPF/DMARC, and TLS certificate for a domain",
            parameters: [{ name: "domain", in: "query", required: true, schema: { type: "string", example: "github.com" } }],
            responses: { "200": { description: "Domain DNS and TLS report" }, "400": { description: "Invalid domain" } }
          }
        }
      }
    };
  }
  if (slug === "rss-to-json-feed") {
    return {
      openapi: "3.0.3",
      info: { title: API_PRODUCTS[slug].title, version: "1.0.0", description: API_PRODUCTS[slug].description },
      servers: [{ url: serverUrl }],
      paths: {
        "/v1/parse": {
          get: {
            summary: "Parse an RSS or Atom feed URL into JSON",
            parameters: [
              { name: "url", in: "query", required: true, schema: { type: "string", example: "https://news.ycombinator.com/rss" } },
              { name: "limit", in: "query", required: false, schema: { type: "integer", default: 30 } }
            ],
            responses: { "200": { description: "Parsed feed JSON" }, "400": { description: "Invalid URL" } }
          }
        }
      }
    };
  }
  if (slug === "cron-timezone-utils") {
    return {
      openapi: "3.0.3",
      info: { title: API_PRODUCTS[slug].title, version: "1.0.0", description: API_PRODUCTS[slug].description },
      servers: [{ url: serverUrl }],
      paths: {
        "/v1/cron/next": {
          get: {
            summary: "Compute next execution timestamps for a 5-field cron expression",
            parameters: [
              { name: "expr", in: "query", required: true, schema: { type: "string", example: "0 9 * * 1-5" } },
              { name: "tz", in: "query", required: false, schema: { type: "string", default: "UTC" } },
              { name: "count", in: "query", required: false, schema: { type: "integer", default: 5 } }
            ],
            responses: { "200": { description: "Next cron runs" }, "400": { description: "Invalid cron or timezone" } }
          }
        },
        "/v1/timezone/convert": {
          get: {
            summary: "Convert an ISO timestamp to a target IANA timezone",
            parameters: [
              { name: "time", in: "query", required: false, schema: { type: "string", example: "2026-11-25T12:00:00Z" } },
              { name: "to", in: "query", required: false, schema: { type: "string", default: "UTC" } }
            ],
            responses: { "200": { description: "Converted timestamp" }, "400": { description: "Invalid parameter" } }
          }
        }
      }
    };
  }
  return null;
}
