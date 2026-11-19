import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Clock,
  FileCheck2, Loader2, Lock, MessageCircle, Phone, ShieldCheck, Sparkles,
  TrendingUp, UserRound, Wallet, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const logoAsset = { url: "/images/agi/agi-image.png" };
const symbolAsset = { url: "/images/agi/agi-image-2.png" };
const cardsAsset = { url: "/images/agi/agi-image-3.png" };
const managerImg = "/images/agi/manager.jpg";

import { evaluateInquiry, submitInquiry, getPublicConfig } from "@/lib/inquiry.functions";
import { pixel } from "@/lib/pixel-tracker";
import { ScoreGauge } from "./ScoreGauge";
import {
  DURATIONS, PROFILES, RANGES, REASONS, brl,
  isValidCPF, isValidPhone, maskCPF, maskPhone, onlyDigits,
  scoreLabel, type Duration, type Profile, type Range, type Reason,
} from "@/lib/loan";

// ─────────────────────────────────────────────────────────────
// Step & Order definitions
// ─────────────────────────────────────────────────────────────

type Step =
  | "welcome"
  // Etapa 1 — Dados
  | "dados"
  // Etapa 2 — Perfil (sub-steps navegados internamente)
  | "perfil"
  // Etapa 3 — Simulação
  | "analise" | "score" | "resultado"
  // Etapa 4 — Gerente
  | "gerente";

const ORDER: Step[] = ["welcome", "dados", "perfil", "analise", "score", "resultado", "gerente"];

// ─────────────────────────────────────────────────────────────
// Stage bar — 4 etapas visíveis para o lead
// ─────────────────────────────────────────────────────────────
const STAGES: { label: string; steps: Step[] }[] = [
  { label: "Seus Dados",   steps: ["dados"] },
  { label: "Seu Perfil",   steps: ["perfil"] },
  { label: "Simulação",    steps: ["analise", "score", "resultado"] },
  { label: "Falar com Gerente", steps: ["gerente"] },
];

// ─────────────────────────────────────────────────────────────
// Perfil sub-steps (gerenciados internamente no step "perfil")
// Reduzido para 2 passos ultra-rápidos e inteligentes
// ─────────────────────────────────────────────────────────────
type PerfilSub = "tipo" | "faixa";
const PERFIL_SUBS: PerfilSub[] = ["tipo", "faixa"];

