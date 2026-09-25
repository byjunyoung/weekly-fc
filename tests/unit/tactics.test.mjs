import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, LAWS, lawsByTopic, TOPICS, TOPIC_COLOR } from '../../src/lib/tactics.ts';
import { tacticsBoardSvg } from '../../src/components/tactics-board.ts';

test('법칙 34개, 그림 키·주제가 전부 있다, 제목 중복 없음', () => {
  assert.equal(LAWS.length, 34);
  for (const l of LAWS) { assert.ok(BOARDS[l.art], l.art); assert.ok(TOPICS.includes(l.topic), l.topic); assert.ok(TOPIC_COLOR[l.topic]); }
  assert.equal(new Set(LAWS.map((l) => l.title)).size, LAWS.length);
});
test('주제별 묶음은 TOPICS 순서, 번호는 1부터 이어진다', () => {
  const g = lawsByTopic();
  assert.deepEqual(g.map((x) => x.topic), TOPICS.filter((t) => LAWS.some((l) => l.topic === t)));
  assert.deepEqual(g.flatMap((x) => x.laws.map((l) => l.n)).sort((a, b) => a - b), LAWS.map((_, i) => i + 1));
});
test('보드 SVG — 모든 그림이 그려지고 undefined/NaN 이 없다, 토큰·공·화살표가 있다', () => {
  for (const [k, b] of Object.entries(BOARDS)) {
    const s = tacticsBoardSvg(b, k);
    assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), k);
    assert.ok(!/undefined|NaN/.test(s), k);
    assert.ok((s.match(/<circle/g) ?? []).length >= 2, `${k}: 토큰`);
  }
  assert.ok(tacticsBoardSvg(BOARDS.poker).includes('stroke-dasharray'), '뛰는 길은 점선');
});
test('사람 이름이 없다', () => {
  const all = JSON.stringify(LAWS);
  for (const n of ['현서', '동훈', '준영', '효종', '찬우', '민준', '태영']) assert.ok(!all.includes(n), n);
});
