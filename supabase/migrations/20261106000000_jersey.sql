-- 등번호를 각자 고른다(2026-11-06 사용자 "등번호는 1-99 각자가 선택할 수 있게, 이미 차지한 번호면 티어가 높으면 뺏을 수 있게").
-- 스펙: docs/superpowers/specs/2026-11-06-jersey-pick-design.md
--
-- **번호(num)와 등번호(jersey)를 나눈다.** num 은 지금까지처럼 선수의 고유 번호다 — 계정 연결(members)·대결(votes)·
-- 능력치 기록(stat_log)·배치(placements)·방문(visits)·매치 라인업(jsonb)·주소(/squad/N/)가 전부 여기에 묶여 있어서,
-- 등번호를 바꿀 때마다 그걸 다 옮기면(2026-09-26 전면 재배정이 그랬다) 누구나 아무 때나 누르는 기능으로는 위험하다.
-- 그래서 화면에 찍히는 번호만 jersey 로 따로 두고, 뺏기는 두 사람의 jersey 를 맞바꾸는 것으로 끝낸다.

alter table public.players add column if not exists jersey int;
update public.players set jersey = num where jersey is null;
alter table public.players alter column jersey set not null;
alter table public.players drop constraint if exists players_jersey_range;
alter table public.players add constraint players_jersey_range check (jersey between 1 and 99);
-- 맞바꿈은 한 문장으로 두 줄을 고친다 — 줄 단위로 바로 검사하면 중간에 겹쳐 실패하므로 문장 끝에 검사(deferrable).
alter table public.players drop constraint if exists players_jersey_unique;
alter table public.players add constraint players_jersey_unique unique (jersey) deferrable initially immediate;

-- 새 선수: 등번호를 안 주면 고유 번호와 같은 번호(비어 있으면), 아니면 남은 가장 작은 번호.
create or replace function private.fill_jersey() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.jersey is null then
    if new.num between 1 and 99 and not exists (select 1 from public.players where jersey = new.num) then
      new.jersey := new.num;
    else
      select min(g) into new.jersey from generate_series(1, 99) g
        where not exists (select 1 from public.players where jersey = g);
      if new.jersey is null then raise exception '남은 등번호가 없습니다'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists players_fill_jersey on public.players;
create trigger players_fill_jersey before insert on public.players for each row execute function private.fill_jersey();

