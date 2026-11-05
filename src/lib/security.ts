/**
 * Security Engine: WAF filters, In-Memory Rate Limiting, Threat Detection & Scanner Defenses.
 */

type ClientRecord = {
  count: number;
  resetAt: number;
  blockedUntil?: number;
};

const store = new Map<string, ClientRecord>();
const blacklistedIps = new Set<string>();

// Auto clean-up stale records
const timer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetAt <= now && (!record.blockedUntil || record.blockedUntil <= now)) {
      store.delete(key);
    }
  }
}, 3 * 60 * 1000);

if (typeof timer === "object" && timer && "unref" in timer && typeof timer.unref === "function") {
  timer.unref();
}

export type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  blockDurationMs?: number;
};

/**
 * Checks if request matches common bot probing, vulnerability scanners, or path traversal.
 */
const MALICIOUS_PATTERNS = [
  /\.(env|git|svn|bak|backup|config|sql|tar|gz|zip|rar|yml|yaml|ini|log|sqlite|db)$/i,
  /(wp-admin|wp-login|xmlrpc|phpmyadmin|pma|adminer|actuator|\/cgi-bin\/|\.aws\/|\.ssh\/)/i,
  /(\.\.\/|\.\.\\)/,
  /(etc\/passwd|proc\/self\/environ|win\.ini|boot\.ini)/i,
  /(eval\(|<script|alert\(|union\s+select|information_schema|benchmark\(|pg_sleep)/i,
  /(honeypot|\.php|\.asp|\.aspx|\.jsp|\.cgi|telescope|swagger|openapi\.json)/i,
];

const SUSPICIOUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /acunetix/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /wprecon/i,
  /dirbuster/i,
  /gobuster/i,
  /python-requests/i,
  /aiohttp/i,
  /curl/i,
  /wget/i,
  /httpx/i,
  /scrapy/i,
  /burp/i,
  /nuclei/i,
  /nessus/i,
  /postman/i,
];

export function detectMaliciousPayloadOrScanner(url: URL, request: Request): { malicious: boolean; reason?: string } {
  const pathAndQuery = `${url.pathname}${url.search}`;
  
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(pathAndQuery)) {
      return { malicious: true, reason: `Suspicious target signature: ${pathAndQuery.slice(0, 50)}` };
    }
  }

  const userAgent = request.headers.get("user-agent") || "";
  // Check scanners only on automated probes or if no referer/browser headers exist
  for (const botPattern of SUSPICIOUS_USER_AGENTS) {
    if (botPattern.test(userAgent)) {
      return { malicious: true, reason: `Automated scanner/exploit tool: ${userAgent.slice(0, 30)}` };
    }
  }

  return { malicious: false };
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60_000, maxRequests: 120, blockDurationMs: 300_000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = store.get(identifier);

  if (blacklistedIps.has(identifier)) {
    return { allowed: false, remaining: 0, resetAt: now + 3600_000 };
  }

  if (record && record.blockedUntil && record.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.blockedUntil,
    };
  }

  if (!record || record.resetAt <= now) {
    const newRecord: ClientRecord = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    store.set(identifier, newRecord);
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: newRecord.resetAt,
    };
  }

  if (record.count >= options.maxRequests) {
    // Escalate to temporary ban if flood continues
    if (record.count > options.maxRequests * 1.5) {
      record.blockedUntil = now + (options.blockDurationMs || 300_000);
    }
    record.count += 1;
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.blockedUntil || record.resetAt,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

export function extractClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",");
    const client = parts[0]?.trim();
    if (client) return client;
  }

  return "anonymous-client";
}

export function extractCountry(request: Request): string | null {
  const cfCountry = request.headers.get("cf-ipcountry");
  if (cfCountry) return cfCountry.toUpperCase().trim();

  const xCountry = request.headers.get("x-country-code");
  if (xCountry) return xCountry.toUpperCase().trim();

  return null;
}

/**
 * Checks if the request originated from Brazil when deployed behind Cloudflare or edge proxy.
 * If header is missing (e.g. local dev), it passes through smoothly.
 */
export function isBrazilianTraffic(request: Request): boolean {
  const country = extractCountry(request);
  if (!country) return true; // Local development or proxy without geo headers
  return country === "BR";
}
