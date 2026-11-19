import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export function reply(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.json(data);
}
export function getInitData(req) {
  const h = req.headers["x-telegram-init-data"];
  return typeof h === "string" ? h : "";
}
export function verifyTelegram(initData) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheckString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b))
      .map(([k,v]) => `${k}=${v}`).join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData")
      .update(process.env.TELEGRAM_BOT_TOKEN).digest();
    const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
    const a = Buffer.from(calculated, "hex"), b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate || Math.abs(Date.now()/1000 - authDate) > 86400) return null;
    const user = JSON.parse(params.get("user") || "{}");
    if (!Number.isSafeInteger(Number(user.id))) return null;
    return { id: String(user.id), username: user.username || "", first_name: user.first_name || "Игрок" };
  } catch { return null; }
}
export async function requireUser(req, res) {
  const user = verifyTelegram(getInitData(req));
  if (!user) { reply(res, 401, { error: "Открой приложение через Telegram-бота." }); return null; }
  const { error } = await supabase.from("players").upsert({
    telegram_id: user.id, username: user.username, first_name: user.first_name
  }, { onConflict: "telegram_id", ignoreDuplicates: true });
  if (error) { reply(res, 500, { error: "Не удалось загрузить профиль." }); return null; }
  const { data, error: readError } = await supabase.from("players")
    .select("telegram_id,username,first_name,balance,banned,last_daily").eq("telegram_id", user.id).single();
  if (readError || !data) { reply(res, 500, { error: "Ошибка профиля." }); return null; }
  if (data.banned) { reply(res, 403, { error: "Аккаунт заблокирован." }); return null; }
  return { ...user, player: data, isAdmin: user.id === String(process.env.TELEGRAM_ADMIN_ID || "") };
}
export function method(req, res, expected) {
  if (req.method !== expected) { reply(res, 405, { error: "Метод не поддерживается." }); return false; }
  return true;
}
export function random() { return crypto.randomInt(0, 1_000_000) / 1_000_000; }
export function clamp(n,min,max) { return Math.max(min,Math.min(max,n)); }
