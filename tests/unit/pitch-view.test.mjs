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

test('선수가 선 자리는 이름·자리 라벨을 넣고 이름은 이스케이프한다', () => {
  const s = place(initial(5), 0, 1);
  const html = pitchHtml(s, [P(1, '<김>', 'GK', 80)], null);
  assert.ok(html.includes('&lt;김&gt;'));
  assert.ok(!html.includes('<김>'));
  assert.equal(count(html, 'bd-card'), 1);
  assert.ok(html.includes('pcard-silver'));
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

test('피치에 잔디 줄무늬와 잔디 알갱이 패턴이 깔린다', () => {
  for (const kind of ['soccer', 'futsal']) {
    const svg = pitchLines(kind);
    assert.ok(svg.includes('id="wfc-turf"'), `${kind}: 잔디 패턴이 없다`);
    assert.ok(svg.includes('fill="url(#wfc-turf)"'), `${kind}: 잔디 패턴을 안 쓴다`);
    // 줄무늬 두 색이 번갈아 — 둘 다 나와야 한다.
    assert.ok(svg.includes('#173a23') && svg.includes('#0f2617'), `${kind}: 줄무늬 두 색이 안 보인다`);
  }
});

test('센터서클 블록 원은 상하·좌우 대칭이다 (격자로 그려 들쭉날쭉하지 않다)', () => {
  // 축구 피치 중앙(34, 52.5) 기준으로 블록 좌표를 모아 미러가 같은 집합인지 본다.
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

test('선수 카드에 아바타·OVR·자리 라벨·이름·포지션이 다 들어간다', () => {
  const s = place(initial(5), 0, 1);
  const html = pitchHtml(s, [P(1, '김현서', 'GK', 80)], null);
  const btn = html.match(/<button[^>]*data-slot="0"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.ok(btn.includes('class="bd-sprite"'), '아바타 자리가 없다');
  assert.ok(/<svg[^>]*height="32"/.test(btn), '아바타가 32px(도트 정렬)로 안 들어갔다');
  assert.ok(btn.includes('class="bd-ovr">80<'), 'OVR 이 없다');
  assert.ok(btn.includes('class="bd-slotlabel">GK<'), '자리 라벨이 없다');
  assert.ok(btn.includes('class="bd-name">김현서<'), '이름이 없다');
  assert.ok(btn.includes('class="bd-pos">GK<'), '선수 포지션이 없다');
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
