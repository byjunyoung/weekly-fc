// src/react/game/views/dribble3d/surface.ts — 3D 드리블 훈련장 그림판(2026-11-07 게임 묶음 6단계). three.js 묶음(match3d/surface3d.ts) 안에 같이 실린다.
// 스펙 §3.4 "3D: 뒤에서 따라가는 화면." — 처음 시점은 내 선수 뒤를 따라가는 카메라(kit3d followCam — 코스가 돌아 나와도 가는 쪽을 본다),
// ✕ 아래 버튼으로 1인칭·중계로 바꿀 수 있다(3D 경기와 같은 버튼·같은 1인칭 조작).
// 그리는 것: 레인 테두리, 콘(다음 문은 금색, 지난 문은 흐리게, 넘어진 콘은 회색으로 눕힘), 결승선, 내 선수와 공, 다른 사람은 흐린 몸(같은 코스 위에 겹쳐 —
// 2D 의 유령과 같은 뜻), 위 띠(내 시계·코스·문·콘), 왼쪽 위 순위 줄(여럿), 가운데 3·2·1·출발!·도착!, 콘을 치면 "+1초". 글은 2D 와 같다.
import { BufferGeometry, ConeGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Vector3 } from 'three';
import { COUNT_TICKS, courseCones } from '../../../../lib/games/dribble2d';
import type { Dr3Config, Dr3State } from '../../../../lib/games/dribble3d';
import { DR3_SCALE, LANE_X, LANE_Y, course3, dr3Places, dr3Ranking, lane3Time } from '../../../../lib/games/dribble3d';
import { medalOf } from '../../../../lib/games/dribble2d';
import type { Input } from '../../../../lib/game3d/sim';
import { TICK_HZ } from '../../../../lib/game3d/sim';
import type { Surface, SurfaceIn } from '../types';
import { MEDAL, secText } from '../dribble2d/render';
import { readBest } from '../best';
import { attachInput } from '../match3d/input3d';
import { createScene, type SceneHandle, type ScenePose } from '../match3d/scene';
import { stickToWorld, tankStep, nextView, VIEW_LABEL, type ViewMode } from '../match3d/view3d';
import { createTags, createTouch, el } from '../kit3d/dom3d';
import { followCam } from '../kit3d/cams';
import { dribble3BestKey } from './Solo';

const K = DR3_SCALE;
const MAX_DPR = 2;
const GHOST_RING = '#6b7280';

