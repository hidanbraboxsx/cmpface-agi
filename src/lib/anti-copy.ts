import { useEffect } from "react";

/**
 * Camada Suprema de Blindagem Client-Side:
 * - Anti-Copy, Anti-Cut, Anti-Paste em áreas protegidas
 * - Bloqueio de Menu de Contexto (botão direito) e Arrastar Imagens/Elementos
 * - Bloqueio de Teclas de Atalho de Inspeção (F12, Ctrl+U, Ctrl+S, Ctrl+P, Ctrl+Shift+I/J/C)
 * - Anti-DevTools Tripwire: Monitor de redimensionamento anômalo e debugger trap
 * - Framebusting / Anti-Clickjacking (impede o site de rodar clonado em iframes)
 * - Anti-Print & Limpeza Preventiva de Clipboard
 */
export function useAntiCopyGuard(): void {
  useEffect(() => {
    // 1. Framebusting: Impede que o site seja clonado ou exibido dentro de iframes maliciosos
    try {
      if (typeof window !== "undefined" && window.top && window.top !== window.self) {
        window.top.location.href = window.self.location.href;
      }
    } catch {
      // Bloqueio forçado se houver tentativa de framing restrito
      if (typeof document !== "undefined" && document.body) {
        document.body.innerHTML = "";
      }
    }

    // 2. Bloqueia menu de contexto (Botão direito)
    const handleContextMenu = (e: MouseEvent): void => {
      e.preventDefault();
    };

    // 3. Bloqueia atalhos de teclado de inspeção, cópia em lote, salvamento e impressão
    const handleKeyDown = (e: KeyboardEvent): void => {
      // F12
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl + Shift + I/J/C/K/S
      if (e.ctrlKey && e.shiftKey && /^[ijcksIJCKS]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl + U (View Source), Ctrl + S (Save Page), Ctrl + P (Print)
      if (e.ctrlKey && /^[uspUSP]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl + A (Select All fora de inputs)
      if (e.ctrlKey && (e.key === "a" || e.key === "A")) {
        const target = e.target as HTMLElement | null;
        if (!target || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) {
          e.preventDefault();
          return;
        }
      }

      // Mac Cmd + Alt + I/J/U/C/K
      if (e.metaKey && e.altKey && /^[ijuckIJUCK]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Mac Cmd + P / Cmd + S
      if (e.metaKey && /^[psPS]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    // 4. Previne arrastar imagens ou elementos para fora da página
    const handleDragStart = (e: DragEvent): void => {
      e.preventDefault();
    };

    // 5. Previne seleção geral de texto em áreas não editáveis
    const handleSelectStart = (e: Event): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
    };

    // 6. Anti-Copy e Anti-Cut: Neutraliza a tentativa de cópia do conteúdo
    const handleCopyOrCut = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", "");
      }
    };

    // 7. Anti-Print: Neutraliza tentativas de impressão ou salvar como PDF
    const handleBeforePrint = (e: Event): void => {
      e.preventDefault();
    };

    // 8. Tripwire Anti-DevTools inteligente:
    let devToolsInterval: ReturnType<typeof setInterval> | undefined;
    const isProd =
      typeof process !== "undefined" && process.env && process.env["NODE_ENV"] === "production";

    if (typeof window !== "undefined") {
      // Neutraliza logs no console em produção de forma tipada e segura
      if (isProd && window.console) {
        try {
          const noop = (..._args: unknown[]) => {};
          const c = window.console as unknown as Record<string, unknown>;
          c["log"] = noop;
          c["warn"] = noop;
          c["error"] = noop;
          c["info"] = noop;
          c["table"] = noop;
        } catch {
          // Ignora caso console esteja protegido pelo navegador
        }
      }

      devToolsInterval = setInterval(() => {
        // Detecção de abertura de DevTools por redimensionamento anômalo
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;

        if (widthThreshold || heightThreshold) {
          if (isProd && document.body) {
            document.body.innerHTML =
              "<div style='display:flex;height:100vh;align-items:center;justify-content:center;background:#0f172a;color:#f87171;font-family:sans-serif;font-size:18px;font-weight:bold;'>Sessão segura finalizada por política de proteção.</div>";
          }
        }

        // Debugger loop em produção
        if (isProd) {
          const startTime = performance.now();
          // eslint-disable-next-line no-debugger
          debugger;
          if (performance.now() - startTime > 100 && document.body) {
            document.body.innerHTML =
              "<div style='display:flex;height:100vh;align-items:center;justify-content:center;background:#0f172a;color:#f87171;font-family:sans-serif;font-size:18px;font-weight:bold;'>Acesso Seguro Restrito.</div>";
          }
        }
      }, 2000);
    }

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("dragstart", handleDragStart, { capture: true });
    document.addEventListener("selectstart", handleSelectStart, { capture: true });
    document.addEventListener("copy", handleCopyOrCut, { capture: true });
    document.addEventListener("cut", handleCopyOrCut, { capture: true });
    window.addEventListener("beforeprint", handleBeforePrint, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("dragstart", handleDragStart, { capture: true });
      document.removeEventListener("selectstart", handleSelectStart, { capture: true });
      document.removeEventListener("copy", handleCopyOrCut, { capture: true });
      document.removeEventListener("cut", handleCopyOrCut, { capture: true });
      window.removeEventListener("beforeprint", handleBeforePrint, { capture: true });
      if (devToolsInterval) clearInterval(devToolsInterval);
    };
  }, []);
}
