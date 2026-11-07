// src/react/game/views/match3d/surface3d.ts — 3D 경기의 그림판(2026-11-07 게임 묶음 4단계). three.js 를 부르는 건 이 파일과 scene.ts 뿐이다 —
// 경기 화면이 열릴 때 views/match3d/index.tsx 의 load() 가 동적으로 받는다(목록·2D 게임·다른 페이지는 이 묶음을 안 받는다).
//
// 예전 시제품 화면(src/react/game3d/Match3D.tsx)에서 옮긴 것: three.js 장면·카메라 셋(중계/1인칭/뒤에서)·조작(키·조이스틱·버튼 다섯)·
// 점수판·시계·골 문구(도움 포함)·슛 게이지·이름표·화면 밖 공 화살표·느리면 해상도 낮추기. 모양·클래스·문구는 그대로다.
// 달라진 것: 고정 틱 루프·✕·♪·결과 상자는 공용 틀(MatchFrame·SoloMatch·OnlineMatch)이 맡고, 이 파일은 "받은 상태를 그리고 조작을 입력으로"만 한다
// (views/types.ts 의 Surface 약속). 그래서 같은 그림판이 혼자·방장·손님에서 그대로 돈다. 한마디 말풍선을 머리 위에 띄우는 것이 새로 생겼다.
import { Vector3 } from 'three';
import type { Input, MatchConfig, MatchState } from '../../../../lib/game3d/sim';
import { PITCH3D, RULES3D, TICK_HZ, attackDir } from '../../../../lib/game3d/sim';
import { TEAM } from '../../teams';
import type { Surface, SurfaceIn } from '../types';
import { attachInput } from './input3d';
import { createGauge } from '../kit3d/gauge3d';
import { createScene, type SceneHandle } from './scene';
import { clockText, edgeArrow, nextView, readView, saveView, stickToWorld, tankStep, VIEW_LABEL, type ViewMode } from './view3d';

const MAX_DPR = 2;
const SLOW_MS = 24;             // 평균 프레임이 이보다 길면(≈ 42fps 아래) 해상도부터 낮춘다
const LABEL_MIN_PX = 28;        // 선수 키가 화면에서 이보다 작으면 이름표를 숨긴다
const BUBBLE_UP_PX = 22;        // 말풍선은 이름표보다 이만큼 위

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
};

