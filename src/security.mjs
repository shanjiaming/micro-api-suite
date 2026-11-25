const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i
];

/**
 * Validate a public HTTP/HTTPS URL and block private/internal hosts.
 */
export function validatePublicUrl(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Missing or empty url parameter");
  }
  const raw = input.trim();
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid URL format");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS protocols are supported");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || !hostname.includes(".")) {
    throw new Error("Invalid hostname");
  }
  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error("Private or internal hostnames are not allowed");
    }
  }
  return parsed.toString();
}

/**
 * Validate and normalize a public domain name.
 */
export function validatePublicDomain(input) {
  const url = validatePublicUrl(input);
  return new URL(url).hostname.toLowerCase();
}
