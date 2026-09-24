-- WEEKLY FC — Supabase 스키마와 함수.
-- 설계: docs/superpowers/specs/2026-09-24-supabase-migration-design.md
-- 표는 바깥에서 직접 닿지 않는다(RLS + 권한 회수). 모든 읽기·쓰기는 public 의
-- security definer 함수로만 — 그래서 전화번호는 관리자 함수로만 나간다.
-- 오류 문구는 옛 Apps Script 와 같다(api.ts login() 이 문구로 틀린 PIN 을 가른다).

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ── 표 ─────────────────────────────────────────────────────
create table if not exists public.players (
  num int primary key check (num > 0),
  pos text not null default '', detail text not null default '', foot text not null default '',
  name text not null default '', phone text not null default '',
  vest int, note text not null default '',
  pace int not null default 0, dribble int not null default 0, pass int not null default 0,
  shoot int not null default 0, defend int not null default 0, stamina int not null default 0,
  rot int, avatar text not null default ''
);
create table if not exists public.rotation (
  year int not null, month int not null check (month between 1 and 12),
  p1 text not null default '', p2 text not null default '', done boolean not null default false,
  primary key (year, month)
);
create table if not exists public.fines (
  id text primary key, date date, match_id text not null default '', player text not null default '',
  type text not null default '지각', amount int not null default 0, paid boolean not null default false
);
create table if not exists public.stat_log (
  id bigserial primary key, ts timestamptz not null default now(), by int, by_name text not null default '',
  num int not null, field text not null, before int not null, after int not null
);
-- 이전(import_all)을 여러 번 돌려도 기록이 겹치지 않게.
create unique index if not exists stat_log_dedupe on public.stat_log (ts, num, field);
create table if not exists public.settings (key text primary key, value text not null);

alter table public.players  enable row level security;
alter table public.rotation enable row level security;
alter table public.fines    enable row level security;
alter table public.stat_log enable row level security;
alter table public.settings enable row level security;
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema private from public, anon, authenticated;

-- ── 도우미(private — REST 로 안 열린다) ───────────────────────
create or replace function private.int_or_null(v text) returns int
language sql immutable set search_path = '' as $$
  select case when v is null or btrim(v) = '' then null else round(v::numeric)::int end
$$;

create or replace function private.truthy(v text) returns boolean
language sql immutable set search_path = '' as $$
  select lower(coalesce(v, '')) in ('true', 't', '1', 'yes')
$$;

create or replace function private.check_pin(p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  select value into h from public.settings where key = 'admin_pin_hash';
  if h is null then raise exception 'ADMIN_PIN이 설정되지 않았습니다.'; end if;
  if p_pin is null or extensions.crypt(p_pin, h) <> h then raise exception 'PIN이 올바르지 않습니다.'; end if;
end $$;

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
    -- 최근 300줄만, 오래된 순(화면이 뒤집어 최신을 위로 올린다 — 옛 시트와 같은 순서).
    'statLog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ts', s.ts, 'by', s.by, 'by_name', s.by_name, 'num', s.num,
        'field', s.field, 'before', s.before, 'after', s.after) order by s.ts, s.id)
      from (select * from public.stat_log order by ts desc, id desc limit 300) s), '[]'::jsonb)
  )
$$;

