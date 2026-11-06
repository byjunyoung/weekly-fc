// src/react/game/views/freekick3d/surface.ts — 3D 프리킥 그림판(2026-11-07 게임 묶음 6단계). three.js 묶음(match3d/surface3d.ts) 안에 같이 실린다.
// 장면은 3D 경기의 것(scene.ts)을 그대로 쓰고, 3D 승부차기 그림판과 같은 조각(kit3d — 이름표·터치 버튼·카메라, 위 띠 .p3-* 모양)을 쓴다.
// 프리킥만의 것: 공 뒤 카메라(자리가 옆으로 비껴 있어도 공 뒤에서 골대 쪽 — kit3d behindBallCam, 구경도 같은 화면), 수비벽 셋과 키퍼(봇 — 명단에서
// 방에 없는 선수의 얼굴), 내 조준 표시(골문 면 위 고리 + 흔들림 폭)와 감는 길 미리 보기(흔들림 없이 — fk3Path, 키커 화면에만).
// 2D 와 같은 글: 위 "n번 자리 · 이름 · 점수", 혼자면 "n점 / 11 · 최고" + 자리 표시(●✕○), 여럿이면 "누구 차례 · k/전체" + 순위 줄,
// 5초 막대, 판정 띠 "골!·막았다!·벽!·빗나감·골대!"(+점수), 준비 띠 "내 차례 / 누구 차례", 끝 띠, 아래 내 차례 안내.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, Vector3 } from 'three';
import { PITCH3D } from '../../../../lib/game3d/sim';
import type { FkConfig } from '../../../../lib/games/freekick2d';
import { FK_MAX_POINTS, fkPlaces, fkRanking, fkTotal } from '../../../../lib/games/freekick2d';
import { tiedAt, topName, topWord } from '../../../../lib/games/places';
import { AIM_TICKS, CHARGE_TICKS } from '../../../../lib/games/penalty2d';
import type { Fk3State } from '../../../../lib/games/freekick3d';
import { FK3_AIM_SCALE, FK3_SPOTS, fk3Path, fk3Wall } from '../../../../lib/games/freekick3d';
import type { Pen3Input } from '../../../../lib/games/penalty3d';
import { DIVE_H, deviation3 } from '../../../../lib/games/penalty3d';
import type { Surface, SurfaceIn } from '../types';
import { FK_OUT_TEXT } from '../freekick2d/render';
import { readBest } from '../best';
import { attachInput } from '../match3d/input3d';
import { createScene, type SceneBody, type SceneHandle, type ScenePose } from '../match3d/scene';
import { createTags, createTouch, el } from '../kit3d/dom3d';
import { behindBallCam } from '../kit3d/cams';
import { FK3_LOCAL, fk3Input, type FkLocal3 } from './aim3';
import { FK3_BEST_KEY } from './Solo';

const { HW } = PITCH3D;
const MAX_DPR = 2;
/** 키커를 그릴 때 옆으로 비키는 거리(m). */
const KICKER_SIDE = 0.8;
const OFF: SceneBody = { x: -40, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, kickTicks: 0, shootHeld: false, charge: 0 };

