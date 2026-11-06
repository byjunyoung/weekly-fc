// 결정성 소스 검사(2026-11-07 리뷰 #6) — 방장과 손님이 다른 JS 엔진에서 같은 step 을 돌린다. 계산 파일 전부에 삼각함수·지수·난수·시계가 없어야 한다.
// 폴더를 읽어 찾으므로 새 계산 파일도 저절로 검사를 받는다. step 경로가 아닌 도우미가 꼭 써야 하면 ALLOW 에 파일과 이유를 적는다(지금 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIRS = ['src/lib/game', 'src/lib/game3d', 'src/lib/games'];
/** 파일 → 이유. */
const ALLOW = {};
const BAD = /Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|hypot|pow|exp|expm1|log|log2|log10|log1p|cbrt|random)\b|Date\.now|new Date\b|performance\.now|\*\*/;

test('계산 파일(src/lib/game·game3d·games) 어디에도 삼각함수·지수·난수·시계가 없다', () => {
  const files = DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`));
  assert.ok(files.length >= 25, `파일 ${files.length}개`);
  for (const f of files) {
    if (ALLOW[f]) continue;
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const m = code.match(BAD);
    assert.equal(m, null, `${f}: ${m?.[0]}`);
  }
});
