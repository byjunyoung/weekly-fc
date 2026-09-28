-- POTM 능력치 보상(2026-09-28 "POTM 먹으면 능력치 상향"). 투표는 경기 당일 자정에 닫히므로(20260926000000),
-- 다음 날 0시 5분(서울)에 전날까지 끝난 매치의 1위에게 여섯 항목 +1(99 가 끝). 공동이면 모두, 표가 없으면 아무도.
-- 같은 매치는 potm_awards 한 줄로 한 번만. 배치 전(0) 항목은 건드리지 않는다. 기록은 stat_log via = 'potm'.
-- 적용은 이 규칙을 넣은 날(2026-09-28) 이후 매치부터 — 그 전 매치(9/26)는 따로 정한다.

create table if not exists public.potm_awards (
  match_id bigint primary key references public.matches (id) on delete cascade,
  nums int[] not null default '{}',
  ts timestamptz not null default now()
);
alter table public.potm_awards enable row level security;
revoke all on public.potm_awards from anon, authenticated;

-- p_today 는 테스트용(되돌리는 트랜잭션에서 날짜를 당겨 본다). 예약 작업은 인자 없이 부른다.
create or replace function private.settle_potm(p_today date default null) returns int
language plpgsql security definer set search_path = '' as $$
declare m record; top int[]; n int; f text; before_v int; done int := 0;
begin
  for m in
    select x.id from public.matches x
    where x.date < coalesce(p_today, private.today_kst()) and x.date >= date '2026-09-28'
      and not exists (select 1 from public.potm_awards a where a.match_id = x.id)
    order by x.date
  loop
    select coalesce(array_agg(t.target order by t.target), '{}') into top
      from (select target, count(*) c from public.potm_votes where match_id = m.id group by target) t
      where t.c = (select max(c) from (select count(*) c from public.potm_votes where match_id = m.id group by target) y);
    foreach n in array top loop
      foreach f in array array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] loop
        execute format('select coalesce(%I, 0) from public.players where num = $1 for update', f) into before_v using n;
        if before_v is not null and before_v > 0 and before_v < 99 then
          execute format('update public.players set %I = $1 where num = $2', f) using before_v + 1, n;
          insert into public.stat_log (ts, by, by_name, num, field, before, after, via)
            values (clock_timestamp(), null, '', n, f, before_v, before_v + 1, 'potm');
        end if;
      end loop;
    end loop;
    insert into public.potm_awards (match_id, nums) values (m.id, top);
    done := done + 1;
  end loop;
  return done;
end $$;
revoke execute on function private.settle_potm(date) from public, anon, authenticated;

-- 매일 15:05 UTC = 서울 0시 5분.
create extension if not exists pg_cron;
select cron.unschedule('settle-potm') where exists (select 1 from cron.job where jobname = 'settle-potm');
select cron.schedule('settle-potm', '5 15 * * *', 'select private.settle_potm()');
