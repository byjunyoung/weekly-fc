-- 판정자는 팀원에게 익명, 관리자만(2026-09-29 사용자 결정 — "누가 판정했는지 보여주지 말까?" → 팀원에겐 익명, 관리자만).
-- 화면에서만 가리면 응답에 이름이 그대로 실리므로 서버에서 비운다. 관리자 여부는 로그인 토큰(private.is_admin)으로.
-- stat_log 자체에는 그대로 남는다(관리자 통계·장난 추적용).
create or replace function private.all_data(p_with_phone boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (select private.is_admin() as admin)
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(case when p_with_phone then to_jsonb(p) else to_jsonb(p) - 'phone' end order by p.num)
      from public.players p), '[]'::jsonb),
    'rotation', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.year, r.month) from public.rotation r), '[]'::jsonb),
    'fines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'date', coalesce(to_char(f.date, 'YYYY-MM-DD'), ''), 'match_id', f.match_id,
        'player', f.player, 'type', f.type, 'amount', f.amount, 'paid', f.paid) order by f.date, f.id)
      from public.fines f), '[]'::jsonb),
    -- 오래된 순(화면이 뒤집어 최신을 위로 올린다). 판정자는 관리자에게만.
    'statLog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ts', s.ts, 'by', case when a.admin then s.by end, 'by_name', case when a.admin then s.by_name else '' end, 'num', s.num,
        'field', s.field, 'before', s.before, 'after', s.after, 'via', s.via) order by s.ts, s.id)
      from (
        select *, row_number() over (partition by l.num order by l.ts desc, l.id desc) as rn
        from public.stat_log l
      ) s where s.rn <= 8), '[]'::jsonb),
    'matches', private.match_rows(30)
  ) from a
$$;

create or replace function public.stat_history(p_num int) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (select private.is_admin() as admin)
  select coalesce(jsonb_agg(jsonb_build_object(
    'ts', s.ts, 'by', case when a.admin then s.by end, 'by_name', case when a.admin then s.by_name else '' end, 'num', s.num,
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