export function createFreekickSurface(o: SurfaceIn<FkConfig>): Surface<Fk3State, FkConfig, Pen3Input> | string {
  const { root, canvas, layer, config, roster, playing } = o;
  const n = config.players.length;
  const myId = o.myId !== null && o.myId >= 0 && o.myId < n ? o.myId : null;
  // 벽 셋 + 키퍼 — 명단에서 방(이 판)에 없는 선수의 얼굴로(없으면 앞 사람 얼굴을 빌린다)
  const used = new Set(config.players.map((p) => p.num));
  const spare = roster.filter((p) => !used.has(p.num)).map((p) => p.num);
  const extra = [0, 1, 2, 3].map((k) => spare[k] ?? config.players[k % n].num);
  const KEEPER = n + 3;   // 장면 몸 차례: 키커들(0..n−1) · 벽 셋 · 키퍼
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let sc: SceneHandle;
  try {
    sc = createScene(canvas, { players: [...config.players.map((p) => ({ id: p.id, num: p.num, side: 0 as const })), ...extra.map((num, k) => ({ id: n + k, num, side: 1 as const }))] },
      roster, myId ?? -1, dpr);
  } catch {
    return '이 기기·브라우저에서는 3D 화면을 열 수 없습니다.';
  }
  const nodes: HTMLElement[] = [];
  const add = <T extends HTMLElement>(e: T): T => { nodes.push(e); return e; };

  // 조준 표시·흔들림 폭·미리 보기 길(키커 화면에만)
  const reticle = new Mesh(new RingGeometry(0.16, 0.24, 24), new MeshBasicMaterial({ color: '#ffce21', side: DoubleSide, depthTest: false, transparent: true }));
  const spread = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#ffce21', side: DoubleSide, transparent: true, opacity: 0.22, depthTest: false }));
  for (const m of [reticle, spread]) { m.rotation.y = Math.PI / 2; m.renderOrder = 5; m.visible = false; sc.root.add(m); }
  const pathGeo = new BufferGeometry();
  const path = new Line(pathGeo, new LineBasicMaterial({ color: '#ffce21', transparent: true, opacity: 0.7, depthTest: false }));
  path.renderOrder = 5; path.visible = false; sc.root.add(path);
  let pathKey = '';

  // 위 띠·가운데 띠·안내(3D 승부차기와 같은 모양)
  const top = add(el('div', 'p3-top', layer));
  top.setAttribute('aria-live', 'polite');
  const head = el('div', 'p3-board', top);
  const line2 = el('div', 'p3-head', top);
  const line3 = el('div', 'p3-who', top);
  const clock = el('div', 'p3-clock', top);
  const clockFill = el('i', '', clock);
  const banner = add(el('div', 'p3-banner', layer));
  banner.setAttribute('role', 'status');
  const bannerB = el('b', '', banner), bannerS = el('span', '', banner);
  const hint = add(el('div', 'p3-hint', layer));
  const gauge = add(el('div', 'g3-gauge p3-gauge', layer));
  gauge.setAttribute('aria-hidden', 'true');
  const fill = el('i', '', gauge);
  const lost = add(el('div', 'game-banner', layer));
  lost.style.display = 'none';
  const names = [...config.players.map((p) => p.name), '수비벽', '수비벽', '수비벽', '키퍼'];
  const tags = createTags(layer, names, [...config.players.map(() => 0 as const), 1, 1, 1, 1], myId, () => new Vector3());
  const touch = playing && myId !== null ? createTouch(layer, ['shoot'], { shoot: '슛' }) : null;
  const input = touch ? attachInput({
    root, base: touch.base, knob: touch.knob, shootBtn: touch.btn.shoot, passBtn: touch.btn.pass, throughBtn: touch.btn.through,
    lobBtn: touch.btn.lob, sprintBtn: touch.btn.sprint, onTouch: touch.onTouch,
  }) : null;
  const best = n === 1 ? readBest(FK3_BEST_KEY) : null;

  let w = 0, h = 0, portrait = false, snap = true, dead = false, avgMs = 16, slowFor = 0, lastKey = '';
  let local: FkLocal3 = FK3_LOCAL, kicker = false, phase = 'ready';
  const onLost = (e: Event): void => { e.preventDefault(); dead = true; lost.textContent = '3D 화면이 끊겼습니다 — ✕ 로 나가 다시 열어 주세요.'; lost.style.display = ''; };
  canvas.addEventListener('webglcontextlost', onLost);
  const marks = (st: Fk3State, i: number): string => FK3_SPOTS.map((_, s) => {
    const e = st.log.find((x) => x.kicker === i && x.spot === s);
    const m = e ? (e.out === 'goal' ? '●' : e.out === 'gone' ? '－' : '✕') : '○';   // － = 자리 비움(2D 결과 상자와 같은 표)
    return `<i class="p3-mark${m === '●' ? ' is-goal' : m === '✕' ? ' is-no' : ''}">${m}</i>`;
  }).join('');

  return {
    resize(nw, nh) { w = nw; h = nh; portrait = h > w; sc.resize(w, h); },

    render(f) {
      if (dead || !w || !h) return;
      const st = f.state;
      const spot = FK3_SPOTS[st.spot];
      if (st.kickNo !== local.kickNo) local = { ...FK3_LOCAL, kickNo: st.kickNo, aim: { y: Math.round((-Math.sign(spot.y || -1) * 1.5) / FK3_AIM_SCALE / 0.2) * 0.2, z: 0.5 } };   // 새 차기 — 열린 쪽에서
      kicker = myId !== null && st.kicker === myId;
      phase = st.phase;

      // 몸 — 지금 키커, 벽 셋(같이 뛴다), 키퍼(던지면 눕는다). 다른 키커는 경기장에 없다.
      const gk = st.gk, lying = (gk.diveT > 0 || gk.lie > 0) && gk.dive !== 0;
      const wall = fk3Wall(st.spot);
      const toGoal = { x: HW - st.ball.x, y: 0 - st.ball.y }, gl = Math.sqrt(toGoal.x * toGoal.x + toGoal.y * toGoal.y) || 1;
      const players: SceneBody[] = [];
      const poses: ScenePose[] = [];
      for (let i = 0; i < n; i++) {
        // 키커는 공 뒤에서 조금 옆에 그린다(그림만 — 3D 승부차기와 같은 까닭: 공 뒤 카메라에서 몸이 벽·골문을 가리지 않게)
        if (i === st.kicker) { players.push({ x: st.st.x + (toGoal.y / gl) * KICKER_SIDE, y: st.st.y - (toGoal.x / gl) * KICKER_SIDE, vx: 0, vy: 0, fx: toGoal.x / gl, fy: toGoal.y / gl, kickTicks: st.st.kickFlash, shootHeld: st.st.held, charge: st.st.charge }); poses.push({}); }
        else { players.push(OFF); poses.push({ hide: true }); }
      }
      for (const p of wall) { players.push({ x: p.x, y: p.y, vx: 0, vy: 0, fx: -toGoal.x / gl, fy: -toGoal.y / gl, kickTicks: 0, shootHeld: false, charge: 0 }); poses.push({ lift: st.wallZ }); }
      players.push({ x: gk.x, y: lying ? gk.y - gk.dive * 0.3 : gk.y, vx: 0, vy: lying ? 0 : gk.vy, fx: -1, fy: 0, kickTicks: 0, shootHeld: gk.diveT > 0, charge: gk.diveT > 0 ? 1 : 0 });
      poses.push(lying ? { roll: (0 - gk.dive) * 1.42, lift: Math.max(0, DIVE_H[gk.diveH] - 0.25) } : { lift: gk.z });
      const frame = { players, ball: st.ball, phase: st.phase };
      sc.update(frame, frame, 1, f.dt, { mode: 'broadcast', portrait, heading: 0, snap, cam: behindBallCam(spot.x, spot.y, w / h, 7.5, 4.2), poses, noMarker: kicker });
      snap = false;

      // 내 조준·흔들림·감는 길 — 키커 화면에만(조준 중)
      const showAim = kicker && (st.phase === 'ready' || st.phase === 'aim');
      reticle.visible = showAim; spread.visible = showAim; path.visible = showAim;
      if (showAim) {
        const ay = local.aim.y * FK3_AIM_SCALE;
        reticle.position.set(HW - 0.05, local.aim.z, ay);
        const p = st.st.charge / CHARGE_TICKS, dev = deviation3(p, config.players[st.kicker].perf);
        spread.position.set(HW - 0.06, local.aim.z, ay);
        spread.scale.set(dev * 2 + 0.05, dev * 1.2 + 0.05, 1);
        const key = `${st.spot}|${local.aim.y}|${local.aim.z}|${local.curl}|${Math.round(p * 20)}`;
        if (key !== pathKey) {
          pathKey = key;
          const pts = fk3Path(st.spot, local.aim, Math.max(0.15, p), local.curl, 2);
          pathGeo.setAttribute('position', new Float32BufferAttribute(pts.flatMap((q) => [q.x, q.z, q.y]), 3));
          pathGeo.computeBoundingSphere();
        }
      }
      sc.render();
      const dtMs = f.dt * 1000;
      if (dtMs > 0) {
        avgMs += (dtMs - avgMs) * 0.05;
        if (avgMs > 24 && dpr > 1) { slowFor += dtMs; if (slowFor > 2000) { dpr = Math.max(1, dpr - 0.5); sc.setPixelRatio(dpr); sc.resize(w, h); slowFor = 0; } } else slowFor = 0;
      }

      // 위 띠 — 바뀔 때만
      const key = `${st.kickNo}|${st.phase}|${st.log.length}|${w < 520}`;
      if (key !== lastKey) {
        lastKey = key;
        head.textContent = st.phase === 'end' ? '끝' : `${st.spot + 1}번 자리 · ${spot.name} · ${spot.pts}점`;
        if (n === 1) {
          line2.textContent = `${st.points[0]}점 / ${FK_MAX_POINTS}${best !== null ? ` · 최고 ${best}점` : ''}`;
          line3.innerHTML = marks(st, 0);
        } else {
          line2.innerHTML = st.phase === 'end' ? '' : `<span class="${kicker ? 'is-me' : ''}">${config.players[st.kicker].name}${kicker ? '(나)' : ''} 차례 · ${st.kickNo + 1}/${fkTotal(n)}</span>`;
          const order = fkRanking(st.points, st.log), pl = fkPlaces(st.points, st.log), show = order.slice(0, w < 520 ? 3 : 4);
          if (myId !== null && !show.includes(myId)) show.push(myId);
          line3.textContent = show.map((i) => `${pl[i]} ${Array.from(config.players[i].name).slice(0, 4).join('')} ${st.points[i]}`).join('  ·  ');
        }
        let b = '', s = '', tone = '';
        if (st.phase === 'result' && st.outcome) {
          b = FK_OUT_TEXT[st.outcome]; s = st.outcome === 'goal' ? `${config.players[st.kicker].name} +${spot.pts}점` : st.outcome === 'gone' ? `${config.players[st.kicker].name} 차례를 넘깁니다` : '';
          tone = st.outcome === 'goal' ? 'is-goal' : st.outcome === 'save' ? 'is-save' : 'is-miss';
        } else if (st.phase === 'ready') {
          b = kicker ? '내 차례' : `${config.players[st.kicker].name} 차례`; s = `${spot.name} · ${spot.pts}점`; tone = kicker ? 'is-turn' : 'is-save';
        } else if (st.phase === 'end') {
          const topI = fkRanking(st.points, st.log)[0], pl = fkPlaces(st.points, st.log), nm = config.players[topI].name;   // 같이 1등이면 "공동 1등 k명"
          b = n === 1 ? `${st.points[0]}점` : topWord(pl, nm); s = n === 1 ? `${FK_MAX_POINTS}점 만점` : tiedAt(pl, 1) > 1 ? `${topName(pl, nm)} ${st.points[topI]}점` : `${st.points[topI]}점`; tone = 'is-end';
        }
        banner.className = `p3-banner ${tone}${b ? ' is-on' : ''}`;
        bannerB.textContent = b; bannerS.textContent = s;
      }
      if (st.phase === 'ready' && st.phaseTicks >= 60) banner.classList.remove('is-on');
      hint.textContent = st.phase !== 'end' && kicker
        ? (st.st.held ? '누르는 동안 ←→ = 감아차기 · 떼면 슛' : '방향키로 옆·높이 겨누기 · 슛을 누르고 있다가 떼면 슛 · 누르는 동안 ←→ = 감아차기') : '';
      touch?.setShown(kicker && st.phase !== 'end' && st.phase !== 'result');
      const left = st.phase === 'aim' ? Math.max(0, 1 - st.phaseTicks / AIM_TICKS) : 0;
      clock.classList.toggle('is-on', st.phase === 'aim');
      clockFill.style.transform = `scaleX(${left.toFixed(3)})`;
      clock.classList.toggle('is-low', left < 0.3);
      const pw = st.phase === 'aim' ? st.st.charge / CHARGE_TICKS : st.phase === 'flight' && st.phaseTicks < 30 ? st.power : 0;
      gauge.classList.toggle('is-on', pw > 0);
      gauge.classList.toggle('is-touch', !!touch?.touch);
      if (pw > 0) fill.style.transform = `scaleX(${pw.toFixed(3)})`;
      // 이름표 — 키커(카메라 바로 앞이면 뺀다)와 키퍼, 말풍선은 키커들 누구든(구경하는 키커의 한마디도 — 몸이 없으면 안 뜬다)
      tags.update(sc, w, h, (i) => i === KEEPER || (i === st.kicker && !kicker), f.bubbles, false, (i) => i === st.kicker);
    },

    readInput: input ? (): Pen3Input => {
      const k = input.read();
      const r = fk3Input(local, { x: k.x, y: k.y, kick: k.shoot }, kicker, phase);
      local = r.local;
      return r.input;
    } : null,

    camera: () => null,
    debug: () => ({
      getInfo: () => { const i = sc.info(); return { fps: Math.round(1000 / Math.max(1, avgMs)), drawCalls: i.drawCalls, triangles: i.triangles, kicker, aim: kicker ? { ...local.aim } : null, curl: kicker ? local.curl : null }; },
    }),

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      input?.dispose(); touch?.dispose(); tags.dispose();
      for (const nd of nodes) nd.remove();
      pathGeo.dispose();
      sc.dispose();
    },
  };
}
