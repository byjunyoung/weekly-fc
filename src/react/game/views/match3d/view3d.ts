// src/react/game/views/match3d/view3d.ts — 3D 경기 화면의 순수 계산(2026-11-07, 4단계에 src/react/game3d 에서 옮김)(DOM·three.js 없음 — node 단위 테스트가 그대로 가져온다).
// 하는 일: ① 화면 기준 스틱 → 경기장 방향(카메라가 실제로 보는 방향으로), ② 카메라가 가려는 자리, ③ 남은 시간 글자.
// (라인업 뽑기 pickLineup5 는 2026-11-07 4단계에 지웠다 — 혼자 하기도 방의 시작(src/lib/games/match3d-room.ts buildMatch3d)으로 판을 만든다.)
// 2D 의 view.ts 는 가져오지 않는다 — 그쪽은 2D 경기 계산을 끌고 와서 이 페이지 묶음이 무거워진다.
//
// 좌표: 경기 계산은 바닥 x·y + 높이 z, three.js 는 위가 y 라서 three(x, y, z) = 경기(x, z, y).
import { PITCH3D } from '../../../../lib/game3d/sim.ts';

/** 화면 위 스틱(오른쪽 +x, 아래 +y — 2D 와 같은 꼴) → 경기장 방향. fwdX·fwdY = 카메라가 보는 방향을 바닥에 눕힌 것(경기 좌표).
 *  화면 위 = 카메라 앞, 화면 오른쪽 = 앞을 오른쪽으로 돌린 것((−fy, fx) — three 의 forward × up 을 경기 좌표로 옮긴 값).
 *  카메라가 천천히 도는 중에도 "보이는 대로" 가게, 가로/세로 구분 대신 카메라의 실제 방향을 받는다. */
export function stickToWorld(sx: number, sy: number, fwdX: number, fwdY: number): { x: number; y: number } {
  const l = Math.sqrt(fwdX * fwdX + fwdY * fwdY);
  const fx = l > 1e-6 ? fwdX / l : 0, fy = l > 1e-6 ? fwdY / l : -1;
  const rx = 0 - fy, ry = fx;
  return { x: rx * sx + fx * (0 - sy), y: ry * sx + fy * (0 - sy) };
}

export type CamGoal = { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number };

// ── 카메라 조절 값(화면 쪽 — 경기 계산과 상관없다) ──
const LAND_HEIGHT = 19;      // 가로: 카메라 높이(m)
const LAND_BACK = 23;        // 가로: 경기장 옆(사람 쪽 +y)으로 물러난 거리
const LAND_FOV = 32;         // 좁게 — 넓으면 화면 가장자리 선수가 바깥으로 누워 보인다(헤드리스 화면으로 확인)
const PORT_HEIGHT = 17;      // 세로: 카메라 높이
const PORT_BACK = 11;        // 세로: 우리 골대 쪽으로 물러난 거리
const PORT_FOV = 56;
const KEEP_ME = 8;           // 가로: 카메라 중심이 내 선수에서 이보다 멀어지지 않는다(내 선수가 화면 밖으로 안 나가게)

/** 카메라가 가려는 자리(경기 좌표: p = 카메라 위치, l = 바라보는 점, z 가 높이). 실제 카메라는 여기로 천천히 따라간다(화면 쪽에서 easing).
 *  가로·PC: 옆에서 비스듬히 내려다보며 공을 따라가되 내 선수를 화면 안에 둔다.
 *  세로: 우리 골대 쪽 뒤에서 상대 골대 쪽으로(내 편이 화면 위로 공격). aspect = 가로/세로. */
