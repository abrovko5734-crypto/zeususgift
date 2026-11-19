-- ZeusGift: virtual points only. Run this whole file in Supabase SQL Editor.
create table if not exists public.players (
  telegram_id text primary key,
  username text not null default '',
  first_name text not null default 'Игрок',
  balance bigint not null default 0 check (balance >= 0),
  banned boolean not null default false,
  last_daily timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.game_settings (
  id integer primary key check (id=1),
  win_factor numeric not null default 1 check (win_factor between 0.1 and 1.8)
);
insert into public.game_settings(id,win_factor) values(1,1) on conflict(id) do nothing;
create table if not exists public.game_history (
  id bigint generated always as identity primary key,
  telegram_id text not null references public.players(telegram_id),
  game text not null,
  bet bigint not null,
  delta bigint not null,
  won boolean not null,
  detail text not null,
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;
alter table public.game_settings enable row level security;
alter table public.game_history enable row level security;
-- No public policies: all access goes through server-side service role.

create or replace function public.claim_daily_gift(p_telegram_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype; reward_amount bigint;
begin
  select * into p from players where telegram_id=p_telegram_id for update;
  if not found or p.banned then return jsonb_build_object('ok',false); end if;
  if p.last_daily is not null and p.last_daily > now()-interval '24 hours'
    then return jsonb_build_object('ok',false); end if;
  reward_amount := floor(random()*401+100)::bigint;
  update players set balance=balance+reward_amount,last_daily=now() where telegram_id=p_telegram_id returning * into p;
  return jsonb_build_object('ok',true,'balance',p.balance,'reward',reward_amount);
end; $$;

create or replace function public.apply_game_result(
 p_telegram_id text,p_delta bigint,p_game text,p_bet bigint,p_won boolean,p_detail text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype;
begin
 select * into p from players where telegram_id=p_telegram_id for update;
 if not found or p.banned or p.balance < p_bet then return jsonb_build_object('ok',false); end if;
 update players set balance=balance+p_delta where telegram_id=p_telegram_id returning * into p;
 insert into game_history(telegram_id,game,bet,delta,won,detail)
 values(p_telegram_id,p_game,p_bet,p_delta,p_won,p_detail);
 return jsonb_build_object('ok',true,'balance',p.balance);
end; $$;

create or replace function public.admin_change_balance(
 p_admin_id text,p_target_id text,p_amount bigint,p_action text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype; new_balance bigint;
begin
 if p_admin_id <> '7128871752' then return jsonb_build_object('ok',false); end if;
 select * into p from players where telegram_id=p_target_id for update;
 if not found then return jsonb_build_object('ok',false); end if;
 if p_action='add' then new_balance:=p.balance+p_amount;
 elsif p_action='subtract' then new_balance:=greatest(0,p.balance-p_amount);
 elsif p_action='set_balance' then new_balance:=p_amount;
 else return jsonb_build_object('ok',false); end if;
 update players set balance=new_balance where telegram_id=p_target_id;
 return jsonb_build_object('ok',true,'balance',new_balance);
end; $$;
revoke all on function public.claim_daily_gift(text) from public, anon, authenticated;
revoke all on function public.apply_game_result(text,bigint,text,bigint,boolean,text) from public, anon, authenticated;
revoke all on function public.admin_change_balance(text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.claim_daily_gift(text) to service_role;
grant execute on function public.apply_game_result(text,bigint,text,bigint,boolean,text) to service_role;
grant execute on function public.admin_change_balance(text,text,bigint,text) to service_role;
