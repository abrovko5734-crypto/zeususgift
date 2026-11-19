# ZEUSGIFT — Celestial Expansion

## What's new

- **Daily Trials**: three server-validated daily goals (play a round, win a round, play two different modes), with one-time rewards per UTC day.
- **Relic Forge**: equip owned collection items in two cosmetic slots (relic and aura). The chosen cosmetic slots are saved in this device's local storage; they do not change game odds or rewards.
- **Settings**: toggles for motion effects, short result sounds and Telegram haptic feedback; settings are stored locally.
- **Case opening**: selected chest gets a dedicated opening animation and the item reveal receives rarity styling.
- **Game feedback**: optional haptic/sound feedback after server returns a round result.
- **Crash copy**: loss description now explicitly says Zeus is struck by lightning.
- **Home hub**: new shortcut cards for daily trials, forge and settings.
- **Compatibility repair**: corrected an unmatched `section` tag in the game view that prevented JSX compilation.

## Daily reward API

`POST /api/progression` with `{ "action":"daily_quest", "key":"daily_play" }`, or `daily_win` / `daily_variety`.

The endpoint reads today's game history server-side, checks the goal, and uses the existing `claim_progress_reward` RPC with a date-stamped claim key to prevent duplicate rewards. It uses UTC reset boundaries.

## Install

1. Deploy the frontend and API files from this package.
2. If the earlier progression migration has already been applied, no additional SQL migration is required for daily trials; they use the existing `progress_claims` table and `claim_progress_reward` function.
3. If not, apply `progression.sql` according to `PROGRESSION_SETUP.md`.
4. Redeploy on Vercel and open the Telegram Mini App.

## Notes

- All rewards and cases use virtual in-app points only.
- The Relic Forge cosmetic equip selections and settings are device-local.
- Daily challenges are checked on the server; local UI is only a display of server history.
- This release's JSX was transpiled for syntax validation and API files passed Node syntax checks. A full Vite production build could not be run because dependency installation timed out in the environment.
