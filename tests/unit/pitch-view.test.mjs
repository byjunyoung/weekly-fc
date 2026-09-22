import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchHtml, pitchLines, PITCH_DIM } from '../../src/components/pitch-view.ts';
import { initial, place, moveSlot } from '../../src/lib/lineup.ts';

const P = (num, name, pos, s = 70) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '', pace: s, dribble: s, pass: s, shoot: s, defend: s, stamina: s, rot: null, avatar: '' });
const count = (html, needle) => html.split(needle).length - 1;

test('슬롯마다 버튼 하나, 빈 자리는 라벨을 보여준다', () => {
  const html = pitchHtml(initial(6), [], null);
  assert.equal(count(html, 'data-slot="'), 6);
  assert.equal(count(html, 'bd-empty'), 6);
  assert.ok(html.includes('>GK</button>'));
});

test('선수가 선 자리는 이름을 넣고 이스케이프한다 — title 속성까지', () => {
  const s = place(initial(5), 0, 1);
  const html = pitchHtml(s, [P(1, '<김>', 'GK', 80)], null);
  assert.ok(html.includes('&lt;김&gt;'));
  assert.ok(!html.includes('<김>'), '이름이 날것으로 새면 title 속성이 깨져 마크업이 무너진다');
  assert.equal(count(html, 'bd-card'), 1);
  assert.ok(!/pcard-(gold|silver|bronze)/.test(html), '등급 금속 면은 뺐다 — 자리엔 아바타와 이름만 둔다');
});

test('고른 자리에 is-selected, 포지션이 다른 자리에 선 선수는 is-oop', () => {
  const s = place(place(initial(5), 0, 1), 1, 2);
  const html = pitchHtml(s, [P(1, 'a', 'GK'), P(2, 'b', 'FW')], 1);
  assert.equal(count(html, 'is-selected'), 1);
  const btn = html.match(/<button[^>]*data-slot="1"[^>]*>/)[0];
  assert.ok(btn.includes('is-selected'), '고른 자리는 1번');
  assert.equal(count(html, 'is-oop'), 1);
});

test('옮긴 자리는 옮긴 좌표를 % 로 쓴다', () => {
  const html = pitchHtml(moveSlot(initial(5), 0, [0.1, 0.25]), [], null);
  assert.ok(html.includes('left:10.0%;top:25.0%'));
});

test('경기장별 viewBox 와 비율', () => {
  assert.ok(pitchLines('futsal').includes('viewBox="0 0 20 40"'));
  assert.ok(pitchLines('soccer').includes('viewBox="0 0 68 105"'));
  assert.deepEqual(PITCH_DIM.futsal, { w: 20, h: 40 });
  const s = { ...initial(8), pitch: 'soccer' };
  assert.ok(pitchHtml(s, [], null).includes('aspect-ratio:68 / 105'));
});


// ── 2026-09-22 도트 피치 + 아바타 카드 ──────────────────────

test('피치 그림은 stroke 가 아니라 채운 사각형이다 (도트 톤)', () => {
  for (const kind of ['soccer', 'futsal']) {
    const svg = pitchLines(kind);
    assert.ok(!svg.includes('stroke'), `${kind}: stroke 가 남아 있다`);
    assert.ok(!svg.includes('<line') && !svg.includes('<circle') && !svg.includes('<path'),
      `${kind}: 선·원·경로 요소가 남아 있다 — 전부 rect 여야 한다`);
    assert.ok(svg.includes('shape-rendering="crispEdges"'), `${kind}: crispEdges 가 없다`);
    assert.ok(svg.includes('<rect'), `${kind}: rect 가 없다`);
  }
});

