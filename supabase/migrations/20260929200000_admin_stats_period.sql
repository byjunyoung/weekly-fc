-- 관리자 통계 기간 필터(2026-09-29 "기간 필터는 상단에") — p_days: 1 = 오늘, 7, 30, null = 전체.
-- 방문·페이지뷰·대결·방명록·POTM 표는 전부 그 기간 안에서 센다. 최근 활동·계정 연결은 기간과 무관.
-- 요약(summary)도 서버가 낸다: 기간 안 방문 기기(서로 다른)·접속 팀원·페이지뷰·대결·활동 팀원(방문 또는 대결).
drop function if exists public.admin_stats();
create or replace function public.admin_stats(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t date := private.today_kst(); d0 date; first_day date;
begin
  perform private.require_admin();
  select least(coalesce((select min(day) from public.visits), t), coalesce((select min((ts at time zone 'Asia/Seoul')::date) from public.votes), t)) into first_day;
  d0 := case when p_days is null then first_day else greatest(t - (p_days - 1), first_day) end;
  return jsonb_build_object(
    'today', t, 'from', d0,
    'summary', jsonb_build_object(
      'devices', (select count(distinct device) from public.visits where day >= d0),
      'members', (select count(distinct member_num) from public.visits where day >= d0 and member_num is not null),
      'views', (select coalesce(sum(views), 0) from public.visits where day >= d0),
      'duels', (select count(*) from public.votes where (ts at time zone 'Asia/Seoul')::date >= d0),
      'active', (select count(distinct n) from (
          select member_num n from public.visits where day >= d0 and member_num is not null
          union select m.num from public.votes x join public.members m on m.user_id = x.voter where (x.ts at time zone 'Asia/Seoul')::date >= d0) a)),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date,
        'devices', (select count(*) from public.visits v where v.day = d::date),
        'members', (select count(distinct v.member_num) from public.visits v where v.day = d::date and v.member_num is not null),
        'views', (select coalesce(sum(v.views), 0) from public.visits v where v.day = d::date),
        'duels', (select count(*) from public.votes x where (x.ts at time zone 'Asia/Seoul')::date = d::date)
      ) order by d), '[]'::jsonb) from generate_series(d0, t, interval '1 day') d),
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
        'num', p.num, 'name', p.name,
        'claimed_at', m.claimed_at,
        'last_visit', (select max(v.last_ts) from public.visits v where v.member_num = p.num),
        'visit_days', (select count(*) from public.visits v where v.member_num = p.num and v.day >= d0),
        'views', (select coalesce(sum(v.views), 0) from public.visits v where v.member_num = p.num and v.day >= d0),
        'duels', (select count(*) from public.votes x where x.voter = m.user_id and (x.ts at time zone 'Asia/Seoul')::date >= d0),
        'last_duel', (select max(x.ts) from public.votes x where x.voter = m.user_id),
        'guestbook', (select count(*) from public.guestbook g where g.author = m.user_id and (g.ts at time zone 'Asia/Seoul')::date >= d0),
        'potm_votes', (select count(*) from public.potm_votes pv where pv.voter = m.user_id and (pv.ts at time zone 'Asia/Seoul')::date >= d0)
      ) order by p.num), '[]'::jsonb)
      from public.players p left join public.members m on m.num = p.num)
  );
end $$;
revoke execute on function public.admin_stats(int) from public, anon, authenticated;
grant execute on function public.admin_stats(int) to anon, authenticated;
notify pgrst, 'reload schema';
