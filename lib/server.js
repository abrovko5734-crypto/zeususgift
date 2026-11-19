
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Проверяем настройки Supabase
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  if (!url.startsWith("https://")) {
    throw new Error("SUPABASE_URL must be an HTTPS URL");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

// Создаём клиент только при первом обращении,
// чтобы отсутствие переменных не ломало запуск функции.
let client;

export const supabase = new Proxy({}, {
  get(_target, property) {
    if (!client) client = getSupabase();

    const value = client[property];

    return typeof value === "function"
      ? value.bind(client)
      : value;
  }
});

// Универсальный JSON-ответ
export function reply(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.json(data);
}

// Получаем Telegram initData
export function getInitData(req) {
  const value = req.headers?.["x-telegram-init-data"];

  return typeof value === "string" ? value : "";
}

// Проверяем подлинность Telegram WebApp
export function verifyTelegram(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !initData) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      return null;
    }

    params.delete("hash");

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(authDate) ||
      !authDate ||
      now - authDate > 86400 ||
      authDate > now + 60
    ) {
      return null;
    }

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secret = crypto
      .createHmac("sha256", "WebAppData")
      .update(token)
      .digest();

    const calculated = crypto
      .createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");

    const received = Buffer.from(hash, "hex");
    const expected = Buffer.from(calculated, "hex");

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

// Проверяем игрока и загружаем профиль
export async function requireUser(req, res) {
  const user = verifyTelegram(getInitData(req));

  if (!user) {
    reply(res, 401, {
      error: "Открой приложение через Telegram-бота."
    });
    return null;
  }

  try {
    const { error: upsertError } = await supabase
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

    if (upsertError) {
      console.error("SUPABASE UPSERT ERROR:", {
        message: upsertError.message,
        code: upsertError.code,
        details: upsertError.details,
        hint: upsertError.hint
      });

      reply(res, 500, {
        error: "Не удалось создать профиль игрока."
      });

      return null;
    }

    const { data, error: readError } = await supabase
      .from("players")
      .select(
        "telegram_id,username,first_name,balance,banned,last_daily"
      )
      .eq("telegram_id", user.id)
      .maybeSingle();

    if (readError) {
      console.error("SUPABASE READ ERROR:", {
        message: readError.message,
        code: readError.code,
        details: readError.details,
        hint: readError.hint
      });

      reply(res, 500, {
        error: "Ошибка чтения профиля."
      });

      return null;
    }

    if (!data) {
      reply(res, 500, {
        error: "Профиль игрока не найден."
      });

      return null;
    }

    if (data.banned) {
      reply(res, 403, {
        error: "Аккаунт заблокирован."
      });

      return null;
    }

    return {
      ...user,
      player: data,
      isAdmin:
        user.id === String(process.env.TELEGRAM_ADMIN_ID || "7128871752")
    };

  } catch (error) {
    console.error("PROFILE SERVER ERROR:", error);

    reply(res, 500, {
      error: "Внутренняя ошибка загрузки профиля."
    });

    return null;
  }
}

// Проверка HTTP-метода
export function method(req, res, expected) {
  if (req.method !== expected) {
    reply(res, 405, {
      error: "Метод не поддерживается."
    });

    return false;
  }

  return true;
}

// Случайное число от 0 до 1
export function random() {
  return crypto.randomInt(0, 1000000) / 1000000;
}

// Ограничение значения
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
