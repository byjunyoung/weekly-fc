// 그림판을 스스로 여닫는 화면(3D)을 여는 순서(2026-11-07 4단계 리뷰). 받기(load)가 늦게 끝나도, 그 사이 닫혀도,
// 루프(run)는 한 번만 시작하고 그림판은 한 번만 만든다. 그리고 공용 틀의 효과는 명단·설정 객체가 경기 중에 바뀌어도 다시 돌지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountSurface } from '../../src/react/game/surface-mount.ts';

function fakeKit({ fail = null } = {}) {
  const log = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const kit = {
    load: () => { log.push('load'); return gate; },
    create: () => {
      log.push('create');
      if (fail) return fail;
      return {
        resize: (w, h) => log.push(`resize ${w}x${h}`), render: (f) => log.push(`render dt=${f.dt}`),
        readInput: () => ({ x: 1 }), camera: () => null, debug: () => ({}), dispose: () => log.push('dispose'),
      };
    },
  };
  return { kit, log, release: () => release() };
}
const args = (playing = true) => ({ root: { clientWidth: 1280, clientHeight: 800 }, canvas: {}, layer: {}, config: {}, roster: [], myId: 0, playing });
const hooks = (log) => ({
  onWait: (w) => log.push(`wait ${w}`), onFail: (why) => log.push(`fail ${why}`),
  watchSize: () => () => log.push('unwatch'),
  run: ({ scene, readHuman }) => { log.push(`run ${readHuman ? 'human' : 'spectator'}`); scene.draw({ state: {}, config: {}, myId: 0, bubbles: [] }); return () => log.push('stop'); },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

test('받기가 늦게 끝나도 만들기·크기·루프는 한 번, 닫으면 루프를 멈추고 그림판을 닫는다', async () => {
  const f = fakeKit();
  const close = mountSurface(f.kit, args(), hooks(f.log));
  await flush();
  assert.deepEqual(f.log, ['wait true', 'load'], '받는 동안엔 아무것도 안 만든다');
  f.release(); await flush();
  assert.deepEqual(f.log, ['wait true', 'load', 'wait false', 'create', 'resize 1280x800', 'run human', 'render dt=0']);
  close(); close();
  assert.deepEqual(f.log.slice(-3), ['stop', 'unwatch', 'dispose'], '두 번 닫아도 한 번');
});

test('받는 중에 닫히면(경기를 나감) 만들지도 시작하지도 않는다', async () => {
  const f = fakeKit();
  const close = mountSurface(f.kit, args(), hooks(f.log));
  close();
  f.release(); await flush();
  assert.deepEqual(f.log, ['wait true', 'load']);
});

test('못 열면(WebGL 없음) 이유를 알리고 루프는 시작하지 않는다, 구경은 조작 없이', async () => {
  const f = fakeKit({ fail: '이 기기에서는 못 엽니다' });
  mountSurface(f.kit, args(), hooks(f.log));
  f.release(); await flush();
  assert.deepEqual(f.log.slice(-2), ['create', 'fail 이 기기에서는 못 엽니다']);
  const g = fakeKit();
  mountSurface(g.kit, args(false), hooks(g.log));
  g.release(); await flush();
  assert.ok(g.log.includes('run spectator'));
});

test('공용 틀의 효과는 판 설정·명단·내 자리를 처음 것으로 고정한다 — 명단이 새로 와도 장면을 닫았다 다시 열지 않는다(혼자 하기가 틱 0 으로 돌아가지 않게)', () => {
  const src = readFileSync('src/react/game/MatchFrame.tsx', 'utf8');
  const deps = src.match(/\}, \[([^\]]*)\]\);\s*return \{ refs, touch, wait, fail \}/);
  assert.ok(deps, '효과 의존 줄을 못 찾았다');
  const list = deps[1].split(',').map((x) => x.trim());
  for (const bad of ['roster', 'config', 'myId']) assert.ok(!list.includes(bad), `효과가 ${bad} 에 기대면 경기 중에 다시 돈다`);
});
