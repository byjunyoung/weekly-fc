-- 이름 고르기에 본인 확인(2026-11-13 보안 점검). 지금까진 로그인 + 빈 이름이면 누구나 차지했고, 차지하면 member_phones()
-- 로 팀 전체 연락처를 받았다(가입은 아무 이메일로나 열려 있다). 이제 고르는 선수의 등록 전화번호 뒤 4자리를 맞혀야 한다.
-- 잘못 고름 바꾸기(change_claim)도 같은 문을 거친다 — 아니면 한 번은 남의 이름으로 옮겨 갈 수 있다. 관리자 옮기기는 그대로.
-- 틀린 시도는 계정마다 24시간에 5번까지. 번호가 없는 선수는 관리자가 선수 편집에서 번호를 넣으면 같은 방식으로 고른다.
-- 틀렸을 때 raise 하면 시도 기록까지 되돌려지므로, 틀림·막힘은 {ok:false, error} 로 돌려준다(앱이 그 문구를 띄운다).
-- 설계: docs/superpowers/specs/2026-11-13-claim-phone-check-design.md

create table if not exists public.claim_fails (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  num int not null,
  ts timestamptz not null default now()
);
create index if not exists claim_fails_user_ts on public.claim_fails (user_id, ts);
alter table public.claim_fails enable row level security;
revoke all on public.claim_fails from public, anon, authenticated;

-- 고른 선수가 본인인지 — 맞으면 null, 아니면 화면에 띄울 문구. 번호는 숫자만 비교한다(010-… / 010 … 표기 무관).
create or replace function private.phone_proof(p_num int, p_last4 text) returns text
language plpgsql security definer set search_path = '' as $$
declare d text; tries int;
begin
  select count(*) into tries from public.claim_fails f where f.user_id = auth.uid() and f.ts > now() - interval '24 hours';
  if tries >= 5 then return '번호 확인을 5번 틀려 하루 동안 고를 수 없습니다. 내일 다시 하거나 관리자에게 알려 주세요'; end if;
  select regexp_replace(p.phone, '\D', '', 'g') into d from public.players p where p.num = p_num;
  if d is null then return '그 번호의 선수가 없습니다'; end if;
  if length(d) < 4 then return '이 선수는 등록된 전화번호가 없어 고를 수 없습니다. 관리자에게 번호 등록을 부탁해 주세요'; end if;
  if regexp_replace(p_last4, '\D', '', 'g') = right(d, 4) then return null; end if;
  insert into public.claim_fails (user_id, num) values (auth.uid(), p_num);
  return format('전화번호 뒤 4자리가 맞지 않습니다 (오늘 남은 기회 %s번)', 4 - tries);
end $$;

drop function if exists public.claim(int);
create or replace function public.claim(p_num int, p_last4 text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare why text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if private.my_num() is not null then raise exception '이미 이름을 골랐습니다'; end if;
  if not exists (select 1 from public.players where num = p_num) then raise exception '그 번호의 선수가 없습니다'; end if;
  if exists (select 1 from public.members where num = p_num) then raise exception '이미 다른 계정이 고른 이름입니다'; end if;
  -- 옛 화면(번호 칸 없음)이 보낸 요청.
  if p_last4 is null then raise exception '화면을 새로고침한 뒤 다시 골라 주세요'; end if;
  why := private.phone_proof(p_num, p_last4);
  if why is not null then return jsonb_build_object('ok', false, 'error', why); end if;
  begin
    insert into public.members (user_id, num, email) values (auth.uid(), p_num, coalesce(auth.jwt() ->> 'email', ''));
  exception when unique_violation then
    raise exception '이미 다른 계정이 고른 이름입니다';
  end;
  return jsonb_build_object('ok', true, 'num', p_num);
end $$;

drop function if exists public.change_claim(int);
create or replace function public.change_claim(p_num int, p_last4 text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; why text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if private.my_num() is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  if (select changed from public.members where user_id = auth.uid()) > 0 then
    raise exception '이미 한 번 바꿨습니다. 관리자에게 부탁해 주세요';
  end if;
  if p_last4 is null then raise exception '화면을 새로고침한 뒤 다시 골라 주세요'; end if;
  why := private.phone_proof(p_num, p_last4);
  if why is not null then return jsonb_build_object('ok', false, 'error', why); end if;
  r := private.move_member(auth.uid(), p_num);
  update public.members set changed = changed + 1 where user_id = auth.uid();
  return r;
end $$;

revoke execute on function private.phone_proof(int, text) from public, anon, authenticated;
revoke execute on function public.claim(int, text), public.change_claim(int, text) from public;
grant execute on function public.claim(int, text), public.change_claim(int, text) to anon, authenticated;

notify pgrst, 'reload schema';
