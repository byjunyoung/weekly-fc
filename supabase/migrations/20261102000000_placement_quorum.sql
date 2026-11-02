-- 새 선수 배치는 팀원 여럿이 정한다(2026-11-02, 스펙 2026-11-02-placement-quorum-design.md).
-- 2026-09-28 "관리자 혼자 배치 대결 → 바로 확정"을 덧씌운다. 로그인한 팀원이 한 사람씩 배치 대결을 끝내 제출하고,
-- settings.place_min(기본 3)명이 모이면 항목마다 중앙값으로 확정한다. 그 전까지 능력치는 0(미정).
-- 이미 배치된 선수의 관리자 [재배치](place_player)는 그대로 바로 확정.

insert into public.settings (key, value) values ('place_min', '3') on conflict (key) do nothing;

-- 한 사람이 한 선수에 한 줄. 다시 하면 덮어쓴다. 확정되면 그 선수 줄은 지운다(진행 수가 0부터 다시 세지게).
create table if not exists public.placements (
  num int not null references public.players (num) on delete cascade on update cascade,
  voter uuid not null,
  ts timestamptz not null default now(),
  pace int not null, dribble int not null, pass int not null, shoot int not null, defend int not null, stamina int not null,
  primary key (num, voter)
);
alter table public.placements enable row level security;
revoke all on public.placements from public, anon, authenticated;

create or replace function private.place_min() returns int
language sql stable security definer set search_path = '' as $$
  select greatest(1, coalesce((select value::int from public.settings where key = 'place_min'), 3))
$$;

-- 배치 전 = 여섯 항목이 전부 0.
create or replace function private.unplaced(p_num int) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pace = 0 and dribble = 0 and pass = 0 and shoot = 0 and defend = 0 and stamina = 0
                   from public.players where num = p_num), false)
$$;

create or replace function public.submit_placement(p_num int, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f text; v int; vals int[] := '{}'; me int; cnt int; need int := private.place_min(); med int; done boolean := false;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  me := private.my_num();
  if me is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  if me = p_num then raise exception '본인 배치는 할 수 없습니다'; end if;
  -- 선수 행을 잠근다 — 세 번째 제출이 동시에 둘 들어와도 확정은 한 번만.
  perform 1 from public.players where num = p_num for update;
  if not found then raise exception '그 번호의 선수가 없습니다'; end if;
  if not private.unplaced(p_num) then raise exception '이미 배치가 끝난 선수입니다'; end if;
  foreach f in array array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] loop
    v := private.int_or_null(p_stats->>f);
    if v is null or v < 1 or v > 99 then raise exception '능력치는 1~99 입니다'; end if;
    vals := vals || v;
  end loop;
  insert into public.placements (num, voter, ts, pace, dribble, pass, shoot, defend, stamina)
    values (p_num, auth.uid(), now(), vals[1], vals[2], vals[3], vals[4], vals[5], vals[6])
    on conflict (num, voter) do update set ts = excluded.ts, pace = excluded.pace, dribble = excluded.dribble,
      pass = excluded.pass, shoot = excluded.shoot, defend = excluded.defend, stamina = excluded.stamina;
  select count(*) into cnt from public.placements where num = p_num;
  if cnt >= need then
    -- 중앙값은 한 사람의 판정이 아니다 — 기록의 판정자(by)는 비운다.
    foreach f in array array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'] loop
      execute format('select round(percentile_cont(0.5) within group (order by %I))::int from public.placements where num = $1', f)
        into med using p_num;
      execute format('update public.players set %I = $1 where num = $2', f) using med, p_num;
      insert into public.stat_log (ts, by, by_name, num, field, before, after, via)
        values (clock_timestamp(), null, '', p_num, f, 0, med, 'place');
    end loop;
    delete from public.placements where num = p_num;
    done := true;
  end if;
  return jsonb_build_object('count', case when done then 0 else cnt end, 'need', need, 'done', done);
end $$;

revoke execute on function public.submit_placement(int, jsonb) from public, anon, authenticated;
grant execute on function public.submit_placement(int, jsonb) to authenticated;
revoke execute on function private.place_min(), private.unplaced(int) from public, anon, authenticated;

-- get_all 에 배치 진행 수(누가 했는지는 안 보낸다 — hide_judges 와 같은 결).
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
    'matches', private.match_rows(30),
    'placing', jsonb_build_object('need', private.place_min(), 'count', coalesce((
      select jsonb_object_agg(x.num::text, x.c) from (select num, count(*) c from public.placements group by num) x), '{}'::jsonb))
  ) from a
$$;

-- me() 에 내가 판정을 낸 선수 번호(placed) — 화면이 "제출함 · 다시 하기"를 보이는 데 쓴다.
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
    'admin', private.is_admin(), 'today', cnt, 'todayBy', by_target, 'potm', my_potm,
    'canChange', coalesce((select changed = 0 from public.members where user_id = auth.uid()), false),
    'placed', coalesce((select jsonb_agg(pl.num order by pl.num) from public.placements pl where pl.voter = auth.uid()), '[]'::jsonb));
end $$;

notify pgrst, 'reload schema';
