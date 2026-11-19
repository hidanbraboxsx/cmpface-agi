// Configurações Dinâmicas Gerenciadas pelo Bot do Telegram (Admin Supremo)
// Cloudflare Workers — sem filesystem. Estado mantido em memória do isolate
// (persiste enquanto o worker está quente) + env vars como defaults.

export interface DynamicConfig {
  whatsappNumber: string;
  managerName: string;
  managerAvatarUrl: string;
  companyYears: number;
  apiTokens: string[];
}

// ─── Estado global no isolate (sobrevive entre requests no mesmo worker) ───
const _cfg: DynamicConfig = {
  whatsappNumber: "",
  managerName: "",
  managerAvatarUrl: "",
  companyYears: 0,
  apiTokens: [],
};

let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  _initialized = true;

  // Lê env vars como valores iniciais (definidos na Cloudflare dashboard)
  const env: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};

  _cfg.whatsappNumber =
    (env["MANAGER_WHATSAPP"] || env["DEFAULT_WHATSAPP"] || "5518982719536").trim();

  _cfg.managerName =
    (env["MANAGER_NAME"] || "Lucas Cardoso").trim();

  _cfg.managerAvatarUrl =
    (env["MANAGER_AVATAR_URL"] || "/images/agi/manager.jpg").trim();

  _cfg.companyYears =
    parseInt(env["COMPANY_YEAR"] || String(new Date().getFullYear()), 10);

  const rawTokens = env["HUB_DEVELOPER_TOKENS"] || env["HUB_DEVELOPER_TOKEN"] || "";
  _cfg.apiTokens = rawTokens
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function getConfig(): DynamicConfig {
  ensureInit();
  return { ..._cfg, apiTokens: [..._cfg.apiTokens] };
}

export function updateConfig(partial: Partial<DynamicConfig>): DynamicConfig {
  ensureInit();
  if (partial.whatsappNumber !== undefined) _cfg.whatsappNumber = partial.whatsappNumber;
  if (partial.managerName    !== undefined) _cfg.managerName    = partial.managerName;
  if (partial.managerAvatarUrl !== undefined) _cfg.managerAvatarUrl = partial.managerAvatarUrl;
  if (partial.companyYears   !== undefined) _cfg.companyYears   = partial.companyYears;
  if (partial.apiTokens      !== undefined) _cfg.apiTokens      = [...partial.apiTokens];
  return getConfig();
}

export function addApiToken(token: string): string[] {
  ensureInit();
  const clean = token.trim();
  if (clean && !_cfg.apiTokens.includes(clean)) {
    _cfg.apiTokens.push(clean);
  }
  return [..._cfg.apiTokens];
}

export function removeApiToken(token: string): string[] {
  ensureInit();
  _cfg.apiTokens = _cfg.apiTokens.filter((t) => t !== token.trim());
  return [..._cfg.apiTokens];
}
