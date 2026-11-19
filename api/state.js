import { requireUser, reply, method, supabase } from "../lib/server.js";
export default async function handler(req,res) {
  if (!method(req,res,"GET")) return;
  const auth = await requireUser(req,res); if (!auth) return;
  const { data: settings } = await supabase.from("game_settings").select("win_factor").eq("id",1).maybeSingle();
  return reply(res,200,{ player: auth.player, isAdmin: auth.isAdmin,
    winFactor: settings?.win_factor ?? 1,
    dailyAvailable: !auth.player.last_daily || Date.now()-new Date(auth.player.last_daily).getTime() >= 86400000 });
}