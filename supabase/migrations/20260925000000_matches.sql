-- 매치 기록과 POTM 투표 (2026-09-25). 설계: docs/superpowers/specs/2026-09-25-matches-potm-design.md
-- 매치 하나 = 하루. lineup 은 이름까지 박은 스냅샷이라 명단에서 빠진 사람도 지난 매치엔 그대로 남는다.
-- 표는 한 사람 한 표(다시 누르면 갈아탄다). 누가 누구를 찍었는지는 밖으로 안 나간다 — 집계만.

-- ── 표 ────────────────────────────────────────────────────────
create table if not exists public.matches (
  id bigserial primary key,
  date date not null unique,
  lineup jsonb not null default '[]'::jsonb,
  created_by int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.potm_votes (
  match_id bigint not null references public.matches (id) on delete cascade,
  voter uuid not null,
  target int not null,
  ts timestamptz not null default now(),
  primary key (match_id, voter)
);
alter table public.matches    enable row level security;
alter table public.potm_votes enable row level security;
revoke all on public.matches, public.potm_votes from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ── 도우미 ────────────────────────────────────────────────────
-- lineup 에 든 명단 번호들(용병은 num 이 없어 빠진다).
create or replace function private.lineup_nums(p_lineup jsonb) returns int[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg((m->>'num')::int), '{}'::int[])
  from jsonb_array_elements(coalesce(p_lineup, '[]'::jsonb)) t, jsonb_array_elements(coalesce(t->'members', '[]'::jsonb)) m
  where m ? 'num' and (m->>'num') ~ '^[0-9]+$'
$$;

-- 투표는 매치 날짜부터 7일(서울 시간)까지.
create or replace function private.potm_open(p_date date) returns boolean
language sql stable set search_path = '' as $$ select private.today_kst() <= p_date + 7 $$;

-- 매치 목록(최신이 위) + 표 집계. all_data 가 쓴다.
create or replace function private.match_rows(p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'date', to_char(m.date, 'YYYY-MM-DD'), 'lineup', m.lineup,
      'tally', coalesce((select jsonb_object_agg(v.target::text, v.c)
                         from (select target, count(*) c from public.potm_votes where match_id = m.id group by target) v), '{}'::jsonb),
      'voters', (select count(*) from public.potm_votes where match_id = m.id)
    ) order by m.date desc, m.id desc), '[]'::jsonb)
  from (select * from public.matches order by date desc, id desc limit greatest(p_limit, 1)) m
$$;

-- ── 읽기: all_data 에 matches 를 더한다(나머지는 티어 게임 때 그대로) ──
create or replace function private.all_data(p_with_phone boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
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
    -- 오래된 순(화면이 뒤집어 최신을 위로 올린다).
    'statLog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ts', s.ts, 'by', s.by, 'by_name', s.by_name, 'num', s.num,
        'field', s.field, 'before', s.before, 'after', s.after, 'via', s.via) order by s.ts, s.id)
      from (
        select *, row_number() over (partition by l.num order by l.ts desc, l.id desc) as rn
        from public.stat_log l
      ) s where s.rn <= 8), '[]'::jsonb),
    'matches', private.match_rows(30)
  )
$$;

-- me() 에 potm(아직 열린 매치에서 내가 준 표)을 더한다. 나머지는 본인인증 때 그대로.
create or replace function public.me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n int; t date := private.today_kst(); by_target jsonb; cnt int; my_potm jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('login', false); end if;
  n := private.my_num();
  select count(*) into cnt from public.votes v where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t;
  select coalesce(jsonb_object_agg(x.num::text, x.c), '{}'::jsonb) into by_target from (
    select p.num, count(*) c from public.votes v, lateral (values (v.win), (v.lose)) p(num)
    where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t group by p.num) x;
  select coalesce(jsonb_object_agg(pv.match_id::text, pv.target), '{}'::jsonb) into my_potm
    from public.potm_votes pv join public.matches m on m.id = pv.match_id
    where pv.voter = auth.uid() and private.potm_open(m.date);
  return jsonb_build_object('login', true, 'email', coalesce(auth.jwt() ->> 'email', ''),
    'num', n, 'name', (select name from public.players where num = n),
    'admin', private.is_admin(), 'today', cnt, 'todayBy', by_target, 'potm', my_potm);
end $$;

-- ── 쓰기 ──────────────────────────────────────────────────────
-- 팀짜기 결과를 그날 매치로. 같은 날짜면 덮어쓴다(표는 남는다 — 명단이 조금 바뀌어도 이미 준 표를 버리지 않는다).
create or replace function public.save_match(p_date date, p_lineup jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mid bigint; t jsonb; m jsonb; teams int := 0;
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
  insert into public.matches (date, lineup, created_by) values (p_date, p_lineup, private.my_num())
  on conflict (date) do update set lineup = excluded.lineup, updated_at = now()
  returning id into mid;
  return jsonb_build_object('id', mid, 'date', to_char(p_date, 'YYYY-MM-DD'));
end $$;

create or replace function public.delete_match(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.matches where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- 그날 최고 한 표. 그날 뛴 회원만, 본인 제외, 매치 날짜부터 7일. 다시 누르면 표를 옮긴다.
create or replace function public.vote_potm(p_match bigint, p_num int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me int; d date; nums int[]; tally jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  me := private.my_num();
  if me is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  select m.date, private.lineup_nums(m.lineup) into d, nums from public.matches m where m.id = p_match;
  if d is null then raise exception '그 매치가 없습니다'; end if;
  if not private.potm_open(d) then raise exception '투표가 끝난 매치입니다'; end if;
  if not (me = any (nums)) then raise exception '그날 뛴 사람만 투표할 수 있습니다'; end if;
  if p_num is null or p_num = me then raise exception '자기한테는 줄 수 없습니다'; end if;
  if not (p_num = any (nums)) then raise exception '그날 뛴 선수에게만 줄 수 있습니다'; end if;
  insert into public.potm_votes (match_id, voter, target, ts) values (p_match, auth.uid(), p_num, clock_timestamp())
  on conflict (match_id, voter) do update set target = excluded.target, ts = excluded.ts;
  select coalesce(jsonb_object_agg(v.target::text, v.c), '{}'::jsonb) into tally
    from (select target, count(*) c from public.potm_votes where match_id = p_match group by target) v;
  return jsonb_build_object('id', p_match, 'tally', tally,
    'voters', (select count(*) from public.potm_votes where match_id = p_match), 'mine', p_num);
end $$;

-- ── 실행 권한 ─────────────────────────────────────────────────
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.save_match(date, jsonb), public.delete_match(bigint), public.vote_potm(bigint, int)
  from public, anon, authenticated;
grant execute on function public.save_match(date, jsonb), public.delete_match(bigint), public.vote_potm(bigint, int)
  to anon, authenticated;

notify pgrst, 'reload schema';
