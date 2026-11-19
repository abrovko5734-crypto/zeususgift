# ZEUSGIFT progression update

## Install the database migration

1. Open Supabase project → SQL Editor.
2. Paste and run `progression.sql` **after** the existing `supabase.sql` setup.
3. Deploy the updated Vercel project.

The migration adds player XP/level/streak fields and tables for inventory, case history, claims, and achievements. It also installs server-side RPCs used by the API.

## Features

- XP: +10 per completed game, +5 on a win. XP/season XP/level are updated through a server-side RPC after the existing game-result transaction.
- Daily streak: claim once per calendar day. Reward grows by streak day (caps at day 7); +20 XP.
- Virtual cases: Storm (250), Olympus (750), Mythic (2,000) virtual points. Item selection and deduction are atomic server-side; rarity rolls are server-generated. Items are stored in `player_inventory`.
- Quests: account-wide milestones; claims are server-validated and unique.
- Season path: claimable milestones at 0/100/250/500/1,000 season XP.
- Achievements: server-unlocked first-level, 10 games, 5 inventory items, legendary item, 3-day streak, and 500 season XP.
- Inventory and history: fetched from Supabase for the authenticated Telegram user.

Everything is virtual. Case items have no cash value, no cash-out, and no real-money purchase functionality.

## Important

If the migration is not applied, the original game will still run but progression/case pages will show backend setup errors when used. Never expose the Supabase service-role key to the browser. Keep it only in server environment variables.
