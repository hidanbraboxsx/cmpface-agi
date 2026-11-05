import { createFileRoute } from "@tanstack/react-router";
import { LoanFlow } from "@/components/LoanFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Consulta INSS | Simulação de Crédito Consignado" },
      { name: "description", content: "Simulação independente para aposentados e pensionistas: estime valores de crédito consignado, sujeitos a análise autorizada." },
      { property: "og:title", content: "Consulta INSS | Simulação de Crédito Consignado" },
      { property: "og:description", content: "Consulte uma estimativa ilustrativa de crédito consignado. Identidade, renda e aprovação dependem de verificação autorizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoanFlow,
});
