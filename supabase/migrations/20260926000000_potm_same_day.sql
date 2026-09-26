-- POTM 투표는 매치 당일만(2026-09-26 "매치 당일만 오픈"). 서울 시간 자정에 닫힌다.
-- 7일 창(20260925000000)·경기 전 차단(20260925300000)에 이어 세 번째 조정.

create or replace function private.potm_open(p_date date) returns boolean
language sql stable set search_path = '' as $$ select private.today_kst() = p_date $$;

create or replace function public.vote_potm(p_match bigint, p_num int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me int; d date; nums int[]; tally jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  me := private.my_num();
  if me is null then raise exception '먼저 내 이름을 골라 주세요'; end if;
  select m.date, private.lineup_nums(m.lineup) into d, nums from public.matches m where m.id = p_match;
  if d is null then raise exception '그 매치가 없습니다'; end if;
  if private.today_kst() < d then raise exception '경기 뒤에 투표할 수 있습니다'; end if;
  if private.today_kst() > d then raise exception '투표는 경기 당일 자정까지입니다'; end if;
  if not (me = any (nums)) then raise exception '그날 뛴 사람만 투표할 수 있습니다'; end if;
  if p_num is null or p_num = me then raise exception '자기한테는 줄 수 없습니다'; end if;
  if not (p_num = any (nums)) then raise exception '그날 뛴 선수에게만 줄 수 있습니다'; end if;
  insert into public.potm_votes (match_id, voter, target, ts) values (p_match, auth.uid(), p_num, clock_timestamp())
  on conflict (match_id, voter) do update set target = excluded.target, ts = excluded.ts;
  select coalesce(jsonb_object_agg(v.target::text, v.c), '{}'::jsonb) into tally
    from (select target, count(*) c from public.potm_votes where match_id = p_match group by target) v;
  return jsonb_build_object('id', p_match, 'tally', tally,
    'voters', (select count(*) from public.potm_votes where match_id = p_match), 'mine', p_num);
end $$;

notify pgrst, 'reload schema';
