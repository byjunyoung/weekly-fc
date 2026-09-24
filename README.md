# WEEKLY FC 포탈

매주 토요일 모이는 풋살 팀의 포탈. https://byjunyoung.github.io/weekly-fc/

- 스택: Astro 정적 사이트(React 섬 + antd) + Supabase(Postgres). 2026-09-24 에 구글시트·Apps Script 에서 옮겼다 — `docs/superpowers/specs/2026-09-24-supabase-migration-design.md`.
- 설계: `docs/superpowers/specs/2026-09-10-weekly-fc-portal-design.md`. 결정을 바꾸면 그 문서부터.
- 배포: `main` push → GitHub Actions → Pages.

## 개발

```bash
npm install        # ~/Documents는 iCloud라 node_modules는 .nosync 심링크 구조 (memory 참고)
npm run dev        # http://localhost:4321/weekly-fc/
npm test           # 단위 테스트 + 빌드 + dist 검사
```

## 데이터

Supabase 프로젝트 `irltzwgijbbodkgzmnrc`(서울 리전, 무료). 표는 바깥에서 직접 못 닿고, 앱은
`src/lib/api.ts` 의 `rpc()` 로 DB 함수만 부른다. 주소·공개 키는 `src/lib/backend.ts`.
표·함수 정의는 `supabase/migrations/` — 바꿀 땐 새 파일을 더해 올린다.

```bash
# Supabase CLI 로그인은 한 번(브라우저 승인). Claude Code 안에서 돌리면 환경변수
# CLAUDECODE·AI_AGENT 를 빼야 CLI 가 대화형 모드로 뜬다.
npx supabase db query --linked --project-ref irltzwgijbbodkgzmnrc -f 파일.sql
```

관리자 PIN 은 DB 에 해시로만 있다. 무료 프로젝트는 7일 동안 안 쓰면 멈추므로
`.github/workflows/keepalive.yml` 이 사흘마다 한 번 읽어 깨운다(멈췄으면 실패 메일).
옛 구글시트는 옮긴 날 모습으로 남겨 둔 보관본이다 — 사이트는 더 이상 읽지 않는다.

## 배포

`main` push → Actions 가 `npm test` 뒤 Pages 로 배포. DB 함수를 바꾸면 SQL 을 먼저 올리고 프런트를 민다.

## 규칙 상수

벌금·시간·장소·통장은 `src/lib/rules.ts` 한 곳. 운영 규칙 페이지(`/rules/`)와 정산 화면이 같은 값을 쓴다.