export function createSurface3d(o: SurfaceIn<MatchConfig>): Surface<MatchState, MatchConfig, Input> | string {
  const { root, canvas, layer, config, roster, playing } = o;
  const myId = o.myId !== null && o.myId >= 0 && o.myId < config.players.length ? o.myId : null;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let sc: SceneHandle;
  try {
    sc = createScene(canvas, config, roster, myId ?? -1, dpr);
  } catch {
    // WebGL 을 못 연다(오래된 기기·꺼 둔 설정·인앱 브라우저 일부) — 빈 화면 대신 글로 알린다
    return '이 기기·브라우저에서는 3D 화면을 열 수 없습니다.';
  }

  // ── 캔버스 위 DOM(점수판·시계·골 문구·게이지·이름표·말풍선·시점·화살표·조작 버튼) — 예전 Match3D 와 같은 클래스 ──
  const nodes: HTMLElement[] = [];
  const add = <T extends HTMLElement>(e: T): T => { nodes.push(e); return e; };
  const labelBox = add(el('div', 'g3-labels', layer));
  labelBox.setAttribute('aria-hidden', 'true');
  const hud = add(el('div', 'g3-hud', layer));
  hud.setAttribute('aria-live', 'polite');
  const scoreEl = el('b', 'g3-score', hud);
  const clockEl = el('span', 'g3-clock', hud);
  const goalEl = add(el('div', 'g3-goal', layer));
  goalEl.setAttribute('role', 'status');
  goalEl.style.display = 'none';
  const goalB = el('b', '', goalEl); goalB.textContent = '골!';
  const goalWho = el('span', '', goalEl);
  const gauge = createGauge(layer);   // 세기 막대 하나 — 발밑(1인칭은 아래 가운데), 2026-11-07 "게이지 시스템 피파랑 비슷하게 가자"
  const arrow = add(el('div', 'g3-arrow', layer));
  arrow.setAttribute('aria-hidden', 'true');
  const lost = add(el('div', 'game-banner', layer));
  lost.setAttribute('role', 'alert');
  lost.style.display = 'none';

  // 시점(2026-11-07 "1인칭도 구현해줘") — ✕ 바로 아래. 고른 시점은 기기에 남는다. 구경은 중계만(내 선수가 없다).
  let mode: ViewMode = myId === null ? 'broadcast' : readView();
  const viewBtn = myId === null ? null : add(el('button', 'g3-view', layer));
  const paintView = (): void => {
    if (!viewBtn) return;
    viewBtn.setAttribute('aria-label', `시점 바꾸기, 지금 ${VIEW_LABEL[mode]}`);
    viewBtn.innerHTML = `시점 <b>${VIEW_LABEL[mode]}</b>`;
  };
  if (viewBtn) {
    viewBtn.type = 'button';
    paintView();
    viewBtn.addEventListener('click', () => { mode = nextView(mode); saveView(mode); paintView(); viewBtn.blur(); });
  }

  // 조작 — 뛰는 사람만. 터치 버튼은 처음 터치가 들어오거나 터치 기기면 보인다(마우스 PC 에선 안 보임).
  let touch = !!window.matchMedia?.('(any-pointer: coarse)').matches;
  const btns: HTMLButtonElement[] = [];
  const button = (cls: string, label: string, text: string): HTMLButtonElement => {
    const b = add(el('button', `g3-btn ${cls}`, layer));
    b.type = 'button'; b.setAttribute('aria-label', label); b.textContent = text;
    btns.push(b);
    return b;
  };
  let input: ReturnType<typeof attachInput> | null = null;
  if (playing && myId !== null) {
    const base = add(el('div', 'g3-stick', layer));
    base.setAttribute('aria-hidden', 'true');
    const knob = el('div', 'g3-stick-knob', base);
    const passBtn = button('g3-pass', '패스', '패스');
    const shootBtn = button('g3-shoot', '슛', '슛');
    const throughBtn = button('g3-small g3-through', '스루 패스', '스루');
    const lobBtn = button('g3-small g3-lob', '로빙 패스', '로빙');
    const sprintBtn = button('g3-small g3-sprint', '질주(누르는 동안)', '질주');
    input = attachInput({ root, base, knob, shootBtn, passBtn, throughBtn, lobBtn, sprintBtn, onTouch: () => { touch = true; } });
  }
  let btnsOn = false;

  // 이름표 — 선수마다 span 하나, 매 프레임 transform 만 고친다. 말풍선도 같은 자리(조금 위)에.
  const labels = config.players.map((mp, i) => {
    const e = el('span', `g3-label${i === myId ? ' is-me' : ''}`, labelBox);
    e.textContent = mp.name;
    e.style.borderColor = TEAM[mp.side].color;
    return { el: e, shown: false };
  });
  const bubbles = new Map<number, { el: HTMLSpanElement; shown: boolean }>();

  let w = 0, h = 0, portrait = false, snap = true;
  const vHead = new Vector3(), vFoot = new Vector3(), vCam = new Vector3();
  // 1인칭 시선 — 화면 쪽에서 각도로 들고(삼각함수는 여기서만), 경기 계산에는 단위 벡터로 넘긴다(온라인이면 어댑터가 64방향 표로 양자화한다).
  let heading = 0, turnVel = 0, lastMode: ViewMode | null = null, lastPhase: string | null = null;
  const faceOf = (s: MatchState): number => { const p = myId === null ? undefined : s.players[myId]; return p ? Math.atan2(p.fy, p.fx) : 0; };
  /** 킥오프 자리에서 선수가 보는 쪽(공격 방향). 킥오프로 돌아가면 sim 이 보는 쪽을 이걸로 놓는다 — 시선도 같이 돌려놓아야
   *  1인칭 입력이 예전 시선으로 다시 돌려 버리지 않는다(상태의 보는 쪽은 그 입력이 이미 덮어썼을 수 있어 믿지 않는다). */
  const kickoffHeading = myId === null ? 0 : (attackDir(config.players[myId].side) === 1 ? 0 : Math.PI);
  let last: MatchState | null = null;

  let avgMs = 1000 / TICK_HZ, slowFor = 0, lastClock = '', lastScore = '', arrowOn = false, goalOn = false, dead = false;
  const onLost = (e: Event): void => {
    e.preventDefault();
    dead = true;
    lost.textContent = '3D 화면이 끊겼습니다 — ✕ 로 나가 다시 열어 주세요.';
    lost.style.display = '';
  };
  canvas.addEventListener('webglcontextlost', onLost);

  const team = (side: 0 | 1): string => `<span class="g3-team" style="color:${TEAM[side].color}">${TEAM[side].short}</span>`;

  return {
    resize(nw, nh) {
      w = nw; h = nh;
      portrait = h > w;
      sc.resize(w, h);
    },

    render(f) {
      if (dead || !w || !h) return;
      const s = f.state;
      // 시선 맞추기: 시점을 바꿨으면 지금 보는 쪽, 킥오프로 돌아갔으면(또는 첫 프레임) 공격 방향. 1인칭이 아니면 늘 선수가 보는 쪽을 따라간다.
      if (mode !== lastMode) { lastMode = mode; heading = lastPhase === null ? kickoffHeading : faceOf(s); turnVel = 0; }
      if (s.phase === 'kickoff' && lastPhase !== 'kickoff') { heading = kickoffHeading; turnVel = 0; }
      if (mode !== 'first') heading = faceOf(s);
      lastPhase = s.phase;

      // 상태는 틀이 이미 틱 사이를 섞어 주었다 — 장면 쪽 섞기는 쓰지 않는다(직전 그린 것 → 이번 것, alpha 1)
      sc.update(last ?? s, s, 1, f.dt, { mode, portrait, heading, snap });
      snap = false;
      last = s;
      sc.render();

      // 프레임 시간 — 느리면 해상도부터 낮춘다(계산은 그대로 60틱, 화면만 덜 곱게)
      const dtMs = f.dt * 1000;
      if (dtMs > 0) {
        avgMs += (dtMs - avgMs) * 0.05;
        if (avgMs > SLOW_MS && dpr > 1) {
          slowFor += dtMs;
          if (slowFor > 2000) { dpr = Math.max(1, dpr - 0.5); sc.setPixelRatio(dpr); sc.resize(w, h); slowFor = 0; }
        } else slowFor = 0;
      }

      // 점수판·시계(바뀔 때만 DOM)
      const sk = `${s.score[0]}:${s.score[1]}`;
      if (sk !== lastScore) { scoreEl.innerHTML = `${team(0)} ${s.score[0]} : ${s.score[1]} ${team(1)}`; lastScore = sk; }
      const ct = clockText(s.ticksLeft, TICK_HZ);
      if (ct !== lastClock) { clockEl.textContent = ct; lastClock = ct; }
      // 골 문구 — 넣은 사람 · 도움(2D 와 같은 규칙), 자책이면 편 이름
      const g = s.phase === 'goal';
      if (g !== goalOn) {
        goalOn = g;
        goalEl.style.display = g ? '' : 'none';
        if (g) {
          const name = (id: number | null): string | null => (id !== null ? config.players[id]?.name ?? null : null);
          const scorer = name(s.lastScorer), assist = name(s.lastAssist);
          const side: 0 | 1 = s.kickoffSide === 0 ? 1 : 0;   // 넣은 편 = 다음 킥오프 반대편
          goalWho.textContent = scorer ? (assist ? `${scorer} · 도움 ${assist}` : scorer) : TEAM[side].short;
        }
      }
      // 터치 버튼 — 터치면, 끝나기 전까지
      const on = touch && s.phase !== 'end';
      if (on !== btnsOn) { btnsOn = on; for (const b of btns) b.classList.toggle('is-shown', on); }

      // 이름표 — 머리 위를 화면에 비춘다. 뒤에 있거나 너무 작으면 숨긴다(폰에서 글자가 겹쳐 뭉개지지 않게)
      const fp = mode === 'first';
      const head = (i: number): { x: number; y: number; ok: boolean; big: boolean } => {
        // 카메라 뒤에 있는 점은 투영하면 엉뚱한 데 찍힌다 — 카메라 좌표로 앞(-z)인지 먼저 본다
        const ahead = sc.headPoint(i, vCam).applyMatrix4(sc.camera.matrixWorldInverse).z < -0.3;
        sc.headPoint(i, vHead).project(sc.camera);
        sc.footPoint(i, vFoot).project(sc.camera);
        const px = (vHead.y - vFoot.y) * 0.5 * h;
        return { x: (vHead.x + 1) * 0.5 * w, y: (1 - vHead.y) * 0.5 * h, ok: ahead && vHead.z < 1 && vHead.z > -1, big: px > LABEL_MIN_PX };
      };
      const heads = labels.map((_, i) => head(i));
      for (let i = 0; i < labels.length; i++) {
        const H = heads[i], L = labels[i];
        const show = H.ok && H.big && !(fp && i === myId);
        if (show !== L.shown) { L.el.classList.toggle('is-on', show); L.shown = show; }
        if (show) L.el.style.transform = `translate(${H.x.toFixed(1)}px, ${H.y.toFixed(1)}px) translate(-50%, -100%)`;
      }
      // 한마디 말풍선 — 그 선수 머리 위(이름표보다 조금 위). 작게 보여도 띄운다(말은 놓치면 안 된다), 화면 뒤면 숨긴다.
      const live = new Set<number>();
      for (const b of f.bubbles) {
        if (!(b.id >= 0 && b.id < labels.length)) continue;
        live.add(b.id);
        let B = bubbles.get(b.id);
        if (!B) { B = { el: el('span', 'g3-bubble', labelBox), shown: false }; bubbles.set(b.id, B); }
        if (B.el.textContent !== b.text) B.el.textContent = b.text;
        const H = heads[b.id];
        const show = H.ok && !(fp && b.id === myId);
        if (show !== B.shown) { B.el.classList.toggle('is-on', show); B.shown = show; }
        if (show) B.el.style.transform = `translate(${H.x.toFixed(1)}px, ${(H.y - BUBBLE_UP_PX).toFixed(1)}px) translate(-50%, -100%)`;
      }
      for (const [id, B] of bubbles) if (!live.has(id) && B.shown) { B.el.classList.remove('is-on'); B.shown = false; }
      // 세기 막대 — 내 선수가 차는 키를 누르는 동안(슛 = 금색·잘 들어가는 띠, 패스·스루·로빙 = 파랑), 발밑에. 1인칭이면 아래 가운데
      const me = myId === null ? undefined : s.players[myId];
      const shotG = me && me.shootHeld && !me.shootVoid ? me.charge / RULES3D.chargeTicks : 0;
      const passG = me && (me.passHeld || me.throughHeld || me.lobHeld) ? me.lobTicks / RULES3D.passCharge : 0;
      let at: { x: number; y: number } | null = null;
      if (myId !== null && !fp) {
        const ahead = sc.footPoint(myId, vCam).applyMatrix4(sc.camera.matrixWorldInverse).z < -0.3;
        sc.footPoint(myId, vFoot).project(sc.camera);
        if (ahead) at = { x: (vFoot.x + 1) * 0.5 * w, y: (1 - vFoot.y) * 0.5 * h + 8 };
      }
      gauge.update(shotG > 0 ? shotG : passG > 0 ? passG : null, shotG > 0 ? 'shot' : 'pass', at, RULES3D.shotSweet, touch);

      // 화면 밖·뒤의 공 — 가장자리 화살표(1인칭·뒤에서). 중계는 공을 따라가니 필요 없다
      let arrowNow = false;
      if (mode !== 'broadcast' && s.phase !== 'end') {
        sc.ballPoint(vCam).applyMatrix4(sc.camera.matrixWorldInverse);
        const e = edgeArrow(vCam.x, vCam.y, vCam.z, sc.camera.fov, sc.camera.aspect, w, h, 44);
        arrowNow = e.show;
        if (arrowNow) arrow.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px) translate(-50%, -50%) rotate(${e.angle.toFixed(3)}rad)`;
      }
      if (arrowNow !== arrowOn) { arrow.classList.toggle('is-on', arrowNow); arrowOn = arrowNow; }
    },

    // 틱마다 한 번(혼자·방장·손님 같은 자리) — 화면 기준 조작을 경기 입력으로.
    readInput: input ? (): Input => {
      const k = input!.read();
      if (mode === 'first') {
        // 탱크식: 좌우 = 돌기, 위아래 = 앞뒤. 보는 쪽을 그대로 선수가 보게 fx·fy 로 넘긴다 — 패스·슛이 보는 쪽으로 간다
        const t = tankStep(k.x, k.y, heading, turnVel, 1 / TICK_HZ);
        heading = t.heading; turnVel = t.turnVel;
        return { x: t.move.x, y: t.move.y, shoot: k.shoot, pass: k.pass, through: k.through, lob: k.lob, sprint: k.sprint, fx: t.face.x, fy: t.face.y };
      }
      const fw = sc.groundForward();
      const d = stickToWorld(k.x, k.y, fw.x, fw.y);   // 화면 기준 → 경기장 방향(카메라가 실제로 보는 방향으로)
      return { x: d.x, y: d.y, shoot: k.shoot, pass: k.pass, through: k.through, lob: k.lob, sprint: k.sprint };
    } : null,

    camera: () => null,

    debug: () => ({
      /** 그리기 정보 — 프레임·그리기 호출·삼각형 수·시점. */
      getInfo: () => { const i = sc.info(); return { fps: Math.round(1000 / Math.max(1, avgMs)), drawCalls: i.drawCalls, triangles: i.triangles, view: mode }; },
      /** 시점 바꾸기(헤드리스 확인용). */
      setView: (m: ViewMode) => { if (myId !== null && VIEW_LABEL[m]) { mode = m; paintView(); } },
      /** 골 장면 점검용(예전 /game3d/ 의 goalChance) — 내 선수를 상대 골대 앞(골키퍼는 옆으로 비킴)에, 공을 발밑에, 동료가 방금 넘겨준 것으로. */
      goalPatch: (s0: MatchState): MatchState => {
        if (myId === null) return s0;
        const n = JSON.parse(JSON.stringify(s0)) as MatchState;
        const side = config.players[myId].side, dir = attackDir(side);
        const gk = config.players.findIndex((p) => p.gk && p.side !== side);
        n.phase = 'play'; n.phaseTicks = 0;
        // 골대 4m 앞(경기장 길이와 상관없이 — 2026-11-07 경기장 44m 로 넓힌 뒤 예전 x 14 가 8m 앞이 됐다)
        Object.assign(n.players[myId], { x: dir * (PITCH3D.HW - 4), y: 0, vx: 0, vy: 0, fx: dir, fy: 0, noTouch: 0 });
        if (gk >= 0) Object.assign(n.players[gk], { x: dir * 6, y: -9, vx: 0, vy: 0 });
        for (const p of config.players) if (p.side !== side && !p.gk) Object.assign(n.players[p.id], { x: dir * -5, y: -8 + p.id % 5, vx: 0, vy: 0 });
        n.owner = myId; n.ball = { x: dir * (PITCH3D.HW - 3.3), y: 0, z: 0.18, vx: 0, vy: 0, vz: 0 };
        const mate = config.players.findIndex((p) => p.side === side && p.id !== myId && !p.gk);
        if (mate >= 0) { n.prevTouch = mate; n.prevTouchTick = n.tick; n.lastTouch = myId; n.lastTouchTick = n.tick; }
        return n;
      },
    }),

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      input?.dispose();
      for (const n of nodes) n.remove();
      gauge.dispose();
      sc.dispose();
    },
  };
}

// 3D 미니게임 그림판(2026-11-07 5단계) — 같은 묶음에 싣는다(3D 게임 셋이 three.js 를 한 번만 받게). 각 화면(views/<id>/index.tsx)이 이 파일을 동적으로 받는다.
export { createPenaltySurface } from '../penalty3d/surface';
export { createFreeSurface } from '../free3d/surface';
export { createFreekickSurface } from '../freekick3d/surface';
export { createDribbleSurface } from '../dribble3d/surface';
