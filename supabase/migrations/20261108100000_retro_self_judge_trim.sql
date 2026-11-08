-- 과거 본인 판정 정리(2026-11-08 사용자 결정 — "소급 기준선 5로 적용하자"). 한 번만 돈다.
-- 본인 판정으로 항목 하나에서 순수하게 +5 를 넘게 오른 몫을 깎고, 그 판의 상대에게 비율대로 돌려준다.
-- 값은 적용 직전 집계를 그대로 박았다(이후 판정이 계산을 바꾸지 않게). 칸마다 기록 한 줄(via = 'adjust', 판정자 없음) — 되돌릴 땐 before 값으로.
do $$
declare
  r record; cur int; nv int;
begin
  if exists (select 1 from public.stat_log where via = 'adjust') then raise exception '이미 적용했습니다'; end if;
  perform 1 from public.players where num in (2, 3, 4, 5, 7, 8, 11, 12, 13, 14, 16) order by num for update;
  for r in
    select * from (values
      (7, 'defend'::text, -3), (7, 'dribble', -5), (7, 'pace', -2), (7, 'pass', -6), (7, 'shoot', -3),
      (4, 'shoot', 1), (5, 'pass', 1), (13, 'pass', 1), (16, 'dribble', 1),
      (3, 'defend', 1), (3, 'shoot', 1), (11, 'dribble', 1), (11, 'shoot', 1), (14, 'pace', 1), (14, 'shoot', 1),
      (2, 'defend', 1), (2, 'pace', 1), (2, 'pass', 1), (8, 'dribble', 1), (8, 'pace', 1), (8, 'pass', 1),
      (12, 'defend', 1), (12, 'dribble', 3)
    ) t(num, field, dv) order by num, field
  loop
    execute format('select %I from public.players where num = $1', r.field) into cur using r.num;
    nv := greatest(1, least(99, cur + r.dv));
    if nv <> cur then
      execute format('update public.players set %I = $1 where num = $2', r.field) using nv, r.num;
      insert into public.stat_log (ts, by, by_name, num, field, before, after, via)
        values (clock_timestamp(), null, '', r.num, r.field, cur, nv, 'adjust');
    end if;
  end loop;
end $$;
