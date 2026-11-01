-- 이름 잘못 고름 고치기(2026-11-01). 양재원 계정이 10번 김효종을 골라 5주 동안 대결 14판이 "김효종의 판정"으로 남은 일에서.
-- 본인은 한 번만 직접 바꿀 수 있고(사용자 결정 — 빈 이름 돌려쓰기 위장 방지), 그다음은 관리자가 옮긴다.
-- 풀기(admin_release)와 달리 옮기기는 그 계정이 옛 번호로 남긴 기록도 새 번호로 따라간다.

alter table public.members add column if not exists changed int not null default 0;

-- 계정 p_uid 를 p_to 번으로. 그 계정이 옛 번호로 한 일(능력치 판정·방명록·방문)도 새 번호·이름으로 바꾼다.
-- 기록은 계정이 처음 이름을 고른 뒤 옛 번호로 남은 것만 — 그 전 것은 본인인증 전 시절 기록이다. 되돌려 옮겨도 그대로 따라온다.
create or replace function private.move_member(p_uid uuid, p_to int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.members; who text; moved int;
begin
  select * into m from public.members where user_id = p_uid for update;
  if m.user_id is null then raise exception '연결된 계정이 없습니다'; end if;
  if m.num = p_to then raise exception '이미 그 선수입니다'; end if;
  select name into who from public.players where num = p_to;
  if who is null then raise exception '그 번호의 선수가 없습니다'; end if;
  if exists (select 1 from public.members where num = p_to) then raise exception '이미 다른 계정이 고른 이름입니다'; end if;

  update public.stat_log set by = p_to, by_name = who where by = m.num and ts >= m.claimed_at;
  get diagnostics moved = row_count;
  update public.guestbook set author_num = p_to, author_name = who where author = p_uid;
  update public.visits set member_num = p_to where member_num = m.num and last_ts >= m.claimed_at;
  -- 옛 이름으로 진짜 나에게 준 POTM 표는 이제 자기 표라 지운다(본인 제외 규칙).
  delete from public.potm_votes where voter = p_uid and target = p_to;
  update public.members set num = p_to where user_id = p_uid;
  return jsonb_build_object('ok', true, 'from', m.num, 'num', p_to, 'moved', moved);
end $$;

-- 본인: 한 번만.
create or replace function public.change_claim(p_num int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if private.my_num() is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  if (select changed from public.members where user_id = auth.uid()) > 0 then
    raise exception '이미 한 번 바꿨습니다. 관리자에게 부탁해 주세요';
  end if;
  r := private.move_member(auth.uid(), p_num);
  update public.members set changed = changed + 1 where user_id = auth.uid();
  return r;
end $$;

-- 관리자: 횟수 제한 없이. 본인 바꾸기 횟수는 건드리지 않는다.
create or replace function public.admin_move(p_from int, p_to int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform private.require_admin();
  select user_id into uid from public.members where num = p_from;
  if uid is null then raise exception '그 선수에 연결된 계정이 없습니다'; end if;
  return private.move_member(uid, p_to);
end $$;

-- me() 에 canChange — 「내 계정」에 [다른 선수로 바꾸기]를 띄울지.
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
    'canChange', coalesce((select changed = 0 from public.members where user_id = auth.uid()), false));
end $$;

revoke execute on function private.move_member(uuid, int) from public, anon, authenticated;
revoke execute on function public.change_claim(int), public.admin_move(int, int) from public;
grant execute on function public.change_claim(int), public.admin_move(int, int) to anon, authenticated;

notify pgrst, 'reload schema';
