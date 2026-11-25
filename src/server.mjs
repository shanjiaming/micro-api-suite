import http from "node:http";
import { runSeoAudit } from "./apis/seoMetaAuditor.mjs";
import { inspectDomainIntel } from "./apis/dnsSslIntel.mjs";
import { fetchAndParseFeed } from "./apis/rssToJson.mjs";
import { getNextCronRuns, convertTimezone } from "./apis/cronTimezone.mjs";
import { API_PRODUCTS, buildProductOpenApi } from "./openapi.mjs";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function parseSecrets(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isClientError(err) {
  const msg = err?.message || "";
  return (
    msg.includes("Missing") ||
    msg.includes("Invalid") ||
    msg.includes("not allowed") ||
    msg.includes("Only HTTP") ||
    msg.includes("Cron") ||
    msg.includes("Time zone")
  );
}

export function createSuiteHandler(options = {}) {
  const allowedSecrets = options.allowedSecrets ?? parseSecrets(process.env.RAPIDAPI_PROXY_SECRETS || process.env.RAPIDAPI_PROXY_SECRET || "");
  const deps = {
    runSeoAudit: options.runSeoAudit || runSeoAudit,
    inspectDomainIntel: options.inspectDomainIntel || inspectDomainIntel,
    fetchAndParseFeed: options.fetchAndParseFeed || fetchAndParseFeed
  };

  return async function handleRequest(req, res) {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    if (pathname === "/health") {
      return sendJson(res, 200, { status: "ok", products: Object.keys(API_PRODUCTS) });
    }
    if (pathname === "/") {
      return sendJson(res, 200, {
        service: "micro-api-suite",
        products: Object.keys(API_PRODUCTS).map((slug) => ({
          slug,
          title: API_PRODUCTS[slug].title,
          openapi: `/apis/${slug}/openapi.json`
        }))
      });
    }

    const openApiMatch = pathname.match(/^\/apis\/([a-z0-9-]+)\/openapi\.json$/);
    if (openApiMatch) {
      const origin = `https://${req.headers.host || "localhost"}`;
      const spec = buildProductOpenApi(openApiMatch[1], origin);
      if (!spec) return sendJson(res, 404, { error: "Unknown API product" });
      return sendJson(res, 200, spec);
    }

    if (pathname.startsWith("/apis/")) {
      if (allowedSecrets.length > 0) {
        const provided = req.headers["x-rapidapi-proxy-secret"];
        if (!provided || !allowedSecrets.includes(provided)) {
          return sendJson(res, 401, { error: "Unauthorized" });
        }
      }
    }

    try {
      if (pathname === "/apis/seo-meta-auditor/v1/audit") {
        const url = reqUrl.searchParams.get("url");
        if (!url) return sendJson(res, 400, { error: "Missing required query parameter: url" });
        return sendJson(res, 200, await deps.runSeoAudit(url));
      }

      if (pathname === "/apis/dns-ssl-intel/v1/inspect") {
        const domain = reqUrl.searchParams.get("domain");
        if (!domain) return sendJson(res, 400, { error: "Missing required query parameter: domain" });
        return sendJson(res, 200, await deps.inspectDomainIntel(domain));
      }

      if (pathname === "/apis/rss-to-json-feed/v1/parse") {
        const url = reqUrl.searchParams.get("url");
        if (!url) return sendJson(res, 400, { error: "Missing required query parameter: url" });
        const limit = reqUrl.searchParams.get("limit") || 30;
        return sendJson(res, 200, await deps.fetchAndParseFeed(url, limit));
      }

      if (pathname === "/apis/cron-timezone-utils/v1/cron/next") {
        const expr = reqUrl.searchParams.get("expr");
        if (!expr) return sendJson(res, 400, { error: "Missing required query parameter: expr" });
        const tz = reqUrl.searchParams.get("tz") || "UTC";
        const count = reqUrl.searchParams.get("count") || 5;
        return sendJson(res, 200, getNextCronRuns(expr, tz, count));
      }

      if (pathname === "/apis/cron-timezone-utils/v1/timezone/convert") {
        const time = reqUrl.searchParams.get("time");
        const to = reqUrl.searchParams.get("to") || "UTC";
        return sendJson(res, 200, convertTimezone(time, to));
      }
    } catch (err) {
      return sendJson(res, isClientError(err) ? 400 : 502, { error: err?.message || "Request failed" });
    }

    return sendJson(res, 404, { error: "Not found" });
  };
}

export function startServer(port = Number(process.env.PORT) || 3002) {
  const server = http.createServer(createSuiteHandler());
  server.listen(port, () => {
    console.log(`micro-api-suite listening on http://localhost:${port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
