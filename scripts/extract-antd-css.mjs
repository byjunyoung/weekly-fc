// scripts/extract-antd-css.mjs — antd 부품 CSS 를 빌드 전에 public/antd.css 로 뽑는다(prebuild).
// 화면은 zeroRuntime(런타임에 스타일을 만들지 않음)이라 이 파일이 없으면 antd 부품이 맨 모습으로 나온다.
// 뽑을 때만 zeroRuntime 을 끈다 — 켠 채로 뽑으면 CSS 변수만 나오고 부품 규칙이 비어 있다(2026-09-15 실험).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { extractStyle } from '@ant-design/static-style-extract';
import { ConfigProvider } from 'antd';
import { themeConfig } from '../src/react/theme.ts';

// 스펙에서 쓰지 않는 부품군. 전부 뽑으면 gzip 110KB, 빼면 약 64KB.
// 쓰는 것만 고르는 includes 는 Table 이 안에서 쓰는 Pagination·Checkbox·Dropdown 을 빠뜨리기 쉬워 쓰지 않는다.
// 새 부품을 쓰게 되면 여기서 뺀다(tests/build/dist.test.mjs 가 쓰는 부품 규칙이 있는지 본다).
const UNUSED = ['Affix', 'Alert', 'Anchor', 'AutoComplete', 'Avatar', 'BackTop', 'Badge', 'Breadcrumb', 'Calendar', 'Carousel',
  'Cascader', 'Collapse', 'ColorPicker', 'Divider', 'Flex', 'FloatButton', 'Image', 'Layout', 'List', 'Listy', 'Masonry',
  'Mentions', 'Progress', 'QRCode', 'Rate', 'Result', 'Skeleton', 'Slider', 'Splitter', 'Statistic', 'Steps', 'Switch',
  'Tabs', 'Tag', 'Timeline', 'Tour', 'Transfer', 'Tree', 'TreeSelect', 'Typography', 'Upload', 'Watermark', 'notification'];

const css = extractStyle({
  excludes: UNUSED,
  customTheme: (node) => createElement(ConfigProvider, { theme: { ...themeConfig, zeroRuntime: false } }, node),
});
mkdirSync('public', { recursive: true });
writeFileSync('public/antd.css', css);
console.log(`public/antd.css ${css.length}B`);
