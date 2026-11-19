# ZeusGift — Telegram Mini App

Небесная мини-игра на виртуальных очках. В проекте нет реальных денег, депозитов, вывода средств или призов с денежной стоимостью.

## Что есть
- Профиль Telegram и баланс: новый игрок начинает с **0**.
- Бесплатный кейс раз в 24 часа (случайно 100–500 виртуальных очков).
- Игровые режимы: рулетка, мины, краш (Зевсик бежит, при проигрыше его поражает молния), апгрейдер.
- Серверный расчёт исходов и сохранение баланса в Supabase.
- Закрытая админ-панель только для Telegram ID `7128871752`: выдать/списать/установить очки, бан/разбан, настройка общего коэффициента вероятностей.
- Политика конфиденциальности.

## 1. Создай базу Supabase
1. Создай проект на https://supabase.com/.
2. Открой **SQL Editor → New query**.
3. Вставь весь файл `supabase.sql` и нажми Run.
4. В Project Settings → API скопируй Project URL и `service_role` key. `service_role` — секрет, не публикуй его.

## 2. Создай Telegram-бота
1. Открой `@BotFather`, выполни `/newbot` и создай бота.
2. Скопируй токен бота.
3. После публикации сайта укажи URL Mini App через BotFather (`/mybots` → твой бот → Bot Settings → Menu Button / Configure Mini App).
4. В настройках Mini App укажи HTTPS URL сайта на Vercel.

## 3. Переменные окружения Vercel
Импортируй GitHub-репозиторий в Vercel, затем Project → Settings → Environment Variables добавь:

| Имя | Значение |
|---|---|
| `SUPABASE_URL` | Project URL из Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key из Supabase |
| `TELEGRAM_BOT_TOKEN` | токен от BotFather |
| `TELEGRAM_ADMIN_ID` | `7128871752` |
| `TELEGRAM_ADMIN_USERNAME` | `Keldisqq` (для справки; проверяется именно ID) |

После добавления переменных сделай Redeploy. Не добавляй секреты в `VITE_*` переменные и не коммить `.env`.

## 4. Запуск локально
```bash
cp .env.example .env
npm install
npm run dev
```
Локальный запуск вне Telegram не авторизует пользователя — это намеренно. Для настоящего теста открой Mini App через Telegram после настройки HTTPS.

## 5. GitHub
Распакуй ZIP, создай новый репозиторий GitHub и загрузи содержимое папки. Убедись, что `.env` не попал в репозиторий. Vercel → Add New → Project → Import Git Repository.

## Важные ограничения
- Баланс и награды — только виртуальные очки, без денежной стоимости.
- Нет платёжных интеграций, депозитов, вывода средств или покупки очков.
- Админ-доступ проверяется сервером по проверенному Telegram `initData` и ID `7128871752`; username сам по себе не даёт доступ.
- Коэффициент в админке меняет вероятность выигрыша в игровых режимах. Не используй проект как денежное казино.
- Перед публичным запуском проверь требования Telegram, Vercel и Supabase, а также актуальные законы и возрастные ограничения для своей аудитории.

---

## Olympus progression expansion (November 2026)

This archive includes the new progression features. **Before deploying, run `progression.sql` in Supabase SQL Editor after your original `supabase.sql` migration.** It adds XP, levels, streaks, case inventory, unique reward claims and achievement unlocks, plus the server RPCs used by the new `/api/progression` endpoint.

See `PROGRESSION_SETUP.md` for details and the exact feature list. The new frontend sections include Cases, Level/XP, daily streaks, Achievements, Season Pass, server-backed Inventory and persistent Round History.


## Celestial Expansion (2026)

See `MEGA_UPDATE_2026.md` for daily trials, cosmetic relic forge, settings, result feedback, and installation notes.

## Admin Control Center update (November 2026)

The admin panel now loads live Supabase totals (registered players, rounds, total virtual-point balance and inventory item count), recent round activity, and the current win factor. It includes Telegram-ID player lookup, player balance actions, ban/unban, per-player recent round history, and a global factor slider. The interface has animated panel entrance, live status pulse, refresh animation, metric cards and responsive controls.

Admin API access is restricted server-side through verified Telegram `initData` and `TELEGRAM_ADMIN_ID`. The browser never receives the Supabase service-role key. Player balance changes still use the `admin_change_balance` SQL RPC from `supabase.sql`; the Telegram admin ID in that SQL function must match `TELEGRAM_ADMIN_ID`.

To deploy this update, replace the project files with this archive and redeploy. No new SQL migration is required beyond the earlier `supabase.sql` and `progression.sql` migrations. The inventory metric is optional and displays zero if the progression inventory table has not been created yet.
