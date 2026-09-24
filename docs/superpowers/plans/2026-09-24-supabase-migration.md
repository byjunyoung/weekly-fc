# Supabase 이전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데이터 저장소를 Google Sheets + Apps Script 에서 Supabase(Postgres + DB 함수)로 옮기되, 화면 코드는 그대로 두고 사이트가 끊기지 않게 한다.

**Architecture:** 모든 읽기·쓰기를 `public` 스키마의 `security definer` 함수로만 열고(표는 RLS·권한으로 봉쇄), 브라우저는 `fetch` 로 `/rest/v1/rpc/<함수>` 를 POST 한다. `src/lib/api.ts` 의 공개 함수 모양은 그대로다. 이전은 PIN 으로 여는 `import_all` 로, 백업은 비공개 저장소의 예약 작업이 `get_all_full` 로 한다.

**Tech Stack:** Supabase(Postgres 15+, PostgREST, pgcrypto) · 브라우저 `fetch` · Node 25(`node --test`, .ts 직접 import) · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-24-supabase-migration-design.md`

## Global Constraints

- 화면 코드(`src/react/**`, `src/layouts/**`)는 바꾸지 않는다 — api.ts 공개 함수의 이름·인자·반환 모양 유지.
- Supabase 전용 라이브러리를 쓰지 않는다. 브라우저는 `apikey` 헤더만 보낸다(`Authorization` 에 공개 키를 싣지 않는다).
- 오류 문구는 지금 서버와 같게: `PIN이 올바르지 않습니다.` · `<field> 값이 1~99 정수가 아닙니다` · `고칠 값이 없습니다` · `그 번호의 선수가 없습니다` · `번호가 없습니다` · `아바타 코드 형식이 올바르지 않습니다`.
- 아바타 코드 정규식은 앱 `CODE_SHAPE` 와 글자 그대로 같다: `^([a-z]\d{1,2}:){1,16}k#[0-9a-fA-F]{3,6}$`, 길이 상한 120.
- service_role 키·DB 비밀번호를 저장소·스크립트·워크플로에 두지 않는다. 관리자 PIN 은 `.env.local`(gitignore)·GitHub 비밀값에만.
- 공개 저장소(weekly-fc)에 실명·전화번호를 커밋하지 않는다.
- 요청 제한시간 15초 유지(카톡 인앱 멈춤 대비).
- 커밋 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01DaDPzugZyKUdGnpyTH5KY4`.

**사용자 대기 단계**는 🙋 로 표시한다. 그 앞까지는 프로젝트 없이 만들 수 있다.

---

### Task 1: 표·함수 SQL + 아바타 정규식 대조

**Files:**
- Create: `supabase/migrations/20260924000000_init.sql`
- Modify: `tests/unit/avatar.test.mjs` (대조 대상을 Apps Script → SQL 로)

**Interfaces:**
- Produces (RPC, 전부 `jsonb` 반환): `get_all()`, `write_avatar(p_num int, p_avatar text)`, `write_stats(p_num int, p_stats jsonb, p_by int default null)`, `verify_pin(p_pin text)`, `get_all_full(p_pin text)`, `write_player(p_pin text, p_payload jsonb)`, `delete_player(p_pin text, p_payload jsonb)`, `write_rotation(p_pin text, p_payload jsonb)`, `write_fine(p_pin text, p_payload jsonb)` → `{ok,id}`, `delete_fine(p_pin text, p_payload jsonb)`, `set_admin_pin(p_pin text)`, `import_all(p_pin text, p_data jsonb)` → `{players,rotation,fines,statLog}` 개수.

- [ ] **Step 1: 대조 테스트를 SQL 대상으로 바꾼다 (실패 확인용)**

`tests/unit/avatar.test.mjs` 의 `'앱과 서버의 아바타 코드 정규식이 같다 — 파일에서 직접 읽어 대조'` 테스트 본문을 다음으로:

```js
  // 복사본끼리 비교하면 한쪽만 고쳐도 안 걸린다. 두 파일의 실제 정규식을 꺼내 맞춘다.
  // 2026-09-24 서버가 Supabase 로 옮겨 대조 대상이 SQL 함수가 됐다.
  const client = /const CODE_SHAPE = \/(.+)\/;/.exec(readFs('src/lib/avatar.ts', 'utf8'))[1];
  const server = /p_avatar !~ '([^']+)'/.exec(readFs('supabase/migrations/20260924000000_init.sql', 'utf8'))[1];
  assert.equal(server, client);
  assert.equal(`/${client}/`, String(SERVER_CODE_RE));
  assert.match(readFs('supabase/migrations/20260924000000_init.sql', 'utf8'), /length\(p_avatar\) > 120/);
```

- [ ] **Step 2: 실행 — SQL 파일이 없어 실패**

Run: `node --test tests/unit/avatar.test.mjs`
Expected: FAIL (ENOENT supabase/migrations/…)

- [ ] **Step 3: SQL 작성**

**Create:** `supabase/migrations/20260924000000_init.sql`

```sql
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
```

- [ ] **Step 4: 실행 — 통과**

Run: `node --test tests/unit/avatar.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit** — `feat(db): Supabase 표·함수 SQL` (브랜치 `supabase-migration`)

---

### Task 2: 새 통로 — api.ts 를 Supabase RPC 로

**Files:**
- Create: `src/lib/backend.ts`
- Modify: `src/lib/api.ts` (Apps Script 전달부 → RPC)
- Modify: `tests/unit/api.test.mjs` (buildUrl 테스트 → rpc 테스트)

**Interfaces:**
- Consumes: Task 1 의 RPC 이름·인자
- Produces: `SUPABASE_URL`, `SUPABASE_KEY` (backend.ts), api.ts 공개 함수 모양 불변. 새로 export: `rpc(fn, args, base?, key?)`, `RPC_OF`.

- [ ] **Step 1: 실패하는 테스트**

`tests/unit/api.test.mjs` 머리의 import 와 buildUrl 테스트를 다음으로 바꾼다:

```js
import { normalizeFine, normalizePlayer, normalizeRotation, serializeFine, serializeRotation, rpc, RPC_OF } from '../../src/lib/api.ts';

test('rpc 는 POST 로 /rest/v1/rpc/<함수> 를 부르고 apikey 헤더만 싣는다', async () => {
  const orig = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, text: async () => '{"ok":true}' }; };
  try {
    const r = await rpc('write_fine', { p_pin: '1234', p_payload: { id: 'x' } }, 'https://ex.supabase.co', 'pk');
    assert.deepEqual(r, { ok: true });
    assert.equal(seen.url, 'https://ex.supabase.co/rest/v1/rpc/write_fine');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers.apikey, 'pk');
    assert.equal(seen.init.headers.Authorization, undefined, '공개 키를 Authorization 에 싣지 않는다');
    assert.deepEqual(JSON.parse(seen.init.body), { p_pin: '1234', p_payload: { id: 'x' } });
    assert.ok(!seen.url.includes('1234'), 'PIN 이 주소에 실리면 안 된다');
  } finally { globalThis.fetch = orig; }
});

test('rpc 오류 응답은 서버 문구 그대로 던진다 (틀린 PIN 구분이 이 문구에 기댄다)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => '{"code":"P0001","message":"PIN이 올바르지 않습니다."}' });
  try { await assert.rejects(rpc('verify_pin', { p_pin: 'x' }, 'https://ex', 'pk'), /PIN이 올바르지 않습니다\./); }
  finally { globalThis.fetch = orig; }
});

test('rpc 빈 응답(204)은 빈 객체', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 204, text: async () => '' });
  try { assert.deepEqual(await rpc('x', {}, 'https://ex', 'pk'), {}); } finally { globalThis.fetch = orig; }
});

test('관리자 쓰기 액션 다섯이 모두 RPC 이름을 가진다', () => {
  assert.deepEqual(RPC_OF, { writePlayer: 'write_player', deletePlayer: 'delete_player', writeRotation: 'write_rotation', writeFine: 'write_fine', deleteFine: 'delete_fine' });
});
```

같은 파일의 제한시간 테스트(`fetchData`)와 서버 오류 문구 테스트는 fetch 스텁이 `{ ok, status, text }` 모양을 돌려주게 고친다:

```js
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => '{"message":"PIN이 올바르지 않습니다"}' });
```

- [ ] **Step 2: 실행 — rpc 가 없어 실패**

Run: `TZ=UTC node --test tests/unit/api.test.mjs`
Expected: FAIL (`rpc` is not exported)

- [ ] **Step 3: 구현**

**Create:** `src/lib/backend.ts`

```ts
// src/lib/backend.ts — Supabase 프로젝트 주소와 공개 키.
// 둘 다 **브라우저에 실리게 만든 공개용 값**이다(비밀 키가 아니다). 전권을 가진 service_role 키는
// 어디에도 두지 않는다 — 모든 쓰기는 DB 함수가 PIN 으로 확인한다(설계 §6).
export const SUPABASE_URL = 'https://PROJECT_REF.supabase.co';
export const SUPABASE_KEY = 'PUBLISHABLE_KEY';
```

`src/lib/api.ts` 에서 `API_URL`·`buildUrl`·`call` 을 지우고 다음으로 바꾼다(머리 주석 포함):

```ts
// src/lib/api.ts — 서버 호출은 여기 한 곳. 2026-09-24 에 Apps Script → Supabase RPC 로 옮겼다.
// 공개 함수(fetchData·refresh·login·write·writeAvatar·writeStats·fetchFull)의 모양은 그대로라 화면은 모른다.
import { SUPABASE_KEY, SUPABASE_URL } from './backend.ts';
```

```ts
/** 관리자 쓰기 액션 → DB 함수 이름. 화면은 옛 액션 이름으로 부른다. */
export const RPC_OF: Record<string, string> = {
  writePlayer: 'write_player', deletePlayer: 'delete_player', writeRotation: 'write_rotation',
  writeFine: 'write_fine', deleteFine: 'delete_fine',
};

