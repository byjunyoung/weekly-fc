// src/react/game3d/scene.ts — 3D 축구 **시제품**의 three.js 장면(2026-11-07). 경기 상태를 받아 그리기만 한다 — 계산·입력·시계는 모른다.
// 스펙 §4 "포털의 어두운 도트 분위기": 잔디 줄무늬, 선, 골대와 그물, 둘레 낮은 벽, 도트 아바타 입체, 발밑 팀 색 고리, 내 선수 표시.
//
// 그리기 호출을 적게(폰): 바닥+선 / 벽 / 골대 / 그물은 각각 한 덩어리로 직접 만든 버퍼, 고리·그림자는 인스턴스 하나씩,
// 선수는 몸·다리 둘 = 3개씩(재질 하나를 같이 쓴다). 텍스처는 하나도 없다 — 색은 꼭짓점 색, 도트 느낌은 평면 음영으로.
// 진짜 그림자(shadow map)는 쓰지 않는다 — 발밑 동그란 그림자가 공 높이를 읽기에 더 낫고 거의 공짜다.
//
// 좌표: three(x, y, z) = 경기(x, z, y). three 의 y 가 위.
import {
  AmbientLight, BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry, DirectionalLight, Fog, Group, HemisphereLight,
  IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments, Material, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PerspectiveCamera, Quaternion, RingGeometry, Scene, Vector3, WebGLRenderer,
} from 'three';
import { avatarPixels } from '../../components/avatar.ts';
import { avatarSpecFor, isUnsetAvatar, randomAvatar } from '../../lib/avatar.ts';
import { PITCH3D, RULES3D, type MatchConfig, type MatchState } from '../../lib/game3d/sim.ts';
import { VESTS } from '../../lib/teams.ts';
import type { Player } from '../../lib/types.ts';
import { cameraGoal } from './view3d.ts';
import { buildFigure, type Part } from './voxel.ts';

const { HW, HH, goalHalfW: GW, goalH: GH, goalDepth: GD, boardH: BH, ballR: BR, centerR } = PITCH3D;

// ── 색(장면 전용 팔레트 — 2D 경기장과 같은 계열, 빛을 받으니 조금 밝게) ──
const BG = '#05070a';
const GRASS_A = '#1b4529', GRASS_B = '#225433', RUNOFF = '#0c1a11';
const LINE = '#e8ece8';
const BOARD = '#1f2024', BOARD_TOP = '#565f6f';
const POST = '#f4f4f4';
const GOLD = '#ffce21';
/** 팀 색 — 0 편 주황조끼, 1 편 노조끼(VESTS). */
export const TEAM_COLOR = [VESTS.find((v) => v.key === 'orange')?.color ?? '#e67e22', VESTS.find((v) => v.key === 'none')?.color ?? '#e5e5e5'] as const;

// ── 움직임 그림(화면만) ──
const RUN_FREQ = 4.2;        // 속도(m/s)당 걸음 위상 — 클수록 다리를 빨리 놀린다
const BOB = 0.06;            // 통통 튀는 높이(m)
const LEG_SWING = 0.75;      // 다리 흔드는 각(라디안)
const KICK_LEAN = 0.38;      // 찰 때 앞으로 기우는 각
const CAM_EASE = 3.2;        // 카메라가 따라가는 빠르기(1/초)

/** 직접 쌓는 버퍼 — 상자·바닥 사각형을 꼭짓점 색과 함께. 마지막에 BufferGeometry 하나로. */
class Builder {
  pos: number[] = []; nor: number[] = []; col: number[] = []; idx: number[] = [];
  private c = new Color();
  rgb(hex: string): [number, number, number] { this.c.set(hex); return [this.c.r, this.c.g, this.c.b]; }
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], rgb: [number, number, number]): void {
    const base = this.pos.length / 3;
    for (const v of [a, b, c, d]) { this.pos.push(v[0], v[1], v[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(rgb[0], rgb[1], rgb[2]); }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** 바닥과 나란한 사각형(위를 본다). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, hex: string): void {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], this.rgb(hex));
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: string): void {
    const c = this.rgb(hex);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], c);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], c);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], c);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c);
  }
  geometry(): BufferGeometry { return toGeometry({ positions: this.pos, normals: this.nor, colors: this.col, indices: this.idx }); }
}

