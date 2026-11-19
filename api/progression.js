import { requireUser, reply, method, supabase } from "../lib/server.js";
export default async function handler(req,res){
 const auth=await requireUser(req,res);if(!auth)return;
 if(req.method==="GET"){
  const [inv,claims,ach,history]=await Promise.all([
   supabase.from("player_inventory").select("id,item_key,item_name,rarity,item_type,source,created_at").eq("telegram_id",auth.id).order("created_at",{ascending:false}).limit(100),
   supabase.from("progress_claims").select("claim_key,reward,created_at").eq("telegram_id",auth.id),
   supabase.from("achievement_unlocks").select("achievement_key,unlocked_at").eq("telegram_id",auth.id),
   supabase.from("game_history").select("id,game,bet,delta,won,created_at").eq("telegram_id",auth.id).order("created_at",{ascending:false}).limit(100)
  ]);
  for(const q of [inv,claims,ach,history])if(q.error)return reply(res,500,{error:"Не удалось загрузить прогресс."});
  const p=auth.player;
  return reply(res,200,{player:{xp:p.xp||0,level:p.level||1,streak:p.streak||0,streak_claimed_at:p.streak_claimed_at,season_xp:p.season_xp||0,balance:p.balance},inventory:inv.data||[],claims:(claims.data||[]).map(x=>x.claim_key),achievements:ach.data||[],history:history.data||[]});
 }
 if(!method(req,res,"POST"))return;
 const {action,key}=req.body||{};
 if(action==="case"){
  const {data,error}=await supabase.rpc("open_virtual_case",{p_telegram_id:auth.id,p_case_key:key});
  if(error)return reply(res,500,{error:"Сундук не удалось открыть. Сначала запусти progression.sql в Supabase."});
  if(!data?.ok)return reply(res,400,{error:data.error==="insufficient_balance"?"Недостаточно очков для этого сундука.":"Неизвестный сундук."});
  return reply(res,200,data);
 }
 if(action==="claim"){
  const rewards={quest_first_round:25,quest_three_games:50,quest_five_rounds:75,achievement_first_level:100,achievement_collector:150,pass_1:50,pass_2:100,pass_3:150,pass_4:250,pass_5:400};
  if(!Object.hasOwn(rewards,key))return reply(res,400,{error:"Награда не найдена."});
  const [{count:roundCount},{data:games},{count:invCount},{data:ach}]=await Promise.all([
   supabase.from("game_history").select("id",{count:"exact",head:true}).eq("telegram_id",auth.id),
   supabase.from("game_history").select("game").eq("telegram_id",auth.id),
   supabase.from("player_inventory").select("id",{count:"exact",head:true}).eq("telegram_id",auth.id),
   supabase.from("achievement_unlocks").select("achievement_key").eq("telegram_id",auth.id)
  ]);
  const uniqueGames=new Set((games||[]).map(g=>g.game)).size;const unlocked=new Set((ach||[]).map(a=>a.achievement_key));
  const seasonXp=Number(auth.player.season_xp||0);
  const passRequired={pass_1:0,pass_2:100,pass_3:250,pass_4:500,pass_5:1000};
  const conditions={quest_first_round:roundCount>=1,quest_three_games:uniqueGames>=3,quest_five_rounds:roundCount>=5,achievement_first_level:unlocked.has("first_level"),achievement_collector:(invCount||0)>=5,pass_1:seasonXp>=passRequired.pass_1,pass_2:seasonXp>=passRequired.pass_2,pass_3:seasonXp>=passRequired.pass_3,pass_4:seasonXp>=passRequired.pass_4,pass_5:seasonXp>=passRequired.pass_5};
  if(!conditions[key])return reply(res,409,{error:"Сначала выполни условие этой награды."});
  const {data,error}=await supabase.rpc("claim_progress_reward",{p_telegram_id:auth.id,p_claim_key:key,p_reward:rewards[key]});
  if(error)return reply(res,500,{error:"Награды не настроены. Выполни progression.sql в Supabase."});
  if(!data?.ok)return reply(res,409,{error:"Эта награда уже забрана."});return reply(res,200,data);
 }
 if(action==="daily_quest"){
  const today=new Date().toISOString().slice(0,10);const start=`${today}T00:00:00.000Z`;
  const [{data:rounds},{data:gamesToday}]=await Promise.all([
   supabase.from("game_history").select("id,won,game,created_at").eq("telegram_id",auth.id).gte("created_at",start),
   supabase.from("game_history").select("game").eq("telegram_id",auth.id).gte("created_at",start)
  ]);
  const rows=rounds||[];const keys={daily_play:{ok:rows.length>=1,reward:50},daily_win:{ok:rows.some(x=>x.won),reward:100},daily_variety:{ok:new Set((gamesToday||[]).map(x=>x.game)).size>=2,reward:150}};
  if(!keys[key]?.ok)return reply(res,409,{error:"Испытание ещё не выполнено."});
  const claimKey=`quest_${key}_${today.replaceAll("-","")}`;
  const {data,error}=await supabase.rpc("claim_progress_reward",{p_telegram_id:auth.id,p_claim_key:claimKey,p_reward:keys[key].reward});
  if(error)return reply(res,500,{error:"Не удалось получить награду."});if(!data?.ok)return reply(res,409,{error:"Награда за сегодня уже получена."});return reply(res,200,data);
 }
 if(action==="streak"){
  const {data,error}=await supabase.rpc("claim_streak_reward",{p_telegram_id:auth.id});
  if(error)return reply(res,500,{error:"Серия входов не настроена. Выполни progression.sql в Supabase."});
  if(!data?.ok)return reply(res,409,{error:"Награда за сегодня уже получена."});return reply(res,200,data);
 }
 return reply(res,400,{error:"Неизвестное действие."});
}
