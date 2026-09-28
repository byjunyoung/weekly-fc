-- (1) 선수 한 명의 능력치 기록 전체(2026-09-28 "고친 기록 보는 거 좀 더 재밌게") — get_all 은 선수마다 8줄만 보낸다.
--     기록은 원래 공개(선수 페이지에 누가 고쳤는지 이름까지 나온다)라 로그인 없이 읽는다.
-- (2) 오늘 방문·활동 수("오늘 페이지 방문자 수, 활동 횟수") — 기기마다 하루 한 줄. 기기 id 는 브라우저가 만든 난수라
--     누가 누구인지 알 수 없다. 로그인한 사람이면 선수 번호만 같이 남겨 "팀원 몇 명"을 센다.

create or replace function public.stat_history(p_num int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ts', s.ts, 'by', s.by, 'by_name', s.by_name, 'num', s.num,
    'field', s.field, 'before', s.before, 'after', s.after, 'via', s.via) order by s.ts, s.id), '[]'::jsonb)
  from (select * from public.stat_log where num = p_num order by ts desc, id desc limit 2000) s
$$;

create table if not exists public.visits (
  day date not null,
  device text not null,
  member_num int,
  ts timestamptz not null default now(),
  primary key (day, device)
);
alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;

-- 방문 한 번 — 같은 기기는 하루 한 줄. 나중에 로그인하면 번호만 채운다.
create or replace function public.hit(p_device text) returns void
language plpgsql security definer set search_path = '' as $$
declare me int;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{8,64}$' then return; end if;
  if auth.uid() is not null then select m.num into me from public.members m where m.user_id = auth.uid(); end if;
  insert into public.visits (day, device, member_num) values (private.today_kst(), p_device, me)
  on conflict (day, device) do update set member_num = coalesce(public.visits.member_num, excluded.member_num);
end $$;

-- 오늘(서울) 숫자들. 방문은 기기 수, 팀원은 로그인해 이름을 고른 사람 수.
create or replace function public.today_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'visitors', (select count(*) from public.visits where day = private.today_kst()),
    'members', (select count(distinct member_num) from public.visits where day = private.today_kst() and member_num is not null),
    'duels', (select count(*) from public.votes where (ts at time zone 'Asia/Seoul')::date = private.today_kst()),
    'guestbook', (select count(*) from public.guestbook where (ts at time zone 'Asia/Seoul')::date = private.today_kst()),
    'potm', (select count(*) from public.potm_votes where (ts at time zone 'Asia/Seoul')::date = private.today_kst()))
$$;

revoke execute on function public.stat_history(int), public.hit(text), public.today_stats() from public, anon, authenticated;
grant execute on function public.stat_history(int), public.hit(text), public.today_stats() to anon, authenticated;

notify pgrst, 'reload schema';
