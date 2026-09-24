-- 매치에 유튜브 링크 (2026-09-25 "매치에 유튜브 링크도 걸어두자").
-- 영상은 보통 팀을 짠 뒤에 올라오므로 저장 때 같이 넣을 수도, 나중에 카드에서 따로 붙일 수도 있다.

alter table public.matches add column if not exists video_url text not null default '';

-- 링크 정리 — 비면 '', 아니면 http(s) 로 시작해야 한다.
create or replace function private.clean_video_url(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(coalesce(p, ''));
begin
  if v = '' then return ''; end if;
  if v !~* '^https?://' then raise exception '링크는 http(s)로 시작해야 합니다'; end if;
  if length(v) > 500 then raise exception '링크가 너무 깁니다'; end if;
  return v;
end $$;

-- 목록에 video 를 더한다.
create or replace function private.match_rows(p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'date', to_char(m.date, 'YYYY-MM-DD'), 'lineup', m.lineup, 'video', m.video_url,
      'tally', coalesce((select jsonb_object_agg(v.target::text, v.c)
                         from (select target, count(*) c from public.potm_votes where match_id = m.id group by target) v), '{}'::jsonb),
      'voters', (select count(*) from public.potm_votes where match_id = m.id)
    ) order by m.date desc, m.id desc), '[]'::jsonb)
  from (select * from public.matches order by date desc, id desc limit greatest(p_limit, 1)) m
$$;

-- save_match 에 p_video 를 더한다. 옛 2인자 함수는 지운다 — 둘 다 있으면 PostgREST 가 어느 쪽인지 못 고른다.
-- p_video 가 null 이면 이미 있던 링크를 지키고, '' 이면 지운다.
drop function if exists public.save_match(date, jsonb);
create or replace function public.save_match(p_date date, p_lineup jsonb, p_video text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mid bigint; t jsonb; m jsonb; teams int := 0; v text;
begin
  perform private.require_admin();
  if p_date is null then raise exception '날짜가 없습니다'; end if;
  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' then raise exception '팀 구성이 잘못됐습니다'; end if;
  for t in select * from jsonb_array_elements(p_lineup) loop
    teams := teams + 1;
    if jsonb_typeof(t->'members') <> 'array' or jsonb_array_length(t->'members') = 0 then raise exception '팀 구성이 잘못됐습니다'; end if;
    if coalesce(t->>'vest', '') not in ('none', 'orange', 'neon', 'black') then raise exception '팀 구성이 잘못됐습니다'; end if;
    for m in select * from jsonb_array_elements(t->'members') loop
      if btrim(coalesce(m->>'name', '')) = '' then raise exception '팀 구성이 잘못됐습니다'; end if;
      if m ? 'num' and (m->>'num') !~ '^[0-9]+$' then raise exception '팀 구성이 잘못됐습니다'; end if;
    end loop;
  end loop;
  if teams < 2 then raise exception '팀이 둘 이상이어야 합니다'; end if;
  v := case when p_video is null then null else private.clean_video_url(p_video) end;
  insert into public.matches (date, lineup, created_by, video_url) values (p_date, p_lineup, private.my_num(), coalesce(v, ''))
  on conflict (date) do update set lineup = excluded.lineup, updated_at = now(),
    video_url = coalesce(v, public.matches.video_url)
  returning id into mid;
  return jsonb_build_object('id', mid, 'date', to_char(p_date, 'YYYY-MM-DD'));
end $$;

-- 카드에서 링크만 붙이거나 고친다(관리자). '' 이면 지운다.
create or replace function public.set_match_video(p_id bigint, p_video text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform private.require_admin();
  v := private.clean_video_url(p_video);
  update public.matches set video_url = v, updated_at = now() where id = p_id;
  if not found then raise exception '그 매치가 없습니다'; end if;
  return jsonb_build_object('id', p_id, 'video', v);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.save_match(date, jsonb, text), public.set_match_video(bigint, text) from public, anon, authenticated;
grant execute on function public.save_match(date, jsonb, text), public.set_match_video(bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
