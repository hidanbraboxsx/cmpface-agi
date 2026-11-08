import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  checkRateLimit,
  extractClientIp,
  detectMaliciousPayloadOrScanner,
  isBrazilianTraffic,
  isDirectIpAccess,
  banIp,
  isIpBanned,
} from "./lib/security";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as {
      unhandled?: unknown;
      message?: unknown;
      error?: unknown;
      status?: unknown;
    };
    return (
      payload.unhandled === true ||
      (payload.error === true && payload.status === 500) ||
      payload.message === "HTTPError"
    );
  } catch {
    return false;
  }
}

function applySecurityHeaders(headers: Headers): void {
  // Prevent clickjacking & framing attacks (anti-copy and anti-phishing)
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()",
  );

  // Content Security Policy against unauthorized injected scripts and asset theft
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https:; frame-ancestors 'none';",
  );

  // Mask and camouflage server identity & environment stack (Disguise host as Cloudflare edge)
  headers.delete("X-Powered-By");
  headers.delete("x-nitro-version");
  headers.delete("x-powered-by");
  headers.delete("x-runtime");
  headers.delete("Via");
  headers.delete("Server");
  headers.set("Server", "cloudflare");
}

let hasAutoSetupWebhook = false;

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const clientIp = extractClientIp(request);
      const url = new URL(request.url);

      // Auto-registra o webhook no Telegram silenciosamente na inicialização/primeiro acesso
      if (!hasAutoSetupWebhook && typeof process !== "undefined" && process.env?.["TELEGRAM_BOT_TOKEN"]) {
        hasAutoSetupWebhook = true;
        import("./lib/telegram-webhook")
          .then((m) => m.setupTelegramWebhook(url.origin))
          .catch(() => {});
      }

      // 1. Blacklist check: Bloqueia imediatamente IPs marcados como atacantes
      if (isIpBanned(clientIp)) {
        return new Response("Forbidden", {
          status: 403,
          headers: {
            "Content-Type": "text/plain",
            Server: "cloudflare",
          },
        });
      }

      // 2. Proteção contra varredura de portas e detecção de IP da host:
      // Se a requisição veio direto para o IP bruto da máquina (sem hostname/domínio válido),
      // é um scanner automatizado (Shodan, Masscan, Nmap, Censys). Bloqueia e camufla.
      if (isDirectIpAccess(request)) {
        banIp(clientIp);
        return new Response("Not Found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
            Server: "cloudflare",
          },
        });
      }

      // 3. WAF: Detecção de scanners de portas, explorações de vulnerabilidades e path traversal
      const threat = detectMaliciousPayloadOrScanner(url, request);
      if (threat.malicious) {
        banIp(clientIp);
        return new Response("Not Found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
            Server: "cloudflare",
          },
        });
      }

      // 4. Geo-restriction shield: Assegura tráfego originado do Brasil (quando atrás de CDN/Edge)
      const isTelegramWebhook = url.pathname === "/api/telegram-webhook";
      if (!isTelegramWebhook && !isBrazilianTraffic(request)) {
        return new Response("Acesso restrito ao território nacional.", {
          status: 403,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            Server: "cloudflare",
          },
        });
      }

      // 5. Webhook do Telegram para receber comandos do Admin (/whatsapp, /nome, /add_token, etc)
      if (isTelegramWebhook) {
        if (request.method === "POST") {
          try {
            const { handleTelegramUpdate } = await import("./lib/telegram-webhook");
            const body = (await request.json()) as Parameters<typeof handleTelegramUpdate>[0];
            await handleTelegramUpdate(body);
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (e) {
            console.error("[Telegram Webhook] Erro ao processar POST:", e);
            return new Response(JSON.stringify({ ok: false, error: String(e) }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        if (request.method === "GET") {
          const { setupTelegramWebhook } = await import("./lib/telegram-webhook");
          const { getConfig } = await import("./lib/bot-config");
          const setupResult = await setupTelegramWebhook(url.origin);
          const currentConfig = getConfig();
          return new Response(
            JSON.stringify(
              {
                status: "online",
                message: "Webhook do Telegram ativo e sincronizado!",
                setup: setupResult,
                config: currentConfig,
              },
              null,
              2,
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json; charset=utf-8" },
            },
          );
        }
      }

      // 6. Mitigação DDoS Camada 7 & Anti-Abuso
      const isApiOrPost = request.method !== "POST" ? false : true;
      const isServerFn = url.pathname.includes("/_serverFn");

      const limitRule =
        isServerFn || isApiOrPost
          ? { windowMs: 60_000, maxRequests: 45, blockDurationMs: 600_000 } // Anti-Bruteforce
          : { windowMs: 60_000, maxRequests: 180, blockDurationMs: 300_000 }; // Anti-Scraping

      const rateCheck = checkRateLimit(
        `${clientIp}:${isServerFn ? "fn" : request.method}`,
        limitRule,
      );

      if (!rateCheck.allowed) {
        return new Response("Too Many Requests. Connection restricted.", {
          status: 429,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Retry-After": Math.ceil((rateCheck.resetAt - Date.now()) / 1000).toString(),
            "X-Content-Type-Options": "nosniff",
            Server: "cloudflare",
          },
        });
      }

      const handler = await getServerEntry();
      const rawResponse = await handler.fetch(request, env, ctx);
      const response = await normalizeCatastrophicSsrResponse(rawResponse);

      const secureHeaders = new Headers(response.headers);
      applySecurityHeaders(secureHeaders);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: secureHeaders,
      });
    } catch (error) {
      console.error(error);
      const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
      applySecurityHeaders(headers);
      return new Response(renderErrorPage(), {
        status: 500,
        headers,
      });
    }
  },
};
