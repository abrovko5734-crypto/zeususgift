
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ============================================
// SUPABASE — безопасное подключение на сервере
// ============================================

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Не заданы SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в Vercel."
    );
  }

  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "Для сервера нужен Supabase secret key, а не publishable key."
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error("SUPABASE_URL имеет неправильный формат.");
  }

  supabaseClient = createClient(url.replace(/\/+$/, ""), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        "X-Client-Info": "zeusgift-server"
      }
    }
  });

  return supabaseClient;
}

// Сохраняем совместимость с api-файлами проекта.
export const supabase = new Proxy({}, {
  get(_target, property) {
    const client = getSupabase();
    const value = client[property];

    return typeof value === "function"
      ? value.bind(client)
      : value;
  }
});

// ============================================
// JSON-ОТВЕТЫ
// ============================================

export function reply(res, status, data) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  return res.status(status).json(data);
}

// ============================================
// TELEGRAM INIT DATA
// ============================================

export function getInitData(req) {
  const value =
    req.headers?.["x-telegram-init-data"] ||
    req.headers?.["X-Telegram-Init-Data"];

  return typeof value === "string" ? value.trim() : "";
}

// Проверка подлинности данных Telegram.
export function verifyTelegram(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");

    if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
      return null;
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([keyA], [keyB]) => {
        if (keyA < keyB) return -1;
        if (keyA > keyB) return 1;
        return 0;
      })
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Секретный ключ Telegram WebApp.
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Вычисляем подпись полученных данных.
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const calculatedBuffer = Buffer.from(calculatedHash, "hex");
    const receivedBuffer = Buffer.from(receivedHash, "hex");

    if (
      calculatedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(calculatedBuffer, receivedBuffer)
    ) {
      return null;
    }

    // Проверяем срок действия данных.
    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(authDate) ||
      authDate <= 0 ||
      now - authDate > 86400 ||
      authDate - now > 300
    ) {
      return null;
    }

    // Получаем пользователя только после проверки подписи.
    const rawUser = params.get("user");

    if (!rawUser) return null;

    const telegramUser = JSON.parse(rawUser);
    const telegramId = Number(telegramUser.id);

    if (
      !Number.isSafeInteger(telegramId) ||
      telegramId <= 0
    ) {
      return null;
    }

    return {
      id: String(telegramId),
      username: String(telegramUser.username || ""),
      first_name: String(telegramUser.first_name || "Игрок")
    };
  } catch (error) {
    console.error("TELEGRAM VERIFY ERROR:", error.message);
    return null;
  }
}

// ============================================
// АВТОРИЗАЦИЯ И СОЗДАНИЕ ПРОФИЛЯ
// ============================================

export async function requireUser(req, res) {
  // Проверяем, настроен ли токен бота.
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    reply(res, 500, {
      error: "На сервере не настроен TELEGRAM_BOT_TOKEN."
    });
    return null;
  }

  // Проверяем Telegram initData.
  const initData = getInitData(req);
  const user = verifyTelegram(initData);

  if (!user) {
    reply(res, 401, {
      error: "Не удалось подтвердить Telegram. Открой игру через бота."
    });
    return null;
  }

  try {
    const db = getSupabase();

    // Создаём профиль, если его ещё нет.
    // При повторном входе обновляем только имя и username.
    // Баланс, блокировка и дата бесплатного кейса сохраняются.
    const { data: player, error: upsertError } = await db
      .from("players")
      .upsert(
        {
          telegram_id: user.id,
          username: user.username,
          first_name: user.first_name
        },
        {
          onConflict: "telegram_id"
        }
      )
      .select(
        "telegram_id, username, first_name, balance, banned, last_daily"
      )
      .single();

    if (upsertError) {
      console.error("SUPABASE PROFILE UPSERT ERROR:", {
        message: upsertError.message,
        code: upsertError.code,
        details: upsertError.details,
        hint: upsertError.hint
      });

      reply(res, 500, {
        error: "Не удалось создать профиль игрока. Проверь настройки Supabase."
      });

      return null;
    }

    if (!player) {
      console.error("SUPABASE ERROR: профиль не вернулся после сохранения.");

      reply(res, 500, {
        error: "Профиль игрока не найден."
      });

      return null;
    }

    // Проверяем блокировку.
    if (player.banned) {
      reply(res, 403, {
        error: "Аккаунт заблокирован."
      });

      return null;
    }

    // Администратор определяется по Telegram ID.
    const adminId = String(
      process.env.TELEGRAM_ADMIN_ID || ""
    ).trim();

    return {
      ...user,
      player,
      isAdmin: adminId !== "" && user.id === adminId
    };

  } catch (error) {
    console.error("REQUIRE USER ERROR:", {
      message: error.message,
      code: error.code,
      details: error.details
    });

    reply(res, 500, {
      error: "Ошибка подключения к базе данных. Проверь настройки сервера."
    });

    return null;
  }
}

// ============================================
// ПРОВЕРКА HTTP-МЕТОДА
// ============================================

export function method(req, res, expected) {
  if (req.method !== expected) {
    reply(res, 405, {
      error: "Метод запроса не поддерживается."
    });

    return false;
  }

  return true;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

export function random() {
  return crypto.randomInt(0, 1000000) / 1000000;
}

export function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.max(min, Math.min(max, number));
}