function toGeometry(p: Part): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(p.positions), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(p.normals), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(p.colors), 3));
  const n = p.positions.length / 3;
  g.setIndex(new BufferAttribute(n > 65535 ? new Uint32Array(p.indices) : new Uint16Array(p.indices), 1));
  g.computeBoundingSphere();
  return g;
}

/** 경기장 바닥·선(한 덩어리). */
function buildGround(): BufferGeometry {
  const b = new Builder();
  b.flat(-HW - 6, -HH - 6, HW + 6, HH + 6, -0.02, RUNOFF);
  const stripes = 12, sw = (HW * 2) / stripes;
  for (let i = 0; i < stripes; i++) b.flat(-HW + i * sw, -HH, -HW + (i + 1) * sw, HH, 0, i % 2 ? GRASS_B : GRASS_A);
  const y = 0.012, w = 0.06;
  const line = (x0: number, z0: number, x1: number, z1: number): void => {
    // 가로·세로 선만 쓴다 — 굵기 w 의 얇은 사각형
    if (Math.abs(z1 - z0) < 1e-6) b.flat(Math.min(x0, x1) - w, z0 - w, Math.max(x0, x1) + w, z0 + w, y, LINE);
    else b.flat(x0 - w, Math.min(z0, z1) - w, x0 + w, Math.max(z0, z1) + w, y, LINE);
  };
  const ix = HW - 0.1, iz = HH - 0.1;
  line(-ix, -iz, ix, -iz); line(-ix, iz, ix, iz); line(-ix, -iz, -ix, iz); line(ix, -iz, ix, iz); line(0, -iz, 0, iz);
  for (const s of [1, -1]) {   // 골 앞 상자(그림만 — 규칙은 없다)
    const gx = s * ix, bx = s * (ix - 3.2), bz = GW + 1.6;
    line(bx, -bz, bx, bz); line(Math.min(gx, bx), -bz, Math.max(gx, bx), -bz); line(Math.min(gx, bx), bz, Math.max(gx, bx), bz);
    b.flat(s * (ix - 6) - 0.1, -0.1, s * (ix - 6) + 0.1, 0.1, y, LINE);   // 페널티 점
  }
  // 가운데 원 — 짧은 사각형 조각을 이어 붙인다(그리기 쪽이라 삼각함수를 써도 된다)
  const seg = 64;
  const c = b.rgb(LINE);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const r0 = centerR - w, r1 = centerR + w;
    const p = (r: number, a: number): number[] => [Math.cos(a) * r, y, Math.sin(a) * r];
    b.quad(p(r0, a0), p(r0, a1), p(r1, a1), p(r1, a0), [0, 1, 0], c);
  }
  b.flat(-0.12, -0.12, 0.12, 0.12, y, LINE);
  return b.geometry();
}

/** 둘레 낮은 벽 — 옆 둘, 끝 넷(골문 자리 비움), 골대 뒤 상자 벽. */
function buildBoards(): BufferGeometry {
  const b = new Builder();
  const t = 0.16, cap = 0.05;
  const wall = (x0: number, z0: number, x1: number, z1: number): void => {
    b.box(x0, 0, z0, x1, BH - cap, z1, BOARD);
    b.box(x0, BH - cap, z0, x1, BH, z1, BOARD_TOP);
  };
  wall(-HW - t, -HH - t, HW + t, -HH); wall(-HW - t, HH, HW + t, HH + t);
  for (const s of [1, -1]) {
    const x0 = s > 0 ? HW : -HW - t, x1 = s > 0 ? HW + t : -HW;
    wall(x0, -HH, x1, -GW - 0.08); wall(x0, GW + 0.08, x1, HH);
  }
  return b.geometry();
}

/** 골대(기둥·크로스바·뒤 틀). */
function buildGoals(): BufferGeometry {
  const b = new Builder();
  const r = 0.07, back = 0.035;
  for (const s of [1, -1]) {
    const x = s * HW, xb = s * (HW + GD);
    b.box(x - r, 0, -GW - r, x + r, GH + r, -GW + r, POST);
    b.box(x - r, 0, GW - r, x + r, GH + r, GW + r, POST);
    b.box(x - r, GH - r, -GW - r, x + r, GH + r, GW + r, POST);
    // 뒤 틀(가늘게)
    b.box(xb - back, 0, -GW - back, xb + back, GH, -GW + back, '#9aa0a8');
    b.box(xb - back, 0, GW - back, xb + back, GH, GW + back, '#9aa0a8');
    b.box(Math.min(x, xb), GH - back, -GW - back, Math.max(x, xb), GH + back, -GW + back, '#9aa0a8');
    b.box(Math.min(x, xb), GH - back, GW - back, Math.max(x, xb), GH + back, GW + back, '#9aa0a8');
    b.box(xb - back, GH - back, -GW, xb + back, GH + back, GW, '#9aa0a8');
  }
  return b.geometry();
}

