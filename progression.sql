-- ZEUSGIFT progression expansion. Run after supabase.sql.
alter table public.players add column if not exists xp bigint not null default 0;
alter table public.players add column if not exists level integer not null default 1;
alter table public.players add column if not exists streak integer not null default 0;
alter table public.players add column if not exists streak_claimed_at timestamptz;
alter table public.players add column if not exists season_xp bigint not null default 0;
alter table public.players add column if not exists updated_at timestamptz not null default now();
create table if not exists public.player_inventory(id bigint generated always as identity primary key,telegram_id text not null references public.players(telegram_id) on delete cascade,item_key text not null,item_name text not null,rarity text not null,item_type text not null default 'cosmetic',source text not null default 'case',created_at timestamptz not null default now());
create table if not exists public.progress_claims(id bigint generated always as identity primary key,telegram_id text not null references public.players(telegram_id) on delete cascade,claim_key text not null,reward bigint not null default 0,created_at timestamptz not null default now(),unique(telegram_id,claim_key));
create table if not exists public.achievement_unlocks(telegram_id text not null references public.players(telegram_id) on delete cascade,achievement_key text not null,unlocked_at timestamptz not null default now(),primary key(telegram_id,achievement_key));
create table if not exists public.case_openings(id bigint generated always as identity primary key,telegram_id text not null references public.players(telegram_id) on delete cascade,case_key text not null,item_key text not null,item_name text not null,rarity text not null,cost bigint not null,created_at timestamptz not null default now());
alter table public.player_inventory enable row level security;alter table public.progress_claims enable row level security;alter table public.achievement_unlocks enable row level security;alter table public.case_openings enable row level security;
create or replace function public.award_game_progress(p_telegram_id text,p_won boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype; gained integer;
begin select * into p from players where telegram_id=p_telegram_id for update;if not found or p.banned then return jsonb_build_object('ok',false);end if;gained:=10+case when p_won then 5 else 0 end;
update players set xp=xp+gained,season_xp=season_xp+gained,level=1+floor((xp+gained)/100)::integer,updated_at=now() where telegram_id=p_telegram_id returning * into p;
if p.level>=2 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'first_level') on conflict do nothing;end if;
if p.season_xp>=500 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'season_500') on conflict do nothing;end if;
if (select count(*) from game_history where telegram_id=p_telegram_id)>=10 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'games_10') on conflict do nothing;end if;
return jsonb_build_object('ok',true,'xp_gained',gained,'xp',p.xp,'level',p.level,'season_xp',p.season_xp);end;$$;
create or replace function public.open_virtual_case(p_telegram_id text,p_case_key text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype; cost_amount bigint; roll numeric; r text; item text; ik text; new_id bigint;
begin if p_case_key not in ('storm','olympus','mythic') then return jsonb_build_object('ok',false,'error','unknown_case');end if;cost_amount:=case p_case_key when 'storm' then 250 when 'olympus' then 750 else 2000 end;
select * into p from players where telegram_id=p_telegram_id for update;if not found or p.banned or p.balance<cost_amount then return jsonb_build_object('ok',false,'error','insufficient_balance');end if;roll:=random()*100;
if p_case_key='storm' then r:=case when roll<60 then 'common' when roll<88 then 'rare' when roll<98 then 'epic' else 'legendary' end;elsif p_case_key='olympus' then r:=case when roll<35 then 'common' when roll<72 then 'rare' when roll<94 then 'epic' else 'legendary' end;else r:=case when roll<15 then 'common' when roll<55 then 'rare' when roll<85 then 'epic' else 'legendary' end;end if;
item:=case r when 'common' then (array['Облачный фрагмент','Серебряная искра','Перо ветра'])[1+floor(random()*3)::int] when 'rare' then (array['Сапфир небес','Громовой знак','Лавровый жетон'])[1+floor(random()*3)::int] when 'epic' then (array['Крыло Олимпа','Сфера эфира','Щит Афины'])[1+floor(random()*3)::int] else (array['Трезубец Зевса','Корона Олимпа','Сердце бури'])[1+floor(random()*3)::int] end;ik:=lower(replace(item,' ','_'));
update players set balance=balance-cost_amount,updated_at=now() where telegram_id=p_telegram_id returning * into p;
insert into player_inventory(telegram_id,item_key,item_name,rarity,source) values(p_telegram_id,ik,item,r,p_case_key) returning id into new_id;
if r='legendary' then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'legendary') on conflict do nothing;end if;
if (select count(*) from player_inventory where telegram_id=p_telegram_id)>=5 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'collector') on conflict do nothing;end if;
insert into case_openings(telegram_id,case_key,item_key,item_name,rarity,cost) values(p_telegram_id,p_case_key,ik,item,r,cost_amount);
return jsonb_build_object('ok',true,'balance',p.balance,'item',jsonb_build_object('id',new_id,'key',ik,'name',item,'rarity',r));end;$$;
create or replace function public.claim_progress_reward(p_telegram_id text,p_claim_key text,p_reward bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype;
begin if p_claim_key !~ '^(quest_[a-z0-9_]+|pass_[0-9]+|achievement_[a-z0-9_]+)$' then return jsonb_build_object('ok',false);end if;
insert into progress_claims(telegram_id,claim_key,reward) values(p_telegram_id,p_claim_key,p_reward) on conflict do nothing;if not found then return jsonb_build_object('ok',false,'duplicate',true);end if;
update players set balance=balance+p_reward,updated_at=now() where telegram_id=p_telegram_id returning * into p;return jsonb_build_object('ok',true,'balance',p.balance,'reward',p_reward);end;$$;
create or replace function public.claim_streak_reward(p_telegram_id text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p players%rowtype; today date; lastdate date; reward bigint;
begin select * into p from players where telegram_id=p_telegram_id for update;if not found or p.banned then return jsonb_build_object('ok',false);end if;today:=current_date;lastdate:=coalesce(p.streak_claimed_at::date,'1900-01-01');if lastdate=today then return jsonb_build_object('ok',false,'claimed',true);end if;
if lastdate=today-1 then p.streak:=p.streak+1;else p.streak:=1;end if;reward:=100+least(p.streak,7)*50;
update players set streak=p.streak,streak_claimed_at=now(),balance=balance+reward,xp=xp+20,season_xp=season_xp+20,level=1+floor((xp+20)/100)::int,updated_at=now() where telegram_id=p_telegram_id returning * into p;if p.streak>=3 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'streak_3') on conflict do nothing;end if;if p.level>=2 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'first_level') on conflict do nothing;end if;if p.season_xp>=500 then insert into achievement_unlocks(telegram_id,achievement_key) values(p_telegram_id,'season_500') on conflict do nothing;end if;return jsonb_build_object('ok',true,'reward',reward,'balance',p.balance,'streak',p.streak,'xp',p.xp,'level',p.level);end;$$;
grant execute on function public.award_game_progress(text,boolean) to service_role;grant execute on function public.open_virtual_case(text,text) to service_role;grant execute on function public.claim_progress_reward(text,text,bigint) to service_role;grant execute on function public.claim_streak_reward(text) to service_role;

revoke all on function public.award_game_progress(text,boolean) from public,anon,authenticated;revoke all on function public.open_virtual_case(text,text) from public,anon,authenticated;revoke all on function public.claim_progress_reward(text,text,bigint) from public,anon,authenticated;revoke all on function public.claim_streak_reward(text) from public,anon,authenticated;