/** DB 함수 하나를 부른다 — POST · JSON 본문(PIN 이 주소에 안 실린다) · apikey 헤더만. */
export async function rpc(fn: string, args: Record<string, unknown> = {}, base: string = SUPABASE_URL, key: string = SUPABASE_KEY): Promise<Raw> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ac.signal,
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    const json = (text ? JSON.parse(text) : {}) as Raw;
    // DB 함수가 raise exception 으로 알린 문구는 PostgREST 오류 응답의 message 에 담겨 온다.
    if (!res.ok) throw new Error(String(json.message ?? `서버 오류 ${res.status}`));
    return json;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`${TIMEOUT_MS / 1000}초 동안 응답이 없습니다`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
```

호출부 교체:

```ts
export async function fetchData(): Promise<Data> { return normalizeData(await rpc('get_all')); }
// login():  await rpc('verify_pin', { p_pin: pin });
// write():
export async function write(action: string, payload: unknown): Promise<Raw> {
  const pin = getPin(); if (!pin) throw new Error('관리자 PIN이 필요합니다');
  const fn = RPC_OF[action]; if (!fn) throw new Error(`알 수 없는 액션: ${action}`);
  const r = await rpc(fn, { p_pin: pin, p_payload: payload });
  if (inflight) await inflight.catch(() => {});
  await refresh();
  return r;
}
export async function fetchFull(): Promise<Data> { return normalizeData(await rpc('get_all_full', { p_pin: getPin() })); }
// writeStats():  const r = await rpc('write_stats', { p_num: num, p_stats: stats, p_by: by });
// writeAvatar(): const r = await rpc('write_avatar', { p_num: num, p_avatar: avatar });
```

- [ ] **Step 4: 실행 — 통과, 타입 검사**

Run: `npm test && npm run check`
Expected: 테스트 전부 PASS, check 는 기존 `SquadApp.tsx:29` 1건만

- [ ] **Step 5: Commit** — `feat(api): 전달 통로를 Supabase RPC 로` (브랜치, main 에 합치지 않는다 — Task 6 까지)

---

### Task 3: 이전 스크립트

**Files:**
- Create: `scripts/migrate-to-supabase.mjs`
- Modify: `.gitignore` (`.env.local` 추가 — 이미 있으면 그대로)

**Interfaces:**
- Consumes: `rpc` (Task 2), `set_admin_pin`·`verify_pin`·`import_all`·`get_all_full` (Task 1)
- Produces: 실행 `node scripts/migrate-to-supabase.mjs` — `.env.local` 의 `WFC_PIN` 을 읽는다.

- [ ] **Step 1: 작성**

**Create:** `scripts/migrate-to-supabase.mjs`

```js
// scripts/migrate-to-supabase.mjs — 구글 시트(Apps Script) → Supabase 한 번에 옮기기.
// 여러 번 돌려도 같다(덮어쓰기·기록은 겹치면 건너뜀) — 전환 뒤 한 번 더 돌려 그 사이 쓰인 걸 따라잡는다.
// PIN 은 저장소에 안 올라가는 .env.local 에서만 읽는다: WFC_PIN=...
import { readFileSync } from 'node:fs';
import { rpc } from '../src/lib/api.ts';

