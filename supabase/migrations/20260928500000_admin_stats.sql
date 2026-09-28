-- 관리자 통계(2026-09-28 "누가 얼마나 접속했고 사용자 현황 파악"). 방문은 기기·하루 한 줄에 페이지뷰 수와 마지막 시각을 더한다.
-- 로그인한 사람이면 그 줄에 선수 번호가 붙는다 — 로그인 안 한 방문은 기기 수로만 센다(누구인지 모른다).

alter table public.visits add column if not exists views int not null default 1;
alter table public.visits add column if not exists last_ts timestamptz not null default now();

create or replace function public.hit(p_device text) returns void
language plpgsql security definer set search_path = '' as $$
declare me int;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{8,64}$' then return; end if;
  if auth.uid() is not null then select m.num into me from public.members m where m.user_id = auth.uid(); end if;
  insert into public.visits (day, device, member_num) values (private.today_kst(), p_device, me)
  on conflict (day, device) do update set member_num = coalesce(excluded.member_num, public.visits.member_num),
    views = public.visits.views + 1, last_ts = now();
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t date := private.today_kst();
begin
  perform private.require_admin();
  return jsonb_build_object(
    'today', t,
    -- 최근 30일 날짜별: 방문 기기·접속 팀원·페이지뷰·대결 판수
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date,
        'devices', (select count(*) from public.visits v where v.day = d::date),
        'members', (select count(distinct v.member_num) from public.visits v where v.day = d::date and v.member_num is not null),
        'views', (select coalesce(sum(v.views), 0) from public.visits v where v.day = d::date),
        'duels', (select count(*) from public.votes x where (x.ts at time zone 'Asia/Seoul')::date = d::date)
      ) order by d), '[]'::jsonb) from generate_series(t - 29, t, interval '1 day') d),
    -- 선수마다: 계정 연결, 최근 방문, 30일 방문 일수·페이지뷰, 대결·방명록·POTM 표
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
        'num', p.num, 'name', p.name,
        'claimed_at', m.claimed_at,
        'last_visit', (select max(v.last_ts) from public.visits v where v.member_num = p.num),
        'visit_days', (select count(*) from public.visits v where v.member_num = p.num and v.day > t - 30),
        'views', (select coalesce(sum(v.views), 0) from public.visits v where v.member_num = p.num and v.day > t - 30),
        'duels', (select count(*) from public.votes x where x.voter = m.user_id),
        'duels_7d', (select count(*) from public.votes x where x.voter = m.user_id and (x.ts at time zone 'Asia/Seoul')::date > t - 7),
        'last_duel', (select max(x.ts) from public.votes x where x.voter = m.user_id),
        'guestbook', (select count(*) from public.guestbook g where g.author = m.user_id),
        'potm_votes', (select count(*) from public.potm_votes pv where pv.voter = m.user_id)
      ) order by p.num), '[]'::jsonb)
      from public.players p left join public.members m on m.num = p.num)
  );
end $$;

revoke execute on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_stats() to anon, authenticated;

notify pgrst, 'reload schema';