-- 관리자 [선수 추가]: 고른 등번호를 함께 받는다. 고칠 때는 등번호를 건드리지 않는다(등번호는 pick_jersey 로만).
create or replace function private.upsert_player(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_jersey int := private.int_or_null(p->>'jersey');
begin
  if private.int_or_null(p->>'num') is null or private.int_or_null(p->>'num') <= 0 then raise exception '번호가 없습니다'; end if;
  if v_jersey is not null and not exists (select 1 from public.players where num = private.int_or_null(p->>'num')) then
    if v_jersey not between 1 and 99 then raise exception '등번호는 1~99 입니다'; end if;
    if exists (select 1 from public.players where jersey = v_jersey) then raise exception '이미 쓰는 등번호입니다'; end if;
  else
    v_jersey := null;   -- 이미 있는 선수면 무시(아래 on conflict 가 등번호를 안 건드린다)
  end if;
  insert into public.players (num, pos, detail, foot, name, phone, vest, note,
    pace, dribble, pass, shoot, defend, stamina, rot, avatar, jersey)
  values (
    private.int_or_null(p->>'num'),
    coalesce(p->>'pos', ''), coalesce(p->>'detail', ''), coalesce(p->>'foot', ''),
    coalesce(p->>'name', ''), coalesce(p->>'phone', ''),
    private.int_or_null(p->>'vest'), coalesce(p->>'note', ''),
    coalesce(private.int_or_null(p->>'pace'), 0), coalesce(private.int_or_null(p->>'dribble'), 0),
    coalesce(private.int_or_null(p->>'pass'), 0), coalesce(private.int_or_null(p->>'shoot'), 0),
    coalesce(private.int_or_null(p->>'defend'), 0), coalesce(private.int_or_null(p->>'stamina'), 0),
    private.int_or_null(p->>'rot'), coalesce(p->>'avatar', ''), v_jersey)
  on conflict (num) do update set
    pos = excluded.pos, detail = excluded.detail, foot = excluded.foot, name = excluded.name,
    phone = excluded.phone, vest = excluded.vest, note = excluded.note,
    pace = excluded.pace, dribble = excluded.dribble, pass = excluded.pass,
    shoot = excluded.shoot, defend = excluded.defend, stamina = excluded.stamina,
    rot = excluded.rot, avatar = excluded.avatar;
end $$;

-- 종합 티어(1 = S … 5 = D). 화면의 src/lib/tier.ts tierRows(players, 'ovr')·tierQuota 와 **같은 규칙**이어야 한다:
-- 종합 = 0 이 아닌 항목 평균의 반올림, 순서는 종합 → 여섯 항목 합 → 번호, 정원은 10·20·40·20·10% 를
-- 내림한 뒤 남는 자리를 소수점이 큰 칸부터(같으면 B 에 가까운 칸, 그다음 위 칸) 하나씩. 배치 전(전부 0)은 줄이 없다.
create or replace function private.tier_idx() returns table (num int, tier int)
language plpgsql stable security definer set search_path = '' as $$
declare
  n int;
  ratio numeric[] := array[0.1, 0.2, 0.4, 0.2, 0.1];
  q int[] := array[0, 0, 0, 0, 0];
  left_ int;
  i int;
begin
  select count(*) into n from public.players p
    where p.pace > 0 or p.dribble > 0 or p.pass > 0 or p.shoot > 0 or p.defend > 0 or p.stamina > 0;
  for i in 1..5 loop q[i] := floor(n * ratio[i]); end loop;
  left_ := n - (q[1] + q[2] + q[3] + q[4] + q[5]);
  for i in select g from generate_series(1, 5) g order by (n * ratio[g] - floor(n * ratio[g])) desc, abs(g - 3), g loop
    exit when left_ <= 0;
    q[i] := q[i] + 1; left_ := left_ - 1;
  end loop;
  return query
    select r.num, case
      when r.rk <= q[1] then 1
      when r.rk <= q[1] + q[2] then 2
      when r.rk <= q[1] + q[2] + q[3] then 3
      when r.rk <= q[1] + q[2] + q[3] + q[4] then 4
      else 5 end
    from (
      select s.num, row_number() over (order by s.o desc, s.total desc, s.num)::int as rk
      from (
        select p.num,
          round((select avg(v) from unnest(array[p.pace, p.dribble, p.pass, p.shoot, p.defend, p.stamina]) v where v > 0)) as o,
          p.pace + p.dribble + p.pass + p.shoot + p.defend + p.stamina as total
        from public.players p
      ) s where s.o > 0
    ) r;
end $$;

-- 누가 언제 무엇으로 바꿨나(뺏긴 사람이 물어볼 때 답할 근거). 표는 막고 함수로만 쓴다.
create table if not exists public.jersey_log (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  num int not null,            -- 번호를 바꾼 선수
  from_jersey int not null,
  to_jersey int not null,
  other_num int,               -- 맞바꾼 상대(빈 번호였으면 null)
  by_admin boolean not null default false
);
alter table public.jersey_log enable row level security;
revoke all on public.jersey_log from public, anon, authenticated;

-- 등번호 고르기. 빈 번호면 그대로 갖고, 주인이 있으면 **내 종합 티어가 한 칸 이상 높을 때** 서로 맞바꾼다.
-- 배치 전 선수는 빈 번호만 고를 수 있고(뺏지 못함), 배치 전 선수의 번호는 티어가 있는 누구나 가져갈 수 있다.
-- p_num 을 주면 관리자가 그 선수의 등번호를 정한다(티어 조건 없이, 주인이 있으면 맞바꿈).
create or replace function public.pick_jersey(p_jersey int, p_num int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me int := private.my_num();
  v_target int;
  v_admin boolean := false;
  v_old int;
  v_holder int;
  v_holder_name text;
  v_my_tier int;
  v_holder_tier int;
  v_letters text[] := array['S', 'A', 'B', 'C', 'D'];
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_num is not null and p_num is distinct from v_me then
    perform private.require_admin();
    v_target := p_num; v_admin := true;
  else
    if v_me is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
    v_target := v_me;
  end if;
  if p_jersey is null or p_jersey not between 1 and 99 then raise exception '등번호는 1~99 입니다'; end if;

  perform pg_advisory_xact_lock(hashtext('wfc.jersey'));   -- 동시에 둘이 같은 번호를 누르면 한 줄로 세운다
  select jersey into v_old from public.players where num = v_target;
  if v_old is null then raise exception '그 번호의 선수가 없습니다'; end if;
  if v_old = p_jersey then return jsonb_build_object('ok', true, 'jersey', v_old, 'swapped', null); end if;

  select num, name into v_holder, v_holder_name from public.players where jersey = p_jersey;
  if v_holder is null then
    update public.players set jersey = p_jersey where num = v_target;
  else
    if not v_admin then
      select t.tier into v_my_tier from private.tier_idx() t where t.num = v_target;
      select t.tier into v_holder_tier from private.tier_idx() t where t.num = v_holder;
      if v_my_tier is null then
        raise exception '% 님이 쓰는 번호입니다 — 배치 전에는 빈 번호만 고를 수 있습니다', v_holder_name;
      end if;
      if v_holder_tier is not null and v_my_tier >= v_holder_tier then
        raise exception '% 님(%)이 쓰는 번호입니다 — 내 티어(%)가 더 높아야 가져올 수 있습니다',
          v_holder_name, v_letters[v_holder_tier], v_letters[v_my_tier];
      end if;
    end if;
    update public.players set jersey = case when num = v_target then p_jersey else v_old end where num in (v_target, v_holder);
  end if;
  insert into public.jersey_log (num, from_jersey, to_jersey, other_num, by_admin) values (v_target, v_old, p_jersey, v_holder, v_admin);
  return jsonb_build_object('ok', true, 'jersey', p_jersey, 'swapped', v_holder_name);
end $$;

revoke execute on function public.pick_jersey(int, int) from public, anon, authenticated;
grant execute on function public.pick_jersey(int, int) to authenticated;
revoke execute on function private.tier_idx(), private.fill_jersey() from public, anon, authenticated;

notify pgrst, 'reload schema';
