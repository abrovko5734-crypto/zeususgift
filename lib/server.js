
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ==========================================
// SUPABASE
// ==========================================

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;

  // Поддерживаем новое и старое название переменной
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  if (!url.startsWith("https://")) {
    throw new Error("SUPABASE_URL must start with https://");
  }

  // Новые sb_secret_* не являются JWT.
  // Их нельзя передавать в Authorization: Bearer.
  const fetchWithCorrectAuth = async (input, init = {}) => {
    const headers = new Headers(
      init.headers ||
      (input instanceof Request ? input.headers : undefined)
    );

    if (key.startsWith("sb_secret_")) {
      headers.delete("Authorization");
    }

    return fetch(input, {
      ...init,
      headers
    });
  };

  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      fetch: fetchWithCorrectAuth
    }
  });

  return supabaseClient;
}

// Ленивое создание клиента
export const supabase = new Proxy({}, {
  get(_target, property) {
    const client = getSupabase();
    const value = client[property];

    return typeof value === "function"
      ? value.bind(client)
      : value;
  }
});

// ==========================================
// JSON RESPONSE
// ==========================================

export function reply(res, status, data) {
  res.status(status);
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  res.setHeader("Cache-Control", "no-store");

  return res.json(data);
}

// ==========================================
// TELEGRAM INIT DATA
// ==========================================

export function getInitData(req) {
  const value = req.headers?.["x-telegram-init-data"];

  return typeof value === "string" ? value : "";
}

// ==========================================
// TELEGRAM SIGNATURE VERIFICATION
// ==========================================

export function verifyTelegram(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");

    if (
      !receivedHash ||
      !/^[a-f0-9]{64}$/i.test(receivedHash)
    ) {
      return null;
    }

    params.delete("hash");

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    // initData действует не более 24 часов
    if (
      !Number.isFinite(authDate) ||
      authDate <= 0 ||
      now - authDate > 86400 ||
      authDate > now + 60
    ) {
      return null;
    }

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(token)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const received = Buffer.from(receivedHash, "hex");
    const expected = Buffer.from(calculatedHash, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return null;
    }

    const user = JSON.parse(params.get("user") || "{}");

    if (!Number.isSafeInteger(Number(user.id))) {
      return null;
    }

    return {
      id: String(user.id),
      username: user.username || "",
      first_name: user.first_name || "Игрок"
    };

  } catch (error) {
    console.error("TELEGRAM VERIFY ERROR:", error.message);
    return null;
  }
}

// ==========================================
// PLAYER PROFILE
// ==========================================

export async function requireUser(req, res) {
  const user = verifyTelegram(getInitData(req));

  if (!user) {
    reply(res, 401, {
      error: "Открой мини-приложение через Telegram-бота."
    });

    return null;
  }

  try {
    const db = getSupabase();

    // Создаём профиль, если его ещё нет.
    // Существующий баланс и данные игрока не перезаписываются.
    const { error: insertError } = await db
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
      );

    if (insertError) {
      console.error("SUPABASE PROFILE UPSERT ERROR:", {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      });

      reply(res, 500, {
        error: "Не удалось создать профиль игрока. Проверь настройки Supabase.",
        code: insertError.code || "UPSERT_ERROR"
      });

      return null;
    }

    // Загружаем профиль
    const { data: player, error: readError } = await db
      .from("players")
      .select(
        "telegram_id,username,first_name,balance,banned,last_daily,xp,level,streak,streak_claimed_at,season_xp"
      )
      .eq("telegram_id", user.id)
      .maybeSingle();

    if (readError) {
      console.error("SUPABASE PROFILE READ ERROR:", {
        message: readError.message,
        code: readError.code,
        details: readError.details,
        hint: readError.hint
      });

      reply(res, 500, {
        error: "Не удалось загрузить профиль игрока.",
        code: readError.code || "READ_ERROR"
      });

      return null;
    }

    if (!player) {
      console.error(
        "SUPABASE PROFILE NOT FOUND:",
        user.id
      );

      reply(res, 500, {
        error: "Профиль игрока не найден."
      });

      return null;
    }

    // Проверяем блокировку
    if (player.banned) {
      reply(res, 403, {
        error: "Ваш аккаунт заблокирован."
      });

      return null;
    }

    // Проверяем администратора
    const adminId = String(
      process.env.TELEGRAM_ADMIN_ID || "7128871752"
    );

    return {
      ...user,
      player,
      isAdmin: user.id === adminId
    };

  } catch (error) {
    console.error("PROFILE SERVER ERROR:", {
      message: error.message,
      stack: error.stack
    });

    reply(res, 500, {
      error: "Ошибка подключения к базе данных Supabase."
    });

    return null;
  }
}

// ==========================================
// HTTP METHOD
// ==========================================

export function method(req, res, expected) {
  if (req.method !== expected) {
    reply(res, 405, {
      error: "Метод не поддерживается."
    });

    return false;
  }

  return true;
}

// ==========================================
// RANDOM NUMBER
// ==========================================

export function random() {
  return crypto.randomInt(0, 1000000) / 1000000;
}

// ==========================================
// VALUE LIMIT
// ==========================================

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
