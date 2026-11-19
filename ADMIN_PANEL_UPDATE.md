# ZeusGift Admin Control Center

## Included
- Server-only admin authorization based on verified Telegram WebApp initData.
- Live dashboard stats: users, game rounds, total virtual points, inventory count.
- Recent global game activity.
- Player lookup by Telegram numeric ID.
- Per-player balance add, subtract, set, ban and unban actions.
- Per-player recent game history.
- Global win-factor slider with explicit save action.
- Animated responsive interface with status indicator, metric cards, refresh state and staggered entrance.

## Deployment
1. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_ADMIN_ID` configured in Vercel.
2. Ensure the SQL in `supabase.sql` has been applied. It creates `admin_change_balance`.
3. Ensure `TELEGRAM_ADMIN_ID` matches the admin ID hard-coded in `admin_change_balance` in `supabase.sql` (default `7128871752`).
4. Apply `progression.sql` as well if you want the inventory count and progression sections.
5. Deploy the updated files.

## Security notes
- Never put Supabase service-role credentials in frontend variables or source files.
- All admin endpoints call `requireUser` and reject non-admin Telegram users.
- Admin operations are performed server-side. The browser only sends action parameters.
- The win-factor setting changes game outcome probabilities; it is a gameplay configuration, not a payout or money feature.
