import { requireUser, reply, method, supabase, clamp } from "../lib/server.js";
export default async function handler(req,res) {
  if (!method(req,res,"POST")) return;
  const auth = await requireUser(req,res); if (!auth) return;
  if (!auth.isAdmin) return reply(res,403,{error:"Доступ только владельцу."});
  const { action, targetId, amount, factor } = req.body || {};
  if (action === "set_factor") {
    const value = clamp(Number(factor),0.1,1.8);
    if (!Number.isFinite(value)) return reply(res,400,{error:"Некорректный коэффициент."});
    const { error } = await supabase.from("game_settings").upsert({id:1,win_factor:value});
    if (error) return reply(res,500,{error:"Не удалось сохранить шанс."});
    return reply(res,200,{ok:true,winFactor:value});
  }
  if (!targetId || !/^\\d{5,20}$/.test(String(targetId))) return reply(res,400,{error:"Укажи Telegram ID игрока."});
  if (action === "ban" || action === "unban") {
    const { error } = await supabase.from("players").update({banned:action==="ban"}).eq("telegram_id",String(targetId));
    if (error) return reply(res,500,{error:"Не удалось изменить блокировку."});
    return reply(res,200,{ok:true,message:action==="ban"?"Игрок заблокирован.":"Блокировка снята."});
  }
  if (action === "add" || action === "subtract" || action === "set_balance") {
    const n = Math.floor(Number(amount));
    if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) return reply(res,400,{error:"Сумма должна быть от 0 до 100 000 000."});
    const { data, error } = await supabase.rpc("admin_change_balance", {
      p_admin_id:auth.id,p_target_id:String(targetId),p_amount:n,p_action:action
    });
    if (error || !data?.ok) return reply(res,400,{error:"Не удалось изменить баланс игрока."});
    return reply(res,200,{ok:true,balance:data.balance,message:"Баланс обновлён."});
  }
  return reply(res,400,{error:"Неизвестная команда."});
}