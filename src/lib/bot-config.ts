// Configurações Dinâmicas Gerenciadas pelo Bot do Telegram (Admin Supremo)
export interface DynamicConfig {
  whatsappNumber: string;
  managerName: string;
  managerAvatarUrl: string;
  companyYears: number;
  apiTokens: string[];
}

import fs from "fs";
import path from "path";

// Caminho do arquivo de persistência (no Vercel / serverless usa /tmp que é gravável)
const CONFIG_FILE =
  typeof process !== "undefined" && (process.env["VERCEL"] || process.env["AWS_LAMBDA_FUNCTION_NAME"])
    ? path.resolve("/tmp", ".bot-config.json")
    : path.resolve(process.cwd(), ".bot-config.json");

function loadPersistedConfig(): Partial<DynamicConfig> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("[Bot Config] Falha ao carregar .bot-config.json local:", e);
  }
  return {};
}

function savePersistedConfig(cfg: DynamicConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("[Bot Config] Falha ao salvar .bot-config.json local:", e);
  }
}

const persisted = loadPersistedConfig();

const activeConfig: DynamicConfig = {
  whatsappNumber: persisted.whatsappNumber || "5518982719536",
  managerName: persisted.managerName || "Lucas Cardoso",
  managerAvatarUrl: persisted.managerAvatarUrl || "/images/agi/manager.jpg",
  companyYears: persisted.companyYears || new Date().getFullYear(),
  apiTokens: persisted.apiTokens || [],
};

// Inicializa tokens a partir do process.env caso existam e não estejam no arquivo
if (typeof process !== "undefined" && process.env) {
  const envTokens = (
    process.env["HUB_DEVELOPER_TOKENS"] ||
    process.env["HUB_DEVELOPER_TOKEN"] ||
    ""
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (envTokens.length > 0 && activeConfig.apiTokens.length === 0) {
    activeConfig.apiTokens = envTokens;
  }
}

// ---------------------------------------------------------------------------
// Persistência em Nuvem via Telegram Cloud Storage (setMyDescription isolado)
// Utiliza language_code: "ia" (Interlingua) para não poluir a descrição pública
// ---------------------------------------------------------------------------
const STORAGE_LANG = "ia";
let lastCloudSyncTime = 0;
const CLOUD_CACHE_TTL_MS = 15_000; // 15 segundos de cache em memória

export async function syncConfigToTelegramCloud(cfg: DynamicConfig): Promise<boolean> {
  const token = typeof process !== "undefined" ? process.env?.["TELEGRAM_BOT_TOKEN"]?.trim() : undefined;
  if (!token) return false;

  const payload = JSON.stringify({
    w: cfg.whatsappNumber,
    m: cfg.managerName,
    a: cfg.managerAvatarUrl,
    y: cfg.companyYears,
    t: cfg.apiTokens.slice(0, 5), // Preserva os tokens principais
  });

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: payload,
        language_code: STORAGE_LANG,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.error("[Bot Config Cloud] Erro no setMyDescription:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Bot Config Cloud] Falha ao enviar para Telegram Cloud:", err);
    return false;
  }
}

export async function fetchConfigFromTelegramCloud(): Promise<Partial<DynamicConfig> | null> {
  const token = typeof process !== "undefined" ? process.env?.["TELEGRAM_BOT_TOKEN"]?.trim() : undefined;
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMyDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language_code: STORAGE_LANG }),
    });
    const data = (await res.json()) as { ok?: boolean; result?: { description?: string } };
    if (data.ok && data.result?.description) {
      const parsed = JSON.parse(data.result.description) as {
        w?: string;
        m?: string;
        a?: string;
        y?: number;
        t?: string[];
      };
      const result: Partial<DynamicConfig> = {};
      if (parsed.w) result.whatsappNumber = parsed.w;
      if (parsed.m) result.managerName = parsed.m;
      if (parsed.a) result.managerAvatarUrl = parsed.a;
      if (parsed.y) result.companyYears = parsed.y;
      if (Array.isArray(parsed.t)) result.apiTokens = parsed.t;
      return result;
    }
  } catch (err) {
    console.error("[Bot Config Cloud] Falha ao carregar do Telegram Cloud:", err);
  }
  return null;
}

export function getConfig(): DynamicConfig {
  return { ...activeConfig };
}

export async function getConfigAsync(): Promise<DynamicConfig> {
  const now = Date.now();
  if (now - lastCloudSyncTime < CLOUD_CACHE_TTL_MS) {
    return { ...activeConfig };
  }

  const cloud = await fetchConfigFromTelegramCloud();
  if (cloud) {
    if (cloud.whatsappNumber) activeConfig.whatsappNumber = cloud.whatsappNumber;
    if (cloud.managerName) activeConfig.managerName = cloud.managerName;
    if (cloud.managerAvatarUrl) activeConfig.managerAvatarUrl = cloud.managerAvatarUrl;
    if (cloud.companyYears) activeConfig.companyYears = cloud.companyYears;
    if (cloud.apiTokens && cloud.apiTokens.length > 0) activeConfig.apiTokens = cloud.apiTokens;
    lastCloudSyncTime = now;
    savePersistedConfig(activeConfig);
  }

  return { ...activeConfig };
}

export function updateConfig(partial: Partial<DynamicConfig>): DynamicConfig {
  if (partial.whatsappNumber !== undefined) activeConfig.whatsappNumber = partial.whatsappNumber;
  if (partial.managerName !== undefined) activeConfig.managerName = partial.managerName;
  if (partial.managerAvatarUrl !== undefined)
    activeConfig.managerAvatarUrl = partial.managerAvatarUrl;
  if (partial.companyYears !== undefined) activeConfig.companyYears = partial.companyYears;
  if (partial.apiTokens !== undefined) activeConfig.apiTokens = [...partial.apiTokens];
  
  savePersistedConfig(activeConfig);
  lastCloudSyncTime = Date.now();
  
  // Sincroniza em background com a Nuvem Telegram
  syncConfigToTelegramCloud(activeConfig).catch(() => {});
  return { ...activeConfig };
}

export async function updateConfigAsync(partial: Partial<DynamicConfig>): Promise<DynamicConfig> {
  const updated = updateConfig(partial);
  await syncConfigToTelegramCloud(updated);
  return updated;
}

export function addApiToken(token: string): string[] {
  const clean = token.trim();
  if (clean && !activeConfig.apiTokens.includes(clean)) {
    activeConfig.apiTokens.push(clean);
    savePersistedConfig(activeConfig);
    syncConfigToTelegramCloud(activeConfig).catch(() => {});
  }
  return [...activeConfig.apiTokens];
}

export function removeApiToken(token: string): string[] {
  activeConfig.apiTokens = activeConfig.apiTokens.filter((t) => t !== token.trim());
  savePersistedConfig(activeConfig);
  syncConfigToTelegramCloud(activeConfig).catch(() => {});
  return [...activeConfig.apiTokens];
}
