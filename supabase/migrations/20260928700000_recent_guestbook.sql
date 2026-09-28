-- 라커룸 「최근 방명록」(2026-09-28) — 팀 전체에서 가장 최근 글. 방명록은 원래 공개라 로그인 없이 읽는다. 받는 선수 이름을 붙인다.
create or replace function public.recent_guestbook(p_limit int default 3) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'num', g.player_num, 'to_name', coalesce(p.name, ''), 'author_num', g.author_num, 'author_name', g.author_name, 'text', g.text, 'ts', g.ts
    ) order by g.ts desc, g.id desc), '[]'::jsonb)
  from (select * from public.guestbook order by ts desc, id desc limit least(greatest(coalesce(p_limit, 3), 1), 10)) g
  left join public.players p on p.num = g.player_num
$$;
revoke execute on function public.recent_guestbook(int) from public, anon, authenticated;
grant execute on function public.recent_guestbook(int) to anon, authenticated;
notify pgrst, 'reload schema';
