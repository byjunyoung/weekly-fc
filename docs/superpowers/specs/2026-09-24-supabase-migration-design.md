# 백엔드 이전 — Google Sheets + Apps Script → Supabase

> 2026-09-24. 사용자 결정: "다른 백엔드로 옮기자". 방향 질문 셋의 답 — **Supabase**,
> 관리자 인증은 **PIN 그대로**, 구글 시트는 옮긴 날 모습 그대로 보관하고 **비공개 저장소로 매주 백업**.

## 1. 왜

실측(2026-09-23, 6회): 전체 데이터 읽기 2.6~4.4초(가운데 약 3초), 그중 약 1.5초는 Apps Script 자체
기동이라 줄일 수 없다. 처음 오는 사람·새 기기는 그 시간 동안 "불러오는 중"만 본다. 그 밖에

- 쓰기가 전부 GET 이라 관리자 PIN 이 주소 쿼리로 간다(방문 기록·서버 기록에 남는다).
- 동시 쓰기 잠금이 없다.
- 카톡 인앱 브라우저가 `script.google.com` 요청을 멈춰 세운다(2026-09-22 확인) — 지금은 외부
  브라우저로 강제 전환해 우회 중이다.

## 2. 고른 것과 근거

| | Supabase(채택) | Cloudflare Workers + D1 | Firebase |
|---|---|---|---|
| 속도 | 서울 리전(ap-northeast-2) | 엣지 | 빠름 |
| 무료 한도 | DB 500MB, 요청 무제한 | 요청 10만/일 | 읽기 5만·쓰기 2만/일 |
| 잠듦 | **7일 미사용 시 멈춤** | 없음 | 없음 |
| 직접 고치기 | 표 편집기 | SQL 콘솔 | 문서 뷰어 |
| 서버 로직 | DB 함수(SQL) — 한 트랜잭션 | API 를 따로 짬 | 보안 규칙 |
| 카톡 인앱 | 구글 도메인 아님(추정: 안 막힘) | 같음(추정) | googleapis.com(추정: 막힐 수 있음) |

출처: supabase.com/pricing · supabase.com/docs/guides/platform/regions ·
supabase.com/docs/guides/platform/free-project-pausing · supabase.com/docs/guides/platform/backups ·
developers.cloudflare.com/d1/platform/pricing · developers.cloudflare.com/workers/platform/pricing ·
firebase.google.com/pricing

**무료 플랜의 두 약점과 대응** — (1) 7일 동안 DB 활동이 없으면 멈춘다 → 사흘마다 도는 백업 작업이
DB 를 읽어 깨운다(일주일 경계가 아슬아슬해 7일이 아니라 3일). (2) 자동 백업이 없다 → 같은 작업이
전체 데이터를 비공개 저장소에 쌓는다.

## 3. 구조

```
화면 ─ src/lib/api.ts ─(POST · JSON 본문)─ Supabase REST /rest/v1/rpc/<함수> ─ Postgres
```

- **화면 코드는 바꾸지 않는다.** api.ts 의 공개 함수(`fetchData`·`refresh`·`login`·`write`·
  `writeAvatar`·`writeStats`·`fetchFull`)의 이름·인자·반환 모양을 그대로 두고, 그 아래 전달 통로만 바꾼다.
  `get_all` 이 지금 `getAll` 과 같은 JSON 모양(`players`·`rotation`·`fines`·`statLog`)을 돌려주므로
  `normalizeData` 도 그대로 쓴다.
- **Supabase 전용 라이브러리를 쓰지 않는다.** `fetch` 로 RPC 를 부른다 — 번들이 안 커지고 지금 구조와 같다.
- 서버 로직은 별도 서버 없이 **DB 함수**(SQL, `security definer`)로 둔다. 파일은 `supabase/migrations/`.
- 사이트 호스팅(GitHub Pages)은 그대로.

## 4. 데이터

