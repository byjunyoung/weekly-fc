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

test('버튼은 지금 button 규칙과 같은 알약 모양', () => {
  const b = themeConfig.components.Button;
  assert.equal(b.borderRadius, 9999);
  assert.equal(b.controlHeight, 40);
  assert.equal(b.paddingInline, 22);
  assert.equal(b.contentFontSize, 14);
  assert.equal(b.fontWeight, 500);
  assert.equal(b.primaryShadow, 'none');
  assert.equal(b.controlHeightSM, 34);
  assert.equal(b.paddingInlineSM, 16);
  assert.equal(b.contentFontSizeSM, 12);
});

test('표는 지금 .tbl 모습 — 머리 바탕·글자, 줄 경계, 글자 크기, 줄 hover, 정렬 열 바탕 없음', () => {
  const t = themeConfig.components.Table;
  assert.equal(t.headerBg, tok('elevated'));
  assert.equal(t.headerSortActiveBg, tok('elevated'));
  assert.equal(t.headerSortHoverBg, tok('elevated'));
  assert.equal(t.headerColor, tok('muted'));
  assert.equal(t.borderColor, tok('hairline'));
  assert.equal(t.cellFontSizeSM, px('fs-sm'));
  assert.equal(t.rowHoverBg, 'rgba(255, 255, 255, .06)');
  assert.equal(t.bodySortBg, 'transparent');
  assert.equal(t.headerSplitColor, 'transparent');
});

test('표 모서리·칸 여백·머리 굵기도 지금 .tbl 과 같다', () => {
  const t = themeConfig.components.Table;
  assert.equal(t.headerBorderRadius, px('r-md'));
  assert.equal(t.cellPaddingInlineSM, px('s-md'));
  assert.equal(t.cellPaddingBlockSM, 13); // 14px 글자·줄높이 약 22px + 위아래 13 = 줄 높이 약 48(--row-h)
  assert.equal(t.fontWeightStrong, Number(tok('fw-heavy')));
});

test('연도 고르기는 지금 칩 모습 — 알약, 선택 = 흰 바탕·검정 글자, 평소 글자 --body, hover --charcoal, 바탕 --elevated', () => {
  const s = themeConfig.components.Segmented;
  assert.equal(s.itemSelectedBg, tok('fg'));
  assert.equal(s.itemSelectedColor, tok('canvas'));
  assert.equal(s.itemColor, tok('body'));
  assert.equal(s.itemHoverBg, tok('charcoal'));
  assert.equal(s.itemHoverColor, tok('fg'));
  assert.equal(s.trackBg, tok('elevated'));
  assert.equal(s.borderRadius, 9999);
  assert.equal(s.borderRadiusSM, 9999);
  assert.equal(s.fontSize, px('fs-xs'));
});

test('선수 요약(Descriptions)은 지금 .card 모습 — 라벨 바탕 --elevated·글자 --muted, 값 글자 --fg', () => {
  const d = themeConfig.components.Descriptions;
  assert.equal(d.labelBg, tok('elevated'));
  assert.equal(d.labelColor, tok('muted'));
  assert.equal(d.contentColor, tok('fg'));
  assert.equal(d.titleColor, tok('fg'));
});
