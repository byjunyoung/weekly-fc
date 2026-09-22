// 공유 이미지(캔버스)의 글꼴 계약 — 캔버스엔 CSS 가 안 닿아 화면 쪽 규약(tokens-scope)이 못 지킨다.
// 여기서 지키는 것 둘:
//  · 쓰는 크기가 전부 10의 배수여야 한다 — 갈무리는 10px 격자라 그 밖이면 도트가 뭉갠다.
//    캔버스엔 font-synthesis 도 없어 굵기는 400 만 쓴다(가짜 볼드가 만들어지면 더 뭉갠다).
//  · 쓰는 크기가 전부 PIXEL_SIZES 에 있어야 한다 — ShareModal 이 그 목록만 미리 불러오므로,
//    빠진 크기는 첫 진입에서 대체 글꼴로 굳은 이미지가 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIXEL_SIZES } from '../../src/components/share-image.ts';

const src = readFileSync(new URL('../../src/components/share-image.ts', import.meta.url), 'utf8');

test('PIXEL_SIZES 는 전부 10의 배수다 (갈무리 격자)', () => {
  assert.ok(PIXEL_SIZES.length > 0, 'PIXEL_SIZES 가 비었다');
  for (const px of PIXEL_SIZES) assert.equal(px % 10, 0, `${px}px 는 10의 배수가 아니다`);
});

test('캔버스가 쓰는 글꼴 크기가 전부 PIXEL_SIZES 안에 있다 (미리 불러오는 목록과 일치)', () => {
  const used = [...src.matchAll(/pixelFont\((\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(used.length >= 4, `pixelFont 호출을 못 찾았다: ${used}`);
  for (const px of new Set(used)) {
    assert.ok(PIXEL_SIZES.includes(px), `${px}px 를 쓰는데 PIXEL_SIZES 에 없다 — 미리 안 불러와 대체 글꼴로 굳는다`);
  }
});

test('굵기는 400 만 쓴다 (캔버스엔 font-synthesis 가 없다)', () => {
  const weights = [...src.matchAll(/`(\d{3}) \$\{px\}px/g)].map((m) => m[1]);
  for (const w of weights) assert.equal(w, '400', `굵기 ${w} 를 요구한다 — 가짜 볼드가 도트를 뭉갠다`);
});

test('피치·아바타 그림을 화면 렌더러에서 가져온다 (캔버스가 따로 그리면 둘이 갈린다)', () => {
  assert.match(src, /import \{[^}]*\bavatarPixels\b[^}]*\} from '\.\/avatar\.ts'/, '아바타 픽셀맵을 안 가져온다');
  assert.match(src, /import \{[^}]*\bturfRects\b[^}]*\} from '\.\/pitch-view\.ts'/, '잔디를 안 가져온다');
  assert.match(src, /import \{[^}]*\bmarkRects\b[^}]*\} from '\.\/pitch-view\.ts'/, '마킹을 안 가져온다');
  // 캔버스가 자기 좌표로 다시 그리기 시작하면 이 단언들이 막는다.
  assert.ok(!/strokeRect\(\s*\d+(\.\d+)?\s*\*/.test(src), '피치 선을 캔버스가 직접 그리고 있다');
});

test('OVR 은 그리지 않는다 (단톡방에 능력치가 도는 걸 막은 결정, 2026-09-13)', () => {
  // 등급 색은 쓰되 숫자는 안 찍는다 — ovr() 로 색만 고르고 fillText 로 내보내지 않는지 본다.
  const ovrInText = /fillText\([^)]*\bovr\(/.test(src);
  assert.equal(ovrInText, false, 'OVR 숫자를 캔버스에 찍고 있다');
});
