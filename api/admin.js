import { requireUser, reply, method, supabase, clamp } from "../lib/server.js";

export default async function handler(req,res) {
  if (!['GET','POST'].includes(req.method)) return reply(res,405,{error:'Метод не поддерживается.'});
  const auth = await requireUser(req,res); if (!auth) return;
  if (!auth.isAdmin) return reply(res,403,{error:"Доступ только владельцу."});

  if (req.method === 'GET') {
    const [players, history, settings, inventory] = await Promise.all([
      supabase.from('players').select('telegram_id,username,first_name,balance,banned,xp,level,created_at').order('created_at',{ascending:false}).limit(8),
      supabase.from('game_history').select('id,telegram_id,game,bet,delta,won,created_at').order('created_at',{ascending:false}).limit(8),
      supabase.from('game_settings').select('win_factor').eq('id',1).maybeSingle(),
      supabase.from('player_inventory').select('id',{count:'exact',head:true})
    ]);
    if (players.error || history.error) return reply(res,500,{error:'Не удалось загрузить данные панели.'});
    const {count: playerCount,error:countError}=await supabase.from('players').select('*',{count:'exact',head:true});
    const {count:roundCount,error:roundError}=await supabase.from('game_history').select('*',{count:'exact',head:true});
    const {data:sumData,error:sumError}=await supabase.from('players').select('balance');
    if(countError||roundError||sumError) return reply(res,500,{error:'Не удалось получить статистику.'});
    return reply(res,200,{stats:{players:playerCount||0,rounds:roundCount||0,balance:(sumData||[]).reduce((s,p)=>s+Number(p.balance||0),0),items:inventory.count||0},players:players.data||[],history:history.data||[],winFactor:settings.data?.win_factor??1});
  }

  const { action, targetId, amount, factor } = req.body || {};
  if (action === 'lookup') {
    if (!/^\d{5,20}$/.test(String(targetId||''))) return reply(res,400,{error:'Укажи корректный Telegram ID.'});
    const [{data:player,error},{data:history}] = await Promise.all([
      supabase.from('players').select('telegram_id,username,first_name,balance,banned,xp,level,streak,season_xp,created_at,last_daily').eq('telegram_id',String(targetId)).maybeSingle(),
      supabase.from('game_history').select('id,game,bet,delta,won,created_at').eq('telegram_id',String(targetId)).order('created_at',{ascending:false}).limit(6)
    ]);
    if(error) return reply(res,500,{error:'Ошибка поиска игрока.'});
    if(!player) return reply(res,404,{error:'Игрок не найден.'});
    return reply(res,200,{player,history:history||[]});
  }
  if (action === 'set_factor') {
    const value = Number(factor);
    if (!Number.isFinite(value) || value < .1 || value > 1.8) return reply(res,400,{error:'Коэффициент должен быть от 0.1 до 1.8.'});
    const { error } = await supabase.from('game_settings').upsert({id:1,win_factor:value});
    if (error) return reply(res,500,{error:'Не удалось сохранить параметры.'});
    return reply(res,200,{ok:true,winFactor:value,message:'Параметры сохранены.'});
  }
  if (!targetId || !/^\d{5,20}$/.test(String(targetId))) return reply(res,400,{error:'Укажи Telegram ID игрока.'});
  if (action === 'ban' || action === 'unban') {
    const { data,error } = await supabase.from('players').update({banned:action==='ban'}).eq('telegram_id',String(targetId)).select('telegram_id').maybeSingle();
    if (error || !data) return reply(res,404,{error:'Игрок не найден или действие не выполнено.'});
    return reply(res,200,{ok:true,message:action==='ban'?'Игрок заблокирован.':'Блокировка снята.'});
  }
  if (['add','subtract','set_balance'].includes(action)) {
    const n = Math.floor(Number(amount));
    if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) return reply(res,400,{error:'Сумма должна быть от 0 до 100 000 000.'});
    const { data,error } = await supabase.rpc('admin_change_balance',{p_admin_id:auth.id,p_target_id:String(targetId),p_amount:n,p_action:action});
    if (error || !data?.ok) return reply(res,400,{error:'Не удалось изменить баланс. Проверь SQL-функцию admin_change_balance.'});
    return reply(res,200,{ok:true,balance:data.balance,message:'Баланс игрока обновлён.'});
  }
  return reply(res,400,{error:'Неизвестная команда.'});
}