export function cameraGoal(portrait: boolean, aspect: number, ball: { x: number; y: number }, me: { x: number; y: number } | null): CamGoal {
  const { HW, HH } = PITCH3D;
  const m = me ?? ball;
  if (!portrait) {
    let fx = ball.x * 0.65 + m.x * 0.35;
    fx = Math.min(m.x + KEEP_ME, Math.max(m.x - KEEP_ME, fx));
    fx = Math.min(HW - 7, Math.max(-HW + 7, fx));
    const fy = (ball.y * 0.6 + m.y * 0.4) * 0.45;
    // 화면이 좁을수록(정사각에 가까울수록) 더 물러나 경기장 너비가 들어오게
    const k = Math.max(1, 1.75 / Math.max(0.6, aspect));
    return { px: fx, py: fy + LAND_BACK * k, pz: LAND_HEIGHT * k, lx: fx, ly: fy - 1, lz: 0, fov: LAND_FOV };
  }
  let fx = m.x * 0.55 + ball.x * 0.45;
  fx = Math.min(HW - 8, Math.max(-HW + 5, fx));
  const fy = Math.min(HH - 4, Math.max(-HH + 4, m.y * 0.6 + ball.y * 0.4));
  return { px: fx - PORT_BACK, py: fy, pz: PORT_HEIGHT, lx: fx + 4, ly: fy, lz: 0, fov: PORT_FOV };
}

