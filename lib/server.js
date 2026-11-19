
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = String(process.env.TELEGRAM_ADMIN_ID || "7128871752");

let supabase;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabase;
}

function reply(res, status, data) {
  res.status(status).json(data);
}

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  if (!initData || typeof initData !== "string") {
    return null;
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) return null;

  params.delete("hash");

  const authDate = Number(params.get("auth_date"));

  if (!authDate || !Number.isFinite(authDate)) {
    return null;
  }

  // Не принимаем данные старше 24 часов
  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > 86400 || authDate > now + 60) {
    return null;
  }

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(calculatedHash, "hex");
  const b = Buffer.from(receivedHash, "hex");

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return null;
  }

  try {
    const user = JSON.parse(params.get("user") || "null");

    if (!user || !user.id) return null;

    return {
      id: String(user.id),
      username: user.username || "",
      first_name: user.first_name || "Игрок"
    };
  } catch {
    return null;
  }
}

export async function getTelegramUser(req, res) {
  try {
    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.initData ||
      req.query?.initData;

    const user = verifyTelegramInitData(initData);

    if (!user) {
      reply(res, 401, {
        error: "Не удалось проверить Telegram. Открой мини-приложение через Telegram-бота."
      });
      return null;
    }

    return user;
  } catch (error) {
    console.error("TELEGRAM AUTH ERROR:", error);

    reply(res, 500, {
      error: "Ошибка проверки Telegram."
    });

    return null;
  }
}

export async function getPlayer(req, res) {
  const user = await getTelegramUser(req, res);

  if (!user) return null;

  try {
    const db = getSupabase();

    const { data, error } = await db
      .from("players")
      .upsert(
        {
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name
        },
        {
          onConflict: "telegram_id",
          ignoreDuplicates: true
        }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error("SUPABASE PROFILE ERROR:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });

      reply(res, 500, {
        error: "Не удалось загрузить профиль.",
        code: error.code || "SUPABASE_ERROR"
      });

      return null;
    }

    // При ignoreDuplicates Supabase может вернуть null
    let player = data;

    if (!player) {
      const result = await db
        .from("players")
        .select("*")
        .eq("telegram_id", user.id)
        .maybeSingle();

      if (result.error) {
        console.error("SUPABASE PLAYER READ ERROR:", result.error);

        reply(res, 500, {
          error: "Не удалось прочитать профиль."
        });

        return null;
      }

      player = result.data;
    }

    if (!player) {
      const result = await db
        .from("players")
        .insert({
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name,
          balance: 0
        })
        .select()
        .single();

      if (result.error) {
        console.error("SUPABASE PLAYER INSERT ERROR:", result.error);

        reply(res, 500, {
          error: "Не удалось создать профиль."
        });

        return null;
      }

      player = result.data;
    }

    if (player.banned) {
      reply(res, 403, {
        error: "Твой аккаунт заблокирован."
      });

      return null;
    }

    return {
      ...player,
      isAdmin: user.id === ADMIN_ID
    };
  } catch (error) {
    console.error("GET PLAYER ERROR:", error);

    reply(res, 500, {
      error: "Ошибка загрузки профиля."
    });

    return null;
  }
}

export function getAdminId() {
  return ADMIN_ID;
}

export function getDatabase() {
  return getSupabase();
}
