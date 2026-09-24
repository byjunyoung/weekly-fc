-- 선수 방명록 (2026-09-25 "각 선수 라커룸? 카드? 에 방명록 달 수 있게 하자").
-- 선수 페이지 카드 아래 한 줄씩. 쓰는 사람은 로그인해 이름을 차지한 회원(사용자 결정) — 이름은 서버가 붙인다.
-- 지우기는 쓴 사람 본인과 관리자. 읽기는 누구나(선수별로 따로 읽는다 — get_all 에 실으면 끝없이 커진다).

create table if not exists public.guestbook (
  id bigserial primary key,
  player_num int not null references public.players (num) on delete cascade on update cascade,
  author uuid not null,
  author_num int,
  author_name text not null default '',
  text text not null,
  ts timestamptz not null default now()
);
create index if not exists guestbook_player_ts on public.guestbook (player_num, ts desc);
alter table public.guestbook enable row level security;
revoke all on public.guestbook from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 글 정리 — 앞뒤 공백 제거, 1~140자, 줄바꿈은 공백으로.
create or replace function private.clean_guestbook_text(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if v = '' then raise exception '내용을 적어 주세요'; end if;
  if length(v) > 140 then raise exception '140자까지만 남길 수 있습니다'; end if;
  return v;
end $$;

-- 한 선수의 방명록(최신이 위, 최대 100). 누구나.
create or replace function public.guestbook(p_num int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'num', g.player_num, 'author_num', g.author_num, 'author_name', g.author_name, 'text', g.text, 'ts', g.ts
    ) order by g.ts desc, g.id desc), '[]'::jsonb)
  from (select * from public.guestbook where player_num = p_num order by ts desc, id desc limit 100) g
$$;

-- 한 줄 남기기. 로그인 + 이름 차지. 하루 30건(장난 방지, 한국 시간).
create or replace function public.guestbook_write(p_num int, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me int; who text; v text; cnt int; rid bigint; t date := private.today_kst();
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  me := private.my_num();
  if me is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  if not exists (select 1 from public.players where num = p_num) then raise exception '그 번호의 선수가 없습니다'; end if;
  v := private.clean_guestbook_text(p_text);
  select count(*) into cnt from public.guestbook g where g.author = auth.uid() and (g.ts at time zone 'Asia/Seoul')::date = t;
  if cnt >= 30 then raise exception '오늘은 여기까지 — 내일 또 남겨 주세요'; end if;
  select coalesce(name, '') into who from public.players where num = me;
  insert into public.guestbook (player_num, author, author_num, author_name, text, ts)
  values (p_num, auth.uid(), me, who, v, clock_timestamp()) returning id into rid;
  return jsonb_build_object('id', rid, 'num', p_num, 'author_num', me, 'author_name', who, 'text', v, 'ts', clock_timestamp());
end $$;

-- 지우기 — 쓴 사람 본인 또는 관리자.
create or replace function public.guestbook_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select author into owner from public.guestbook where id = p_id;
  if owner is null then raise exception '그 글이 없습니다'; end if;
  if owner <> auth.uid() and not private.is_admin() then raise exception '내가 쓴 글만 지울 수 있습니다'; end if;
  delete from public.guestbook where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.guestbook(int), public.guestbook_write(int, text), public.guestbook_delete(bigint) from public, anon, authenticated;
grant execute on function public.guestbook(int), public.guestbook_write(int, text), public.guestbook_delete(bigint) to anon, authenticated;

notify pgrst, 'reload schema';
