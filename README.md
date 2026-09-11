# WEEKLY FC 포탈

매주 토요일 모이는 풋살 팀의 포탈. https://byjunyoung.github.io/weekly-fc/

- 스택: Astro 정적 사이트 + Google Apps Script(구글시트). 프레임워크·외부 라이브러리 없음.
- 설계: `docs/superpowers/specs/2026-09-10-weekly-fc-portal-design.md`. 결정을 바꾸면 그 문서부터.
- 배포: `main` push → GitHub Actions → Pages.

## 개발

```bash
npm install        # ~/Documents는 iCloud라 node_modules는 .nosync 심링크 구조 (memory 참고)
npm run dev        # http://localhost:4321/weekly-fc/
npm test           # 단위 테스트 + 빌드 + dist 검사
```

## 데이터

전부 구글시트에 있고 소스에는 없다. 시트: `선수명단`(rot 열이 봉사 순번) · `매치기록` · `봉사로테이션` · `벌금` · `라인업`.
Apps Script는 standalone 프로젝트 `weekly fc`(`script.google.com/u/1/home/my`). 재배포는 "배포 관리 > 새 버전"으로 주소를 유지한다. 스크립트 속성 `SPREADSHEET_ID`·`ADMIN_PIN` 필요.

## 배포 순서

백엔드를 프런트보다 먼저 올린다. 프런트가 먼저 나가면 새 코드가 옛 열 구성의
백엔드에 쓰게 되고, 참석자 명단이 매핑 밖 열로 들어가 백엔드를 올리는 순간 사라진다.
열 구성을 바꾸는 변경일수록 이 순서가 중요하다.

```bash
npm run deploy:api   # 1. 백엔드 — clasp 가 기존 배포에 새 버전을 물린다(주소 유지)
npm test             # 2. 프런트 검증
git push origin main # 3. 프런트 — Actions 가 빌드해 Pages 로 배포
```

`npm run deploy:api` 는 최초 1회 `clasp login` 이 필요하다(개인 구글 계정).
scriptId 는 `.clasp.json`, 배포 id 는 `package.json` 의 스크립트에 박혀 있다.
`.claspignore` 가 `server/` 안의 두 파일만 올라가도록 막는다.

배포 직후 몇십 초간 웹앱 주소가 404 를 내는 일이 있다 — 전파 지연이니 잠시 뒤 다시 확인한다.

## 규칙 상수

벌금·시간·장소·통장은 `src/lib/rules.ts` 한 곳. 소개 페이지와 정산 화면이 같은 값을 쓴다.
