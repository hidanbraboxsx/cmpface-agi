import React, { useEffect, useState } from "react";
import { Smartphone, QrCode, Copy, Check, ShieldCheck, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface MobileOnlyGuardProps {
  children: React.ReactNode;
}

export function MobileOnlyGuard({ children }: MobileOnlyGuardProps) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("https://agibankconsult.vercel.app");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentUrl(window.location.href);

      const checkMobile = () => {
        const ua = navigator.userAgent || "";
        const mobileUaMatch =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi|mobile/i.test(ua);
        const hasTouch =
          navigator.maxTouchPoints > 0 ||
          window.matchMedia("(pointer: coarse)").matches;
        const isNarrowScreen = window.innerWidth <= 820;

        // É mobile se o User-Agent indicar dispositivo móvel OU tela estreita com touchscreen
        const mobileDetected = Boolean(mobileUaMatch || (hasTouch && isNarrowScreen));
        setIsMobile(mobileDetected);
      };

      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, []);

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast.success("Link copiado! Cole no navegador do seu celular.");
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Durante a hidratação SSR inicial no cliente, evita piscar
  if (isMobile === null) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  // Se o usuário estiver em dispositivo móvel, renderiza o sistema normalmente
  if (isMobile) {
    return <>{children}</>;
  }

  // TELA DE BLOQUEIO PARA COMPUTADORES (DESKTOP)
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-blue-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans">
      <div className="w-full max-w-lg bg-slate-900/90 border border-blue-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute -top-24 -left-24 size-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 size-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Selo do Banco */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-6">
          <Lock className="size-3.5" />
          Ambiente Restrito · Apenas Dispositivos Móveis
        </div>

        {/* Ícone de Smartphone com animação */}
        <div className="relative mx-auto size-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/30 mb-5 flex items-center justify-center">
          <div className="size-full bg-slate-900 rounded-[14px] flex items-center justify-center">
            <Smartphone className="size-10 text-blue-400 animate-pulse" />
          </div>
        </div>

        {/* Título Principal */}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
          Acesse pelo seu Celular
        </h1>

        {/* Mensagem Explicativa */}
        <p className="text-sm text-slate-300 leading-relaxed mb-6">
          Por diretrizes de segurança bancária e validação biométrica de crédito consignado, este
          portal está habilitado <b className="text-white">exclusivamente para smartphones e aparelhos móveis</b>.
        </p>

        {/* Card do QR Code para Escanear */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 mb-6 flex flex-col items-center shadow-inner">
          <div className="size-48 bg-white rounded-xl p-2.5 flex items-center justify-center shadow-md mb-3">
            {/* Imagem do QR Code oficial apontando para o link da página */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                currentUrl,
              )}`}
              alt="QR Code para acesso mobile"
              className="size-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
            <QrCode className="size-4" />
            <span>Abra a câmera do celular e aponte para o QR Code</span>
          </div>
        </div>

        {/* Botão Copiar Link */}
        <button
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/30 mb-6"
        >
          {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
          {copied ? "Link copiado para a área de transferência!" : "Copiar Link para Acessar no Celular"}
        </button>

        {/* Rodapé com Selos de Segurança */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            Criptografia Bancária SSL 256-Bit
          </span>
          <span className="flex items-center gap-1">
            <Lock className="size-3.5 text-blue-400" />
            Conforme Diretrizes LGPD
          </span>
        </div>
      </div>
    </div>
  );
}