/** 남은 틱 → "m:ss"(올림 — 0:00 은 정말 끝났을 때만). */
export function clockText(ticks: number, hz = 60): string {
  const s = Math.max(0, Math.ceil(ticks / hz - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 씨앗 하나로 도는 작은 난수기(mulberry32) — 라인업 섞기용(화면 쪽, 경기 계산 밖). */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 시점(2026-11-07 "1인칭도 구현해줘") ──
// 중계 = 지금까지의 카메라. 1인칭 = 내 선수 눈높이에서 보는 쪽으로. 뒤에서 = 내 선수 몇 m 뒤·위에서 상대 골대 쪽으로(폰에서 편한 중간).
export type ViewMode = 'broadcast' | 'first' | 'chase';
export const VIEW_MODES: readonly ViewMode[] = ['broadcast', 'first', 'chase'];
export const VIEW_LABEL: Record<ViewMode, string> = { broadcast: '중계', first: '1인칭', chase: '뒤에서' };
export const nextView = (m: ViewMode): ViewMode => VIEW_MODES[(VIEW_MODES.indexOf(m) + 1) % VIEW_MODES.length];
export const isViewMode = (v: unknown): v is ViewMode => VIEW_MODES.includes(v as ViewMode);

/** 고른 시점 — 설정 화면과 경기 화면이 같이 쓰고, 다음에 와도 그대로. (three.js 를 안 끌고 오게 여기 둔다.) */
const VIEW_KEY = 'wfc:game3d:view';
export function readView(): ViewMode {
  try { const v = globalThis.localStorage?.getItem(VIEW_KEY); return isViewMode(v) ? v : 'broadcast'; } catch { return 'broadcast'; }
}
export function saveView(v: ViewMode): void {
  try { globalThis.localStorage?.setItem(VIEW_KEY, v); } catch { /* 저장 못 해도 이번 판은 그 시점으로 */ }
}

// 1인칭·뒤에서 조절 값(화면 쪽)
const TURN_SPEED = 2.4;      // 스틱·키를 끝까지 눌렀을 때 도는 빠르기(라디안/초) — 1초에 약 140도
const TURN_SMOOTH = 0.18;    // 도는 속도가 목표로 따라가는 비율(틱당) — 작을수록 부드럽게 돌기 시작하고 멈춘다
const EYE_H = 1.62;          // 눈높이(m) — 아바타 키 1.75 의 머리 가운데쯤
const FP_LOOK_DOWN = 0.2;    // 1인칭 시선이 아래로 기우는 정도(앞 1m 당) — 발 앞 공이 화면 아래에 걸리게
const FP_HFOV = 84;          // 1인칭 가로 시야각 — 세로 화면에서도 옆이 보이게 가로 기준으로 맞춘다
const CHASE_BACK = 6.5, CHASE_UP = 3.6, CHASE_AHEAD = 7;   // 뒤에서: 뒤로·위로 물러난 거리, 바라보는 점(선수 앞)

/** 탱크식 1인칭 조작 한 틱: 스틱 좌우(sx) = 시선 돌리기, 위아래(sy, 위가 -) = 앞뒤로 가기.
 *  heading = 보는 각(라디안, 경기 x 축에서 y 쪽으로), turnVel = 지금 도는 속도. 화면 쪽 계산이라 삼각함수를 쓴다 —
 *  경기 계산에는 결과 단위 벡터(face)와 움직임(move)만 넘긴다. 화면에서 오른쪽(sx>0)을 누르면 시선이 오른쪽으로 돈다
 *  (경기 좌표는 x→y 가 시계 방향으로 보이게 깔려 있어 heading 이 커지는 쪽이 오른쪽이다). */
export function tankStep(sx: number, sy: number, heading: number, turnVel: number, dt: number):
  { heading: number; turnVel: number; move: { x: number; y: number }; face: { x: number; y: number } } {
  const want = Math.max(-1, Math.min(1, sx)) * TURN_SPEED;
  const tv = turnVel + (want - turnVel) * TURN_SMOOTH;
  let h = heading + tv * dt;
  if (h > Math.PI) h -= Math.PI * 2; else if (h < -Math.PI) h += Math.PI * 2;
  const fx = Math.cos(h), fy = Math.sin(h);
  const fwd = Math.max(-1, Math.min(1, 0 - sy));
  return { heading: h, turnVel: tv, move: { x: fx * fwd, y: fy * fwd }, face: { x: fx, y: fy } };
}

/** 1인칭 카메라: 눈(경기 좌표 x·y·높이)과 바라보는 점. */
export function firstPersonGoal(me: { x: number; y: number }, heading: number, aspect: number): CamGoal {
  const fx = Math.cos(heading), fy = Math.sin(heading);
  return { px: me.x, py: me.y, pz: EYE_H, lx: me.x + fx * 6, ly: me.y + fy * 6, lz: EYE_H - FP_LOOK_DOWN * 6, fov: fpFov(aspect) };
}

/** 가로 시야각을 FP_HFOV 로 맞춘 세로 시야각(three 카메라는 세로 기준). 너무 넓거나 좁지 않게 자른다. */
export function fpFov(aspect: number): number {
  const v = (2 * Math.atan(Math.tan((FP_HFOV * Math.PI) / 360) / Math.max(0.3, aspect)) * 180) / Math.PI;
  return Math.max(50, Math.min(100, v));
}

/** 뒤에서 카메라: 내 선수 뒤(우리 골대 쪽)·위에서 상대 골대 쪽으로 — 화면 위가 늘 공격 방향이라 스틱이 화면 기준 그대로 맞는다. */
export function chaseGoal(me: { x: number; y: number }, ball: { x: number; y: number }, aspect: number): CamGoal {
  const ly = me.y * 0.8 + ball.y * 0.2;
  return { px: me.x - CHASE_BACK, py: me.y * 0.9 + ball.y * 0.1, pz: CHASE_UP, lx: me.x + CHASE_AHEAD, ly, lz: 0.4, fov: Math.max(55, Math.min(80, fpFov(aspect) - 15)) };
}

/** 화면 밖·뒤에 있는 공을 가리키는 화살표 자리. cx·cy·cz = 카메라 좌표의 공(앞이 -z, 위가 +y), w·h = 화면(px), m = 가장자리 여백.
 *  화면 안이면 show=false. angle 은 화면 기준(오른쪽 0, 아래가 +, 라디안). */
export function edgeArrow(cx: number, cy: number, cz: number, fovDeg: number, aspect: number, w: number, h: number, m: number):
  { show: boolean; x: number; y: number; angle: number } {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const front = cz < 0;
  // 앞이면 투영한 자리, 뒤면 방향만(뒤를 투영하면 좌우가 뒤집힌다)
  let nx: number, ny: number;
  if (front) { nx = cx / (0 - cz) / (t * aspect); ny = cy / (0 - cz) / t; }
  else { nx = cx; ny = cy; if (Math.abs(nx) + Math.abs(ny) < 1e-6) ny = -1; }
  if (front && Math.abs(nx) <= 1 && Math.abs(ny) <= 1) return { show: false, x: 0, y: 0, angle: 0 };
  const dx = nx, dy = 0 - ny;
  const hw = w / 2 - m, hh = h / 2 - m;
  const k = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  return { show: true, x: w / 2 + dx * k, y: h / 2 + dy * k, angle: Math.atan2(dy, dx) };
}
