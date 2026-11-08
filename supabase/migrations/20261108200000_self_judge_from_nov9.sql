-- 본인 판정 공개는 2026-11-09 0시(한국 시간) 이후 판정부터. 규칙이 없을 때 한 과거 판정으로 한 사람이 지목되지 않게(2026-11-08).
create or replace function public.stat_history(p_num int) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (select private.is_admin() as admin)
  select coalesce(jsonb_agg(jsonb_build_object(
    'ts', s.ts, 'by', case when a.admin or (s.ts >= timestamptz '2026-11-09 00:00:00+09' and (s.by = s.num or s.by = o.opp)) then s.by end,
    'by_name', case when a.admin or (s.ts >= timestamptz '2026-11-09 00:00:00+09' and (s.by = s.num or s.by = o.opp)) then s.by_name else '' end, 'num', s.num,
    'field', s.field, 'before', s.before, 'after', s.after, 'via', s.via,
    'opp', o.opp, 'opp_name', (select name from public.players where num = o.opp)) order by s.ts, s.id), '[]'::jsonb)
  from a, (select * from public.stat_log where num = p_num order by ts desc, id desc limit 2000) s
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