export function LoanFlow() {
  // ── Navigation
  const [step, setStep] = useState<Step>("welcome");
  const [perfilSub, setPerfilSub] = useState<PerfilSub>("tipo");

  // ── Lead data
  const [cpf, setCpf]       = useState("");
  const [phone, setPhone]   = useState("");
  const [name, setName]     = useState("");
  const [protocol, setProtocol] = useState("");

  // ── Perfil answers
  const [profile,  setProfile]  = useState<Profile  | null>(null);
  const [reason,   setReason]   = useState<Reason   | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [range,    setRange]    = useState<Range    | null>(null);

  // ── Simulation result
  const [result, setResult] = useState<{ score: number; amount: number } | null>(null);

  // ── Errors
  const [dadosErr, setDadosErr] = useState<{ cpf?: string; phone?: string }>({});

  // ── Config from admin bot
  const [managerName,     setManagerName]     = useState("Lucas Cardoso");
  const [managerWhatsapp, setManagerWhatsapp] = useState("5518982719536");
  const [managerAvatar,   setManagerAvatar]   = useState(managerImg);

  // ── Server fns
  const evaluate        = useServerFn(evaluateInquiry);
  const submitApplication = useServerFn(submitInquiry);
  const loadConfig      = useServerFn(getPublicConfig);

  // Load admin config on mount
  useEffect(() => {
    loadConfig().then((cfg) => {
      if (!cfg) return;
      if (cfg.managerName)      setManagerName(cfg.managerName);
      if (cfg.whatsappNumber)   setManagerWhatsapp(cfg.whatsappNumber);
      if (cfg.managerAvatarUrl) setManagerAvatar(cfg.managerAvatarUrl);
    }).catch(() => {});
  }, []);

  // ── Navigation helpers
  const idx    = ORDER.indexOf(step);
  const go     = (s: Step) => { setStep(s); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const back = () => {
    if (step === "perfil") {
      const si = PERFIL_SUBS.indexOf(perfilSub);
      if (si > 0) { setPerfilSub(PERFIL_SUBS[si - 1]!); return; }
      go("dados"); return;
    }
    if (step === "analise" || step === "score") { go("perfil"); setPerfilSub("faixa"); return; }
    if (step === "resultado") { go("score"); return; }
    const prev = ORDER[Math.max(0, idx - 1)] ?? "welcome";
    go(prev);
  };

  const fail = (msg: string) => toast.error(msg);

  // ── Step 1: Dados submit
  const submitDados = () => {
    if (!isValidCPF(cpf)) {
      setDadosErr({ cpf: "CPF inválido. Confira os números digitados." });
      return;
    }
    setDadosErr({});
    pixel.updateData({ cpf: onlyDigits(cpf) });
    pixel.track("cpf_entered", { cpf: onlyDigits(cpf), stepDetails: "CPF do titular informado." });
    go("perfil");
    setPerfilSub("tipo");
  };

  // ── Step 2: Perfil — advance sub-step (2 passos inteligentes para máxima conversão)
  const pickPerfil = (v: Profile) => {
    setProfile(v);
    const inferredReason: Reason = v === "pensionista" ? "pensao_morte" : "idade";
    setReason(inferredReason);
    setDuration("3a5");
    setPerfilSub("faixa");
  };

  const pickFaixa = (v: Range) => {
    setRange(v);
    pixel.track("faixa_selected", { cpf: onlyDigits(cpf), stepDetails: "Perfil simplificado concluído." });
    go("analise");
  };

  // ── Step 3: Run analysis
  const runAnalysis = async (): Promise<boolean> => {
    if (!profile || !reason || !duration || !range) return false;
    try {
      const r = await evaluate({ data: { cpf, duration, range, reason } });
      setResult(r);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro na análise. Tente novamente.";
      fail(msg);
      go("perfil");
      setPerfilSub("faixa");
      return false;
    }
  };

  // ── Step 4: Finalizar e ir ao WhatsApp
  const finalize = async () => {
    const proto = "AGI" + Math.random().toString(36).substring(2, 8).toUpperCase();
    setProtocol(proto);
    try {
      await submitApplication({
        data: {
          leadId:   pixel.getLeadId(),
          cpf,
          duration: duration!,
          range:    range!,
          reason:   reason!,
          fullName: name.trim() || "Titular do CPF",
          birthDate: "01/01/1970",
          profile:  profile!,
          otherBanks: [],
          payout: { method: "pix", pixType: "cpf", pixKey: cpf },
        },
      });
    } catch {
      // Não trava o fluxo — o lead vai ao WhatsApp de qualquer forma
    }
    go("gerente");
  };

  // WhatsApp link with pre-filled message
  const waLink = useMemo(() => {
    const msg = "Preciso de um atendimento Humanizado de AgiBank";
    const cleanNumber = onlyDigits(managerWhatsapp);
    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`;
  }, [managerWhatsapp]);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen bg-background flex flex-col shadow-2xl relative">
        <Header />
        {step !== "welcome" && <StageBar step={step} perfilSub={perfilSub} />}

        <main
          className={`relative z-10 flex-1 w-full px-4 pb-8 ${step === "welcome" ? "" : "-mt-14"}`}
          key={`${step}-${perfilSub}`}
        >
          {/* ── WELCOME ───────────────────────────────────── */}
          {step === "welcome" && <Welcome onStart={() => go("dados")} />}

          {/* ── ETAPA 1: DADOS ────────────────────────────── */}
          {step === "dados" && (
            <Card
              icon={<UserRound />}
              title="Informe seu CPF"
              subtitle="Digite o CPF do titular do benefício INSS para iniciarmos sua simulação com total segurança."
              badge="Etapa 1 de 4"
            >
              {/* Honeypot anti-bot */}
              <div style={{ display: "none", position: "absolute", left: "-9999px" }} aria-hidden="true">
                <input type="text" name="website_lead_token" tabIndex={-1} autoComplete="off"
                  onChange={(e) => { if (e.target.value) pixel.updateData({ honeypotFilled: true }); }} />
              </div>

              <Field
                label="CPF do titular do benefício"
                ok={isValidCPF(cpf)}
                err={dadosErr.cpf ?? (onlyDigits(cpf).length === 11 && !isValidCPF(cpf) ? "CPF inválido. Confira os números." : undefined)}
                hint="Digite os 11 dígitos do seu CPF"
              >
                <Input
                  aria-label="CPF"
                  inputMode="numeric"
                  maxLength={14}
                  value={cpf}
                  placeholder="000.000.000-00"
                  onChange={(e) => { setCpf(maskCPF(e.target.value)); setDadosErr({}); }}
                />
              </Field>

              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex items-start gap-2 text-xs text-emerald-700">
                <Lock className="size-3.5 mt-0.5 shrink-0 text-emerald-500" />
                <span>Seus dados são criptografados e protegidos pela LGPD. Não cobramos nenhuma taxa antecipada.</span>
              </div>

              <Nav
                onBack={() => go("welcome")}
                onNext={submitDados}
                nextLabel="Continuar para o Perfil"
                disabled={!isValidCPF(cpf)}
              />
            </Card>
          )}

          {/* ── ETAPA 2: PERFIL (SIMPLIFICADO EM 2 PASSOS) ─── */}
          {step === "perfil" && (
            <>
              {perfilSub === "tipo" && (
                <Choices
                  icon={<BadgeCheck />}
                  title="Qual é o seu tipo de benefício no INSS?"
                  subtitle="Selecione como você recebe seu benefício para identificarmos as melhores taxas."
                  badge="Etapa 2 de 4 · Passo 1/2"
                  options={PROFILES}
                  value={profile}
                  onPick={pickPerfil}
                  onBack={back}
                />
              )}
              {perfilSub === "faixa" && (
                <Choices
                  icon={<Wallet />}
                  title="Qual o valor líquido do seu benefício?"
                  subtitle="Informe a faixa aproximada do valor que você recebe mensalmente."
                  badge="Etapa 2 de 4 · Passo 2/2"
                  options={RANGES}
                  value={range}
                  onPick={pickFaixa}
                  onBack={back}
                />
              )}
            </>
          )}

          {/* ── ETAPA 3: ANÁLISE ──────────────────────────── */}
          {step === "analise" && (
            <Loading
              title="Calculando sua simulação"
              lines={[
                "Verificando elegibilidade do CPF…",
                "Analisando perfil do benefício INSS…",
                "Calculando score de crédito ilustrativo…",
                "Preparando o valor estimado disponível…",
              ]}
              task={runAnalysis}
              onDone={() => go("score")}
            />
          )}

          {step === "score" && result && (
            <Card
              icon={<TrendingUp />}
              title="Seu perfil na simulação"
              subtitle="Indicador ilustrativo com base nas informações declaradas. Não é o score oficial do Agibank ou de birôs de crédito."
              badge="Etapa 3 de 4"
            >
              <ScoreGauge score={result.score} />
              <div className="text-center">
                <span className="text-sm font-semibold text-primary">{scoreLabel(result.score)}</span>
              </div>
              <dl className="divide-y border-y text-sm mt-2">
                {[
                  ["CPF verificado", "Dígitos válidos · Elegível para simulação"],
                  ["Faixa declarada", RANGES[range!]],
                  ["Tempo de benefício", DURATIONS[duration!]],
                  ["Perfil INSS", PROFILES[profile!]],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 py-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words text-right font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <Button
                variant="hero"
                size="xl"
                className="h-auto min-h-14 w-full whitespace-normal px-4 py-3"
                onClick={() => go("resultado")}
              >
                Ver valor estimado <ArrowRight />
              </Button>
            </Card>
          )}

          {step === "resultado" && result && (
            <div className="animate-rise space-y-4">
              {/* Hero valor */}
              <div className="overflow-hidden rounded-3xl bg-gradient-hero p-8 text-center text-primary-foreground shadow-elegant">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Sparkles className="size-8" />
                </div>
                <p className="text-sm font-medium uppercase tracking-widest opacity-80">Simulação concluída!</p>
                <h2 className="mt-2 text-2xl font-semibold">Valor estimado disponível</h2>
                <p className="font-display mt-4 text-5xl font-bold">{brl(result.amount)}</p>
                <p className="mx-auto mt-4 max-w-xs text-sm opacity-80 leading-relaxed">
                  Este valor é ilustrativo. A confirmação e liberação dependem da análise do gerente especializado.
                </p>
              </div>

              {/* Resumo */}
              <Card icon={<FileCheck2 />} title="Resumo da sua simulação" badge="Etapa 3 de 4">
                <dl className="divide-y rounded-xl border bg-muted/40 text-sm">
                  {[
                    ["CPF", cpf],
                    ["Perfil", PROFILES[profile!]],
                    ["Faixa do benefício", RANGES[range!]],
                    ["Score ilustrativo", `${result.score} pts · ${scoreLabel(result.score)}`],
                    ["Valor estimado", brl(result.amount)],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 break-words text-right font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-800 leading-relaxed">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span><strong>Atenção:</strong> Nunca realize depósitos antecipados para liberar empréstimos. A contratação ocorre diretamente com o gerente, sem custos prévios.</span>
                </div>

                <Button
                  variant="hero"
                  size="xl"
                  className="h-auto min-h-14 w-full whitespace-normal px-4 py-3 text-base font-bold"
                  onClick={finalize}
                >
                  <MessageCircle className="size-5" />
                  Falar com o gerente agora
                </Button>
              </Card>
            </div>
          )}

          {/* ── ETAPA 4: GERENTE ──────────────────────────── */}
          {step === "gerente" && (
            <div className="animate-rise space-y-4">
              {/* Manager card */}
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <div className="h-28 bg-gradient-hero" />
                <div className="-mt-16 px-6 pb-8 text-center sm:px-10">
                  <img
                    src={managerAvatar}
                    alt={managerName}
                    width={816} height={816}
                    className="mx-auto size-32 rounded-full border-4 border-card object-cover shadow-elegant"
                  />
                  <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-primary">Seu gerente exclusivo</p>
                  <h2 className="mt-1 text-2xl font-semibold">{managerName}</h2>
                  <p className="text-sm text-muted-foreground">Especialista em Crédito Consignado INSS · Agibank</p>

                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-success-soft px-4 py-1.5 text-sm font-semibold text-success">
                    <CheckCircle2 className="size-4" />
                    Protocolo {protocol || "AGI000000"}
                  </div>

                  <p className="mx-auto mt-5 max-w-sm text-muted-foreground leading-relaxed">
                    Olá! Vou cuidar pessoalmente da sua proposta de{" "}
                    <strong className="text-foreground">{result && brl(result.amount)}</strong>.{" "}
                    Clique abaixo para me chamar agora no WhatsApp e darmos continuidade à liberação do seu crédito.
                  </p>

                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-6"
                    onClick={() => {
                      pixel.track("whatsapp_clicked", {
                        cpf: onlyDigits(cpf),
                        stepDetails: "Lead iniciou atendimento humanizado no WhatsApp.",
                      });
                    }}
                  >
                    <Button variant="hero" size="xl" className="w-full text-base font-bold h-14 gap-2 shadow-lg active:scale-[0.99] transition-all">
                      <MessageSquare className="size-5" />
                      Chamar {managerName} no WhatsApp
                    </Button>
                  </a>
                </div>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Clock className="size-5 text-primary" />,       title: "Resposta em até 15 min",   desc: "Atendimento ágil e prioritário" },
                  { icon: <ShieldCheck className="size-5 text-success" />, title: "Sem custos antecipados",   desc: "Nunca pague nada antes da liberação" },
                  { icon: <Phone className="size-5 text-primary" />,       title: "Contato direto",           desc: "Fale diretamente com o especialista" },
                  { icon: <Sparkles className="size-5 text-amber-500" />,  title: "Proposta personalizada",   desc: "Baseada no seu perfil INSS real" },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl bg-card border border-border/40 shadow-sm p-4 flex flex-col items-start gap-2">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-muted">
                      {item.icon}
                    </div>
                    <span className="text-xs font-bold text-foreground leading-snug">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground leading-snug">{item.desc}</span>
                  </div>
                ))}
              </div>

              <p className="text-center text-[11px] text-muted-foreground leading-relaxed px-4 pt-2">
                Protocolo: <strong>{protocol}</strong> · Valor estimado: <strong>{result && brl(result.amount)}</strong>
              </p>
            </div>
          )}
        </main>

        <footer className="w-full space-y-1 px-6 pb-10 pt-4 text-center text-[11px] text-muted-foreground mt-auto">
          <img src={symbolAsset.url} alt="" width={28} height={28} className="mx-auto mb-2 size-7 opacity-70" />
          <p>© {new Date().getFullYear()} Consulta INSS. Todos os direitos reservados.</p>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StageBar
// ─────────────────────────────────────────────────────────────
function StageBar({ step, perfilSub }: { step: Step; perfilSub: PerfilSub }) {
  const current = Math.max(0, STAGES.findIndex((s) => s.steps.includes(step)));
  const stage   = STAGES[current];
  if (!stage) return null;

  // Para o step "perfil", calcula progresso baseado no sub-step
  let innerPct: number;
  if (step === "perfil") {
    const si = PERFIL_SUBS.indexOf(perfilSub) + 1;
    innerPct = (si / PERFIL_SUBS.length) * 100;
  } else {
    const inner = stage.steps.indexOf(step) + 1;
    innerPct = (inner / stage.steps.length) * 100;
  }

  return (
    <div className="bg-gradient-hero px-5 pb-20 pt-6 text-primary-foreground">
      <div className="w-full">
        <p className="text-xs font-medium opacity-85">Etapa {current + 1} de {STAGES.length}</p>
        <p className="font-display text-xl font-bold mt-0.5 tracking-tight">{stage.label}</p>
        <div className="mt-3.5 grid grid-cols-4 gap-1.5">
          {STAGES.map((s, i) => (
            <div key={s.label} className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
              <div
                className="h-full rounded-full bg-success transition-all duration-500 ease-out"
                style={{ width: i < current ? "100%" : i === current ? `${innerPct}%` : "0%" }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] sm:text-xs font-medium">
          {STAGES.map((s, i) => (
            <span
              key={s.label}
              className={`truncate transition-opacity ${
                i === current ? "opacity-100 font-bold text-white" :
                i < current   ? "opacity-90 text-emerald-200" : "opacity-45"
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
        <span />
        <img src={logoAsset.url} alt="Agibank" width={56} height={40} className="h-9 w-auto" />
        <span className="flex items-center justify-end gap-1 text-[11px] font-medium text-muted-foreground">
          <Lock className="size-3.5 text-success" /> Seguro
        </span>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// Welcome
// ─────────────────────────────────────────────────────────────
function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="animate-rise -mx-3 sm:-mx-4 -mt-0">
      <div className="bg-gradient-hero px-5 sm:px-6 pb-20 sm:pb-24 pt-6 sm:pt-8 text-primary-foreground rounded-b-3xl sm:rounded-b-none">
        <p className="text-xs sm:text-sm font-medium opacity-90">Olá,</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight">
          Empréstimo Consignado INSS
        </h1>
        <p className="mt-2 text-xs sm:text-sm opacity-90 leading-relaxed">
          Simule em 4 etapas e fale diretamente com nosso gerente pelo WhatsApp. Rápido, seguro e sem burocracia.
        </p>
        <img src={cardsAsset.url} alt="Cartões Agibank" width={1920} height={1050}
          className="mx-auto -mb-2 sm:-mb-4 mt-3 sm:mt-4 h-40 sm:h-48 w-auto object-contain drop-shadow-md" />
      </div>

      <div className="-mt-12 sm:-mt-16 space-y-3.5 sm:space-y-4 px-3 sm:px-4">
        {/* Feature chips */}
        <div className="grid grid-cols-3 gap-2">
          {([
            [Wallet,      "Até R$ 2.500"],
            [ShieldCheck, "Sem antecipação"],
            [Clock,       "Resposta em 15 min"],
          ] as const).map(([Icon, label]) => {
            const I = Icon as typeof Wallet;
            return (
              <div key={label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-2 py-3.5 text-center shadow-card border border-border/40">
                <I className="size-5 text-primary" />
                <span className="text-[11px] font-bold text-primary-deep leading-tight">{label}</span>
              </div>
            );
          })}
        </div>

        {/* How it works */}
        <div className="rounded-2xl sm:rounded-3xl bg-card p-4 sm:p-6 shadow-card border border-border/40">
          <h2 className="text-base sm:text-lg font-bold">Como funciona em 4 etapas</h2>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {([
              [UserRound,    "Seus Dados"],
              [BadgeCheck,   "Seu Perfil"],
              [TrendingUp,   "Simulação"],
              [MessageCircle,"Falar com Gerente"],
            ] as const).map(([Icon, label], i) => {
              const I = Icon as typeof Wallet;
              return (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div className="relative flex size-12 items-center justify-center rounded-full bg-primary-soft/60 shadow-sm">
                    <I className="size-5 text-primary" />
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-primary-deep leading-snug">{label}</span>
                </div>
              );
            })}
          </div>
          <Button variant="hero" size="xl" className="mt-5 w-full text-sm font-bold h-13" onClick={onStart}>
            Começar Consulta <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────
function Card({
  icon, title, subtitle, badge, children,
}: {
  icon: ReactNode; title: string; subtitle?: string | undefined; badge?: string | undefined; children: ReactNode;
}) {
  return (
    <section className="animate-rise min-w-0 space-y-5 rounded-3xl bg-card p-6 shadow-card border border-border/30">
      {badge && (
        <span className="inline-block rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold text-primary">
          {badge}
        </span>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3.5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary [&_svg]:size-6">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold leading-snug tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label, ok, err, hint, children,
}: {
  label: string; ok?: boolean | undefined; err?: string | undefined; hint?: string | undefined; children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-xs sm:text-sm font-semibold">
        {label}{ok && <CheckCircle2 className="size-4 text-success" />}
      </span>
      <div className="[&_input]:h-12 sm:[&_input]:h-11 [&_input]:text-base sm:[&_input]:text-sm [&_input]:bg-card">
        {children}
      </div>
      {hint && !err && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      {err  && <span className="text-xs font-medium text-destructive">{err}</span>}
    </label>
  );
}

function Choices<K extends string>({
  icon, title, subtitle, badge, options, value, onPick, onBack,
}: {
  icon: ReactNode; title: string; subtitle?: string | undefined; badge?: string | undefined;
  options: Record<K, string>; value: K | null;
  onPick: (k: K) => void; onBack: () => void;
}) {
  return (
    <Card icon={icon} title={title} subtitle={subtitle} badge={badge}>
      <div className="grid gap-2.5 sm:gap-3">
        {(Object.keys(options) as K[]).map((k) => (
          <Button
            key={k}
            variant="choice"
            className="h-auto min-h-[3.75rem] py-3.5 px-4 text-left transition-all active:scale-[0.99]"
            data-active={value === k}
            onClick={() => onPick(k)}
          >
            <span className="min-w-0 flex-1 break-words text-sm sm:text-base font-semibold leading-relaxed">
              {options[k]}
            </span>
            <ArrowRight className="size-4 text-muted-foreground shrink-0 ml-2" />
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="w-fit text-xs sm:text-sm" onClick={onBack}>
        <ArrowLeft className="size-4" /> Voltar
      </Button>
    </Card>
  );
}

function Nav({
  onBack, onNext, nextLabel = "Continuar", disabled,
}: {
  onBack: () => void; onNext: () => void; nextLabel?: string | undefined; disabled?: boolean | undefined;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 pt-2">
      <Button variant="outline" size="xl" className="rounded-xl" onClick={onBack}>
        <ArrowLeft />
      </Button>
      <Button
        variant="hero"
        size="xl"
        className="h-auto min-h-14 min-w-0 whitespace-normal px-3 py-3 text-sm leading-snug font-bold"
        disabled={disabled}
        onClick={onNext}
      >
        {nextLabel} {!disabled && <ArrowRight />}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading screen
// ─────────────────────────────────────────────────────────────
function Loading({
  title, lines, task, onDone,
}: {
  title: string; lines: string[]; task?: (() => Promise<boolean>) | undefined; onDone: () => void;
}) {
  const [i, setI]           = useState(0);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    let alive = true;
    const stepDuration = 2800;
    const totalTime    = lines.length * stepDuration;

    const stepInterval = setInterval(() => {
      setI((prev) => Math.min(prev + 1, lines.length - 1));
    }, stepDuration);

    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev >= 98 ? 98 : prev + 1));
    }, totalTime / 90);

    let waitTimer: ReturnType<typeof setTimeout>;
    const minWait = new Promise<void>((r) => {
      waitTimer = setTimeout(() => { setProgress(100); setTimeout(r, 500); }, totalTime);
    });

    Promise.all([task ? task() : Promise.resolve(true), minWait]).then(([ok]) => {
      if (alive && ok) onDone();
    });

    return () => {
      alive = false;
      clearInterval(stepInterval);
      clearInterval(progressInterval);
      clearTimeout(waitTimer!);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="animate-rise rounded-3xl bg-card p-8 sm:p-10 text-center shadow-card">
      <div className="relative mx-auto size-24">
        <svg className="size-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" className="stroke-primary-soft" />
          <circle
            cx="50" cy="50" r="42" fill="none" strokeWidth="6"
            strokeDasharray="264"
            strokeDashoffset={264 - (264 * progress) / 100}
            strokeLinecap="round"
            className="stroke-primary transition-all duration-300 ease-out"
          />
        </svg>
        <img src={symbolAsset.url} alt="" width={36} height={36}
          className="absolute inset-0 m-auto size-9 object-contain" />
      </div>

      <div className="mt-4">
        <span className="inline-block rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
          {progress}% concluído
        </span>
      </div>

      <h2 className="mt-3 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Aguarde enquanto calculamos sua simulação com segurança.
      </p>

      <ul className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm">
        {lines.map((l, j) => {
          const isDone    = j < i;
          const isCurrent = j === i;
          return (
            <li key={l} className={`flex items-center gap-3 transition-opacity duration-500 ${j <= i ? "opacity-100" : "opacity-35"}`}>
              {isDone    ? <CheckCircle2 className="size-4 shrink-0 text-success" /> :
               isCurrent ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> :
                           <div className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />}
              <span className={isCurrent ? "font-medium text-foreground" : ""}>{l}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
