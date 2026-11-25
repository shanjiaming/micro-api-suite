import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { validatePublicUrl, validatePublicDomain } from "../src/security.mjs";
import { auditSeoHtml } from "../src/apis/seoMetaAuditor.mjs";
import { inspectDomainIntel } from "../src/apis/dnsSslIntel.mjs";
import { parseFeedXml } from "../src/apis/rssToJson.mjs";
import { getNextCronRuns, convertTimezone } from "../src/apis/cronTimezone.mjs";
import { createSuiteHandler } from "../src/server.mjs";

test("security blocks internal/private hosts", () => {
  assert.equal(validatePublicDomain("https://stripe.com/docs"), "stripe.com");
  assert.throws(() => validatePublicUrl("http://127.0.0.1:8080"), /Private or internal/);
  assert.throws(() => validatePublicUrl("http://169.254.169.254/latest"), /Private or internal/);
  assert.throws(() => validatePublicUrl("ftp://example.com"), /Only HTTP/);
});

test("auditSeoHtml computes SEO score, headings, images, links, and JSON-LD", () => {
  const html = `
    <html>
      <head>
        <title>Best Developer Tools for Modern Teams</title>
        <meta name="description" content="Comprehensive platform for building, testing, and deploying reliable APIs in production environments." />
        <link rel="canonical" href="/tools" />
        <meta property="og:title" content="DevTools" />
        <meta property="og:description" content="Build fast" />
        <script type="application/ld+json">{"@type":"SoftwareApplication","name":"DevTools"}</script>
      </head>
      <body>
        <h1>Developer Tools</h1>
        <img src="/a.png" alt="Logo" />
        <img src="/b.png" />
        <a href="/docs">Docs</a>
        <a href="https://github.com/org">GitHub</a>
      </body>
    </html>
  `;
  const res = auditSeoHtml(html, "https://example.com/tools");
  assert.equal(res.canonical, "https://example.com/tools");
  assert.equal(res.headings.h1[0], "Developer Tools");
  assert.equal(res.images.total, 2);
  assert.equal(res.images.missingAlt, 1);
  assert.equal(res.links.internal, 1);
  assert.equal(res.links.external, 1);
  assert.equal(res.jsonLdCount, 1);
  assert.equal(res.score, 97);
});

test("inspectDomainIntel aggregates DNS and SPF/DMARC flags", async () => {
  const mockDns = {
    resolve4: async () => ["1.2.3.4"],
    resolve6: async () => [],
    resolveMx: async () => [{ exchange: "mx.example.com", priority: 10 }],
    resolveTxt: async (d) => (d.startsWith("_dmarc.") ? [["v=DMARC1; p=reject"]] : [["v=spf1 include:_spf.google.com ~all"]]),
    resolveNs: async () => ["ns1.example.com"]
  };
  const res = await inspectDomainIntel("example.com", {
    dnsImpl: mockDns,
    tlsImpl: async () => ({ available: true, protocol: "TLSv1.3", daysRemaining: 60, expired: false })
  });
  assert.deepEqual(res.dns.a, ["1.2.3.4"]);
  assert.equal(res.emailSecurity.hasSpf, true);
  assert.equal(res.emailSecurity.hasDmarc, true);
  assert.equal(res.tls.daysRemaining, 60);
});

test("parseFeedXml parses RSS 2.0 and Atom feeds", () => {
  const rss = `
    <rss version="2.0"><channel>
      <title>Tech News</title><link>https://news.example.com</link><description>Daily feed</description>
      <item><title><![CDATA[Hello World]]></title><link>https://news.example.com/1</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate><category>AI</category></item>
    </channel></rss>
  `;
  const parsed = parseFeedXml(rss, "https://news.example.com/rss");
  assert.equal(parsed.format, "rss");
  assert.equal(parsed.title, "Tech News");
  assert.equal(parsed.items[0].title, "Hello World");
  assert.equal(parsed.items[0].categories[0], "AI");
});

test("cronTimezone computes next cron runs and timezone conversions", () => {
  const base = new Date("2026-11-25T00:00:00Z");
  const runs = getNextCronRuns("30 9 * * *", "UTC", 2, base);
  assert.equal(runs.count, 2);
  assert.equal(runs.nextRuns[0].utc, "2026-11-25T09:30:00.000Z");

  const conv = convertTimezone("2026-11-25T00:00:00Z", "Asia/Shanghai");
  assert.equal(conv.localTime, "2026-11-25 08:00:00");
});

test("HTTP suite server routes all 4 products and enforces RAPIDAPI_PROXY_SECRETS", async () => {
  const handler = createSuiteHandler({
    allowedSecrets: ["sec-1", "sec-2"],
    runSeoAudit: async (u) => ({ url: u, score: 100 }),
    inspectDomainIntel: async (d) => ({ domain: d }),
    fetchAndParseFeed: async (u) => ({ feedUrl: u, items: [] })
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const spec = await fetch(`${base}/apis/seo-meta-auditor/openapi.json`);
    assert.equal(spec.status, 200);
    assert.equal((await spec.json()).openapi, "3.0.3");

    const unauth = await fetch(`${base}/apis/cron-timezone-utils/v1/cron/next?expr=*+*+*+*+*`);
    assert.equal(unauth.status, 401);

    const cronRes = await fetch(`${base}/apis/cron-timezone-utils/v1/cron/next?expr=0+12+*+*+*&count=2`, {
      headers: { "x-rapidapi-proxy-secret": "sec-2" }
    });
    assert.equal(cronRes.status, 200);
    assert.equal((await cronRes.json()).count, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
