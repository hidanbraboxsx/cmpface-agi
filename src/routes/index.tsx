import { createFileRoute } from "@tanstack/react-router";
import { LoanFlow } from "@/components/LoanFlow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Consulta INSS | Simulação de Crédito Consignado" },
      { name: "description", content: "Simulação de crédito consignado para aposentados e pensionistas: estime valores disponíveis com rapidez e segurança." },
      { property: "og:title", content: "Consulta INSS | Simulação de Crédito Consignado" },
      { property: "og:description", content: "Consulte uma estimativa ilustrativa de crédito consignado. Identidade, renda e aprovação dependem de verificação autorizada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoanFlow,
});
