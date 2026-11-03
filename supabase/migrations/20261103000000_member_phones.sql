-- 연락처는 이름을 고른 팀원에게 보인다(2026-11-03 사용자 "회원가입 만들었으니까 로그인한 애들한텐 다 보이게").
-- 2026-09-24 "전화번호는 관리자 함수로만" 을 덧씌운다. 로그인만 한 사람(아무 이메일이나 가입 가능)은 못 보고,
-- 명단에서 이름을 고른 계정(members)과 관리자만 받는다. get_all 은 여전히 전화번호를 빼고 내보낸다.
create or replace function public.member_phones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or (private.my_num() is null and not private.is_admin()) then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(p.num::text, p.phone) from public.players p where btrim(p.phone) <> ''), '{}'::jsonb);
end $$;

revoke execute on function public.member_phones() from public;
grant execute on function public.member_phones() to anon, authenticated;

notify pgrst, 'reload schema';
