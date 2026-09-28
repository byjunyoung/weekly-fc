-- 지난 2026 매치 29건을 카톡 기록에서 채워 넣으면서(2026-09-28) 매치가 30건이 됐다. all_data 는 match_rows(30) 을 불러
-- 다음 경기부터 가장 오래된 매치가 목록에서 빠진다 — 한도를 최소 300 으로 올린다(all_data 는 그대로 두고 여기서).
create or replace function private.match_rows(p_limit int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'date', to_char(m.date, 'YYYY-MM-DD'), 'lineup', m.lineup, 'video', m.video_url,
      'opponent', m.opponent, 'score_us', m.score_us, 'score_them', m.score_them,
      'tally', coalesce((select jsonb_object_agg(v.target::text, v.c)
                         from (select target, count(*) c from public.potm_votes where match_id = m.id group by target) v), '{}'::jsonb),
      'voters', (select count(*) from public.potm_votes where match_id = m.id)
    ) order by m.date desc, m.id desc), '[]'::jsonb)
  from (select * from public.matches order by date desc, id desc limit greatest(p_limit, 300)) m
$$;
