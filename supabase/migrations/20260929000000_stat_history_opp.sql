-- 판정 기록에 대결 상대(2026-09-29 "누구랑 대결했는지"). stat_log 에 상대 칸이 없어 읽을 때 찾는다:
-- ① 같은 판에서 함께 남은 짝 줄(같은 판정자·항목, 1초 안, 부호가 반대인 다른 선수) → ② 없으면 votes 표(2초 안).
-- 9/28 기준 대결 줄 895개 중 880개가 이어진다(대결표가 생기기 전 첫날 일부·숫자가 안 바뀐 쪽은 못 찾는다).
create or replace function public.stat_history(p_num int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ts', s.ts, 'by', s.by, 'by_name', s.by_name, 'num', s.num,
    'field', s.field, 'before', s.before, 'after', s.after, 'via', s.via,
    'opp', o.opp, 'opp_name', (select name from public.players where num = o.opp)) order by s.ts, s.id), '[]'::jsonb)
  from (select * from public.stat_log where num = p_num order by ts desc, id desc limit 2000) s
  left join lateral (
    select coalesce(
      (select x.num from public.stat_log x where s.via = 'game' and x.via = 'game' and x.field = s.field and x.num <> s.num
         and x.by is not distinct from s.by and sign(x.after - x.before) = -sign(s.after - s.before)
         and x.ts between s.ts - interval '1 second' and s.ts + interval '1 second'
       order by abs(extract(epoch from x.ts - s.ts)) limit 1),
      (select case when v.win = s.num then v.lose else v.win end from public.votes v
         where s.via = 'game' and v.field = s.field and s.num in (v.win, v.lose)
           and v.ts between s.ts - interval '2 seconds' and s.ts + interval '2 seconds'
       order by abs(extract(epoch from v.ts - s.ts)) limit 1)) as opp
  ) o on true
$$;
notify pgrst, 'reload schema';