| 표 | 열 | 키 |
|---|---|---|
| players | num int, pos, detail, foot, name, phone, vest int null, note, pace·dribble·pass·shoot·defend·stamina int, rot int null, avatar | num |
| rotation | year int, month int, p1, p2, done bool | (year, month) |
| fines | id text, date date, match_id text, player, type('지각'·'노쇼'), amount int, paid bool | id |
| stat_log | id bigserial, ts timestamptz, by int null, by_name, num int, field, before int, after int | id |
| settings | key text, value text — 관리자 PIN 의 bcrypt 해시(`pgcrypto`)만 | key |

**표에 바깥에서 직접 닿는 길은 없다.** 모든 표에 RLS 를 켜고 정책을 하나도 두지 않으며, `anon`·
`authenticated` 의 표 권한도 걷는다. 읽기·쓰기는 전부 아래 함수를 거친다 — 그래서 전화번호는
관리자 함수로만 나간다.

## 5. 함수 — 지금 액션과 1:1

| 함수 | 권한 | 지금 액션 | 동작 |
|---|---|---|---|
| `get_all()` | 누구나 | getAll | 전화번호 뺀 선수, 봉사표, 벌금, 최근 기록 300줄(오래된 순) |
| `write_avatar(p_num, p_avatar)` | 누구나 | writeAvatar | 코드 형식 검사 후 그 칸만 |
| `write_stats(p_num, p_stats, p_by)` | 누구나 | writeStats | 보낸 칸만, 1~99 정수, 바뀐 칸마다 기록 — **한 트랜잭션, 선수 행 잠금** |
| `verify_pin(p_pin)` | PIN | verifyPin | |
| `get_all_full(p_pin)` | PIN | getAllFull | get_all + 전화번호 |
| `write_player(p_pin, p_payload)` | PIN | writePlayer | 번호로 덮어쓰기(없으면 추가) |
| `delete_player(p_pin, p_payload)` | PIN | deletePlayer | |
| `write_rotation(p_pin, p_payload)` | PIN | writeRotation | (연, 월)로 덮어쓰기 |
| `write_fine(p_pin, p_payload)` | PIN | writeFine | id 로 덮어쓰기, id 없으면 새로 |
| `delete_fine(p_pin, p_payload)` | PIN | deleteFine | |
| `set_admin_pin(p_pin)` | 한 번만 | — | PIN 이 아직 없을 때만 설정(이전 첫 단계) |
| `import_all(p_pin, p_data)` | PIN | — | 이전용. 선수·봉사표·벌금은 덮어쓰기, 기록은 (ts, num, field) 가 같으면 건너뜀 — 여러 번 돌려도 같다 |

- **오류 문구는 지금과 같게** 낸다(`PIN이 올바르지 않습니다.`, `pace 값이 1~99 정수가 아닙니다` 등) —
  `login()` 이 문구로 "틀린 PIN"과 "연결 실패"를 가른다. 함수는 `raise exception` 으로 알리고, api.ts 가
  PostgREST 오류 응답의 `message` 를 그대로 `Error` 로 던진다.
- 아바타 코드 규칙은 앱 `CODE_SHAPE` 와 **같은 정규식**을 SQL 에 둔다. 두 파일을 읽어 대조하는 테스트를
  서버 쪽 대상만 Apps Script 파일 → SQL 파일로 바꾼다. 길이 상한 120 도 그대로.
- 함수 실행 권한은 위 표의 공개 함수에만 `anon` 에게 준다. 도우미 함수는 걷는다.

## 6. 비밀값

| 값 | 성격 | 어디에 |
|---|---|---|
| 프로젝트 URL · anon(공개) 키 | 공개용 — 브라우저에 실리게 만든 값 | api.ts 상수 |
| 관리자 PIN | 비밀 | DB 엔 해시만. 이전 스크립트는 저장소 밖에 안 올라가는 `.env.local` 에서 읽음. 백업 저장소엔 GitHub 비밀값 |
| service_role 키 · DB 비밀번호 | 쓰지 않는다 | — |