create or replace function private.upsert_player(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.int_or_null(p->>'num') is null or private.int_or_null(p->>'num') <= 0 then raise exception '번호가 없습니다'; end if;
  insert into public.players (num, pos, detail, foot, name, phone, vest, note,
    pace, dribble, pass, shoot, defend, stamina, rot, avatar)
  values (
    private.int_or_null(p->>'num'),
    coalesce(p->>'pos', ''), coalesce(p->>'detail', ''), coalesce(p->>'foot', ''),
    coalesce(p->>'name', ''), coalesce(p->>'phone', ''),
    private.int_or_null(p->>'vest'), coalesce(p->>'note', ''),
    coalesce(private.int_or_null(p->>'pace'), 0), coalesce(private.int_or_null(p->>'dribble'), 0),
    coalesce(private.int_or_null(p->>'pass'), 0), coalesce(private.int_or_null(p->>'shoot'), 0),
    coalesce(private.int_or_null(p->>'defend'), 0), coalesce(private.int_or_null(p->>'stamina'), 0),
    private.int_or_null(p->>'rot'), coalesce(p->>'avatar', ''))
  on conflict (num) do update set
    pos = excluded.pos, detail = excluded.detail, foot = excluded.foot, name = excluded.name,
    phone = excluded.phone, vest = excluded.vest, note = excluded.note,
    pace = excluded.pace, dribble = excluded.dribble, pass = excluded.pass,
    shoot = excluded.shoot, defend = excluded.defend, stamina = excluded.stamina,
    rot = excluded.rot, avatar = excluded.avatar;
end $$;

create or replace function private.upsert_rotation(r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rotation (year, month, p1, p2, done)
  values (private.int_or_null(r->>'year'), private.int_or_null(r->>'month'),
    coalesce(r->>'p1', ''), coalesce(r->>'p2', ''), private.truthy(r->>'done'))
  on conflict (year, month) do update set p1 = excluded.p1, p2 = excluded.p2, done = excluded.done;
end $$;

create or replace function private.upsert_fine(f jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare fid text := nullif(btrim(coalesce(f->>'id', '')), '');
begin
  if fid is null then fid := (floor(extract(epoch from clock_timestamp()) * 1000))::bigint::text; end if;
  insert into public.fines (id, date, match_id, player, type, amount, paid)
  values (fid, nullif(left(coalesce(f->>'date', ''), 10), '')::date, coalesce(f->>'match_id', ''),
    coalesce(f->>'player', ''), coalesce(nullif(f->>'type', ''), '지각'),
    coalesce(private.int_or_null(f->>'amount'), 0), private.truthy(f->>'paid'))
  on conflict (id) do update set date = excluded.date, match_id = excluded.match_id, player = excluded.player,
    type = excluded.type, amount = excluded.amount, paid = excluded.paid;
  return fid;
end $$;

-- ── 공개 함수: 누구나 ─────────────────────────────────────────
create or replace function public.get_all() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.all_data(false)
$$;

-- 아바타 칸 하나만. 코드 규칙은 src/lib/avatar.ts CODE_SHAPE 와 글자 그대로 같다(테스트가 대조).
create or replace function public.write_avatar(p_num int, p_avatar text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_num is null then raise exception '번호가 없습니다'; end if;
  if p_avatar is null or length(p_avatar) > 120
     or (p_avatar <> '' and p_avatar !~ '^([a-z]\d{1,2}:){1,16}k#[0-9a-fA-F]{3,6}$') then
    raise exception '아바타 코드 형식이 올바르지 않습니다';
  end if;
  update public.players set avatar = p_avatar where num = p_num;
  if not found then raise exception '그 번호의 선수가 없습니다'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- 능력치 — 보낸 칸만, 1~99 정수. 값 검사를 선수 확인보다 먼저 한다(옛 서버와 같은 순서).
-- 선수 행을 잠그고 바꾼 칸마다 기록을 남긴다 — 한 트랜잭션이라 동시에 고쳐도 기록이 어긋나지 않는다.
create or replace function public.write_stats(p_num int, p_stats jsonb, p_by int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fields text[] := array['pace', 'dribble', 'pass', 'shoot', 'defend', 'stamina'];
  f text; n numeric; cur jsonb; before_v int; changed int := 0; who text := ''; any_key boolean := false;
begin
  if p_num is null then raise exception '번호가 없습니다'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then raise exception '고칠 값이 없습니다'; end if;
  foreach f in array fields loop
    if p_stats ? f then
      any_key := true;
      begin n := (p_stats ->> f)::numeric;
      exception when others then raise exception '% 값이 1~99 정수가 아닙니다', f; end;
      if n is null or n <> trunc(n) or n < 1 or n > 99 then raise exception '% 값이 1~99 정수가 아닙니다', f; end if;
    end if;
  end loop;
  if not any_key then raise exception '고칠 값이 없습니다'; end if;

  select to_jsonb(p) into cur from public.players p where p.num = p_num for update;
  if cur is null then raise exception '그 번호의 선수가 없습니다'; end if;
  if p_by is not null then select coalesce(name, '') into who from public.players where num = p_by; who := coalesce(who, ''); end if;

  foreach f in array fields loop
    if p_stats ? f then
      n := (p_stats ->> f)::numeric;
      before_v := coalesce((cur ->> f)::int, 0);
      if before_v <> n::int then
        execute format('update public.players set %I = $1 where num = $2', f) using n::int, p_num;
        insert into public.stat_log (by, by_name, num, field, before, after) values (p_by, who, p_num, f, before_v, n::int);
        changed := changed + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'changed', changed);
end $$;

-- ── 공개 함수: PIN ────────────────────────────────────────────
create or replace function public.verify_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform private.check_pin(p_pin); return jsonb_build_object('ok', true); end $$;

create or replace function public.get_all_full(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform private.check_pin(p_pin); return private.all_data(true); end $$;

create or replace function public.write_player(p_pin text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform private.check_pin(p_pin); perform private.upsert_player(p_payload); return jsonb_build_object('ok', true); end $$;

create or replace function public.delete_player(p_pin text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_pin(p_pin);
  delete from public.players where num = private.int_or_null(p_payload->>'num');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.write_rotation(p_pin text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin perform private.check_pin(p_pin); perform private.upsert_rotation(p_payload); return jsonb_build_object('ok', true); end $$;

create or replace function public.write_fine(p_pin text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fid text;
begin perform private.check_pin(p_pin); fid := private.upsert_fine(p_payload); return jsonb_build_object('ok', true, 'id', fid); end $$;

create or replace function public.delete_fine(p_pin text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_pin(p_pin);
  delete from public.fines where id = coalesce(p_payload->>'id', '');
  return jsonb_build_object('ok', true);
end $$;

-- 첫 PIN 설정 — 아직 없을 때만. 이전 스크립트가 맨 처음 한 번 부른다.
create or replace function public.set_admin_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(length(p_pin), 0) = 0 then raise exception 'PIN이 비었습니다'; end if;
  if exists (select 1 from public.settings where key = 'admin_pin_hash') then raise exception '이미 PIN이 설정되어 있습니다'; end if;
  insert into public.settings (key, value) values ('admin_pin_hash', extensions.crypt(p_pin, extensions.gen_salt('bf')));
  return jsonb_build_object('ok', true);
end $$;

-- 이전용 — 옛 getAllFull 응답을 그대로 받는다. 덮어쓰기라 여러 번 돌려도 같다.
create or replace function public.import_all(p_pin text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x jsonb; c_players int := 0; c_rot int := 0; c_fines int := 0; c_log int := 0; k int;
begin
  perform private.check_pin(p_pin);
  for x in select * from jsonb_array_elements(coalesce(p_data->'players', '[]')) loop
    perform private.upsert_player(x); c_players := c_players + 1; end loop;
  for x in select * from jsonb_array_elements(coalesce(p_data->'rotation', '[]')) loop
    if private.int_or_null(x->>'year') is not null and private.int_or_null(x->>'month') is not null then
      perform private.upsert_rotation(x); c_rot := c_rot + 1; end if; end loop;
  for x in select * from jsonb_array_elements(coalesce(p_data->'fines', '[]')) loop
    if nullif(btrim(coalesce(x->>'id', '')), '') is not null then
      perform private.upsert_fine(x); c_fines := c_fines + 1; end if; end loop;
  for x in select * from jsonb_array_elements(coalesce(p_data->'statLog', '[]')) loop
    if nullif(x->>'ts', '') is not null and private.int_or_null(x->>'num') is not null then
      insert into public.stat_log (ts, by, by_name, num, field, before, after)
      values ((x->>'ts')::timestamptz, private.int_or_null(x->>'by'), coalesce(x->>'by_name', ''),
        private.int_or_null(x->>'num'), coalesce(x->>'field', ''),
        coalesce(private.int_or_null(x->>'before'), 0), coalesce(private.int_or_null(x->>'after'), 0))
      on conflict (ts, num, field) do nothing;
      get diagnostics k = row_count; c_log := c_log + k;
    end if; end loop;
  return jsonb_build_object('players', c_players, 'rotation', c_rot, 'fines', c_fines, 'statLog', c_log);
end $$;

-- ── 실행 권한 — 위 공개 함수에만 ──────────────────────────────
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.get_all(), public.write_avatar(int, text), public.write_stats(int, jsonb, int),
  public.verify_pin(text), public.get_all_full(text), public.write_player(text, jsonb),
  public.delete_player(text, jsonb), public.write_rotation(text, jsonb), public.write_fine(text, jsonb),
  public.delete_fine(text, jsonb), public.set_admin_pin(text), public.import_all(text, jsonb)
  to anon;

notify pgrst, 'reload schema';