test('피치에 잔디 줄무늬와 잔디 알갱이 패턴이 깔린다 (줄 수는 하프라인이 경계에 떨어지게)', () => {
  // 줄 수를 세는 단언이 없으면 홀수로 바꿔도 테스트가 통과한다(2026-09-22 리뷰의 뮤테이션).
  for (const [kind, bands, half] of [['soccer', 10, 52.5], ['futsal', 8, 20]]) {
    const svg = pitchLines(kind);
    assert.ok(svg.includes('id="wfc-turf"'), `${kind}: 잔디 패턴이 없다`);
    assert.ok(svg.includes('fill="url(#wfc-turf)"'), `${kind}: 잔디 패턴을 안 쓴다`);
    const stripes = [...svg.matchAll(/<rect x="0" y="([\d.]+)" width="\d+" height="([\d.]+)" fill="#(?:173a23|0f2617)"/g)];
    assert.equal(stripes.length, bands, `${kind}: 줄 수가 ${bands} 가 아니다`);
    const bh = Number(stripes[0][2]);
    assert.ok(Number.isInteger(half / bh), `${kind}: 하프라인 ${half} 이 줄 높이 ${bh} 의 배수가 아니다`);
  }
});

test('센터서클 블록 원은 한 겹·한 덩어리다 (각도 훑기로 되돌리면 조각난다)', () => {
  // 대칭만 보면 각도 훑기 방식(칸이 빠져 들쭉날쭉)도 통과한다 — 연결성과 빈 행까지 본다.
  const svg = pitchLines('soccer');
  const step = 1.5, cx = 34, cy = 52.5, r = 9.15;
  const cells = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="1.5" height="1.5"/g)]
    .map((m) => [Number(m[1]) + step / 2, Number(m[2]) + step / 2])
    .filter(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= step); // 스폿(1.5칸)은 걸러낸다
  assert.ok(cells.length >= 32, `블록이 너무 적다: ${cells.length}`);
  // 행마다 칸이 있어야 한다(빈 행 = 고리가 끊긴 것).
  const rows = new Set(cells.map(([, y]) => y.toFixed(2)));
  const ys = [...rows].map(Number).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] - ys[i - 1] <= step + 1e-6, `빈 행이 있다: ${ys[i - 1]} → ${ys[i]}`);
  }
  // 8-연결 성분이 하나여야 한다.
  const key = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const all = new Map(cells.map((c) => [key(c), c]));
  const seen = new Set([key(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const dx of [-step, 0, step]) for (const dy of [-step, 0, step]) {
      const k = key([x + dx, y + dy]);
      if (all.has(k) && !seen.has(k)) { seen.add(k); stack.push(all.get(k)); }
    }
  }
  assert.equal(seen.size, cells.length, `고리가 ${cells.length - seen.size}칸만큼 끊겨 있다`);
});

test('피치 마킹 좌표가 규격과 맞는다 (손으로 세다 어긋나는 자리)', () => {
  const svg = pitchLines('soccer');
  // 페널티 스폿은 골라인(y=2·103)에서 11m — 중심 13·92, 1.5 칸이라 좌상단은 12.25·91.25.
  assert.ok(svg.includes('<rect x="33.25" y="12.25" width="1.5" height="1.5"'), '위쪽 페널티 스폿이 11m 가 아니다');
  assert.ok(svg.includes('<rect x="33.25" y="91.25" width="1.5" height="1.5"'), '아래쪽 페널티 스폿이 11m 가 아니다');
  // 하프라인 — 없어져도 다른 단언이 안 잡는다.
  assert.ok(svg.includes('<rect x="2" y="52.05" width="64" height="0.9"'), '하프라인이 없다');
  // 골대 폭(축구 8m·풋살 3m) — 넓혀도 안 잡히던 자리.
  assert.ok(svg.includes('<rect x="30" y="0" width="8" height="2"'), '축구 골대 폭이 8m 가 아니다');
  const f = pitchLines('futsal');
  assert.ok(f.includes('<rect x="8.5" y="0" width="3" height="1"'), '풋살 골대 폭이 3m 가 아니다');
});

