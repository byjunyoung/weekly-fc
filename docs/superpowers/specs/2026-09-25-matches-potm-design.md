# 매치 기록과 POTM — 팀짜기를 날짜로 남기고, 그날 최고를 뽑는다

> 2026-09-25. 사용자: "팀짜기할 때 날짜 저장해서 매치 팀구분 가능하게 하고, 매치별로 평점이나 POTM 정하는 것도
> 만들어서 하자." 방향 질문 하나의 답 — **POTM 투표**(평점 아님). 나머지는 아래 가정으로 정하고 진행했다.

## 0. 가정(묻지 않고 정한 것)

- **매치 하나 = 하루.** 자체전은 조끼 2~4팀으로 그날 내내 돌기 때문에 팀 나누기도 하루 단위다. 같은 날 다시
  저장하면 덮어쓴다.
- **저장은 관리자만.** 다른 쓰기(선수·로테이션·벌금)와 같다.
- **투표는 그날 명단에 든 로그인 회원, 한 표, 본인 제외.** 다시 누르면 표를 옮긴다. 용병은 뽑을 수도 뽑힐 수도 없다
  (번호가 없다).
- **투표는 매치 날짜부터 7일(서울 시간)까지.** 지나면 결과만 보인다.
- **POTM = 표가 가장 많은 사람.** 동점이면 공동 POTM.

## 1. 왜

지금 팀짜기는 브라우저 저장소에만 남는다. 다음 주에 "지난주 누가 어느 조끼였지"를 볼 수 없고, 매치라는 단위가
데이터에 없어 벌금 표의 `match_id` 칸도 늘 비어 있다. 매치가 표에 남으면 그 위에 "그날 최고"를 뽑을 수 있다.

## 2. 화면

```
상단 탭: 홈 · 명단 · 라인업 · 팀짜기 · 매치 · 티어 · 운영 규칙

/teams/ (팀짜기) — 관리자 모드일 때만 아래 줄이 보인다
  [날짜: 2026-09-27] [매치로 저장]
    · 아직 안 정한 사람이 있으면 저장 안 됨("아직 안 정한 사람이 있습니다")
    · 같은 날짜가 이미 있으면 덮어쓴다(확인 창)
    · 저장 뒤 "매치에 저장했습니다 — 보러 가기" 링크. 초안(브라우저 저장소)은 그대로 둔다.

/matches/ (매치) — 최신이 위. 매치마다 카드 하나
  ┌ 9월 27일 (토)                                   [삭제 — 관리자]
  │ POTM  (아바타) 김현서 · 5표      ← 표가 없으면 "아직 없음", 동점이면 둘 다
  │ 노조끼   현서 / 동훈 / 준영         ← 조끼 색 점 + 이름 칩(팀짜기와 같은 모양)
  │ 주황조끼 …
  │ 야광조끼 …
  │ ── POTM 뽑기 (투표 창이 열려 있고, 로그인 + 이름 차지 + 그날 뛴 사람일 때만)
  │    [현서] [동훈] [재원] …   ← 나는 빠짐. 내가 준 표는 채움 표시. 누르면 바로 저장
  │    "10월 4일까지 · 12명 중 7명 투표"
  └ 안 열려 있으면 이유 한 줄("로그인하면 투표할 수 있습니다" / "그날 뛴 사람만 투표합니다" / "투표가 끝났습니다")
```

폰 폭에서 탭이 일곱이 된다 — 탭 줄은 이미 가로로 밀고 끝을 흐리게 하므로(티어 게임 §2) 그대로 둔다.

## 3. 서버

마이그레이션 `supabase/migrations/20260925000000_matches.sql`.

| 표 | |
|---|---|
| `matches(id bigserial pk, date date unique, lineup jsonb, created_by int, created_at, updated_at)` | 하루 하나. `lineup` 은 **이름까지 박은 스냅샷** — 명단에서 빠진 사람(오늘 강준영을 뺐다)도 지난 매치엔 그대로 보여야 한다 |
| `potm_votes(match_id → matches on delete cascade, voter uuid, target int, ts, pk(match_id, voter))` | 한 사람 한 표. 다시 누르면 갈아탄다 |

`lineup` 모양 — 팀 순서는 조끼 순서(노조끼 → 주황 → 야광 → 검정), 빈 팀은 뺀다.
```json
[{ "vest": "none",   "members": [{ "num": 2, "name": "김현서" }, { "name": "오준 용병+2" }] },
 { "vest": "orange", "members": [ … ] }]
```

