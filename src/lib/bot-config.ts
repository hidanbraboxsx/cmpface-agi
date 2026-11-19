// Configurações Dinâmicas Gerenciadas pelo Bot do Telegram (Admin Supremo)
// Sincronização 100% em Nuvem via Telegram Cloud Storage (setMyDescription / getMyDescription).
// Isso garante sincronia instantânea e permanente entre todos os containers Vercel/Cloudflare e o admin.

export interface DynamicConfig {
  whatsappNumber: string;
  managerName: string;
  managerAvatarUrl: string;
  companyYears: number;
  apiTokens: string[];
}

// ─── Defaults de fallback ───
const DEFAULT_CONFIG: DynamicConfig = {
  whatsappNumber: "5518982719536",
  managerName: "Lucas Cardoso",
  managerAvatarUrl: "/images/agi/manager.jpg",
  companyYears: new Date().getFullYear(),
  apiTokens: [],
};

// Cache em memória do isolate para alta performance
let _cachedConfig: DynamicConfig = { ...DEFAULT_CONFIG };
let _lastFetchTime = 0;
const CACHE_TTL_MS = 10_000; // 10 segundos de cache para ultra-velocidade sem sobrecarregar Telegram

function getEnvTokens(): string[] {
  const env: Record<string, string | undefined> =
    typeof process !== "undefined" && process.env ? process.env : {};
  const raw = env["HUB_DEVELOPER_TOKENS"] || env["HUB_DEVELOPER_TOKEN"] || "";
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ─── Busca síncrona imediata (do cache rápido) ───
export function getConfig(): DynamicConfig {
  // Dispara refresh em background se o cache expirou
  if (Date.now() - _lastFetchTime > CACHE_TTL_MS) {
    refreshFromTelegramCloud().catch(() => {});
  }
  return { ..._cachedConfig, apiTokens: [..._cachedConfig.apiTokens] };
}

// ─── Busca assíncrona garantida (usada pelas Server Functions e APIs) ───
export async function getConfigAsync(): Promise<DynamicConfig> {
  const now = Date.now();
  if (now - _lastFetchTime < CACHE_TTL_MS && _cachedConfig.whatsappNumber) {
    return { ..._cachedConfig, apiTokens: [..._cachedConfig.apiTokens] };
  }
  await refreshFromTelegramCloud();
  return { ..._cachedConfig, apiTokens: [..._cachedConfig.apiTokens] };
}

// ─── Lê dados salvos na nuvem do Telegram ───
async function refreshFromTelegramCloud(): Promise<void> {
  const token = typeof process !== "undefined" && process.env ? process.env["TELEGRAM_BOT_TOKEN"] : undefined;
  if (!token) {
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMyDescription`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as { ok: boolean; result?: { description?: string } };

    if (json.ok && json.result?.description) {
      try {
        const parsed = JSON.parse(json.result.description);
        if (parsed && typeof parsed === "object") {
          if (parsed.whatsappNumber) _cachedConfig.whatsappNumber = String(parsed.whatsappNumber);
          if (parsed.managerName) _cachedConfig.managerName = String(parsed.managerName);
          if (parsed.managerAvatarUrl) _cachedConfig.managerAvatarUrl = String(parsed.managerAvatarUrl);
          if (parsed.companyYears) _cachedConfig.companyYears = Number(parsed.companyYears);
          if (Array.isArray(parsed.apiTokens) && parsed.apiTokens.length > 0) {
            _cachedConfig.apiTokens = parsed.apiTokens;
          }
        }
      } catch {
        // Se a descrição for texto puro, ignora
      }
    }
  } catch (err) {
    console.error("[Bot Config] Falha ao consultar Telegram Cloud:", err);
  }

  // Inicializa tokens de env se vazios
  if (_cachedConfig.apiTokens.length === 0) {
    _cachedConfig.apiTokens = getEnvTokens();
  }

  _lastFetchTime = Date.now();
}

// ─── Salva dados na nuvem do Telegram (Persistência Global Instantânea) ───
export function updateConfig(partial: Partial<DynamicConfig>): DynamicConfig {
  if (partial.whatsappNumber !== undefined) _cachedConfig.whatsappNumber = partial.whatsappNumber;
  if (partial.managerName !== undefined) _cachedConfig.managerName = partial.managerName;
  if (partial.managerAvatarUrl !== undefined) _cachedConfig.managerAvatarUrl = partial.managerAvatarUrl;
  if (partial.companyYears !== undefined) _cachedConfig.companyYears = partial.companyYears;
  if (partial.apiTokens !== undefined) _cachedConfig.apiTokens = [...partial.apiTokens];

  _lastFetchTime = Date.now();

  // Persiste no Telegram Cloud assincronamente
  persistToTelegramCloud(_cachedConfig).catch((err) => {
    console.error("[Bot Config] Erro ao persistir no Telegram Cloud:", err);
  });

  return getConfig();
}

async function persistToTelegramCloud(cfg: DynamicConfig): Promise<void> {
  const token = typeof process !== "undefined" && process.env ? process.env["TELEGRAM_BOT_TOKEN"] : undefined;
  if (!token) return;

  const dataToStore = {
    whatsappNumber: cfg.whatsappNumber,
    managerName: cfg.managerName,
    managerAvatarUrl: cfg.managerAvatarUrl,
    companyYears: cfg.companyYears,
    apiTokens: cfg.apiTokens,
  };

  const serialized = JSON.stringify(dataToStore);

  await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: serialized }),
  });
}

export function addApiToken(token: string): string[] {
  const clean = token.trim();
  if (clean && !_cachedConfig.apiTokens.includes(clean)) {
    _cachedConfig.apiTokens.push(clean);
    updateConfig({ apiTokens: _cachedConfig.apiTokens });
  }
  return [..._cachedConfig.apiTokens];
}

export function removeApiToken(token: string): string[] {
  _cachedConfig.apiTokens = _cachedConfig.apiTokens.filter((t) => t !== token.trim());
  updateConfig({ apiTokens: _cachedConfig.apiTokens });
  return [..._cachedConfig.apiTokens];
}
