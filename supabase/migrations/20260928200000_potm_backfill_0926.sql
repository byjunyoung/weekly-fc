-- 9/26 매치 POTM 보상 소급(2026-09-28 사용자 "응 소급해줘"). settle_potm 은 9/28 이후 매치만 보므로 이 매치 하나만 같은 규칙으로 한 번.
do $$
declare mid bigint; top int[]; n int; f text; before_v int;
begin
  select id into mid from public.matches where date = date '2026-09-26';
  if mid is null or exists (select 1 from public.potm_awards where match_id = mid) then return; end if;
  select coalesce(array_agg(t.target order by t.target), '{}') into top
    from (select target, count(*) c from public.potm_votes where match_id = mid group by target) t
    where t.c = (select max(c) from (select count(*) c from public.potm_votes where match_id = mid group by target) y);
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
  insert into public.potm_awards (match_id, nums) values (mid, top);
end $$;