export function createDribbleSurface(o: SurfaceIn<Dr3Config>): Surface<Dr3State, Dr3Config, Input> | string {
  const { root, canvas, layer, config, roster, playing } = o;
  const n = config.players.length;
  const myId = o.myId !== null && o.myId >= 0 && o.myId < n ? o.myId : null;
  const c = course3(config.course), cones = courseCones(c), gateOfCone = cones.map((_, j) => (j < c.gates.length * 2 ? Math.floor(j / 2) : -1));
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let sc: SceneHandle;
  try {
    sc = createScene(canvas, { players: config.players.map((p) => ({ id: p.id, num: p.num })) }, roster, myId ?? -1, dpr,
      { balls: 1, rings: config.players.map(() => GHOST_RING) });
  } catch {
    return '이 기기·브라우저에서는 3D 화면을 열 수 없습니다.';
  }
  // ── 코스 — 레인 테두리·결승선·콘 ──
  const rect = new BufferGeometry();
  const X = LANE_X, Y = LANE_Y, Z = 0.02;
  rect.setAttribute('position', new Float32BufferAttribute([-X, Z, -Y, X, Z, -Y, X, Z, -Y, X, Z, Y, X, Z, Y, -X, Z, Y, -X, Z, Y, -X, Z, -Y], 3));
  const rectLine = new LineSegments(rect, new LineBasicMaterial({ color: '#e8ece8', transparent: true, opacity: 0.55 }));
  sc.root.add(rectLine);
  const finish = new Mesh(new PlaneGeometry(0.12, Y * 2).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffffff' }));
  finish.position.set(c.finish.x * K, 0.025, 0);
  sc.root.add(finish);
  const coneGeo = new ConeGeometry(0.15, 0.45, 10).translate(0, 0.225, 0);
  const MAT = {
    base: new MeshLambertMaterial({ color: '#e8752a' }), next: new MeshLambertMaterial({ color: '#ffce21' }),
    past: new MeshLambertMaterial({ color: '#e8752a', transparent: true, opacity: 0.3 }), down: new MeshLambertMaterial({ color: '#6b7280' }),
  };
  const coneMeshes = cones.map((p) => { const m = new Mesh(coneGeo, MAT.base); m.position.set(p.x * K, 0, p.y * K); sc.root.add(m); return m; });

  const nodes: HTMLElement[] = [];
  const add = <T extends HTMLElement>(e: T): T => { nodes.push(e); return e; };
  const top = add(el('div', 'p3-top', layer));
  top.setAttribute('aria-live', 'polite');
  const line1 = el('div', 'p3-board', top);
  const line2 = el('div', 'p3-head', top);
  const ranks = add(el('ol', 'd3-ranks', layer));
  const banner = add(el('div', 'p3-banner', layer));
  banner.setAttribute('role', 'status');
  const bannerB = el('b', '', banner), bannerS = el('span', '', banner);
  const pop = add(el('div', 'd3-pop', layer));
  pop.textContent = '+1초';
  const lost = add(el('div', 'game-banner', layer));
  lost.style.display = 'none';
  const tags = createTags(layer, config.players.map((p) => p.name), config.players.map(() => null), myId, () => new Vector3());
  const best = n === 1 ? readBest(dribble3BestKey(c.id)) : null;

  // 시점 — 처음은 뒤에서 따라가기(스펙), ✕ 아래 버튼으로 1인칭·중계. 구경은 앞선 사람을 뒤에서.
  let mode: ViewMode = 'chase';
  const viewBtn = myId === null ? null : add(el('button', 'g3-view', layer));
  const paintView = (): void => { if (viewBtn) { viewBtn.setAttribute('aria-label', `시점 바꾸기, 지금 ${VIEW_LABEL[mode]}`); viewBtn.innerHTML = `시점 <b>${VIEW_LABEL[mode]}</b>`; } };
  if (viewBtn) { viewBtn.type = 'button'; paintView(); viewBtn.addEventListener('click', () => { mode = nextView(mode); paintView(); viewBtn.blur(); }); }
  const touch = playing && myId !== null ? createTouch(layer, ['shoot', 'sprint']) : null;
  const input = touch ? attachInput({
    root, base: touch.base, knob: touch.knob, shootBtn: touch.btn.shoot, passBtn: touch.btn.pass, throughBtn: touch.btn.through,
    lobBtn: touch.btn.lob, sprintBtn: touch.btn.sprint, onTouch: touch.onTouch,
  }) : null;

  let w = 0, h = 0, portrait = false, snap = true, dead = false, avgMs = 16, slowFor = 0;
  let heading = 0, turnVel = 0, lastMode: ViewMode | null = null, camFx = 1, camFy = 0;
  let lastLane = -1, lastPen = -1, popAt = -Infinity, lastKey = '', lastRanks = '', coneKey = '';
  const onLost = (e: Event): void => { e.preventDefault(); dead = true; lost.textContent = '3D 화면이 끊겼습니다 — ✕ 로 나가 다시 열어 주세요.'; lost.style.display = ''; };
  canvas.addEventListener('webglcontextlost', onLost);

  return {
    resize(nw, nh) { w = nw; h = nh; portrait = h > w; sc.resize(w, h); },

    render(f) {
      if (dead || !w || !h) return;
      const st = f.state;
      const lane = myId !== null && st.lanes[myId] ? myId : dr3Ranking(st)[0] ?? 0;
      const me = st.lanes[lane];
      if (!me) return;
      if (lane !== lastLane) { lastLane = lane; lastPen = me.pen; camFx = me.p.fx; camFy = me.p.fy; }
      if (me.pen > lastPen) popAt = st.tick;
      lastPen = me.pen;
      // 시선 — 1인칭이 아니면 내 선수가 보는 쪽, 1인칭으로 바꾸면 그 쪽에서 시작
      if (mode !== lastMode) { lastMode = mode; heading = Math.atan2(me.p.fy, me.p.fx); turnVel = 0; }
      if (mode !== 'first') heading = Math.atan2(me.p.fy, me.p.fx);
      // 따라가는 카메라의 방향은 부드럽게(공을 몰며 좌우로 흔들려도 화면이 덜 흔들리게)
      const k = 1 - Math.exp(0 - 3.5 * Math.min(0.1, f.dt));
      camFx += (me.p.fx - camFx) * k; camFy += (me.p.fy - camFy) * k;
      const cl = Math.sqrt(camFx * camFx + camFy * camFy) || 1;
      // 몸 — 내 레인은 그대로, 다른 사람은 흐리게(같은 코스 위에 겹쳐), 공은 내 것만
      const poses: ScenePose[] = st.lanes.map((_, i) => (i === lane ? {} : { ghost: true }));
      const frame = { players: st.lanes.map((l) => l.p), ball: me.b, balls: [me.b], phase: st.phase };
      sc.update(frame, frame, 1, f.dt, {
        mode, portrait, heading, snap, poses, noMarker: mode === 'chase',
        cam: mode === 'chase' ? followCam(me.p.x, me.p.y, camFx / cl, camFy / cl, w / h) : undefined,
      });
      snap = false;
      // 콘 — 다음 문 금색, 지난 문 흐리게, 넘어진 콘 회색(눕힘). 바뀔 때만.
      const ck = `${lane}|${me.gate}|${me.hit}`;
      if (ck !== coneKey) {
        coneKey = ck;
        coneMeshes.forEach((m, j) => {
          const down = (me.hit & (1 << j)) !== 0, g = gateOfCone[j];
          m.material = down ? MAT.down : g === me.gate ? MAT.next : g >= 0 && g < me.gate ? MAT.past : MAT.base;
          m.rotation.z = down ? 1.35 : 0;
        });
      }
      sc.render();
      const dtMs = f.dt * 1000;
      if (dtMs > 0) {
        avgMs += (dtMs - avgMs) * 0.05;
        if (avgMs > 24 && dpr > 1) { slowFor += dtMs; if (slowFor > 2000) { dpr = Math.max(1, dpr - 0.5); sc.setPixelRatio(dpr); sc.resize(w, h); slowFor = 0; } } else slowFor = 0;
      }
      // 위 띠 — 코스 · 문 · 내 시계(달린 시간 + 콘 벌점)
      const run = st.phase === 'count' ? 0 : me.fin >= 0 ? me.fin : st.phaseTicks;
      const t = me.fin >= 0 ? (lane3Time(me) ?? 0) : (Math.max(0, run) + me.pen * 60) / 60;
      line1.textContent = st.phase === 'count' ? c.name : secText(t);
      line1.classList.toggle('is-done', me.fin >= 0);
      line2.textContent = st.phase === 'count' ? `문 ${c.gates.length}개${best !== null ? ` · 최고 ${secText(best)}` : ''}`
        : `${c.name} · 문 ${Math.min(me.gate, c.gates.length)}/${c.gates.length}${me.pen ? ` · 콘 ${me.pen}` : ''}`;
      // 순위 줄(여럿)
      if (n > 1) {
        const order = dr3Ranking(st), pl = dr3Places(st), rows = order.slice(0, w < 520 ? 3 : 8);
        if (!rows.includes(lane)) rows.push(lane);
        const html = rows.map((i) => {
          const l = st.lanes[i], tm = lane3Time(l);
          return `<li class="${i === lane ? 'is-me' : ''}"><span>${pl[i]} ${Array.from(config.players[i].name).slice(0, 4).join('')}</span><span>${tm !== null ? secText(tm) : l.gone ? '나감' : `문 ${l.gate}/${c.gates.length}`}</span></li>`;
        }).join('');
        if (html !== lastRanks) { ranks.innerHTML = html; lastRanks = html; }
      }
      ranks.style.display = n > 1 ? '' : 'none';
      // 가운데 띠 — 3·2·1·출발, 도착
      let b = '', s = '', tone = '';
      if (st.phase === 'count') { const sec = Math.ceil((COUNT_TICKS - st.phaseTicks) / 60); b = sec > 0 ? String(sec) : '출발!'; s = n > 1 ? `${n}명 동시 출발` : c.name; tone = 'is-save'; }
      else if (st.phase === 'run' && st.phaseTicks < 40) { b = '출발!'; tone = 'is-goal'; }
      else if (me.fin >= 0) { const tm = lane3Time(me), m = medalOf(c, tm); b = '도착!'; s = `${secText(tm ?? 0)}${m !== null ? ` · ${MEDAL[m].name}` : ''}`; tone = 'is-goal'; }
      const key = `${b}|${s}`;
      if (key !== lastKey) { lastKey = key; banner.className = `p3-banner ${tone}${b ? ' is-on' : ''}`; bannerB.textContent = b; bannerS.textContent = s; }
      pop.classList.toggle('is-on', st.tick - popAt < 45);
      touch?.setShown(st.phase !== 'end' && me.fin < 0);
      tags.update(sc, w, h, (i) => i !== lane || mode === 'broadcast', f.bubbles, true, () => true);   // 내 이름표는 중계에서만(뒤·1인칭이면 머리 위로 떠 엉뚱한 데 걸린다), 말풍선은 다
    },

    readInput: input ? (): Input => {
      const kk = input.read();
      if (mode === 'first') {
        const t = tankStep(kk.x, kk.y, heading, turnVel, 1 / TICK_HZ);
        heading = t.heading; turnVel = t.turnVel;
        return { x: t.move.x, y: t.move.y, shoot: kk.shoot, pass: kk.pass, through: kk.through, lob: kk.lob, sprint: kk.sprint, fx: t.face.x, fy: t.face.y };
      }
      const fw = sc.groundForward();
      const d = stickToWorld(kk.x, kk.y, fw.x, fw.y);
      return { x: d.x, y: d.y, shoot: kk.shoot, pass: kk.pass, through: kk.through, lob: kk.lob, sprint: kk.sprint };
    } : null,

    camera: () => null,
    debug: () => ({
      getInfo: () => { const i = sc.info(); return { fps: Math.round(1000 / Math.max(1, avgMs)), drawCalls: i.drawCalls, triangles: i.triangles, view: mode }; },
      setView: (m: ViewMode) => { if (myId !== null && VIEW_LABEL[m]) { mode = m; paintView(); } },
    }),

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      input?.dispose(); touch?.dispose(); tags.dispose();
      for (const nd of nodes) nd.remove();
      for (const m of Object.values(MAT)) m.dispose();
      sc.dispose();
    },
  };
}
