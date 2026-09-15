# WEEKLY FC — Ant Design 도입

2026-09-15. 스쿼드 한 화면·운영 탭·모바일 벤치 줄(2026-09-13 스펙, main `5114587`) 배포 뒤 사용자 요청:

- "좋은데 전반적으로 이것도 ant design 컴포넌트 활용하자"

이 문서는 앞선 스펙들을 **덧씌운다**. 정보구조·주소·데이터 계약(시트 열)·백엔드·`api.ts` 계약·noindex는 그대로 두고, 화면을 그리는 방식을 vanilla TS 문자열 조립에서 React + antd로 바꾼다. 실사 선수 카드(D단계)는 이 문서 범위 밖이다(§8).

## 1. 결정 기록

| 항목 | 결정 | 근거 |
|---|---|---|
| 겉모습 | **지금 짙은 톤(PlayStation DESIGN.md) 유지**. antd 기본 모습으로 바꾸지 않는다 | 사용자 결정 |
| 구조 | **페이지마다 React 섬 하나**(`client:load`). Astro 페이지·레이아웃은 남긴다 | 주소·옛 주소 넘김·noindex·빌드 검사를 그대로 둔다 |
| 버전 | **antd 6 + React 19** | v5는 React 19에서 패치가 필요하다([v5-for-19](https://5x.ant.design/docs/react/v5-for-19/)). v6는 React 18 이상, CSS 변수 기본([v6 마이그레이션](https://ant.design/docs/react/migration-v6/)) |
| 무게 | **antd 전면 도입, 무게 감수**. 페이지 JS gzip 약 180~380KB(지금 41~53KB) | 실측(§7.1) 뒤 사용자 결정. Table·DatePicker를 빼는 안(약 180~260KB)과 도입 취소 안을 두고 골랐다 |
| 순서·배포 | **기반 → 운영 → 선수 상세 → 매치·홈 → 스쿼드**, 단계마다 main 배포 | 작은 화면으로 테마·스타일 추출을 검증한 뒤 가장 큰 스쿼드로 간다 |
| 섬 사이 상태 | **기존 window 이벤트(`wfc:data`·`wfc:error`·`wfc:admin`)를 훅이 구독**. Nano Stores는 섬끼리 따로 나눌 상태가 생길 때만 | 섞인 기간에 옛 화면은 이벤트로만 듣는다. 저장소를 하나 더 두면 두 경로를 동기화해야 한다 |
| 도메인 부품 | 피치·그리기·아래 고정 벤치 줄·1080×1350 공유 이미지는 **React로 옮기되 직접 만든 채로** | antd에 대응 부품이 없다 |
| Web Awesome | **4단계(스쿼드) 끝에 제거** | 옛 화면이 `wa-dialog`를 쓰는 동안은 남긴다 |

1~5행은 사용자 결정(2026-09-15), 나머지는 설계 승인(같은 날).

## 2. 구조

```
Astro 페이지 (.astro) ── 주소·옛 주소 넘김·noindex·빌드 검사는 그대로
 └ <XxxApp client:load />   ← 페이지마다 React 섬 하나
     ├ <ThemeRoot>  antd ConfigProvider: darkAlgorithm + 우리 토큰 + ko_KR
     ├ antd 부품 (Table · Modal · Form · Segmented · Drawer …)
     ├ 도메인 부품 (피치·그리기·벤치 줄·공유 이미지)
     └ src/lib 순수 로직 ─ 그대로 import
```

### 2.1 새로 두는 파일

| 파일 | 하는 일 |
|---|---|
| `src/react/theme.ts` | antd 테마 객체 하나(§3.1). 다른 곳에서 색·모서리 값을 직접 쓰지 않는다 |
| `src/react/ThemeRoot.tsx` | `ConfigProvider`(테마·`ko_KR`)로 섬 하나를 감싼다. 모든 섬의 바깥 |
| `src/react/useData.ts` | `onData`·`refresh`·`wfc:data`·`wfc:error`를 감싸 `{ data, error, retry }`를 준다 |
| `src/react/useAdmin.ts` | `isAdmin()`을 화면이 뜬 뒤에 읽고 `wfc:admin`을 구독한다 |
| `src/react/useMe.ts` | `getMe()`를 화면이 뜬 뒤에 읽고, 바뀌면 다시 읽는다 |
| `src/react/<화면>/` | 화면별 섬과 그 화면만 쓰는 부품 |

`src/lib`의 순수 로직(`formation`·`lineup`·`share`·`match-videos`·`rotation`·`stats` 등)과 `api.ts`는 바꾸지 않는다.

### 2.2 의존성

| 추가 | 제거 |
|---|---|
| `@astrojs/react`, `react@^19`, `react-dom@^19`, `antd@^6`, 빌드 때 CSS 추출용 `@ant-design/static-style-extract`(개발 의존성) | 4단계 끝에 `@awesome.me/webawesome` |

`@astrojs/sitemap`은 이미 안 쓰지만 이 작업 범위 밖이라 그대로 둔다(§8).

## 3. 테마 · 스타일

### 3.1 토큰 옮기기

`theme.ts`는 `darkAlgorithm` 위에 `tokens.css` 값을 그대로 얹는다. 값은 2026-09-15 `tokens.css` 기준.

| antd 토큰 | 값 | 출처(`tokens.css`) |
|---|---|---|
| `colorPrimary` | `#0070d1` | `--primary` |
| `colorBgBase` / `colorBgLayout` | `#000000` | `--bg` |
| `colorBgContainer` | `#181818` | `--card` |
| `colorBgElevated` | `#1f2024` | `--charcoal` |
| `colorText` | `#ffffff` | `--fg` |
| `colorTextSecondary` | `rgba(255, 255, 255, .7)` | `--body` |
| `colorTextTertiary` | `rgba(229, 229, 229, .55)` | `--muted` |
| `colorBorder` | `rgba(229, 229, 229, .38)` | `--hairline-strong` |
| `colorBorderSecondary` | `rgba(229, 229, 229, .2)` | `--hairline` |
| `colorLink` | `#53b1ff` | `--link`(검정 위 `#0070d1`은 글자 대비 미달이라 따로 둔 값) |
| `colorError` | `#ff5c74` | `--warn` |
| `colorSuccess` | `#59cf84` | `--ok` |
| `borderRadiusSM` / `borderRadius` / `borderRadiusLG` | `4` / `8` / `16` | `--r-sm` / `--r-md` / `--r-lg` |
| `fontFamily` | `--font` 문자열 그대로 | `--font` |
| `fontSize` | `16` | `--fs-body` |

부품 단위로 맞추는 것:

- `Button` — 알약 모양(`borderRadius` 9999), 높이 40, 좌우 여백 22, 글자 14·굵기 500, 테두리 `--hairline-strong`, 기본 바탕 투명. 지금 `button, .btn` 규칙과 같은 모습.
- `Modal` — 바탕 `--card`, 모서리 16, 제목 22. 지금 `wa-dialog::part(...)` 규칙과 같은 모습.
- `Segmented`·칩 — 선택된 항목은 흰 바탕에 검정 글자. 지금 `.chip.on`과 같은 모습.

`tokens.css`는 남긴다. 레이아웃·도메인 부품·Astro 쪽 요소가 계속 쓴다. `--wa-*` 매핑과 `wa-dialog`·`wa-select` 규칙만 4단계에서 지운다.

### 3.2 스타일을 빌드 때 뽑는다

- antd 6의 `zeroRuntime` 설정과 `@ant-design/static-style-extract`로 빌드할 때 antd CSS 파일을 만든다([6.0 발표](https://medium.com/ant-design/ant-design-6-0-is-here-0f5b2803e6a0), [dev.to 마이그레이션 글](https://dev.to/nainikmehta/migrate-to-ant-design-v6-zeroruntime-css-variables-4c99)).
- 공통 레이아웃 head에 그 CSS를 링크한다. 첫 화면부터 스타일이 입혀져 있어야 한다(Astro에서 antd 스타일이 빠지는 사례: [withastro/astro#6497](https://github.com/withastro/astro/issues/6497)).
- 이 방식이 문서대로 안 되면 대안으로 간다: 페이지 빌드 때 스타일을 추출해 head에 넣는다([공식 SSR 추출 글](https://ant.design/docs/blog/extract-ssr/)).

2026-09-15 실험(antd 6.6.4, `@ant-design/static-style-extract` 2.1.0, Astro 7.3 빌드)에서 확인한 것:

- **뽑을 때는 `zeroRuntime`을 꺼야 한다.** 켠 채로 `extractStyle({ customTheme })`에 넘기면 CSS 변수만 나오고 부품 규칙이 비어 화면이 맨 모습이다. 끄고 뽑으면 전 부품 규칙이 나온다(원본 1,019KB, gzip 110KB).
- **쓰지 않는 부품군은 `excludes`로 뺀다**(gzip 약 64KB). 쓰는 부품만 고르는 `includes`(약 58KB)는 Table이 안에서 쓰는 Pagination·Checkbox·Dropdown 같은 부품을 빠뜨리기 쉬워 쓰지 않는다. 새 부품을 쓰게 되면 제외 목록에서 뺀다.
- **CSS 변수 클래스를 고정해야 한다.** 기본값이면 추출 CSS는 `.css-var-_R_0_`, 페이지는 React `useId`로 `css-var-_r1R_0_`를 만들어 변수가 안 걸린다. `cssVar: { key: 'wfc' }`와 `hashed: false`를 주면 둘 다 `wfc` 클래스로 맞는다.
- **`darkAlgorithm`은 주색·링크색을 바꾼다**(`#0070d1` → `#0362b5`, `#53b1ff` → `#4a99dc`). `token`에 적어도 안 돌아온다. `algorithm: [darkAlgorithm, 우리 색 다시 얹기]`처럼 뒤에 함수 하나를 더 두면 정확한 값이 남는다.
- 추출 스크립트는 Node가 `theme.ts`를 바로 불러 쓴다(Node 22.18 이상 타입 제거). `package.json` `engines`가 이미 `>=22.18.0`이다.

## 4. 상태 · 섞인 기간

### 4.1 흐름

```
api.ts (캐시·refresh·login·write) ── 그대로
   │  wfc:data / wfc:error / wfc:admin  (window 이벤트)
   ├──▶ 옛 화면(vanilla) : 지금처럼 onData·이벤트로 그림
   └──▶ React 섬 : useData·useAdmin·useMe 가 같은 이벤트를 구독
```

- 상단바 섬은 관리자 모드를 켜거나 끌 때 지금처럼 `wfc:admin`을 보낸다. 옛 화면이 계속 들을 수 있다.
- 토스트: `window.wfcToast`는 남겨 두고, 0단계부터 속을 antd `message`로 바꾼다. 옛 화면의 `toast()`(`src/lib/html.ts`)도 같은 모습이 된다.
- 홈 「내 선수」 타일은 지금 `#me-btn`을 대신 누른다(`src/pages/index.astro`). 상단바가 섬이 된 뒤에도 이 연결이 살아 있어야 한다. 3단계에서 홈이 섬이 되면 `wfc:open-me` 이벤트로 바꾼다.

### 4.2 빌드 때 그린 화면과 실제 상태

`client:load`는 빌드 때 한 번 그려 두고 브라우저에서 이어받는다. 빌드 때는 브라우저 저장소가 없다. 그래서 관리자 여부(`sessionStorage`), 내 이름·캐시(`localStorage`)는 **화면이 뜬 직후에 읽는다**. 먼저 그려 둔 화면과 실제 상태가 달라 생기는 오류를 막는다. 데이터가 오기 전 모습은 지금 화면과 같은 자리에 같은 내용을 둔다.

## 5. 단계별 범위

지금 Web Awesome을 쓰는 곳은 모달 여섯 개다: 상단바(PIN·이름 고르기), 운영(벌금 기록), 선수 상세(선수 편집·아바타 편집), 스쿼드(이미지 공유).

| 단계 | 대상 | antd로 바꾸는 것 | 직접 만든 채로 두는 것 |
|---|---|---|---|
| 0. 기반 | `src/layouts/Shell.astro` | `node_modules` iCloud 제외(§8), 의존성·`astro.config.mjs`의 React 통합, 테마·스타일 추출. 상단바의 이름·관리자 버튼과 PIN·이름 고르기 모달은 `Modal`, 토스트는 `message` | 로고·탭 링크(Astro), 불러오기 실패 띠 |
| 1. 운영 | `src/pages/rules.astro` | 벌금 기준·현황·내역은 `Table`(정렬 포함). 벌금 기록은 `Modal`+`Form`(`DatePicker`·`Select`·`InputNumber`). 벌금 삭제는 `Popconfirm`, 봉사표 연도는 `Segmented`, 당번은 `Select`, 완료는 `Checkbox` | 규칙 본문 |
| 2. 선수 상세 | `src/pages/squad/[num].astro` | 정보는 `Descriptions`, 벌금 내역은 `Table`, 편집은 `Modal`+`Form`. 선수 삭제의 `confirm()`은 `Popconfirm` | 아바타 편집기 안쪽(D단계 실사 카드로 바뀔 예정이라 모달 틀만) |
| 3. 매치·홈 | `src/pages/match/index.astro`, `src/pages/index.astro` | 영상 목록은 `Card` 격자, 홈 타일은 `Card`. 「내 선수」 → `wfc:open-me` | 영상 임베드 |
| 4. 스쿼드 | `src/pages/squad/index.astro` | 모바일 명단 시트는 `Drawer`(아래에서), 보기 전환·인원 수는 `Segmented`, 표 보기는 `Table`, 공유는 `Modal`, 제목은 `Input`, 도구 버튼은 `Button`+`Tooltip`. 끝에 Web Awesome 패키지·`--wa-*`·`wa-dialog` 규칙 제거 | 피치, 그리기, 아래 고정 벤치 줄, 공유 이미지 캔버스 |

옛 주소 넘김 페이지(`about`·`record/*`·`tactics`)와 `Redirect.astro`는 섬을 넣지 않는다.

## 6. 오류 · 빈 상태

지금 동작을 그대로 옮긴다.

| 상황 | 지금 | 옮긴 뒤 |
|---|---|---|
| 데이터 불러오기 실패 | 레이아웃의 「데이터를 불러오지 못했습니다 · 다시 시도」 띠 | 띠는 레이아웃에 그대로. 섬은 `useData`의 `error`·`retry`를 받는다 |
| 전에 받은 데이터 | 캐시를 먼저 보여 준 뒤 새로 받는다 | 같다 |
| 저장 실패 | 토스트에 오류 문구, 모달은 열린 채 | `message.error`, 모달·입력값 유지 |
| PIN 틀림·연결 실패 | 모달 안 경고 문구 | 같은 문구를 모달 안에 |
| 한국어 | 직접 쓴 문구 | 직접 쓴 문구는 그대로, antd 기본 문구(확인·취소·날짜·정렬)는 `ko_KR` |

## 7. 검증 · 배포 · 되돌리기

### 7.1 모든 단계의 완료 조건

```
1. npm test 통과 (단위 + astro build + dist 검사, 기존 넘김·noindex·sitemap 없음 검사 포함)
2. 첫 화면부터 antd 스타일 적용 (CDP로 첫 페인트 확인)
3. 390px·1280px 가로 넘침 0
4. 기존 CDP 시나리오 확인 항목 통과 — 선택자가 바뀌면 같은 행동을 새 선택자로 다시 쓴다
5. 로딩 크기를 기준선과 비교해 보고
6. main 배포 후 실사이트에서 4번 다시 실행
```

기준선(2026-09-15 dist, Ant Design 전):

| 파일 | 원본 | gzip |
|---|---|---|
| 공통 스크립트(Shell) | 141,582B | 36,141B |
| 공통 CSS(Shell) | 78,323B | 13,179B |
| 스쿼드 스크립트 | 22,121B | 8,476B |
| 선수 상세 스크립트 | 6,230B | 2,982B |
| 운영 스크립트 | 4,622B | 2,099B |

페이지가 실제로 받는 합계(모듈 import를 따라가며 중복 없이, 2026-09-15 dist):

| 페이지 | JS gzip | CSS gzip |
|---|---|---|
| 홈 | 42,667B | 13,037B |
| 스쿼드 | 52,675B | 13,037B |
| 선수 상세 | 46,779B | 13,037B |
| 매치 | 40,886B | 13,037B |
| 운영 | 43,848B | 13,037B |

도입 전 실험(antd 6.6.4, React 19.3, esbuild minify + gzip, react 제외):

| 조합 | JS gzip |
|---|---|
| react + react-dom | 68,859B |
| ConfigProvider만 | 43,311B |
| 0단계(App·Button·Modal·Input) | 114,793B |
| Table 하나 | 197,709B |
| 1단계 운영 전체 | 280,279B |
| 스펙 부품 전체 | 307,809B |
| 빌드 때 뽑은 antd CSS(쓰지 않는 부품군 제외) | 63,815B |

### 7.2 단계별로 따로 확인

- **0단계** — 관리자 PIN은 에이전트가 넣지 않는다. 모달 열기·닫기·Esc·포커스 복귀까지만 확인하고 로그인은 사용자가 한다. 크기는 멈춤 기준 없이 실측해 보고만 한다(§1 무게 결정).
- **1·2단계** — 관리자 모드를 끈 화면은 에이전트가 확인한다. 벌금 추가·납부·삭제, 봉사 당번 수정, 선수 편집이 시트에 써지는지는 사용자가 PIN으로 확인한다.
- **4단계** — 모바일 벤치 줄·피치 위 스크롤·그리기·이미지 공유가 지금처럼 동작한다(시나리오 strip 20항목, t10·t11·fix). dist에 Web Awesome 코드가 남지 않는다.

### 7.3 빌드 검사에 추가

- 모든 페이지 head에 추출한 antd CSS 링크가 있다.
- 4단계 뒤로는 dist에 `webawesome` 문자열이 없다.

### 7.4 배포 · 되돌리기

```
단계마다 브랜치 1개 → main 병합 1번 → 배포
문제 발생 → 그 병합만 revert → push → Pages 재배포
```

- 1~4단계는 페이지끼리 서로 기대지 않는다. 한 단계만 되돌려도 다른 화면은 영향이 없다.
- 0단계는 모든 단계의 바탕이다. 단독으로 되돌릴 수 있는 건 1단계가 올라가기 전까지다.
- 4단계를 되돌리면 Web Awesome도 돌아온다.

## 8. 위험 · 범위 밖

### 8.1 열린 위험

| 위험 | 근거 | 대응 |
|---|---|---|
| React·antd 설치 파일이 iCloud로 올라감 | 이 레포 `node_modules`는 제외 링크가 아닌 실제 폴더다. `nosync-setup.sh --dry-run` 결과 "이동 + 링크 1곳" | 0단계 첫 작업으로 적용(로컬, 되돌릴 수 있음). `npm ci`는 링크를 지우므로 쓰면 다시 적용 |
| 빌드 때 CSS 추출이 문서대로 안 됨 | v6에서 새로 생긴 설정 | 0단계 맨 앞에서 확인, 안 되면 §3.2 대안 |
| 로컬 검증이 느려짐 | 8GB 맥에서 `astro check`가 끝나지 않았다 | 빌드 시간을 기준선과 함께 잰다. 타입 검사는 필수 관문에서 뺀다 |
| 스쿼드 화면 회귀 | 376줄로 가장 크고 드래그·그리기·벤치 줄이 얽혀 있다 | 마지막 단계. `src/lib` 단위 테스트와 CDP 시나리오 전체 통과 |
| 모바일 시트 느낌이 달라짐 | antd `Drawer`에는 끌어서 여닫는 손잡이가 없다(추정, 4단계에서 확인) | 손잡이 탭으로 닫기와 높이를 지금 값으로 맞춘다 |
| 로딩이 무거워짐 | 실측 4~8배(§7.1) | 사용자가 감수하기로 했다(§1). 단계마다 실측해 보고하고, 페이지끼리 공통 코드를 나눠 캐시되게 둔다 |

### 8.2 범위 밖

- 실사 선수 카드(D단계) — 사진 저장 위치와 동의부터 따로 정한다.
- 백엔드·시트 열·`api.ts` 계약·주소 구조 변경.
- 안 쓰는 `@astrojs/sitemap` 의존성·안 쓰는 토큰 정리(알려만 둔다).
- 섬끼리 따로 나눌 상태가 생기기 전의 Nano Stores 도입.
