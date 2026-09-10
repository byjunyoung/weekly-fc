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

## 배포 순서 (처음 올릴 때 한 번)

프런트를 먼저 올리면 안 된다. 지금 배포된 Apps Script는 옛 열 구성이라,
새 프런트가 먼저 쓰면 참석자 명단이 매핑 밖 열로 들어가고 나중에 백엔드를
올리는 순간 사라진다.

1. Apps Script 재배포 — `script.google.com/u/1/home/my` → `weekly fc` →
   `apps-script.gs` 전체 붙여넣기 → 배포 관리 > 연필 > 버전: 새 버전
   (「새 배포」로 하면 주소가 바뀌어 앱이 끊긴다)
2. 스프레드시트 `라인업` 시트에서 옛 형식 `default` 행 삭제
   (데이터가 있는 시트는 헤더 자동 정비가 돌지 않는다)
3. `getAll` 로 확인 — 선수 30명, phone 키 없음
4. 그다음 `main` push

## 규칙 상수

벌금·시간·장소·통장은 `src/lib/rules.ts` 한 곳. 소개 페이지와 정산 화면이 같은 값을 쓴다.
