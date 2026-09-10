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

## 규칙 상수

벌금·시간·장소·통장은 `src/lib/rules.ts` 한 곳. 소개 페이지와 정산 화면이 같은 값을 쓴다.
