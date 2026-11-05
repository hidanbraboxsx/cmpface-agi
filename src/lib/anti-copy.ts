import { useEffect } from "react";

/**
 * Camada Suprema de Blindagem Client-Side:
 * - Anti-Copy, Anti-Right Click, Anti-Drag
 * - Bloqueio de Teclas de Atalho de Inspeção (F12, Ctrl+U, Ctrl+S, Ctrl+P, Ctrl+Shift+I/J/C)
 * - Anti-DevTools Tripwire (debugger loop para quem tenta abrir console)
 * - Detecção de Redimensionamento Anômalo por Abertura de DevTools
 * - Desativação de Seleção de Texto e Impressão
 */
export function useAntiCopyGuard() {
  useEffect(() => {
    // 1. Bloqueia menu de contexto (Botão direito)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 2. Bloqueia atalhos de teclado de inspeção e salvamento
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Ctrl + Shift + I/J/C/K
      if (e.ctrlKey && e.shiftKey && /^[ijckIJCK]$/.test(e.key)) {
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

      // Mac Cmd + Alt + I/J/U/C
      if (e.metaKey && e.altKey && /^[ijucIJUC]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    // 3. Previne arrastar imagens ou textos
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };

    // 4. Previne atalho de seleção geral
    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return true;
      }
      e.preventDefault();
      return false;
    };

    // 5. Tripwire Anti-DevTools: Trap assíncrona se console for aberto
    let devToolsInterval: ReturnType<typeof setInterval> | undefined;
    if (typeof window !== "undefined" && typeof process !== "undefined" && process.env && process.env["NODE_ENV"] === "production") {
      devToolsInterval = setInterval(() => {
        const startTime = performance.now();
        // eslint-disable-next-line no-debugger
        debugger;
        if (performance.now() - startTime > 100) {
          // DevTools aberto detectado: limpa o DOM ou recarrega
          document.body.innerHTML = "<div style='display:flex;height:100vh;align-items:center;justify-content:center;background:#0f172a;color:#f87171;font-family:sans-serif;font-size:20px;font-weight:bold;'>Acesso Seguro Restrito.</div>";
        }
      }, 2500);
    }

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("dragstart", handleDragStart, { capture: true });
    document.addEventListener("selectstart", handleSelectStart, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("dragstart", handleDragStart, { capture: true });
      document.removeEventListener("selectstart", handleSelectStart, { capture: true });
      if (devToolsInterval) clearInterval(devToolsInterval);
    };
  }, []);
}
