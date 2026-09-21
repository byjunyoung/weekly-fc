import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { theme as antdTheme } from 'antd';
import { CSS_VAR_KEY, EXACT_COLORS, themeConfig } from '../../src/react/theme.ts';

// tokens.css 첫 :root 블록에서 값을 읽는다 — 테마가 정본과 어긋나면 여기서 잡힌다.
const css = readFileSync('src/styles/tokens.css', 'utf8');
const start = css.indexOf(':root {');
const root = css.slice(start, css.indexOf('\n}', start));
const tok = (name) => { const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`)); assert.ok(m, `--${name} 없음`); return m[1].trim(); };
const px = (name) => Number(tok(name).replace('px', ''));

test('antd 토큰은 tokens.css 값과 같다', () => {
  const t = themeConfig.token;
  assert.equal(t.colorPrimary, tok('primary'));
  assert.equal(t.colorBgBase, tok('bg'));
  assert.equal(t.colorBgLayout, tok('bg'));
  assert.equal(t.colorBgContainer, tok('card'));
  assert.equal(t.colorBgElevated, tok('charcoal'));
  assert.equal(t.colorText, tok('fg'));
  assert.equal(t.colorTextSecondary, tok('body'));
  assert.equal(t.colorTextTertiary, tok('muted'));
  assert.equal(t.colorBorder, tok('hairline-strong'));
  assert.equal(t.colorBorderSecondary, tok('hairline'));
  assert.equal(t.colorLink, tok('link'));
  assert.equal(t.colorError, tok('warn'));
  assert.equal(t.colorSuccess, tok('ok'));
  assert.equal(t.borderRadiusSM, px('r-sm'));
  assert.equal(t.borderRadius, px('r-md'));
  assert.equal(t.borderRadiusLG, px('r-lg'));
  assert.equal(t.fontFamily, tok('font'));
  assert.equal(t.fontSize, px('fs-body'));
});

test('CSS 변수 클래스는 wfc 로 고정, 해시 끔, 화면은 zeroRuntime', () => {
  assert.equal(CSS_VAR_KEY, 'wfc');
  assert.deepEqual(themeConfig.cssVar, { key: 'wfc' });
  assert.equal(themeConfig.hashed, false);
  assert.equal(themeConfig.zeroRuntime, true);
});

test('darkAlgorithm 뒤에도 주색·링크·경고·완료 색은 우리 값', () => {
  const [dark, keep] = themeConfig.algorithm;
  assert.equal(dark, antdTheme.darkAlgorithm);
  const seed = { ...antdTheme.defaultSeed, ...themeConfig.token };
  const darkOnly = dark(seed);
  assert.notEqual(darkOnly.colorPrimary, '#0070d1', 'darkAlgorithm 이 주색을 안 바꾼다면 keep 함수가 필요 없다');
  const map = keep(seed, darkOnly);
  for (const [k, v] of Object.entries(EXACT_COLORS)) assert.equal(map[k], v, k);
  assert.equal(EXACT_COLORS.colorPrimaryHover, tok('primary-pressed'));
});

test('버튼은 지금 button 규칙과 같은 각진 모양', () => {
  const b = themeConfig.components.Button;
  // 각진 모서리(2026-09-21 3단계) — tokens.css --r-* 도 같이 0 이어야 한다, 안 그러면 CSS·antd 가 따로 논다
  assert.equal(b.borderRadius, 0);
  assert.equal(b.controlHeight, 40);
  assert.equal(b.paddingInline, 22);
  // 글자 크기(4b단계) — 탑바·전역 버튼과 같은 20px(--fs-pixel-sm), 글꼴 자체는 tokens.css 의 .ant-btn 규칙이 정한다.
  assert.equal(b.contentFontSize, px('fs-pixel-sm'));
  // 굵기(4b 최종 리뷰) — tokens.css 의 .ant-btn 규칙이 --fw-body 로 이미 정하므로 여기도 400 으로 맞춘다(단일 출처).
  assert.equal(b.fontWeight, 400);
  assert.equal(b.primaryShadow, 'none');
  assert.equal(b.controlHeightSM, 36); // 34→36, 20px 글자가 안 잘리게(4b단계)
  assert.equal(b.paddingInlineSM, 16);
  assert.equal(b.contentFontSizeSM, px('fs-pixel-sm'));
});

test('표는 지금 .tbl 모습 — 머리 바탕·글자, 줄 경계, 글자 크기, 줄 hover, 정렬 열 바탕 없음', () => {
  const t = themeConfig.components.Table;
  assert.equal(t.headerBg, tok('elevated'));
  assert.equal(t.headerSortActiveBg, tok('elevated'));
  assert.equal(t.headerSortHoverBg, tok('elevated'));
  assert.equal(t.headerColor, tok('muted'));
  assert.equal(t.borderColor, tok('hairline'));
  assert.equal(t.cellFontSizeSM, px('fs-pixel-sm')); // 표 본문도 갈무리 20px(2026-09-21 4c단계) — 더 이상 --fs-sm(14px) 이 아니다.
  assert.equal(t.rowHoverBg, 'rgba(255, 255, 255, .06)');
  assert.equal(t.bodySortBg, 'transparent');
  assert.equal(t.headerSplitColor, 'transparent');
});

test('표 모서리·칸 여백·머리 굵기도 지금 .tbl 과 같다', () => {
  const t = themeConfig.components.Table;
  assert.equal(t.headerBorderRadius, px('r-md'));
  assert.equal(t.cellPaddingInlineSM, px('s-md'));
  assert.equal(t.cellPaddingBlockSM, 13); // 14px 글자·줄높이 약 22px + 위아래 13 = 줄 높이 약 48(--row-h)
  // 굵기(4b 최종 리뷰) — tokens.css 의 .ant-table-thead th 규칙이 --fw-body 로 이미 정하므로 여기도 400 으로 맞춘다(단일 출처).
  assert.equal(t.fontWeightStrong, Number(tok('fw-body')));
});

test('연도 고르기는 지금 칩 모습 — 각진 모서리, 선택 = 흰 바탕·검정 글자, 평소 글자 --body, hover --charcoal, 바탕 --elevated', () => {
  const s = themeConfig.components.Segmented;
  assert.equal(s.itemSelectedBg, tok('fg'));
  assert.equal(s.itemSelectedColor, tok('canvas'));
  assert.equal(s.itemColor, tok('body'));
  assert.equal(s.itemHoverBg, tok('charcoal'));
  assert.equal(s.itemHoverColor, tok('fg'));
  assert.equal(s.trackBg, tok('elevated'));
  assert.equal(s.borderRadius, 0);
  assert.equal(s.borderRadiusSM, 0);
  // 글자 크기(4b단계) — 다른 컨트롤과 같은 20px(--fs-pixel-sm)로 올림
  assert.equal(s.fontSize, px('fs-pixel-sm'));
});

test('모달 제목 글자 크기는 여기 한 곳에서만 정한다 — 20px(--fs-pixel-sm)', () => {
  const m = themeConfig.components.Modal;
  assert.equal(m.titleFontSize, px('fs-pixel-sm'));
});

test('선수 요약(Descriptions)은 지금 .card 모습 — 라벨 바탕 --elevated·글자 --muted, 값 글자 --fg', () => {
  const d = themeConfig.components.Descriptions;
  assert.equal(d.labelBg, tok('elevated'));
  assert.equal(d.labelColor, tok('muted'));
  assert.equal(d.contentColor, tok('fg'));
  assert.equal(d.titleColor, tok('fg'));
});