| 함수 | 누가 | |
|---|---|---|
| `save_match(p_date date, p_lineup jsonb)` → `{id, date}` | 관리자 | 날짜 기준 upsert. 팀이 둘 미만이면 `'팀이 둘 이상이어야 합니다'`, 빈 팀·이름 없는 사람이 있으면 `'팀 구성이 잘못됐습니다'` |
| `delete_match(p_id bigint)` | 관리자 | 표도 같이 지워진다(cascade) |
| `vote_potm(p_match bigint, p_num int)` → `{tally}` | 그날 뛴 회원 | 순서대로 거절: `'로그인이 필요합니다'` → `'먼저 내 이름을 골라 주세요'` → `'그 매치가 없습니다'` → `'투표가 끝난 매치입니다'`(오늘 > 날짜+7) → `'그날 뛴 사람만 투표할 수 있습니다'` → `'자기한테는 줄 수 없습니다'` → `'그날 뛴 선수에게만 줄 수 있습니다'`. upsert 뒤 새 집계를 돌려준다 |
| `get_all` | 누구나 | `matches` 를 더한다 — 최신 30개, 각 `{id, date, lineup, tally:{num:표}, voters:투표한 사람 수}`. 누가 누구를 찍었는지는 안 나간다 |
| `me()` | 로그인 | `potm:{match_id: target}` 를 더한다 — 아직 열린 매치(날짜 ≥ 오늘−7)만 |

- 확인은 전부 서버에서(`auth.uid()` · `private.my_num()` · `private.is_admin()`). "그날 뛴 사람"은 `lineup` 의 `num` 목록으로 본다.
- 표·순서는 다른 표와 같은 규칙: RLS 켜고 anon·authenticated 권한 회수, 함수만 `grant execute`.
- 집계는 `private.match_rows(p_limit)` 한 곳에서 만들어 `all_data` 가 쓴다.

## 4. 앱

| 파일 | 역할 |
|---|---|
| `src/lib/types.ts` | `Match`·`MatchTeam`·`MatchMember`, `Data.matches` |
| `src/lib/matches.ts` | 순수 함수 — `snapshot(st, players)`(팀짜기 상태 → lineup, 안 정한 사람 있으면 오류 문구), `potmOf(match)`(동점 공동), `voteOpen(match, today)`, `attendees(match)`, `voteBlock(match, me, today)`(못 누르는 이유 문구), `applyPotm(data, id, tally)`, `matchLabel(date)` |
| `src/lib/api.ts` | `normalizeMatch`, `saveMatch(date, lineup)`·`deleteMatch(id)`(관리자, 뒤에 refresh), `votePotm(id, num)`(응답 tally 로 캐시·`me.potm` 을 고쳐 다시 읽지 않는다 — 티어 `vote()` 와 같은 길) |
| `src/react/teams/TeamsApp.tsx` | 관리자일 때 날짜 + 저장 줄 |
| `src/pages/matches/index.astro` · `src/react/matches/MatchesApp.tsx` | 매치 목록·POTM·투표 |
| `src/layouts/Shell.astro` | 탭 '매치' |
| `tests/unit/matches.test.mjs` · `tests/build/dist.test.mjs` | 순수 함수 · 페이지 목록 |

날짜 입력은 브라우저 기본 `<input type="date">`(antd Input 에 type 만 준다) — 폰에선 OS 달력이 뜨고, 라이브러리 달력
CSS 를 더 싣지 않는다. 기본값은 오늘.

## 5. 확인

- 서버(실제 프로젝트, 트랜잭션 안에서 jwt claims 를 흉내 내고 rollback): 관리자 아닌 저장 거절, 팀 하나 저장 거절,
  같은 날 다시 저장하면 덮어씀, 안 뛴 사람·본인·용병·마감 뒤 투표 거절, 두 번 누르면 표가 옮겨짐, 삭제하면 표도 사라짐.
- 단위: snapshot(빈 팀 제거·안 정한 사람 오류·용병 이름 그대로), potmOf(동점·0표), voteOpen(경계 7일), voteBlock 문구.
- 폰 폭에서 눌러서: 팀짜기 저장 → 매치 카드 → 투표 → 표 옮기기 → 삭제.

## 6. 범위 밖

선수 페이지의 POTM 횟수, 벌금과 매치 연결(`fines.match_id`), 홈 타일, 경기 결과(스코어), 평점, 용병 POTM.
