import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// antd 부품은 CSS 변수 클래스 .wfc 를 달고 나온다(src/react/theme.ts CSS_VAR_KEY). 맨 요소 규칙이 거기 새면
// antd 가 안 정하는 속성(min-height·gap·outline 등)이 끼어 모달 닫기 버튼 같은 게 깨진다.
test('맨 button·input·select·textarea 규칙은 .wfc 밖으로 한정돼 있다', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => !s.startsWith('@'))
    .flatMap((s) => s.split(/,(?![^(]*\))/).map((x) => x.trim())); // 괄호 안 쉼표(:not(a, b))는 자르지 않는다
  const bare = selectors.filter((s) => /^(button|input|select|textarea)\b/.test(s) && !s.includes(':where(:not(.wfc, .wfc *))'));
  assert.deepEqual(bare, []);
});
