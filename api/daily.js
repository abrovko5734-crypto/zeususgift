import { requireUser, reply, method, supabase } from "../lib/server.js";
export default async function handler(req,res) {
  if (!method(req,res,"POST")) return;
  const auth = await requireUser(req,res); if (!auth) return;
  const { data, error } = await supabase.rpc("claim_daily_gift", { p_telegram_id: auth.id });
  if (error) return reply(res,500,{error:"Не удалось открыть бесплатный кейс."});
  if (!data?.ok) return reply(res,409,{error:"Бесплатный кейс уже использован. Попробуй позже."});
  return reply(res,200,{balance:data.balance,reward:data.reward});
}