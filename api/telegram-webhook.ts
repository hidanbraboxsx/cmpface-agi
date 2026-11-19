import { handleTelegramUpdate } from "../src/lib/telegram-webhook";

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "online", webhook: "active" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    await handleTelegramUpdate(body);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("[Telegram Webhook Lambda Error]", error);
    return res.status(200).json({ ok: false, error: String(error) });
  }
}
