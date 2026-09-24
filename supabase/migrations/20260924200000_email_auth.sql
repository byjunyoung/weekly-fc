-- 본인인증(2026-09-24) — 이메일 코드 로그인. 설계: docs/superpowers/specs/2026-09-24-email-auth-design.md
-- "누구"는 전부 서버가 정한다(auth.uid()·auth.jwt()). 브라우저가 보내는 이름·번호는 믿지 않는다.
-- 관리자 PIN 을 없애고 settings.admin_emails 목록으로 바꾼다.

-- ── 표 ────────────────────────────────────────────────────────
-- 이름 차지: 한 계정 한 번호, 한 번호 한 계정. 먼저 고른 사람이 차지하고 관리자가 풀어 준다.
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  num int not null unique references public.players (num) on delete cascade on update cascade,
  email text not null default '',
  claimed_at timestamptz not null default now()
);
-- 대결 한 판마다 한 줄 — 숫자가 안 바뀐 판도 남겨야 하루 판수·같은 선수 횟수를 셀 수 있다.
create table if not exists public.votes (
  id bigserial primary key, ts timestamptz not null default now(), voter uuid not null,
  field text not null, win int not null, lose int not null
);
create index if not exists votes_voter_ts on public.votes (voter, ts);

alter table public.members enable row level security;
alter table public.votes enable row level security;
revoke all on public.members, public.votes from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ── 도우미(private) ───────────────────────────────────────────
create or replace function private.my_num() returns int
language sql stable security definer set search_path = '' as $$
  select m.num from public.members m where m.user_id = auth.uid()
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.settings s, unnest(string_to_array(s.value, ',')) e
    where s.key = 'admin_emails' and lower(btrim(e)) <> '' and lower(btrim(e)) = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not private.is_admin() then raise exception '관리자만 할 수 있습니다'; end if;
end $$;

-- 한국 시간 오늘
create or replace function private.today_kst() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- ── 옛 PIN 길 걷기 ────────────────────────────────────────────
drop function if exists public.verify_pin(text);
drop function if exists public.set_admin_pin(text);
drop function if exists public.import_all(text, jsonb);
drop function if exists public.get_all_full(text);
drop function if exists public.write_player(text, jsonb);
drop function if exists public.delete_player(text, jsonb);
drop function if exists public.write_rotation(text, jsonb);
drop function if exists public.write_fine(text, jsonb);
drop function if exists public.delete_fine(text, jsonb);
drop function if exists public.write_stats(int, jsonb, int);
drop function if exists public.vote(text, int, int, int);
drop function if exists private.check_pin(text);
delete from public.settings where key = 'admin_pin_hash';
insert into public.settings (key, value) values ('admin_emails', '') on conflict (key) do nothing;

-- ── 누구나 · 로그인 ───────────────────────────────────────────
-- 지금 로그인한 사람. 로그인 전이면 {login:false}.
create or replace function public.me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n int; t date := private.today_kst(); by_target jsonb; cnt int;
begin
  if auth.uid() is null then return jsonb_build_object('login', false); end if;
  n := private.my_num();
  select count(*) into cnt from public.votes v where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t;
  select coalesce(jsonb_object_agg(x.num::text, x.c), '{}'::jsonb) into by_target from (
    select p.num, count(*) c from public.votes v, lateral (values (v.win), (v.lose)) p(num)
    where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t group by p.num) x;
  return jsonb_build_object('login', true, 'email', coalesce(auth.jwt() ->> 'email', ''),
    'num', n, 'name', (select name from public.players where num = n),
    'admin', private.is_admin(), 'today', cnt, 'todayBy', by_target);
end $$;

create or replace function public.claim(p_num int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if private.my_num() is not null then raise exception '이미 이름을 골랐습니다'; end if;
  if not exists (select 1 from public.players where num = p_num) then raise exception '그 번호의 선수가 없습니다'; end if;
  begin
    insert into public.members (user_id, num, email) values (auth.uid(), p_num, coalesce(auth.jwt() ->> 'email', ''));
  exception when unique_violation then
    raise exception '이미 다른 계정이 고른 이름입니다';
  end;
  return jsonb_build_object('ok', true, 'num', p_num);
end $$;

-- 차지된 번호 목록(이름 고르기 화면이 회색으로 막는 데 쓴다). 누가 차지했는지는 알려 주지 않는다.
create or replace function public.claimed_nums() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(num order by num), '[]'::jsonb) from public.members
$$;