백업·이전 모두 **PIN 으로 여는 함수**를 쓴다. 전권을 가진 service_role 키를 어디에도 두지 않는 게
최소 권한이다.

**표·함수를 올리는 권한**은 Supabase CLI 로그인(브라우저에서 승인 — clasp 로그인과 같은 방식)으로 받은
토큰을 쓴다. 비밀번호를 건네받지 않는다. 그 길이 막히면 SQL 파일을 대시보드 SQL 편집기에 붙여넣는 것이
대안이다(사용자가 실행).

`set_admin_pin` 은 PIN 이 아직 없을 때만 동작한다. 그 사이 누가 먼저 설정할 틈은 이론상 있으나, 프로젝트
URL 이 사이트에 실리기 전(7-4 이전)이라 밖에서 알 방법이 없다.

## 7. 옮기는 순서 — 사이트가 끊기지 않게

1. (사용자) Supabase 가입, 프로젝트 생성 — 리전 서울. URL·anon 키를 알려 준다.
2. (Claude) 표·함수 올리기. 이때까지 사이트는 계속 시트를 쓴다.
3. (사용자) `.env.local` 에 PIN 을 적고 이전 명령 실행 — 시트(getAllFull)를 읽어 `set_admin_pin` →
   `import_all`. 끝에 선수 수·벌금 합·봉사표 행 수·기록 수를 시트와 대조해 찍는다.
4. (Claude) api.ts 를 새 통로로 바꿔 배포.
5. (사용자) 3 을 한 번 더 — 3~4 사이 시트에 쓰인 게 있으면 따라잡는다(덮어쓰기라 중복 없음).
6. 카톡 인앱에서 열어 확인. 멈춤이 사라졌으면 외부 브라우저 강제 전환을 걷어낸다(별도 커밋).
7. 1주일 뒤 Apps Script 배포를 내리고 `server/`·`deploy:api`·clasp 의존성을 정리한다. 그동안은
   되돌릴 곳으로 남긴다(api.ts 한 파일만 되돌리면 옛 통로).

## 8. 백업·깨우기

비공개 저장소 `byjunyoung/weekly-fc-backup`. 사흘마다(GitHub Actions 예약) `get_all_full` 을 불러
`backup/YYYY-MM-DD.json` 으로 커밋한다. 그 읽기가 곧 깨우기다. 비밀값 `WFC_PIN` 은 사용자가 저장소
설정에서 넣는다. 공개 저장소(weekly-fc)에는 실명·전화번호를 두지 않는다는 기존 원칙을 지킨다.

## 9. 확인

- **단위** — api.ts: RPC 요청 모양(POST·헤더·본문), 오류 응답 → 문구, 15초 제한시간 유지,
  `get_all` 응답 정규화. 아바타 정규식 앱·SQL 대조.
- **실제 프로젝트, 데이터 안 바뀌는 쪽 먼저** — 범위 밖 능력치·형식 틀린 아바타·없는 번호·틀린 PIN 이
  각각 지금과 같은 문구로 막히는지.
- **이전 뒤 대조** — 선수 30명, 벌금 합, 봉사표 행 수, 기록 수가 시트와 같은지(이전 명령이 찍는다).
- **화면** — 로컬·배포본에서 첫 방문 속도, 능력치 스텝퍼·꾸미기 저장·관리자 편집을 눌러서 확인.
- **카톡 인앱** — 사용자 폰에서 7-6.

## 10. 범위 밖 · 알려진 한계

- PIN 대입 공격 제한 없음 — 지금과 같다. 필요하면 후속으로 실패 횟수 제한.
- 아바타를 누가 바꿨는지는 여전히 안 남는다(능력치만 기록).
- 실시간 갱신(다른 사람 수정이 바로 뜸)은 안 한다 — 지금처럼 열 때·저장 후 다시 읽기.
