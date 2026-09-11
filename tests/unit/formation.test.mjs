import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMATIONS, FORMATION_NAMES, bestEleven } from '../../src/lib/formation.ts';

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
