import fs from "fs";
import path from "path";

export interface SystemMetrics {
  totalVisits: number; // Entradas totais no site
  totalAbandons: number; // Saídas / abandono de página
  abandonsByStep: Record<string, number>; // Saídas detalhadas por etapa do funil
  totalSimulations: number; // Simulações iniciadas
  totalProposals: number; // Propostas calculadas com score
  totalConversions: number; // Leads que clicaram no WhatsApp (Conversão Real)
  totalRevenueGenerated: number; // Renda pré-aprovada gerada (R$)
  totalRevenueConfirmed: number; // Renda de leads que avançaram para WhatsApp (R$)
  apiQueriesCount: number; // Total de consultas executadas na Receita
  apiCachedQueriesCount: number; // Consultas servidas do cache (custo R$ 0,00)
  apiCostPerQuery: number; // Valor da taxa da API do Hub (ex: R$ 0,05)
  tokenUsage: Record<string, { queries: number; costPaid: number }>;
  lastUpdated: string;
}

const METRICS_FILE = path.resolve(process.cwd(), ".system-metrics.json");

function getInitialMetrics(): SystemMetrics {
  return {
    totalVisits: 0,
    totalAbandons: 0,
    abandonsByStep: {},
    totalSimulations: 0,
    totalProposals: 0,
    totalConversions: 0,
    totalRevenueGenerated: 0,
    totalRevenueConfirmed: 0,
    apiQueriesCount: 0,
    apiCachedQueriesCount: 0,
    apiCostPerQuery: 0.05, // Taxa média por consulta no Hub do Desenvolvedor
    tokenUsage: {},
    lastUpdated: new Date().toISOString(),
  };
}

let activeMetrics: SystemMetrics = getInitialMetrics();

// Carrega métricas salvas em disco
try {
  if (fs.existsSync(METRICS_FILE)) {
    const raw = fs.readFileSync(METRICS_FILE, "utf-8");
    activeMetrics = { ...getInitialMetrics(), ...JSON.parse(raw) };
  }
} catch (e) {
  console.error("[System Metrics] Erro ao carregar métricas persistidas:", e);
}

function persistMetrics() {
  try {
    activeMetrics.lastUpdated = new Date().toISOString();
    fs.writeFileSync(METRICS_FILE, JSON.stringify(activeMetrics, null, 2), "utf-8");
  } catch (e) {
    console.error("[System Metrics] Erro ao salvar métricas:", e);
  }
}

export function getMetrics(): SystemMetrics {
  return { ...activeMetrics };
}

export function recordVisit() {
  activeMetrics.totalVisits += 1;
  persistMetrics();
}

export function recordAbandon(step?: string) {
  activeMetrics.totalAbandons += 1;
  if (step) {
    activeMetrics.abandonsByStep[step] = (activeMetrics.abandonsByStep[step] || 0) + 1;
  }
  persistMetrics();
}

export function recordSimulation() {
  activeMetrics.totalSimulations += 1;
  persistMetrics();
}

export function recordProposal(amount: number) {
  activeMetrics.totalProposals += 1;
  if (amount > 0) {
    activeMetrics.totalRevenueGenerated += amount;
  }
  persistMetrics();
}

export function recordConversion(confirmedAmount?: number) {
  activeMetrics.totalConversions += 1;
  if (confirmedAmount && confirmedAmount > 0) {
    activeMetrics.totalRevenueConfirmed += confirmedAmount;
  }
  persistMetrics();
}

export function recordApiQuery(token: string, wasCached: boolean) {
  activeMetrics.apiQueriesCount += 1;
  if (wasCached) {
    activeMetrics.apiCachedQueriesCount += 1;
  } else {
    const cleanToken = token.trim().slice(0, 12) + "...";
    if (!activeMetrics.tokenUsage[cleanToken]) {
      activeMetrics.tokenUsage[cleanToken] = { queries: 0, costPaid: 0 };
    }
    activeMetrics.tokenUsage[cleanToken].queries += 1;
    activeMetrics.tokenUsage[cleanToken].costPaid = Number(
      (activeMetrics.tokenUsage[cleanToken].queries * activeMetrics.apiCostPerQuery).toFixed(2)
    );
  }
  persistMetrics();
}

export function resetMetrics() {
  activeMetrics = getInitialMetrics();
  persistMetrics();
  return activeMetrics;
}
