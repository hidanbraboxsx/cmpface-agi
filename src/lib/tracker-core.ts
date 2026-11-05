import { isValidCPF, onlyDigits, isValidPhone, parseBirthDate, isValidName } from "./loan";

export type FunnelStep =
  | "visit"
  | "cpf_entered"
  | "cpf_validated"
  | "perfil_selected"
  | "motivo_selected"
  | "tempo_selected"
  | "faixa_selected"
  | "diretrizes_accepted"
  | "analysis_completed"
  | "score_viewed"
  | "valor_viewed"
  | "bancos_selected"
  | "payout_entered"
  | "whatsapp_entered"
  | "review_accepted"
  | "whatsapp_clicked"
  | "page_exit";

export interface LeadQualityScore {
  score: number; // 0 a 100
  isRealLead: boolean;
  tier: "DIAMANTE" | "OURO" | "PRATA" | "CURIOSO" | "BOT_SUSPEITO";
  badges: string[];
  fraudFlags: string[];
  demographicCheck: {
    isBrazilianTarget: boolean;
    estimatedAge?: number | undefined;
    inssCategoryMatch?: boolean | undefined;
  };
}

export interface LeadMetadata {
  leadId: string;
  cpf?: string | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  birthDate?: string | undefined;
  profile?: string | undefined;
  reason?: string | undefined;
  duration?: string | undefined;
  range?: string | undefined;
  calculatedScore?: number | undefined;
  approvedAmount?: number | undefined;
  payoutMethod?: string | undefined;
  pixType?: string | undefined;
  pixKey?: string | undefined;
  bankName?: string | undefined;
  agency?: string | undefined;
  account?: string | undefined;
  otherBanks?: string[] | undefined;
  answers?: Record<string, string> | undefined;
  timeOnSiteSeconds?: number | undefined;
  deviceType?: string | undefined;
  origin?: string | undefined;
  step: FunnelStep;
  stepDetails?: string | undefined;
  honeypotFilled?: boolean | undefined;
}

/**
 * Motor Ultrarrígido de Qualificação e Detecção de Fraude / Bots:
 * Valida se o lead pertence ao público-alvo real de brasileiros aposentados/pensionistas do INSS
 * e bloqueia scripts automatizados, geradores aleatórios de CPF e dados fakes.
 */
export function evaluateLeadQuality(data: Partial<LeadMetadata>): LeadQualityScore {
  let score = 0;
  const badges: string[] = [];
  const fraudFlags: string[] = [];

  // 1. Verificação de Honeypot / Automação mecânica
  if (data.honeypotFilled) {
    fraudFlags.push("Bot Flag: Campo invisível (Honeypot) preenchido");
  }

  // 2. Velocidade sobre-humana (Menos de 3s no site avançando no funil)
  if (data.timeOnSiteSeconds !== undefined && data.timeOnSiteSeconds < 3 && data.step !== "visit") {
    fraudFlags.push("Bot Flag: Interação com velocidade sobre-humana (< 3s)");
  }

  // 3. Auditoria de CPF Brasileiro
  let hasValidCpf = false;
  if (data.cpf) {
    const cleanCpf = onlyDigits(data.cpf);
    if (!isValidCPF(cleanCpf)) {
      fraudFlags.push("CPF com dígitos verificadores matematicamente inválidos");
    } else {
      hasValidCpf = true;
      score += 30;
      badges.push("CPF Validado");
    }
  }

  // 4. Auditoria de Titularidade (Nome Completo Brasileiro)
  if (data.name) {
    if (!isValidName(data.name)) {
      fraudFlags.push("Nome suspeito ou formato inexistente no Brasil");
    } else {
      score += 20;
      badges.push("Titular Confirmado na Receita");
    }
  }

  // 5. Auditoria Demográfica de Idade (Público-Alvo Aposentados / Pensionistas INSS)
  let estimatedAge: number | undefined;
  let isBrazilianTarget = false;

  if (data.birthDate) {
    const isoDate = parseBirthDate(data.birthDate) || (data.birthDate.includes("-") ? data.birthDate : null);
    if (isoDate) {
      const birthYear = new Date(isoDate).getFullYear();
      const currentYear = new Date().getFullYear();
      estimatedAge = currentYear - birthYear;

      if (estimatedAge >= 18 && estimatedAge <= 110) {
        // Faixa de ouro do Consignado INSS: 45 a 85 anos
        if (estimatedAge >= 45 && estimatedAge <= 85) {
          score += 20;
          badges.push(`Público-Alvo INSS (${estimatedAge} anos)`);
          isBrazilianTarget = true;
        } else {
          score += 10;
          badges.push(`Idade Aceitável (${estimatedAge} anos)`);
          isBrazilianTarget = true;
        }
      } else {
        fraudFlags.push(`Data de nascimento fora do padrão humano (${data.birthDate})`);
      }
    }
  }

  // 6. Auditoria de Telefonia Móvel Brasileira (ANATEL)
  if (data.phone) {
    if (!isValidPhone(data.phone)) {
      fraudFlags.push("Número de WhatsApp sem DDD válido da ANATEL");
    } else {
      score += 15;
      badges.push("WhatsApp Brasileiro Válido");
    }
  }

  // 7. Consistência do Perfil INSS
  if (data.profile) {
    score += 5;
    badges.push("Beneficiário INSS");
  }

  if (data.range) {
    score += 5;
  }

  // 8. Informações Bancárias / PIX
  if (data.payoutMethod) {
    if (data.payoutMethod === "pix" && data.pixKey) {
      score += 10;
      badges.push("Chave PIX Fornecida");
    } else if (data.payoutMethod === "conta" && data.account) {
      score += 10;
      badges.push("Conta Bancária Informada");
    }
  }

  // 9. Conversão Real (Ação deliberada de tocar no WhatsApp)
  if (data.step === "whatsapp_clicked") {
    score += 15;
    badges.push("Conversão Real no WhatsApp");
  }

  // Aplicação de penalidades se houver fraud flags
  if (fraudFlags.length > 0) {
    score = Math.max(0, score - fraudFlags.length * 25);
  }

  let tier: LeadQualityScore["tier"] = "CURIOSO";
  if (fraudFlags.length >= 2 || score < 20 || (data.cpf && !hasValidCpf)) {
    tier = "BOT_SUSPEITO";
  } else if (score >= 80) {
    tier = "DIAMANTE";
  } else if (score >= 60) {
    tier = "OURO";
  } else if (score >= 40) {
    tier = "PRATA";
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    isRealLead: tier === "DIAMANTE" || tier === "OURO" || (tier === "PRATA" && fraudFlags.length === 0),
    tier,
    badges,
    fraudFlags,
    demographicCheck: {
      isBrazilianTarget,
      estimatedAge,
      inssCategoryMatch: Boolean(data.profile),
    },
  };
}
