import dns from "node:dns/promises";
import tls from "node:tls";
import { validatePublicDomain } from "../security.mjs";

async function safeDns(fn) {
  try {
    return await fn();
  } catch {
    return [];
  }
}

export function inspectTlsCertificate(domain, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        socket.end();
        if (!cert || !cert.valid_to) {
          return resolve({ available: false });
        }
        const validToMs = Date.parse(cert.valid_to);
        const daysRemaining = Number.isFinite(validToMs)
          ? Math.floor((validToMs - Date.now()) / 86400000)
          : null;
        resolve({
          available: true,
          protocol,
          subjectCN: cert.subject?.CN || null,
          issuerO: cert.issuer?.O || cert.issuer?.CN || null,
          validFrom: cert.valid_from || null,
          validTo: cert.valid_to || null,
          daysRemaining,
          expired: daysRemaining !== null ? daysRemaining < 0 : null
        });
      }
    );
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve({ available: false, reason: "TLS handshake timeout" });
    });
    socket.on("error", (err) => {
      resolve({ available: false, reason: err.message });
    });
  });
}

/**
 * Inspect DNS records (A, AAAA, MX, TXT, NS), SPF/DMARC flags, and TLS certificate.
 */
export async function inspectDomainIntel(domainInput, options = {}) {
  const domain = validatePublicDomain(domainInput);
  const resolver = options.dnsImpl || dns;
  const tlsFn = options.tlsImpl || inspectTlsCertificate;

  const [a, aaaa, mx, txtRaw, ns, dmarcTxt, tlsInfo] = await Promise.all([
    safeDns(() => resolver.resolve4(domain)),
    safeDns(() => resolver.resolve6(domain)),
    safeDns(() => resolver.resolveMx(domain)),
    safeDns(() => resolver.resolveTxt(domain)),
    safeDns(() => resolver.resolveNs(domain)),
    safeDns(() => resolver.resolveTxt(`_dmarc.${domain}`)),
    tlsFn(domain)
  ]);

  const txt = txtRaw.map((chunks) => chunks.join(""));
  const spfRecord = txt.find((t) => t.toLowerCase().startsWith("v=spf1")) || null;
  const dmarcFlat = dmarcTxt.map((chunks) => chunks.join(""));
  const dmarcRecord = dmarcFlat.find((t) => t.toLowerCase().startsWith("v=dmarc1")) || null;

  return {
    domain,
    dns: {
      a,
      aaaa,
      mx: mx.slice().sort((x, y) => x.priority - y.priority),
      ns,
      txt
    },
    emailSecurity: {
      hasSpf: Boolean(spfRecord),
      spfRecord,
      hasDmarc: Boolean(dmarcRecord),
      dmarcRecord
    },
    tls: tlsInfo
  };
}