create or replace function public.write_avatar(p_num int, p_avatar text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_avatar is null or length(p_avatar) > 120 or p_avatar !~ '^([a-z]\d{1,2}:){1,16}k#[0-9a-fA-F]{3,6}$' then
    raise exception '아바타 코드 형식이 올바르지 않습니다';
  end if;
  if coalesce(private.my_num(), -1) <> p_num and not private.is_admin() then raise exception '내 선수만 꾸밀 수 있습니다'; end if;
  update public.players set avatar = p_avatar where num = p_num;
  if not found then raise exception '그 번호의 선수가 없습니다'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- 대결 한 판. 하루 30판, 같은 선수는 하루 3번까지(한국 시간). 내가 낀 대결도 된다(사용자 결정).
create or replace function public.vote(p_field text, p_win int, p_lose int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me int; who text; w int; l int; d int; nw int; nl int; found_n int; t date := private.today_kst(); cnt int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  -- 내 차지 줄을 잠가 한 사람의 판들을 줄 세운다 — 동시에 눌러 제한을 넘는 걸 막는다.
  select m.num into me from public.members m where m.user_id = auth.uid() for update;
  if me is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  if p_field is null or p_field <> all (array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina']) then
    raise exception '모르는 능력치입니다';
  end if;
  if p_win is null or p_lose is null then raise exception '그 번호의 선수가 없습니다'; end if;
  if p_win = p_lose then raise exception '같은 선수끼리는 대결할 수 없습니다'; end if;

  select count(*) into cnt from public.votes v where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t;
  if cnt >= 30 then raise exception '오늘 대결은 여기까지입니다. 내일 또!'; end if;
  if (select count(*) from public.votes v where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t
        and (p_win in (v.win, v.lose))) >= 3
     or (select count(*) from public.votes v where v.voter = auth.uid() and (v.ts at time zone 'Asia/Seoul')::date = t
        and (p_lose in (v.win, v.lose))) >= 3 then
    raise exception '오늘 이 선수는 더 판정할 수 없습니다';
  end if;

  select count(*) into found_n from (
    select 1 from public.players where num in (p_win, p_lose) order by num for update) x;
  if found_n < 2 then raise exception '그 번호의 선수가 없습니다'; end if;

  execute format('select coalesce(%I, 0) from public.players where num = $1', p_field) into w using p_win;
  execute format('select coalesce(%I, 0) from public.players where num = $1', p_field) into l using p_lose;
  d := private.vote_delta(w, l);
  nw := least(99, w + d);
  nl := greatest(1, l - d);
  select coalesce(name, '') into who from public.players where num = me;

  -- 기록 시각은 clock_timestamp() — now() 는 트랜잭션 시작 시각이라 한 트랜잭션의 여러 판이 (ts, num, field) 중복 규칙에 걸린다.
  insert into public.votes (ts, voter, field, win, lose) values (clock_timestamp(), auth.uid(), p_field, p_win, p_lose);
  if nw <> w then
    execute format('update public.players set %I = $1 where num = $2', p_field) using nw, p_win;
    insert into public.stat_log (ts, by, by_name, num, field, before, after, via) values (clock_timestamp(), me, who, p_win, p_field, w, nw, 'game');
  end if;
  if nl <> l then
    execute format('update public.players set %I = $1 where num = $2', p_field) using nl, p_lose;
    insert into public.stat_log (ts, by, by_name, num, field, before, after, via) values (clock_timestamp(), me, who, p_lose, p_field, l, nl, 'game');
  end if;

  return jsonb_build_object('ts', now(), 'field', p_field, 'by', me, 'by_name', who,
    'win', jsonb_build_object('num', p_win, 'before', w, 'after', nw),
    'lose', jsonb_build_object('num', p_lose, 'before', l, 'after', nl));
end $$;

-- ── 관리자 ────────────────────────────────────────────────────
create or replace function public.get_all_full() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin perform private.require_admin(); return private.all_data(true); end $$;

create or replace function public.write_player(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform private.require_admin(); perform private.upsert_player(p_payload); return jsonb_build_object('ok', true); end $$;

create or replace function public.delete_player(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.players where num = private.int_or_null(p_payload->>'num');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.write_rotation(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform private.require_admin(); perform private.upsert_rotation(p_payload); return jsonb_build_object('ok', true); end $$;

create or replace function public.write_fine(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fid text;
begin perform private.require_admin(); fid := private.upsert_fine(p_payload); return jsonb_build_object('ok', true, 'id', fid); end $$;

create or replace function public.delete_fine(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.fines where id = coalesce(p_payload->>'id', '');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_members() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('num', m.num, 'email', m.email, 'claimed_at', m.claimed_at) order by m.num)
    from public.members m), '[]'::jsonb);
end $$;

create or replace function public.admin_release(p_num int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.members where num = p_num;
  return jsonb_build_object('ok', found);
end $$;

-- ── 실행 권한 ─────────────────────────────────────────────────
-- 로그인한 요청은 authenticated 로, 아니면 anon 으로 온다. 막는 건 함수 안에서 한다.
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.get_all(), public.me(), public.claim(int), public.claimed_nums(), public.write_avatar(int, text),
  public.vote(text, int, int), public.get_all_full(), public.write_player(jsonb), public.delete_player(jsonb),
  public.write_rotation(jsonb), public.write_fine(jsonb), public.delete_fine(jsonb),
  public.admin_members(), public.admin_release(int)
  to anon, authenticated;

notify pgrst, 'reload schema';
