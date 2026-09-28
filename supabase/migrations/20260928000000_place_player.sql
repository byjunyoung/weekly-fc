-- 새 선수 배치 대결 결과 쓰기(2026-09-28, 스펙 2026-09-28-admin-roster-design.md §3.2).
-- 관리자만. 여섯 항목을 한 번에 쓰고, 바뀐 항목만 stat_log 에 via = 'place' 로 남긴다. 다른 선수 숫자는 건드리지 않는다.
create or replace function public.place_player(p_num int, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f text; before_v int; after_v int; me int; who text := '';
begin
  perform private.require_admin();
  if not exists (select 1 from public.players where num = p_num) then raise exception '그 번호의 선수가 없습니다'; end if;
  select m.num into me from public.members m where m.user_id = auth.uid();
  if me is not null then select coalesce(name, '') into who from public.players where num = me; end if;
  foreach f in array array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] loop
    after_v := private.int_or_null(p_stats->>f);
    if after_v is null or after_v < 1 or after_v > 99 then raise exception '능력치는 1~99 입니다'; end if;
    execute format('select coalesce(%I, 0) from public.players where num = $1 for update', f) into before_v using p_num;
    if before_v <> after_v then
      execute format('update public.players set %I = $1 where num = $2', f) using after_v, p_num;
      insert into public.stat_log (ts, by, by_name, num, field, before, after, via)
        values (clock_timestamp(), me, who, p_num, f, before_v, after_v, 'place');
    end if;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.place_player(int, jsonb) from public, anon, authenticated;
grant execute on function public.place_player(int, jsonb) to authenticated;

notify pgrst, 'reload schema';
