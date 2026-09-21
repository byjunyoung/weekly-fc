// src/react/theme.ts — antd 테마 한 곳. 값은 src/styles/tokens.css 를 그대로 옮긴다(tests/unit/theme.test.mjs 가 대조).
// 이 파일은 브라우저 번들과 scripts/extract-antd-css.mjs(Node) 양쪽에서 불린다 — Node 에서 바로 돌도록 타입 외 문법만 쓴다.
import { theme as antdTheme } from 'antd';
import type { MappingAlgorithm, ThemeConfig } from 'antd';

/** CSS 변수를 거는 클래스. 기본값이면 빌드 때 뽑은 CSS(.css-var-_R_0_)와 화면(React useId 로 만든 이름)이 달라 변수가 안 걸린다. */
export const CSS_VAR_KEY = 'wfc';

/** darkAlgorithm 은 주색 #0070d1 을 #0362b5 로, 링크 #53b1ff 를 #4a99dc 로 바꾼다. token 에 적어도 안 돌아와서 알고리즘 뒤에 다시 얹는다. */
export const EXACT_COLORS = {
  colorPrimary: '#0070d1',
  colorPrimaryHover: '#0064b7',
  colorPrimaryActive: '#0064b7',
  colorLink: '#53b1ff',
  colorLinkHover: '#53b1ff',
  colorError: '#ff5c74',
  colorSuccess: '#59cf84',
};
const keepExactColors: MappingAlgorithm = (_seed, map) => ({ ...map!, ...EXACT_COLORS });

export const themeConfig: ThemeConfig = {
  zeroRuntime: true,
  cssVar: { key: CSS_VAR_KEY },
  hashed: false,
  algorithm: [antdTheme.darkAlgorithm, keepExactColors],
  token: {
    colorPrimary: '#0070d1',
    colorBgBase: '#000000',
    colorBgLayout: '#000000',
    colorBgContainer: '#181818',
    colorBgElevated: '#1f2024',
    colorText: '#ffffff',
    colorTextSecondary: 'rgba(255, 255, 255, .7)',
    colorTextTertiary: 'rgba(229, 229, 229, .55)',
    colorBorder: 'rgba(229, 229, 229, .38)',
    colorBorderSecondary: 'rgba(229, 229, 229, .2)',
    colorLink: '#53b1ff',
    colorError: '#ff5c74',
    colorSuccess: '#59cf84',
    borderRadiusSM: 0,
    borderRadius: 0,
    borderRadiusLG: 0,
    fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    fontSize: 16,
  },
  components: {
    // 지금 tokens.css 의 button 규칙(각진 모서리, 높이 40, 좌우 22, 20px·400)과 .topbar-act button(34, 좌우 16, 20px)을 옮긴다.
    Button: {
      borderRadius: 0, borderRadiusSM: 0, borderRadiusLG: 0,
      controlHeight: 40, paddingInline: 22, contentFontSize: 20,
      controlHeightSM: 36, paddingInlineSM: 16, contentFontSizeSM: 20,
      fontWeight: 400,
      defaultBg: 'transparent', defaultColor: '#ffffff', defaultBorderColor: 'rgba(229, 229, 229, .38)',
      defaultHoverBg: 'rgba(255, 255, 255, .1)', defaultHoverColor: '#ffffff', defaultHoverBorderColor: 'rgba(229, 229, 229, .38)',
      defaultShadow: 'none', primaryShadow: 'none', dangerShadow: 'none',
    },
    // 지금 wa-dialog::part(...) 규칙 — 카드 면, 모서리 0, 제목 22·굵기 400.
    Modal: { contentBg: '#181818', headerBg: '#181818', titleFontSize: 20, fontWeightStrong: 400, borderRadiusLG: 0 },
    // 지금 .tbl 규칙 — 머리 바탕 --elevated·글자 --muted, 줄 경계 --hairline, 14px, 줄 hover.
    // 정렬된 열에 바탕을 따로 깔지 않는다(.tbl th.sorted 는 글자색만 바꾼다).
    // 모서리 0, 칸 좌우 여백 --s-md, 칸 위아래 여백은 13(cellPaddingBlockSM) — 표 본문이 갈무리 20px 로 바뀌면서(4c단계)
    // 14px 시절의 "줄높이 약 22px + 13 씩 = --row-h(48px)" 계산은 더 이상 안 맞는다. 실측(스쿼드 표, 열이 좁아 포지션
    // 칸의 뱃지+텍스트가 두 줄로 접히는 실제 행 기준) 줄 높이는 91px — --row-h 를 다시 맞추려는 값이 아니라 참고용 실측치다.
    // 머리 글자 굵기는 tokens.css 의 .ant-table-thead th 가 --fw-body 로 이긴다(여긴 그와 맞춘 값).
    Table: {
      headerBg: '#121314', headerSortActiveBg: '#121314', headerSortHoverBg: '#121314', headerColor: 'rgba(229, 229, 229, .55)',
      borderColor: 'rgba(229, 229, 229, .2)', headerSplitColor: 'transparent', cellFontSizeSM: 20,
      rowHoverBg: 'rgba(255, 255, 255, .06)', bodySortBg: 'transparent',
      headerBorderRadius: 0, cellPaddingInlineSM: 16, cellPaddingBlockSM: 13, fontWeightStrong: 400,
    },
    // 봉사표 연도 고르기 — 지금 .chip / .chip.on(각진 모서리, 12px, 선택 = 흰 바탕·검정 글자, hover --charcoal).
    Segmented: {
      itemColor: 'rgba(255, 255, 255, .7)', itemHoverColor: '#ffffff', itemHoverBg: '#1f2024', itemActiveBg: '#1f2024',
      itemSelectedBg: '#ffffff', itemSelectedColor: '#000000', trackBg: '#121314',
      borderRadius: 0, borderRadiusSM: 0, borderRadiusXS: 0, fontSize: 20, controlHeightSM: 28,
    },
    // 벌금·봉사 요약 — 지금 .card 모습(면 --card 는 Descriptions 바탕과 상관없이 antd 배경 기본값 그대로 두고,
    // 라벨·값 글자만 맞춘다). labelBg 는 bordered 모드의 라벨 칸 바탕.
    Descriptions: { labelBg: '#121314', labelColor: 'rgba(229, 229, 229, .55)', contentColor: '#ffffff', titleColor: '#ffffff' },
  },
};
