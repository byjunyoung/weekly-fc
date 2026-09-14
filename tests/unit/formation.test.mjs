import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATIONS, FORMATION_NAMES, bestEleven, SHAPES, slotsFor, defaultPitch, clampCount, MIN_COUNT, MAX_COUNT } from '../../src/lib/formation.ts';

const P = (num, name, pos, pace) => ({ num, name, pos, detail: '', foot: '', vest: null, note: '',
  pace, dribble: pace, pass: pace, shoot: pace, defend: pace, stamina: pace, rot: null, avatar: '' });

test('모든 포메이션은 11 자리이고 좌표가 0~1 안에 있다', () => {
  for (const name of FORMATION_NAMES) {
    const slots = FORMATIONS[name];
    assert.equal(slots.length, 11, name);
    for (const s of slots) {
      assert.ok(s.x >= 0 && s.x <= 1, `${name} ${s.label} x`);
      assert.ok(s.y >= 0 && s.y <= 1, `${name} ${s.label} y`);
    }
  }
});

test('bestEleven: 자리마다 OVR 높은 사람부터, 같은 사람이 두 번 안 나온다', () => {
  const ps = [P(1, 'GK1', 'GK', 70), P(2, 'DF강', 'DF', 90), P(3, 'DF약', 'DF', 60),
    P(4, 'MF강', 'MF', 95), P(5, 'FW', 'FW', 80)];
  const { lineup } = bestEleven(ps, FORMATIONS['4-3-3']);
  const nums = lineup.map((a) => a.player?.num).filter((n) => n != null);
  assert.equal(new Set(nums).size, nums.length, '중복 배치');
  assert.equal(lineup[0].player?.name, 'GK1');
  assert.equal(lineup[1].player?.name, 'DF강', 'DF 자리는 OVR 높은 쪽부터');
});

test('bestEleven: 포지션이 동나면 남은 사람을 앉히고 자리 밖으로 표시한다', () => {
  const ps = [P(1, 'GK1', 'GK', 70), ...Array.from({ length: 12 }, (_, i) => P(i + 2, `MF${i}`, 'MF', 70))];
  const { lineup, bench } = bestEleven(ps, FORMATIONS['4-3-3']);
  assert.ok(lineup.every((a) => a.player), '빈 자리를 남기지 않는다');
  assert.ok(lineup.filter((a) => a.outOfPosition).length > 0, 'DF·FW 자리는 자리 밖 표시');
  assert.equal(lineup.length + bench.length, ps.length, '11 + 벤치 = 전원');
});

test('bestEleven: 인원이 11명보다 적으면 남는 자리는 빈다', () => {
  const { lineup, bench } = bestEleven([P(1, 'GK1', 'GK', 70)], FORMATIONS['4-4-2']);
  assert.equal(lineup.filter((a) => a.player).length, 1);
  assert.equal(bench.length, 0);
});

test('인원 5~11의 모든 모양: 자리 수 = 인원, 첫 자리 GK 하나, 좌표 0~1, 라벨 있음', () => {
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    assert.ok(SHAPES[n]?.length > 0, `${n}인 모양 없음`);
    for (const shape of SHAPES[n]) {
      const s = slotsFor(n, shape);
      const tag = `${n}인 ${shape}`;
      assert.equal(s.length, n, tag);
      assert.equal(s[0].group, 'GK', tag);
      assert.equal(s.filter((x) => x.group === 'GK').length, 1, tag);
      for (const x of s) {
        assert.ok(x.x >= 0 && x.x <= 1 && x.y >= 0 && x.y <= 1, `${tag} ${x.label} 좌표`);
        assert.ok(x.label, `${tag} 라벨`);
      }
    }
  }
});

test('모양의 줄 인원 합은 인원 - 1(GK 제외)', () => {
  for (let n = MIN_COUNT; n <= MAX_COUNT; n++) {
    for (const shape of SHAPES[n]) assert.equal(shape.split('-').map(Number).reduce((a, b) => a + b, 0), n - 1, `${n} ${shape}`);
  }
});

test('줄이 둘이면 DF·FW, 셋이면 DF·MF·FW', () => {
  assert.deepEqual([...new Set(slotsFor(5, '2-2').slice(1).map((s) => s.group))], ['DF', 'FW']);
  assert.deepEqual([...new Set(slotsFor(6, '2-2-1').slice(1).map((s) => s.group))], ['DF', 'MF', 'FW']);
});

test('같은 줄은 왼쪽부터 놓이고 수비가 공격보다 우리 골대 쪽', () => {
  const s = slotsFor(8, '3-3-1');
  const df = s.filter((x) => x.group === 'DF');
  assert.deepEqual(df.map((x) => x.label), ['LB', 'CB', 'RB']);
  assert.ok(df[0].x < df[1].x && df[1].x < df[2].x);
  assert.ok(df[0].y > s.find((x) => x.group === 'FW').y);
});

test('11인은 손으로 맞춘 배치를 그대로 쓴다', () => {
  assert.equal(slotsFor(11, '4-3-3'), FORMATIONS['4-3-3']);
});

test('그 인원에 없는 모양이면 첫 모양으로', () => {
  assert.deepEqual(slotsFor(6, '4-4-2'), slotsFor(6, '2-2-1'));
});

test('인원은 5~11로 자르고 숫자가 아니면 11', () => {
  assert.equal(clampCount(3), 5);
  assert.equal(clampCount(14), 11);
  assert.equal(clampCount(Number.NaN), 11);
});

test('경기장 기본값: 7명 이하 풋살, 8명 이상 축구', () => {
  assert.equal(defaultPitch(7), 'futsal');
  assert.equal(defaultPitch(8), 'soccer');
});