const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyUDTkTHsKszkiOeJKmNDHDkVJobrVUjbRqufU251PNKmlyrvC0BZ3ir9x0vM_lCJkkmg/exec';

function envPin() {
  let text = '';
  try { text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); } catch { /* 없음 */ }
  const m = /^WFC_PIN=(.*)$/m.exec(text);
  const pin = (m ? m[1] : process.env.WFC_PIN || '').trim().replace(/^["']|["']$/g, '');
  if (!pin) { console.error('.env.local 에 WFC_PIN=관리자PIN 을 적어 주세요.'); process.exit(1); }
  return pin;
}

const pin = envPin();
const url = new URL(APPS_SCRIPT);
url.searchParams.set('action', 'getAllFull');
url.searchParams.set('pin', pin);
const sheet = await (await fetch(url)).json();
if (sheet.error) { console.error('시트 읽기 실패:', sheet.error); process.exit(1); }

try { await rpc('set_admin_pin', { p_pin: pin }); console.log('관리자 PIN 설정'); }
catch (e) { if (!/이미 PIN이 설정되어 있습니다/.test(e.message)) throw e; }
await rpc('verify_pin', { p_pin: pin });

const n = await rpc('import_all', { p_pin: pin, p_data: sheet });
const db = await rpc('get_all_full', { p_pin: pin });

const sum = (xs) => xs.reduce((a, f) => a + Number(f.amount || 0), 0);
const rows = [
  ['선수', sheet.players.length, db.players.length],
  ['봉사표', sheet.rotation.filter((r) => r.year && r.month).length, db.rotation.length],
  ['벌금 건수', sheet.fines.filter((f) => f.id).length, db.fines.length],
  ['벌금 합', sum(sheet.fines), sum(db.fines)],
  ['능력치 기록', sheet.statLog.length, db.statLog.length],
];
console.log('이번에 넣음:', n);
console.log('항목        시트    Supabase  같나');
for (const [k, a, b] of rows) console.log(`${k.padEnd(10)} ${String(a).padStart(6)} ${String(b).padStart(9)}  ${a === b ? '예' : '아니오 ←'}`);
if (rows.some(([, a, b]) => a !== b)) process.exit(2);
```

- [ ] **Step 2: `.gitignore` 확인** — `grep -qx '.env.local' .gitignore || echo '.env.local' >> .gitignore`

- [ ] **Step 3: 문법만 확인** — Run: `node --check scripts/migrate-to-supabase.mjs` → 출력 없음

- [ ] **Step 4: Commit** — `feat(scripts): 시트 → Supabase 이전 스크립트`

---

### Task 4: 백업 저장소 파일(로컬 준비)

**Files:**
- Create: `ops/backup-repo/.github/workflows/backup.yml`
- Create: `ops/backup-repo/README.md`

- [ ] **Step 1: 작성**

**Create:** `ops/backup-repo/.github/workflows/backup.yml`

```yaml
# 비공개 저장소 byjunyoung/weekly-fc-backup 에 둔다(공개 저장소엔 실명·전화번호를 두지 않는다).
# 사흘마다 전체 데이터를 받아 커밋한다. 그 읽기가 Supabase 무료 프로젝트를 깨운다(7일 미사용 시 멈춤).
# 비밀값 WFC_PIN 은 저장소 Settings → Secrets 에 사용자가 넣는다.
name: backup
on:
  schedule:
    - cron: '17 3 */3 * *'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 데이터 받기
        env:
          WFC_PIN: ${{ secrets.WFC_PIN }}
          SUPABASE_URL: https://PROJECT_REF.supabase.co
          SUPABASE_KEY: PUBLISHABLE_KEY
        run: |
          set -euo pipefail
          mkdir -p backup
          body=$(jq -n --arg p "$WFC_PIN" '{p_pin: $p}')
          curl -sf -X POST "$SUPABASE_URL/rest/v1/rpc/get_all_full" \
            -H "apikey: $SUPABASE_KEY" -H 'Content-Type: application/json' -d "$body" > backup/latest.json
          jq -e '.players | length > 0' backup/latest.json > /dev/null
          cp backup/latest.json "backup/$(date -u +%F).json"
      - name: 커밋
        run: |
          git config user.name 'weekly-fc-backup'
          git config user.email 'actions@users.noreply.github.com'
          git add backup
          git diff --cached --quiet || git commit -m "backup $(date -u +%F)"
          git push
```

**Create:** `ops/backup-repo/README.md`

```markdown
# weekly-fc-backup (비공개)

WEEKLY FC 데이터 백업. 사흘마다 `backup/YYYY-MM-DD.json` 이 쌓인다(Actions → backup).
복구: 원하는 날짜 파일을 weekly-fc 의 `scripts/migrate-to-supabase.mjs` 가 받는 모양(players·rotation·fines·statLog)
그대로 `import_all` 에 넘기면 된다.
```

- [ ] **Step 2: YAML 문법 확인** — Run: `ruby -ryaml -e 'YAML.load_file(ARGV[0])' ops/backup-repo/.github/workflows/backup.yml && echo ok`

- [ ] **Step 3: Commit** — `chore(ops): 백업 저장소 워크플로 준비`

---

### 🙋 사용자 A — 프로젝트 만들기

Supabase 가입 → New project(이름 `weekly-fc`, Region **Northeast Asia (Seoul)**) → Project URL·publishable(anon) 키를 채팅에 붙인다.

---

### Task 5: 프로젝트에 표·함수 올리기 + 데이터 안 바뀌는 확인

**Files:**
- Modify: `src/lib/backend.ts`, `ops/backup-repo/.github/workflows/backup.yml` (URL·키 채움)

- [ ] **Step 1: URL·키 채우기** — `PROJECT_REF`·`PUBLISHABLE_KEY` 를 받은 값으로(두 파일).
- [ ] **Step 2: CLI 로그인** — `npx supabase login` 을 백그라운드로 띄워 나온 주소를 `open` → 🙋 브라우저에서 승인.
- [ ] **Step 3: SQL 적용** — 로그인 토큰으로 Management API `POST https://api.supabase.com/v1/projects/<ref>/database/query` 에 SQL 파일 본문을 `{ "query": … }` 로 보낸다. 실패하면 🙋 대시보드 SQL 편집기에 파일 내용을 붙여 실행.
- [ ] **Step 4: 데이터 안 바뀌는 확인** — 각각 기대 문구가 오는지:

```bash
R="$SUPABASE_URL/rest/v1/rpc"; H=(-H "apikey: $SUPABASE_KEY" -H 'Content-Type: application/json')
curl -s -X POST "$R/get_all" "${H[@]}" -d '{}'                                              # {"players":[],...}
curl -s -X POST "$R/write_stats" "${H[@]}" -d '{"p_num":1,"p_stats":{"pace":999}}'           # pace 값이 1~99 정수가 아닙니다
curl -s -X POST "$R/write_stats" "${H[@]}" -d '{"p_num":99999,"p_stats":{"pace":50}}'        # 그 번호의 선수가 없습니다
curl -s -X POST "$R/write_stats" "${H[@]}" -d '{"p_num":1,"p_stats":{}}'                     # 고칠 값이 없습니다
curl -s -X POST "$R/write_avatar" "${H[@]}" -d '{"p_num":1,"p_avatar":"bad"}'                # 아바타 코드 형식이 올바르지 않습니다
curl -s -X POST "$R/verify_pin" "${H[@]}" -d '{"p_pin":"x"}'                                 # ADMIN_PIN이 설정되지 않았습니다.
curl -s "$SUPABASE_URL/rest/v1/players?select=*" -H "apikey: $SUPABASE_KEY"                  # 권한 거부(표 직접 접근 막힘)
```

- [ ] **Step 5: Commit** — `chore: Supabase 프로젝트 주소 연결`

---

### 🙋 사용자 B — 데이터 옮기기

`.env.local` 에 `WFC_PIN=관리자PIN` 한 줄을 적고 `! node scripts/migrate-to-supabase.mjs` 실행. 마지막 표가 전부 "예"여야 한다.

---

### Task 6: 전환 배포 + 화면 확인

- [ ] **Step 1:** 브랜치 `supabase-migration` 을 main 에 합치고 푸시(배포).
- [ ] **Step 2:** 배포본에서 첫 방문 속도(캐시 비운 상태 get_all 왕복)를 재고 옛 수치(2.6~4.4초)와 비교.
- [ ] **Step 3:** 눌러서 확인 — 능력치 스텝퍼(없는 선수 말고 실제 선수, 올렸다 내려 원복), 꾸미기 저장(같은 코드 다시 저장), 관리자 로그인(틀린 PIN 문구).
- [ ] **Step 4:** 🙋 사용자 B 를 한 번 더(따라잡기).

### Task 7: 백업 저장소 만들기

- [ ] **Step 1:** 미리보기 → go 받은 뒤 `gh repo create byjunyoung/weekly-fc-backup --private`, `ops/backup-repo/` 내용을 올린다.
- [ ] **Step 2:** 🙋 저장소 Settings → Secrets → Actions → `WFC_PIN` 추가.
- [ ] **Step 3:** `gh workflow run backup -R byjunyoung/weekly-fc-backup` → 성공·`backup/*.json` 커밋 확인.

### Task 8: 카톡 인앱 확인

**Files:**
- Modify: `src/lib/inapp.ts` (`shouldAutoEscape` 에 확인용 우회), `tests/unit/inapp.test.mjs`

- [ ] **Step 1: 실패하는 테스트** — `tests/unit/inapp.test.mjs` 끝에:

```js
test('주소에 inapp=stay 가 있으면 카톡이어도 자동 전환하지 않는다 — 새 백엔드를 인앱에서 확인하는 용도', () => {
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos), '?inapp=stay'), false);
  assert.equal(shouldAutoEscape(detectInApp(UA.kakaoIos), ''), true);
});
```

- [ ] **Step 2:** `node --test tests/unit/inapp.test.mjs` → FAIL
- [ ] **Step 3: 구현** — `inapp.ts`:

```ts
/** 지금 바로 밖으로 내보낼 대상인가 — 확인된 카톡만. 주소에 `inapp=stay` 가 있으면 건너뛴다
 *  (백엔드를 옮긴 뒤 카톡 안에서도 데이터가 오는지 확인하려면 튕기지 않아야 한다). */
export function shouldAutoEscape(info: InApp | null, search = ''): boolean {
  if (new URLSearchParams(search).get('inapp') === 'stay') return false;
  return info != null && info.kakao;
}
```

`src/layouts/Shell.astro` 의 호출을 `shouldAutoEscape(inApp, location.search)` 로.

- [ ] **Step 4:** 테스트 PASS → 배포 → 🙋 카톡 단톡방에 `https://byjunyoung.github.io/weekly-fc/?inapp=stay` 를 보내 열어 본다. 명단이 뜨면 멈춤이 사라진 것.
- [ ] **Step 5:** 사라졌으면 자동 전환 배선(`inapp.ts`·Shell·테스트)을 걷어내는 별도 커밋. 남아 있으면 유지.

### Task 9: (1주일 뒤) Apps Script 정리

- [ ] `server/`·`.clasp.json`·`deploy:api` 스크립트·`@google/clasp` 제거, Apps Script 배포 보관 처리. 커밋 `chore: Apps Script 걷어내기`.
