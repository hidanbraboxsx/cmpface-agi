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
    console.error("[Bot Config] Falha ao carregar .bot-config.json:", e);
  }
  return {};
}

function savePersistedConfig(cfg: DynamicConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("[Bot Config] Falha ao salvar .bot-config.json:", e);
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

export function getConfig(): DynamicConfig {
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
  return { ...activeConfig };
}

export function addApiToken(token: string): string[] {
  const clean = token.trim();
  if (clean && !activeConfig.apiTokens.includes(clean)) {
    activeConfig.apiTokens.push(clean);
    savePersistedConfig(activeConfig);
  }
  return [...activeConfig.apiTokens];
}

export function removeApiToken(token: string): string[] {
  activeConfig.apiTokens = activeConfig.apiTokens.filter((t) => t !== token.trim());
  savePersistedConfig(activeConfig);
  return [...activeConfig.apiTokens];
}