/** 그물 — 뒤·옆·지붕 격자 선. */
function buildNets(): BufferGeometry {
  const v: number[] = [];
  const L = (a: number[], c: number[]): void => { v.push(a[0], a[1], a[2], c[0], c[1], c[2]); };
  const step = 0.3;
  for (const s of [1, -1]) {
    const x = s * HW, xb = s * (HW + GD);
    for (let z = -GW; z <= GW + 1e-6; z += step) { L([xb, 0, z], [xb, GH, z]); L([x, GH, z], [xb, GH, z]); }
    for (let y = 0; y <= GH + 1e-6; y += step) { L([xb, y, -GW], [xb, y, GW]); L([x, y, -GW], [xb, y, -GW]); L([x, y, GW], [xb, y, GW]); }
    for (let k = 0; k <= GD + 1e-6; k += step) {
      const xx = s * (HW + k);
      L([xx, 0, -GW], [xx, GH, -GW]); L([xx, 0, GW], [xx, GH, GW]); L([xx, GH, -GW], [xx, GH, GW]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  return g;
}

/** 공 — 낮은 다면체에 검은 조각 몇 개(평면 음영이라 도트처럼 각져 보인다). */
function buildBall(): BufferGeometry {
  const g = new IcosahedronGeometry(BR, 1);   // 꼭짓점을 나눠 쓰지 않는 도형이라 면마다 색을 칠할 수 있다
  const pos = g.getAttribute('position');
  const phi = (1 + Math.sqrt(5)) / 2;
  const marks = [[0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]]
    .map(([x, y, z]) => new Vector3(x, y, z).normalize());
  const colors = new Float32Array(pos.count * 3);
  const white = new Color('#f2f2f2'), dark = new Color('#1f2126'), c = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(new Vector3(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)));
    c.normalize();
    const isDark = marks.some((m) => m.dot(c) > 0.93);
    const col = isDark ? dark : white;
    for (let k = 0; k < 3; k++) colors.set([col.r, col.g, col.b], (i + k) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/** 아바타 그림이 없을 때(미설정) — 번호로 정해지는 기본 그림을 쓴다(포털 다른 화면의 대신 그림과 같은 생각). */
function pixelsFor(p: Player | undefined, num: number): NonNullable<ReturnType<typeof avatarPixels>> {
  const spec = avatarSpecFor(p?.num ?? num, p?.avatar);
  return avatarPixels(isUnsetAvatar(spec) ? randomAvatar(num) : spec) ?? (avatarPixels(randomAvatar(num + 1)) as NonNullable<ReturnType<typeof avatarPixels>>);
}

type FigureObj = { root: Group; inner: Group; legL: Mesh | null; legR: Mesh | null; phase: number };

export type SceneHandle = {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  /** prev → next 사이 alpha 만큼 섞은 자리로 몸·공을 옮긴다. dt = 지난 그리기에서 흐른 초(걸음·카메라용). */
  update(prev: MatchState, next: MatchState, alpha: number, dt: number, portrait: boolean, snapCamera: boolean): void;
  render(): void;
  resize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  /** 카메라가 보는 방향을 바닥에 눕힌 것(경기 좌표). 입력을 화면 기준으로 돌리는 데 쓴다. */
  groundForward(): { x: number; y: number };
  /** 선수 i 의 머리 위 점(이름표 자리, three 좌표)과 발 점. */
  headPoint(i: number, out: Vector3): Vector3;
  footPoint(i: number, out: Vector3): Vector3;
  /** 지난 render() 의 그리기 호출·삼각형 수. */
  info(): { drawCalls: number; triangles: number };
  dispose(): void;
};

/** 장면을 만든다. WebGL 을 못 열면 던진다 — 부르는 쪽이 글로 된 안내를 띄운다. */
export function createScene(canvas: HTMLCanvasElement, config: MatchConfig, roster: Player[], humanId: number, pixelRatio: number): SceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: pixelRatio < 2, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(BG, 1);
  const scene = new Scene();
  scene.background = new Color(BG);
  scene.fog = new Fog(BG, 45, 95);
  const camera = new PerspectiveCamera(32, 1, 0.5, 200);
  camera.position.set(0, 19, 23);
  camera.lookAt(0, 0, 0);

  scene.add(new HemisphereLight('#d6e2ff', '#1b2a1b', 1.15));
  scene.add(new AmbientLight('#ffffff', 0.25));
  const sun = new DirectionalLight('#ffffff', 1.5);
  sun.position.set(-8, 20, 12);
  scene.add(sun);

  const lambert = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // 바닥·선은 한 덩어리(선은 바닥보다 1.2cm 위 — 멀리서도 깜빡이지 않을 만큼)
  scene.add(new Mesh(buildGround(), lambert));
  scene.add(new Mesh(buildBoards(), lambert));
  scene.add(new Mesh(buildGoals(), lambert));
  const netMat = new LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.32 });
  scene.add(new LineSegments(buildNets(), netMat));

  // 선수
  const figMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const rgbC = new Color();
  const rgb = (hex: string): [number, number, number] => { rgbC.set(hex); return [rgbC.r, rgbC.g, rgbC.b]; };
  const figs: FigureObj[] = config.players.map((mp) => {
    const pl = roster.find((r) => r.num === mp.num);
    const f = buildFigure(pixelsFor(pl, mp.num), rgb);
    const root = new Group(), inner = new Group();
    root.add(inner);
    inner.add(new Mesh(toGeometry(f.body), figMat));
    // 다리는 엉덩이 높이에 매달아 그 자리를 축으로 흔든다
    const leg = (part: Part | null): Mesh | null => {
      if (!part) return null;
      const m = new Mesh(toGeometry(part), figMat);
      m.position.set(0, f.hipY, 0);
      inner.add(m);
      return m;
    };
    const legL = leg(f.legL), legR = leg(f.legR);
    scene.add(root);
    return { root, inner, legL, legR, phase: mp.id * 1.7 };
  });

  // 발밑 고리(팀 색) · 그림자(선수 + 공) — 인스턴스 하나씩
  const n = config.players.length;
  const ringGeo = new RingGeometry(0.5, 0.64, 28).rotateX(-Math.PI / 2);
  const ringMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
  const rings = new InstancedMesh(ringGeo, ringMat, n);
  config.players.forEach((mp, i) => rings.setColorAt(i, new Color(i === humanId ? GOLD : TEAM_COLOR[mp.side])));
  rings.renderOrder = 2;
  scene.add(rings);
  const shadowGeo = new CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const shadowMat = new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false });
  const shadows = new InstancedMesh(shadowGeo, shadowMat, n + 1);
  shadows.renderOrder = 1;
  scene.add(shadows);
  rings.frustumCulled = false; shadows.frustumCulled = false;   // 인스턴스는 처음 자리로 경계가 잡혀 엉뚱하게 잘릴 수 있다

  // 공
  const ballMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const ball = new Mesh(buildBall(), ballMat);
  scene.add(ball);
  // 내 선수 표시 — 머리 위 금색 역삼각뿔
  const marker = new Mesh(new ConeGeometry(0.2, 0.38, 4).rotateX(Math.PI), new MeshBasicMaterial({ color: GOLD }));
  scene.add(marker);

  const look = new Vector3(0, 0, 0), goalPos = new Vector3(), goalLook = new Vector3();
  const tmpM = new Matrix4(), tmpQ = new Quaternion(), tmpV = new Vector3(), tmpS = new Vector3(), axis = new Vector3(), spin = new Quaternion();
  let lastInfo = { drawCalls: 0, triangles: 0 };
  let time = 0;
  const pos = config.players.map(() => ({ x: 0, y: 0 }));

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const snapOr = (a: number, b: number, t: number): number => (Math.abs(b - a) > 3 ? b : lerp(a, b, t));

  return {
    renderer, camera,
    update(prev, next, alpha, dt, portrait, snapCamera) {
      time += dt;
      const t = Math.min(1, Math.max(0, alpha));
      for (let i = 0; i < n; i++) {
        const a = prev.players[i] ?? next.players[i], b = next.players[i];
        const x = snapOr(a.x, b.x, t), y = snapOr(a.y, b.y, t);
        pos[i].x = x; pos[i].y = y;
        const fx = lerp(a.fx, b.fx, t), fy = lerp(a.fy, b.fy, t);
        const f = figs[i];
        f.root.position.set(x, 0, y);
        if (fx * fx + fy * fy > 1e-4) f.root.rotation.y = Math.atan2(fx, fy);
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        f.phase += sp * dt * RUN_FREQ;
        const run = Math.min(1, sp / 3.5);
        const kick = b.kickTicks > 0 ? KICK_LEAN * (b.kickTicks / RULES3D.kickAnim) : 0;
        f.inner.position.y = Math.abs(Math.sin(f.phase)) * BOB * run;
        f.inner.rotation.x = kick + (f.legL ? 0.06 : 0.14) * run;   // 다리가 따로 안 움직이는 그림이면 더 기울여 달리는 티를 낸다
        if (f.legL) f.legL.rotation.x = Math.sin(f.phase) * LEG_SWING * run;
        if (f.legR) f.legR.rotation.x = 0 - Math.sin(f.phase) * LEG_SWING * run;
        tmpM.compose(tmpV.set(x, 0.006, y), tmpQ.identity(), tmpS.set(1, 1, 1));
        rings.setMatrixAt(i, tmpM);
        tmpM.compose(tmpV.set(x, 0.004, y), tmpQ.identity(), tmpS.set(0.55, 1, 0.55));
        shadows.setMatrixAt(i, tmpM);
      }
      // 공(높이 z → three 의 y)
      const pb = prev.ball, nb = next.ball;
      const bx = snapOr(pb.x, nb.x, t), by = snapOr(pb.y, nb.y, t), bz = snapOr(pb.z, nb.z, t);
      ball.position.set(bx, bz, by);
      const sp = Math.sqrt(nb.vx * nb.vx + nb.vy * nb.vy);
      if (sp > 0.05 && dt > 0) {
        axis.set(nb.vy, 0, 0 - nb.vx).normalize();
        spin.setFromAxisAngle(axis, (sp * dt) / BR);
        ball.quaternion.premultiply(spin);
      }
      const hs = (BR * 1.5) / (1 + (bz - BR) * 0.35);   // 높이 뜰수록 그림자가 작아진다 — 공이 얼마나 떴는지 읽는 단서
      tmpM.compose(tmpV.set(bx, 0.005, by), tmpQ.identity(), tmpS.set(hs, 1, hs));
      shadows.setMatrixAt(n, tmpM);
      rings.instanceMatrix.needsUpdate = true;
      shadows.instanceMatrix.needsUpdate = true;
      // 내 선수 표시
      const me = humanId >= 0 ? pos[humanId] : null;
      if (me) { marker.visible = true; marker.position.set(me.x, 2.0 + Math.sin(time * 4) * 0.05, me.y); } else marker.visible = false;
      // 카메라 — 가려는 자리로 천천히(가로/세로가 바뀌어도 튀지 않게)
      const g = cameraGoal(portrait, camera.aspect, { x: bx, y: by }, me);
      goalPos.set(g.px, g.pz, g.py); goalLook.set(g.lx, g.lz, g.ly);
      const k = snapCamera ? 1 : 1 - Math.exp(0 - CAM_EASE * Math.min(0.1, dt));
      camera.position.lerp(goalPos, k);
      look.lerp(goalLook, k);
      if (Math.abs(camera.fov - g.fov) > 0.01) { camera.fov += (g.fov - camera.fov) * k; camera.updateProjectionMatrix(); }
      camera.lookAt(look);
    },
    render() {
      renderer.render(scene, camera);
      lastInfo = { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    setPixelRatio(r) { renderer.setPixelRatio(r); },
    groundForward() {
      camera.getWorldDirection(tmpV);
      return { x: tmpV.x, y: tmpV.z };
    },
    headPoint(i, out) { const p = pos[i]; return out.set(p?.x ?? 0, 2.3, p?.y ?? 0); },   // 내 선수 표시(2.0) 위
    footPoint(i, out) { const p = pos[i]; return out.set(p?.x ?? 0, 0, p?.y ?? 0); },
    info: () => lastInfo,
    dispose() {
      const mats = new Set<Material>();
      scene.traverse((o: Object3D) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
        const mm = m.material as Material | Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => mats.add(x)); else if (mm) mats.add(mm);
      });
      mats.forEach((m) => m.dispose());
      rings.dispose(); shadows.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
