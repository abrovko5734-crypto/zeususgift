import { requireUser, reply, method, supabase, random, clamp } from "../lib/server.js";
export default async function handler(req,res) {
  if (!method(req,res,"POST")) return;
  const auth = await requireUser(req,res); if (!auth) return;
  const { game, bet: rawBet, choice, risk } = req.body || {};
  const bet = Math.floor(Number(rawBet));
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000) return reply(res,400,{error:"Ставка должна быть от 1 до 1 000 000 очков."});
  if (bet > Number(auth.player.balance)) return reply(res,400,{error:"Недостаточно очков."});
  const { data: cfg } = await supabase.from("game_settings").select("win_factor").eq("id",1).maybeSingle();
  const factor = clamp(Number(cfg?.win_factor ?? 1),0.1,1.8);
  let probability, multiplier, won, detail;
  if (game === "roulette") {
    if (!["red","black"].includes(choice)) return reply(res,400,{error:"Выбери красное или чёрное."});
    probability = clamp(0.47*factor,0.05,0.90); multiplier = 2;
    won = random() < probability; detail = won ? `Выпало ${choice === "red" ? "красное" : "чёрное"}!` : "Не повезло в этот раз.";
  } else if (game === "mines") {
    const mines = clamp(Math.floor(Number(risk)||3),3,8);
    const safePicks = 1;
    probability = clamp(((25-mines)/25)*factor,0.05,0.92);
    multiplier = 0.94/probability;
    won = random() < probability; detail = won ? "Ты нашёл безопасную клетку!" : "Мина! Раунд проигран.";
  } else if (game === "crash") {
    const target = clamp(Number(choice)||2,1.2,10);
    probability = clamp((0.96/target)*factor,0.03,0.95);
    multiplier = target;
    won = random() < probability; detail = won ? `Зевсик добежал до x${target.toFixed(2)}!` : "Молния ударила рядом — Зевсик упал!";
  } else if (game === "upgrader") {
    const target = [2,3,5,10].includes(Number(choice)) ? Number(choice) : 2;
    probability = clamp((0.94/target)*factor,0.02,0.95);
    multiplier = target;
    won = random() < probability; detail = won ? `Улучшение x${target} удалось!` : "Улучшение сорвалось.";
  } else return reply(res,400,{error:"Неизвестная игра."});
  const delta = won ? Math.max(1,Math.floor(bet*(multiplier-1))) : -bet;
  const { data, error } = await supabase.rpc("apply_game_result", {
    p_telegram_id: auth.id, p_delta: delta, p_game: game, p_bet: bet,
    p_won: won, p_detail: detail
  });
  if (error || !data?.ok) return reply(res,400,{error:"Не удалось завершить раунд. Проверь баланс и попробуй ещё раз."});
  let progression = null;
  try { const pr = await supabase.rpc("award_game_progress", { p_telegram_id: auth.id, p_won: won }); if (!pr.error) progression = pr.data; } catch (_) {}
  return reply(res,200,{won,delta,balance:data.balance,detail,multiplier:won?multiplier:0,probability,progression});
}