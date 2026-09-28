-- 상대팀 매치(2026-09-28 "매치는 무조건 자체전이 아니라 상대팀이랑 할 수도 있잖아").
-- opponent = '' 이면 자체전(지금까지 그대로, 조끼 팀 둘 이상). 이름이 있으면 상대팀전 — lineup 은 우리 팀 하나(조끼 none).
-- 스코어는 경기 뒤에 관리자가 따로 넣는다(set_match_score). 둘 다 null 이면 "결과 입력 전".

alter table public.matches add column if not exists opponent text not null default '';
alter table public.matches add column if not exists score_us int;
alter table public.matches add column if not exists score_them int;

create or replace function private.match_rows(p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'date', to_char(m.date, 'YYYY-MM-DD'), 'lineup', m.lineup, 'video', m.video_url,
      'opponent', m.opponent, 'score_us', m.score_us, 'score_them', m.score_them,
      'tally', coalesce((select jsonb_object_agg(v.target::text, v.c)
                         from (select target, count(*) c from public.potm_votes where match_id = m.id group by target) v), '{}'::jsonb),
      'voters', (select count(*) from public.potm_votes where match_id = m.id)
    ) order by m.date desc, m.id desc), '[]'::jsonb)
  from (select * from public.matches order by date desc, id desc limit greatest(p_limit, 1)) m
$$;

-- save_match 에 p_opponent 를 더한다(옛 3인자는 지운다 — 둘 다 있으면 PostgREST 가 못 고른다).
-- p_opponent 가 null 이면 이미 있던 값을 지킨다(옛 화면이 부를 때). '' = 자체전.
drop function if exists public.save_match(date, jsonb, text);
create or replace function public.save_match(p_date date, p_lineup jsonb, p_video text default null, p_opponent text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mid bigint; t jsonb; m jsonb; teams int := 0; v text; opp text;
begin
  perform private.require_admin();
  if p_date is null then raise exception '날짜가 없습니다'; end if;
  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' then raise exception '팀 구성이 잘못됐습니다'; end if;
  opp := case when p_opponent is null then null else btrim(p_opponent) end;
  if opp is not null and length(opp) > 30 then raise exception '상대팀 이름이 너무 깁니다'; end if;
  for t in select * from jsonb_array_elements(p_lineup) loop
    teams := teams + 1;
    if jsonb_typeof(t->'members') <> 'array' or jsonb_array_length(t->'members') = 0 then raise exception '팀 구성이 잘못됐습니다'; end if;
    if coalesce(t->>'vest', '') not in ('none', 'orange', 'neon', 'black') then raise exception '팀 구성이 잘못됐습니다'; end if;
    for m in select * from jsonb_array_elements(t->'members') loop
      if btrim(coalesce(m->>'name', '')) = '' then raise exception '팀 구성이 잘못됐습니다'; end if;
      if m ? 'num' and (m->>'num') !~ '^[0-9]+$' then raise exception '팀 구성이 잘못됐습니다'; end if;
    end loop;
  end loop;
  if coalesce(opp, (select x.opponent from public.matches x where x.date = p_date), '') = '' then
    if teams < 2 then raise exception '팀이 둘 이상이어야 합니다'; end if;
  else
    if teams <> 1 then raise exception '상대팀 매치는 우리 팀 하나만 저장합니다'; end if;
  end if;
  v := case when p_video is null then null else private.clean_video_url(p_video) end;
  insert into public.matches (date, lineup, created_by, video_url, opponent) values (p_date, p_lineup, private.my_num(), coalesce(v, ''), coalesce(opp, ''))
  on conflict (date) do update set lineup = excluded.lineup, updated_at = now(),
    video_url = coalesce(v, public.matches.video_url),
    opponent = coalesce(opp, public.matches.opponent),
    -- 자체전으로 바꾸면 스코어는 뜻이 없어진다
    score_us = case when coalesce(opp, public.matches.opponent) = '' then null else public.matches.score_us end,
    score_them = case when coalesce(opp, public.matches.opponent) = '' then null else public.matches.score_them end
  returning id into mid;
  return jsonb_build_object('id', mid, 'date', to_char(p_date, 'YYYY-MM-DD'));
end $$;

-- 스코어(관리자). 둘 다 null 이면 지운다. 상대팀 매치에만.
create or replace function public.set_match_score(p_id bigint, p_us int, p_them int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if (p_us is null) <> (p_them is null) then raise exception '두 팀 점수를 모두 넣어 주세요'; end if;
  if p_us is not null and (p_us < 0 or p_us > 99 or p_them < 0 or p_them > 99) then raise exception '점수는 0~99 입니다'; end if;
  update public.matches set score_us = p_us, score_them = p_them, updated_at = now() where id = p_id and opponent <> '';
  if not found then raise exception '상대팀 매치가 아닙니다'; end if;
  return jsonb_build_object('id', p_id, 'score_us', p_us, 'score_them', p_them);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.save_match(date, jsonb, text, text), public.set_match_score(bigint, int, int) from public, anon, authenticated;
grant execute on function public.save_match(date, jsonb, text, text), public.set_match_score(bigint, int, int) to anon, authenticated;

notify pgrst, 'reload schema';