test('테두리 모서리가 두 번 칠해지지 않는다 (반투명이 겹치면 그 자리만 밝아진다)', () => {
  const svg = pitchLines('soccer');
  // 바깥 테두리: 가로 변은 x=2 에서 폭 64, 세로 변은 y 가 T 만큼 안으로 들어가야 한다.
  assert.ok(svg.includes('<rect x="2" y="2" width="64" height="0.9"'), '위 변이 없다');
  assert.ok(svg.includes('<rect x="2" y="2.9" width="0.9" height="99.2"'), '왼 변이 모서리를 비켜 있지 않다');
  // 페널티 박스·골 에어리어의 골라인 쪽 변은 아예 안 그린다(3겹 방지).
  assert.ok(!svg.includes('<rect x="13.2" y="2" width="41.6" height="0.9"'), '페널티 박스가 골라인 위에 한 겹 더 그려진다');
  assert.ok(!svg.includes('<rect x="24.8" y="2" width="18.4" height="0.9"'), '골 에어리어가 골라인 위에 한 겹 더 그려진다');
});

test('센터서클 블록 원은 상하·좌우 대칭이다', () => {
  // 축구 피치 중앙(34, 52.5) 기준으로 블록 좌표를 모아 미러가 같은 집합인지 본다.
  // 스폿도 1.5 칸이라 같이 걸리는데, 셋 다 중앙축 위라 대칭 단언을 깨지 않는다.
  const svg = pitchLines('soccer');
  const cells = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="1.5" height="1.5"/g)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(cells.length > 12, `블록이 너무 적다: ${cells.length}`);
  const key = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const set = new Set(cells.map(key));
  // 블록의 좌상단 x 를 중심 34 에 대해 뒤집으면(칸 폭 1.5 를 보정) 다시 집합 안에 있어야 한다.
  for (const [x, y] of cells) {
    assert.ok(set.has(key([2 * 34 - x - 1.5, y])), `좌우 비대칭: ${x},${y}`);
    assert.ok(set.has(key([x, 2 * 52.5 - y - 1.5])), `상하 비대칭: ${x},${y}`);
  }
});

test('자리엔 아바타와 이름만 — 나머지 정보는 title·aria-label 로 남긴다', () => {
  // 2026-09-22: 72px 칸에 OVR·자리 라벨·포지션까지 우겨넣느라 아바타가 32px 로 쪼그라들어
  // 있었다. 화면에서 뺀 정보를 아예 버리면 스크린리더와 마우스 사용자가 잃는다.
  const s = place(initial(5), 0, 1);
  const html = pitchHtml(s, [P(1, '김현서', 'FW', 80)], null);
  const btn = html.match(/<button[^>]*data-slot="0"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.ok(btn.includes('class="bd-sprite"'), '아바타 자리가 없다');
  assert.ok(btn.includes('class="bd-name">김현서<'), '이름이 없다');
  assert.ok(!btn.includes('bd-ovr'), 'OVR 은 이제 안 그린다');
  assert.ok(!btn.includes('bd-slotlabel'), '자리 라벨은 이제 안 그린다');
  assert.ok(!btn.includes('bd-pos'), '선수 포지션은 이제 안 그린다');
  assert.ok(btn.includes('title="GK · 김현서 (FW)"'), `자리·이름·포지션이 title 에 없다: ${btn.slice(0, 160)}`);
  assert.ok(btn.includes('aria-label="GK · 김현서 (FW)"'), 'aria-label 이 없다');
});

test('빈 자리에는 아바타를 넣지 않는다', () => {
  const html = pitchHtml(initial(5), [], null);
  assert.ok(!html.includes('bd-sprite'), '빈 자리에 아바타가 들어갔다');
  assert.equal(count(html, 'bd-empty'), 5);
});

test('아바타가 들어가도 카드 문자열은 결정적이다 (dangerouslySetInnerHTML 계약)', () => {
  const s = place(initial(5), 0, 1);
  const ps = [P(1, '김현서', 'GK', 80)];
  assert.equal(pitchHtml(s, ps, null), pitchHtml(s, ps, null));
});
