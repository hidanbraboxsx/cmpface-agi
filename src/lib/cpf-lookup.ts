import { onlyDigits } from "./loan";
import { getConfig } from "./bot-config";

export interface CpfLookupResult {
  success: boolean;
  cpf: string;
  name?: string;
  birthDate?: string;
  status?: string;
  cached?: boolean;
  error?: string;
}

// Cache em memória (memória do servidor / processo)
const memoryCache = new Map<string, { result: CpfLookupResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de cache para economizar créditos

// Gerenciador de Tokens (Pool com Round-Robin e Fallback)
class TokenManager {
  private tokens: string[] = [];
  private currentIndex = 0;

  constructor() {
    this.reloadTokens();
  }

  public reloadTokens() {
    const raw = process.env["HUB_DEVELOPER_TOKENS"] || process.env["HUB_DEVELOPER_TOKEN"] || "";
    const envTokens = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Mescla com tokens adicionados dinamicamente via Telegram
    const dynamicTokens = getConfig ? getConfig().apiTokens : [];

    const allTokens = Array.from(new Set([...envTokens, ...dynamicTokens]));
    this.tokens = allTokens;
  }

  public getTokensCount(): number {
    this.reloadTokens();
    return this.tokens.length;
  }

  public getNextToken(): string | null {
    this.reloadTokens();
    if (this.tokens.length === 0) return null;
    const token = this.tokens[this.currentIndex % this.tokens.length];
    this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
    return token ?? null;
  }

  public getAllTokens(): string[] {
    this.reloadTokens();
    return [...this.tokens];
  }
}

const tokenManager = new TokenManager();

// Formata nome para Title Case (ex: "FULANO DE TAL" -> "Fulano de Tal")
function formatTitleCase(str: string): string {
  const lowercaseWords = new Set(["de", "da", "do", "das", "dos", "e"]);
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && lowercaseWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Consulta o CPF no WebService da Receita Federal (Hub do Desenvolvedor)
 * Suporta pool de tokens para alta disponibilidade e economia máxima de créditos.
 */
export async function lookupCpf(cpfInput: string): Promise<CpfLookupResult> {
  const cleanCpf = onlyDigits(cpfInput);

  if (cleanCpf.length !== 11) {
    return { success: false, cpf: cleanCpf, error: "CPF deve conter 11 dígitos" };
  }

  // 1. Checa Cache em Memória
  const cached = memoryCache.get(cleanCpf);
  if (cached && cached.expiresAt > Date.now()) {
    try {
      const { recordApiQuery } = await import("./system-metrics");
      recordApiQuery("cache", true);
    } catch {}
    return { ...cached.result, cached: true };
  }

  const tokens = tokenManager.getAllTokens();
  if (tokens.length === 0) {
    // Modo simulação se nenhum token estiver configurado
    return {
      success: true,
      cpf: cleanCpf,
      name: "",
      cached: false,
    };
  }

  // 2. Itera pelos tokens disponíveis caso algum esteja sem saldo ou bloqueado
  let lastError = "Não foi possível consultar os dados na Receita Federal.";

  for (const token of tokens) {
    try {
      // Endpoint oficial da API do Hub do Desenvolvedor v2 para CPF (HTTPS seguro)
      const url = `https://ws.hubdodesenvolvedor.com.br/v2/cpf/?cpf=${cleanCpf}&token=${token}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        lastError = `Erro HTTP ${res.status} na consulta.`;
        continue;
      }

      const json = await res.json();

      // Registra consumo do token no sistema de métricas
      try {
        const { recordApiQuery } = await import("./system-metrics");
        recordApiQuery(token, false);
      } catch {}

      // Verifica status de retorno da API
      if (json.return === "OK" && json.result) {
        const rawName = json.result.nome_da_pf || "";
        const formattedName = rawName ? formatTitleCase(rawName) : "";
        const birthDate = json.result.data_nascimento || "";
        const status = json.result.situacao_cadastral || "REGULAR";

        if (status.toUpperCase().includes("FALECIDO")) {
          return {
            success: false,
            cpf: cleanCpf,
            status: "TITULAR FALECIDO",
            error: "Documento com indicação de titular falecido na Receita Federal.",
          };
        }

        const lookupSuccess: CpfLookupResult = {
          success: true,
          cpf: cleanCpf,
          name: formattedName,
          birthDate,
          status,
          cached: false,
        };

        // Salva no cache
        memoryCache.set(cleanCpf, {
          result: lookupSuccess,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return lookupSuccess;
      } else {
        const msg = json.message || "CPF não localizado";
        lastError = msg;

        // Se for erro de token, tenta o próximo token da lista
        if (msg.includes("Token") || msg.includes("Limite") || msg.includes("saldo")) {
          continue;
        }

        // Se o CPF for realmente inválido ou não existir, encerra
        if (msg.includes("CPF Inválido")) {
          return { success: false, cpf: cleanCpf, error: "CPF não encontrado na base de dados da Receita Federal." };
        }
      }
    } catch (err: unknown) {
      const e = err as Error;
      lastError = e.name === "AbortError" ? "Tempo limite de resposta excedido." : e.message;
    }
  }

  // Se todos os tokens falharam ou nenhum retornou sucesso, retorna fallback gracioso
  return {
    success: false,
    cpf: cleanCpf,
    error: lastError,
  };
}
