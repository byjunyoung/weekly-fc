-- 티어 게임(2026-09-24) — 1:1 대결 한 판마다 능력치를 바로 옮긴다.
-- 설계: docs/superpowers/specs/2026-09-24-tier-game-design.md
-- 능력치 숫자가 곧 레이팅이다. 기대 승률 E = 1/(1+10^((진 쪽−이긴 쪽)/40)),
-- 이긴 쪽 +Δ · 진 쪽 −Δ, Δ = max(1, round(4·(1−E))). 앱 src/lib/tier.ts voteDelta 와 같은 식 —
-- tests/unit/tier.test.mjs 가 이 파일의 두 상수(40·4)를 읽어 대조한다.

-- 대결로 바뀐 줄 표시. '' = 예전 스텝퍼·관리자, 'game' = 대결.
alter table public.stat_log add column if not exists via text not null default '';

create or replace function private.vote_delta(p_win int, p_lose int) returns int
language sql immutable set search_path = '' as $$
  select greatest(1, round(4 * (1 - 1 / (1 + power(10::numeric, (p_lose - p_win) / 40.0)))))::int
$$;

-- 기록은 선수마다 최근 8줄. 대결은 한 판에 두 줄을 남겨, 전체 300줄로 자르면 150판 만에
-- 대부분 선수의 기록이 창밖으로 밀린다. 화면이 쓰는 건 선수 페이지의 그 선수 8줄뿐이다.
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
      ) s where s.rn <= 8), '[]'::jsonb)
  )
$$;

create or replace function public.vote(p_field text, p_win int, p_lose int, p_by int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w int; l int; d int; nw int; nl int; who text := ''; found_n int;
begin
  if p_field is null or p_field <> all (array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina']) then
    raise exception '모르는 능력치입니다';
  end if;
  if p_win is null or p_lose is null then raise exception '그 번호의 선수가 없습니다'; end if;
  if p_win = p_lose then raise exception '같은 선수끼리는 대결할 수 없습니다'; end if;

  -- 번호 순으로 잠근다 — 두 판이 같은 두 선수를 반대 순서로 잠그다 서로 기다리지 않게.
  select count(*) into found_n from (
    select 1 from public.players where num in (p_win, p_lose) order by num for update) x;
  if found_n < 2 then raise exception '그 번호의 선수가 없습니다'; end if;

  execute format('select coalesce(%I, 0) from public.players where num = $1', p_field) into w using p_win;
  execute format('select coalesce(%I, 0) from public.players where num = $1', p_field) into l using p_lose;
  d := private.vote_delta(w, l);
  nw := least(99, w + d);
  nl := greatest(1, l - d);

  if p_by is not null then select coalesce(name, '') into who from public.players where num = p_by; who := coalesce(who, ''); end if;

  if nw <> w then
    execute format('update public.players set %I = $1 where num = $2', p_field) using nw, p_win;
    insert into public.stat_log (by, by_name, num, field, before, after, via) values (p_by, who, p_win, p_field, w, nw, 'game');
  end if;
  if nl <> l then
    execute format('update public.players set %I = $1 where num = $2', p_field) using nl, p_lose;
    insert into public.stat_log (by, by_name, num, field, before, after, via) values (p_by, who, p_lose, p_field, l, nl, 'game');
  end if;

  return jsonb_build_object('ts', now(), 'field', p_field, 'by', p_by, 'by_name', who,
    'win', jsonb_build_object('num', p_win, 'before', w, 'after', nw),
    'lose', jsonb_build_object('num', p_lose, 'before', l, 'after', nl));
end $$;

-- 실행 권한 — 새 함수는 기본으로 열리니 걷고 vote 만 준다. 스텝퍼가 없어져 write_stats 는 닫는다.
revoke execute on function private.vote_delta(int, int) from public, anon, authenticated;
revoke execute on function public.vote(text, int, int, int) from public, anon, authenticated;
revoke execute on function public.write_stats(int, jsonb, int) from anon;
grant execute on function public.vote(text, int, int, int) to anon;

notify pgrst, 'reload schema';
