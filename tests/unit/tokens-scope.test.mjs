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

// 중첩(@media)까지 정확히 짝지어 "선택자 → 그 규칙만의 선언부" 쌍을 뽑는다. 위 테스트의 얕은 매칭과 달리
// 본문(body)이 필요해서 괄호 스택으로 직접 짝을 맞춘다 — @media 래퍼 자체는 버리고 그 안의 낱규칙만 남긴다.
function ruleBlocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  const selectorStack = [];
  let buf = '';
  for (const ch of clean) {
    if (ch === '{') { selectorStack.push(buf.trim()); buf = ''; }
    else if (ch === '}') {
      const selector = selectorStack.pop();
      if (selector !== undefined && !selector.startsWith('@') && selector !== ':root') blocks.push({ selector, body: buf });
      buf = '';
    } else buf += ch;
  }
  return blocks;
}

// 이 프로젝트는 같은 함정(전역 button 이 갈무리가 되면서 상속된 후손이 10의 배수가 아닌 크기를 다시 선언해
// 흐려지는 것)에 네 번 빠졌다 — font-family: var(--font-pixel) 을 직접 거는 규칙마다 합성 방지·자간·10의
// 배수 크기를 다 갖췄는지 기계로 잡는다(2026-09-21 4b 최종 리뷰).
test('갈무리(도트 폰트)를 직접 거는 규칙은 합성 방지·자간 0·10의 배수 크기를 다 갖췄다 — 상속 흐림 재발 방지', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const pixelSizeTokens = ['fs-pixel-xs', 'fs-pixel-sm', 'fs-pixel-md', 'fs-pixel-lg', 'fs-pixel-xl'];
  const offenders = [];
  for (const { selector, body } of ruleBlocks(css)) {
    if (!/font-family:\s*var\(--font-pixel\)/.test(body)) continue;
    const synthesisNone = /font-synthesis:\s*none\s*;/.test(body);
    const letterSpacingZero = /letter-spacing:\s*0\s*;/.test(body);
    const sizeDecls = [...body.matchAll(/font-size:\s*([^;]+);/g)];
    const lastSize = sizeDecls.length ? sizeDecls[sizeDecls.length - 1][1].trim() : null;
    const sizeMatch = lastSize && lastSize.match(/^var\(--([a-z0-9-]+)\)$/);
    const sizeOk = lastSize === null || (sizeMatch !== null && pixelSizeTokens.includes(sizeMatch[1]));
    if (!synthesisNone || !letterSpacingZero || !sizeOk) {
      offenders.push({ selector, synthesisNone, letterSpacingZero, size: lastSize });
    }
  }
  assert.deepEqual(offenders, []);
});

// ── 도트 글꼴 계약 ─────────────────────────────────────────────────────
// 본문까지 갈무리14 로 바꾸면서(2026-09-22) 제약이 화면 전체로 퍼졌다. 갈무리14 는 14px 격자,
// 갈무리9 는 10px 격자고 **둘 다 굵기가 400 하나뿐**이다. 격자에서 벗어난 크기나 400 아닌 굵기를
// 한 줄만 흘려도 그 자리만 조용히 흐려진다 — 눈으로는 잘 안 보이고 기기마다 달라 놓치기 쉽다.
test('본문 크기는 14 의 배수, 도트 강조 크기는 10 의 배수다', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const sizes = [...root.matchAll(/--(fs-[a-z0-9-]+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]);
  assert.ok(sizes.length >= 8, `크기 토큰을 못 찾았다: ${sizes.length}`);
  for (const [name, px] of sizes) {
    const grid = name.startsWith('fs-pixel-') ? 10 : 14;
    assert.equal(px % grid, 0, `--${name}: ${px}px 는 ${grid} 의 배수가 아니다 — 그 자리만 도트가 뭉갠다`);
  }
});

test('굵기 토큰은 전부 400 이다 — 갈무리엔 볼드가 없어 가짜 볼드가 만들어진다', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const weights = [...css.matchAll(/--(fw-[a-z]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
  assert.ok(weights.length >= 5, `굵기 토큰을 못 찾았다: ${weights.length}`);
  for (const [name, w] of weights) assert.equal(w, 400, `--${name}: ${w} — 400 이 아니면 브라우저가 획을 부풀린다`);
});

test('글꼴 합성을 되살리거나 자간을 음수로 주는 규칙이 없다', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/font-synthesis:\s*auto/.test(css), false, 'font-synthesis: auto 가 남아 있다');
  const tracking = [...css.matchAll(/letter-spacing:\s*(-[^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(tracking, [], '음수 자간은 비트맵 글자를 겹치게 한다');
});

test('html 이 합성·자간을 한 번에 끈다 — 규칙마다 적는 걸 잊어도 새지 않게', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const html = css.slice(css.indexOf('html {'), css.indexOf('}', css.indexOf('html {')));
  assert.match(html, /font-synthesis:\s*none/);
  assert.match(html, /letter-spacing:\s*0/);
});
