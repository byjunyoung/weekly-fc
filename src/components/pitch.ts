// src/components/pitch.ts — tactics-board 엔진 이식. 원본: byjunyoung/tactics-board index.html
import type { PitchState, PitchPlayer } from './lineup-svg';

export type PitchApi = {
  getState(): PitchState;
  setState(s: PitchState): void;
  loadSquad(team: 'home' | 'away', players: { n: number; name: string; pos: string }[]): void;
  setMode(m: 'soccer' | 'futsal'): void;
  setCount(n: number): void;
};

type P = { n: number; pos: string; name?: string; _norm: [number, number]; x: number; y: number };
type Ball = { _norm: [number, number]; x: number; y: number };
type Hit = { team: 'home' | 'away'; idx: number };
type FormSpec = { n: number; pos: string; xy: number[] };
type DragMove = { type: 'move'; startX: number; startY: number; moved: boolean; team: 'home' | 'away'; idx: number; ox: number; oy: number };
type DragBall = { type: 'ball'; startX: number; startY: number; moved: boolean; ox: number; oy: number };
type DragDraw = { type: 'arrow' | 'zone' | 'pen'; startX: number; startY: number; moved: boolean };
type DragState = DragMove | DragBall | DragDraw;

export function initPitch(root: HTMLElement): PitchApi {
// ── FORMATION DATA ────────────────────────────────────────────────────
// Curated list: common formations per player count
const CURATED: Record<number, string[]> = {
  11: ['4-3-3','4-4-2','4-2-3-1','3-5-2','5-3-2','4-5-1','3-4-3'],
  7:  ['2-3-1','3-2-1','2-2-2'],
  5:  ['1-2-1','2-2','3-1','1-3'],
};
const FORMATION_LABELS: Record<string, string> = {
  '4-3-3':'4–3–3', '4-4-2':'4–4–2', '4-2-3-1':'4–2–3–1',
  '3-5-2':'3–5–2', '5-3-2':'5–3–2', '4-5-1':'4–5–1', '3-4-3':'3–4–3',
  '2-3-1':'2–3–1', '3-2-1':'3–2–1', '2-2-2':'2–2–2',
  '1-2-1':'1–2–1 (다이아몬드)', '2-2':'2–2 (박스)', '3-1':'3–1 (수비형)', '1-3':'1–3 (공격형)',
};

const PRESETS: Record<number, { key: string; p: FormSpec[] }[]> = {
  11: [
    { key:'4-3-3', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:2,pos:'RB',xy:[.82,.78]},{n:5,pos:'CB',xy:[.62,.79]},{n:6,pos:'CB',xy:[.38,.79]},{n:3,pos:'LB',xy:[.18,.78]},
      {n:8,pos:'CM',xy:[.72,.57]},{n:4,pos:'CDM',xy:[.50,.54]},{n:10,pos:'CM',xy:[.28,.57]},
      {n:7,pos:'RW',xy:[.78,.28]},{n:9,pos:'ST',xy:[.50,.23]},{n:11,pos:'LW',xy:[.22,.28]}
    ]},
    { key:'4-4-2', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:2,pos:'RB',xy:[.82,.78]},{n:5,pos:'CB',xy:[.62,.80]},{n:6,pos:'CB',xy:[.38,.80]},{n:3,pos:'LB',xy:[.18,.78]},
      {n:7,pos:'RM',xy:[.82,.55]},{n:8,pos:'CM',xy:[.62,.53]},{n:4,pos:'CM',xy:[.38,.53]},{n:11,pos:'LM',xy:[.18,.55]},
      {n:9,pos:'ST',xy:[.62,.27]},{n:10,pos:'ST',xy:[.38,.27]}
    ]},
    { key:'4-2-3-1', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:2,pos:'RB',xy:[.82,.78]},{n:5,pos:'CB',xy:[.62,.79]},{n:6,pos:'CB',xy:[.38,.79]},{n:3,pos:'LB',xy:[.18,.78]},
      {n:4,pos:'CDM',xy:[.63,.62]},{n:8,pos:'CDM',xy:[.37,.62]},
      {n:7,pos:'RAM',xy:[.78,.42]},{n:10,pos:'CAM',xy:[.50,.40]},{n:11,pos:'LAM',xy:[.22,.42]},
      {n:9,pos:'ST',xy:[.50,.22]}
    ]},
    { key:'3-5-2', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:5,pos:'CB',xy:[.70,.80]},{n:4,pos:'CB',xy:[.50,.82]},{n:6,pos:'CB',xy:[.30,.80]},
      {n:2,pos:'WB',xy:[.88,.58]},{n:8,pos:'CM',xy:[.67,.55]},{n:10,pos:'CM',xy:[.50,.52]},{n:7,pos:'CM',xy:[.33,.55]},{n:3,pos:'WB',xy:[.12,.58]},
      {n:9,pos:'ST',xy:[.62,.25]},{n:11,pos:'ST',xy:[.38,.25]}
    ]},
    { key:'5-3-2', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:2,pos:'RWB',xy:[.88,.74]},{n:4,pos:'CB',xy:[.71,.80]},{n:5,pos:'CB',xy:[.50,.82]},{n:6,pos:'CB',xy:[.29,.80]},{n:3,pos:'LWB',xy:[.12,.74]},
      {n:8,pos:'CM',xy:[.67,.55]},{n:10,pos:'CM',xy:[.50,.53]},{n:7,pos:'CM',xy:[.33,.55]},
      {n:9,pos:'ST',xy:[.63,.25]},{n:11,pos:'ST',xy:[.37,.25]}
    ]},
    { key:'4-5-1', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:2,pos:'RB',xy:[.82,.78]},{n:5,pos:'CB',xy:[.62,.79]},{n:6,pos:'CB',xy:[.38,.79]},{n:3,pos:'LB',xy:[.18,.78]},
      {n:7,pos:'RM',xy:[.88,.53]},{n:8,pos:'CM',xy:[.70,.51]},{n:4,pos:'CM',xy:[.50,.49]},{n:10,pos:'CM',xy:[.30,.51]},{n:11,pos:'LM',xy:[.12,.53]},
      {n:9,pos:'ST',xy:[.50,.22]}
    ]},
    { key:'3-4-3', p:[
      {n:1,pos:'GK',xy:[.50,.94]},
      {n:5,pos:'CB',xy:[.70,.80]},{n:4,pos:'CB',xy:[.50,.82]},{n:6,pos:'CB',xy:[.30,.80]},
      {n:2,pos:'RM',xy:[.82,.57]},{n:8,pos:'CM',xy:[.60,.55]},{n:10,pos:'CM',xy:[.40,.55]},{n:3,pos:'LM',xy:[.18,.57]},
      {n:7,pos:'RW',xy:[.78,.28]},{n:9,pos:'ST',xy:[.50,.23]},{n:11,pos:'LW',xy:[.22,.28]}
    ]},
  ],

  7: [
    { key:'2-3-1', p:[
      {n:1,pos:'GK',xy:[.50,.93]},
      {n:4,pos:'CB',xy:[.66,.76]},{n:5,pos:'CB',xy:[.34,.76]},
      {n:2,pos:'RM',xy:[.80,.52]},{n:8,pos:'CM',xy:[.50,.50]},{n:3,pos:'LM',xy:[.20,.52]},
      {n:9,pos:'ST',xy:[.50,.25]}
    ]},
    { key:'3-2-1', p:[
      {n:1,pos:'GK',xy:[.50,.93]},
      {n:2,pos:'RB',xy:[.75,.76]},{n:5,pos:'CB',xy:[.50,.78]},{n:3,pos:'LB',xy:[.25,.76]},
      {n:8,pos:'CM',xy:[.64,.52]},{n:10,pos:'CM',xy:[.36,.52]},
      {n:9,pos:'ST',xy:[.50,.25]}
    ]},
    { key:'2-2-2', p:[
      {n:1,pos:'GK',xy:[.50,.93]},
      {n:4,pos:'CB',xy:[.65,.76]},{n:5,pos:'CB',xy:[.35,.76]},
      {n:8,pos:'CM',xy:[.65,.52]},{n:10,pos:'CM',xy:[.35,.52]},
      {n:9,pos:'ST',xy:[.65,.27]},{n:11,pos:'ST',xy:[.35,.27]}
    ]},
  ],

  5: [
    { key:'1-2-1', p:[
      {n:1,pos:'GK',xy:[.50,.92]},
      {n:4,pos:'FIX',xy:[.50,.67]},
      {n:2,pos:'ALA',xy:[.75,.45]},{n:3,pos:'ALA',xy:[.25,.45]},
      {n:9,pos:'PVT',xy:[.50,.23]}
    ]},
    { key:'2-2', p:[
      {n:1,pos:'GK',xy:[.50,.92]},
      {n:4,pos:'FD',xy:[.68,.67]},{n:5,pos:'FD',xy:[.32,.67]},
      {n:2,pos:'ALA',xy:[.68,.35]},{n:3,pos:'ALA',xy:[.32,.35]}
    ]},
    { key:'3-1', p:[
      {n:1,pos:'GK',xy:[.50,.92]},
      {n:4,pos:'FD',xy:[.72,.67]},{n:5,pos:'FD',xy:[.50,.72]},{n:3,pos:'FD',xy:[.28,.67]},
      {n:9,pos:'PVT',xy:[.50,.28]}
    ]},
    { key:'1-3', p:[
      {n:1,pos:'GK',xy:[.50,.92]},
      {n:4,pos:'FIX',xy:[.50,.70]},
      {n:7,pos:'ALA',xy:[.75,.38]},{n:9,pos:'PVT',xy:[.50,.28]},{n:11,pos:'ALA',xy:[.25,.38]}
    ]},
  ],
};

// ── FORMATION UTILS ───────────────────────────────────────────────────
function autoFormCoords(rows: number[]): FormSpec[] {
  const ROW_Y: Record<number, number[]> = {1:[.50],2:[.74,.30],3:[.77,.53,.28],4:[.79,.61,.43,.24]};
  const ys = ROW_Y[rows.length] || [.50];
  const posLabel = (r: number) => r===0?'DEF':r===rows.length-1?'FWD':'MID';
  const players: FormSpec[] = [{n:1,pos:'GK',xy:[.5,.93]}];
  let num = 2;
  rows.forEach((count,r) => {
    for (let i=0;i<count;i++) {
      const margin = [.32,.22,.16,.13,.10][count-1]??0.10;
      const x = count===1 ? .5 : margin+(1-2*margin)/(count-1)*i;
      players.push({n:num++, pos:posLabel(r), xy:[x,ys[r]]});
    }
  });
  return players;
}

function listFormations(n: number): { key: string; label: string }[] {
  if (n <= 1) return [{key:'gk', label:'GK 단독'}];
  const curated = CURATED[n];
  if (curated) return curated.map(k => ({key:k, label:FORMATION_LABELS[k]||k.replace(/-/g,'–')}));
  // 그 외 인원수: 간단한 자동 생성 (최대 5개)
  const out = n - 1, maxRows = Math.min(3, out);
  const found: number[][] = [];
  function gen(rem: number, rl: number, cur: number[]) {
    if (rem===0&&cur.length>0){found.push([...cur]);return;}
    if (rl===0||rem===0) return;
    const mx=Math.min(Math.min(5,rem),rem-Math.max(0,rl-1));
    for(let i=1;i<=mx;i++){cur.push(i);gen(rem-i,rl-1,cur);cur.pop();}
  }
  gen(out, maxRows, []);
  found.sort((a,b)=>a.length!==b.length?a.length-b.length:b[0]-a[0]);
  return found.slice(0,5).map(rows=>({key:rows.join('-'),label:rows.join('–')}));
}

function coordsForFormation(key: string): FormSpec[] {
  if (key==='gk') return [{n:1,pos:'GK',xy:[.5,.93]}];
  const preset = (PRESETS[playerCount]||[]).find(p=>p.key===key);
  if (preset) return preset.p.map(p=>({...p}));
  const rows = key.split('-').map(Number);
  if (rows.some(isNaN)||rows.reduce((a,b)=>a+b,0)!==playerCount-1)
    return autoFormCoords(listFormations(playerCount)[0]?.key.split('-').map(Number)||[playerCount-1]);
  return autoFormCoords(rows);
}

// ── STATE ─────────────────────────────────────────────────────────────
let mode: 'soccer' | 'futsal' = 'soccer';
let playerCount = 11;
let zoom = 1.0;
let homePlayers: P[] = [];
let awayPlayers: P[] = [];
let arrows: { fx: number; fy: number; tx: number; ty: number }[] = [];
let zones: { x: number; y: number; w: number; h: number }[] = [];
let paths: { x: number; y: number }[][] = [];
let currentPath: { x: number; y: number }[] | null = null;
let ball: Ball = {_norm:[.5,.5], x:0, y:0};
let homeColor = '#ffffff';
let awayColor = '#1a1a1a';
let activeTool: 'arrow' | 'zone' | 'pen' = 'arrow'; // 'arrow' | 'zone'
let orientation: 'portrait' | 'landscape' = 'portrait'; // 'portrait' | 'landscape'

// Drag state
let dragState: DragState | null = null;
// {
//   type: 'move' | 'arrow' | 'zone',
//   startX, startY,   // canvas coords at start
//   moved: bool,
//   // move: team, idx, ox, oy
//   // arrow/zone: fx, fy
// }

// Player edit
let editTarget: Hit | null = null; // {team, idx}

let mousePos = {x:0, y:0};

// ── CANVAS ────────────────────────────────────────────────────────────
const canvas = root.querySelector<HTMLCanvasElement>('#pitch')!;
const ctx = canvas.getContext('2d')!;
const container = root.querySelector<HTMLElement>('#pitch-container')!;

function pitchRatio(): number {
  if (mode === 'futsal') return orientation === 'landscape' ? 40/20 : 20/40;
  return orientation === 'landscape' ? 105/68 : 68/105;
}

function resize(): void {
  const headerH = root.querySelector<HTMLElement>('header')!.offsetHeight;
  const footerH = root.querySelector<HTMLElement>('footer')!.offsetHeight;
  const pad = 32;
  const avH = window.innerHeight - headerH - footerH - pad;
  const avW = window.innerWidth - pad;
  const ratio = pitchRatio();
  let h = avH, w = h * ratio;
  if (w > avW) { w = avW; h = w / ratio; }
  canvas.width = Math.floor(w * zoom);
  canvas.height = Math.floor(h * zoom);
  container.style.width = canvas.width + 'px';
  container.style.height = canvas.height + 'px';
  positionPlayersFromNorm();
  render();
}

// ── PLAYERS ───────────────────────────────────────────────────────────
function normToCanvas(xy: [number, number]): { x: number; y: number } { return {x:xy[0]*canvas.width, y:xy[1]*canvas.height}; }

function positionPlayersFromNorm(): void {
  homePlayers.forEach(p=>{ const c=normToCanvas(p._norm); p.x=c.x; p.y=c.y; });
  awayPlayers.forEach(p=>{ const c=normToCanvas(p._norm); p.x=c.x; p.y=c.y; });
  const cb=normToCanvas(ball._norm); ball.x=cb.x; ball.y=cb.y;
}

function buildPlayers(key: string, mirror: boolean): P[] {
  const specs = coordsForFormation(key);
  return specs.map(s=>{
    let norm: [number, number] = mirror ? [s.xy[0], 1-s.xy[1]] : [s.xy[0], s.xy[1]];
    // Formation data is always in portrait space; transform if landscape
    if (orientation === 'landscape') {
      norm = [norm[1], 1 - norm[0]];
    }
    const c = normToCanvas(norm);
    return {n:s.n, pos:s.pos, _norm:norm, x:c.x, y:c.y};
  });
}

function buildFormSelects(): void {
  const options = listFormations(playerCount);
  ['home-form','away-form'].forEach(id=>{
    const sel = root.querySelector<HTMLSelectElement>('#'+id)!;
    const prev = sel.value;
    sel.innerHTML = '';
    options.forEach(({key,label})=>{
      const opt = document.createElement('option');
      opt.value=key; opt.textContent=label; sel.appendChild(opt);
    });
    if ([...sel.options].some(o=>o.value===prev)) sel.value = prev;
  });
}

function applyFormation(team: 'home' | 'away', key: string): void {
  if (team==='home') homePlayers = buildPlayers(key, false);
  else awayPlayers = buildPlayers(key, true);
  arrows=[]; zones=[]; paths=[]; ball={_norm:[.5,.5],x:0,y:0}; render();
}

function initBoard(): void {
  buildFormSelects();
  const firstKey = ()=>listFormations(playerCount)[0]?.key||'gk';
  homePlayers = buildPlayers((root.querySelector('#home-form') as HTMLSelectElement).value||firstKey(), false);
  awayPlayers = buildPlayers((root.querySelector('#away-form') as HTMLSelectElement).value||firstKey(), true);
  arrows=[]; zones=[]; paths=[]; render();
}

function toggleOrientation(): void {
  // Transform all player positions
  const toL = (n: [number, number]): [number, number] => [n[1], 1 - n[0]];
  const toP = (n: [number, number]): [number, number] => [1 - n[1], n[0]];
  const fn = orientation === 'portrait' ? toL : toP;
  homePlayers.forEach(p => { p._norm = fn(p._norm); });
  awayPlayers.forEach(p => { p._norm = fn(p._norm); });
  ball._norm = fn(ball._norm);
  arrows = []; zones = []; paths = [];
  orientation = orientation === 'portrait' ? 'landscape' : 'portrait';
  updateOrientBtn();
  resize();
}

function updateOrientBtn(): void {
  const btn = root.querySelector<HTMLElement>('#orient-btn');
  if (!btn) return;
  btn.textContent = orientation === 'landscape' ? '↕' : '↔';
  btn.title = orientation === 'landscape' ? '세로형으로 전환' : '가로형으로 전환';
}

function getPlayer(team: 'home' | 'away', idx: number): P { return team==='home'?homePlayers[idx]:awayPlayers[idx]; }

function playerAt(x: number, y: number): Hit | null {
  const r2 = (Math.max(10, Math.min(14, canvas.width*.035)) + 4) ** 2;
  for (let i=homePlayers.length-1;i>=0;i--) {
    const p=homePlayers[i]; if((x-p.x)**2+(y-p.y)**2<r2) return {team:'home',idx:i};
  }
  for (let i=awayPlayers.length-1;i>=0;i--) {
    const p=awayPlayers[i]; if((x-p.x)**2+(y-p.y)**2<r2) return {team:'away',idx:i};
  }
  return null;
}

// ── PITCH DRAWING (simplified) ────────────────────────────────────────
function drawSoccerPitch(): void {
  const W=canvas.width, H=canvas.height;
  const lc='rgba(255,255,255,.32)';
  ctx.fillStyle='#2A4D35'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=lc; ctx.lineWidth=1.5;

  const px=W*.06, py=H*.04;
  const fw=W-px*2, fh=H-py*2;

  // Field outline
  ctx.strokeRect(px, py, fw, fh);
  // Center line
  ctx.beginPath(); ctx.moveTo(px, H/2); ctx.lineTo(W-px, H/2); ctx.stroke();
  // Center circle + dot
  ctx.beginPath(); ctx.arc(W/2, H/2, W*.12, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle=lc; ctx.beginPath(); ctx.arc(W/2, H/2, 2.5, 0, Math.PI*2); ctx.fill();

  // Penalty areas
  const pw=W*.50, ph=H*.155;
  ctx.strokeStyle=lc;
  ctx.strokeRect((W-pw)/2, py, pw, ph);
  ctx.strokeRect((W-pw)/2, H-py-ph, pw, ph);

  // Goal areas
  const gw=W*.26, gh=H*.055;
  ctx.strokeRect((W-gw)/2, py, gw, gh);
  ctx.strokeRect((W-gw)/2, H-py-gh, gw, gh);

  // Goals
  const glw=W*.13, glh=H*.022;
  ctx.strokeStyle='rgba(255,255,255,.5)';
  ctx.strokeRect((W-glw)/2, py-glh, glw, glh);
  ctx.strokeRect((W-glw)/2, H-py, glw, glh);

  // Penalty spots
  ctx.fillStyle=lc;
  ctx.beginPath(); ctx.arc(W/2, py+H*.11, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W/2, H-py-H*.11, 2.5, 0, Math.PI*2); ctx.fill();

  // Penalty arcs
  ctx.strokeStyle=lc;
  ctx.beginPath(); ctx.arc(W/2, py+H*.11, W*.12, .18*Math.PI, .82*Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H-py-H*.11, W*.12, 1.18*Math.PI, 1.82*Math.PI); ctx.stroke();
}

function drawFutsalPitch(): void {
  const W=canvas.width, H=canvas.height;
  const lc='rgba(255,255,255,.32)';
  ctx.fillStyle='#1F4030'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=lc; ctx.lineWidth=1.5;

  const px=W*.07, py=H*.04;
  ctx.strokeRect(px, py, W-px*2, H-py*2);
  ctx.beginPath(); ctx.moveTo(px, H/2); ctx.lineTo(W-px, H/2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, W*.15, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle=lc; ctx.beginPath(); ctx.arc(W/2, H/2, 3, 0, Math.PI*2); ctx.fill();

  // D-arcs
  const r=W*.30;
  ctx.beginPath(); ctx.arc(W/2, py, r, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H-py, r, Math.PI, Math.PI*2); ctx.stroke();

  // Goals
  const gw=W*.22, gh=H*.03;
  ctx.strokeStyle='rgba(255,255,255,.5)';
  ctx.strokeRect((W-gw)/2, py-gh, gw, gh);
  ctx.strokeRect((W-gw)/2, H-py, gw, gh);

  // Spots
  ctx.fillStyle=lc;
  ctx.beginPath(); ctx.arc(W/2, py+H*.12, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W/2, H-py-H*.12, 2.5, 0, Math.PI*2); ctx.fill();
}

function drawSoccerPitchLandscape(): void {
  const W=canvas.width, H=canvas.height;
  const lc='rgba(255,255,255,.32)';
  ctx.fillStyle='#2A4D35'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=lc; ctx.lineWidth=1.5;
  const px=W*.04, py=H*.06;
  // Field outline
  ctx.strokeRect(px, py, W-px*2, H-py*2);
  // Center line (vertical)
  ctx.beginPath(); ctx.moveTo(W/2, py); ctx.lineTo(W/2, H-py); ctx.stroke();
  // Center circle + dot
  ctx.beginPath(); ctx.arc(W/2, H/2, H*.12, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle=lc; ctx.beginPath(); ctx.arc(W/2, H/2, 2.5, 0, Math.PI*2); ctx.fill();
  // Penalty areas (left and right)
  const paD=W*.155, paW=H*.50;
  ctx.strokeStyle=lc;
  ctx.strokeRect(px, (H-paW)/2, paD, paW);
  ctx.strokeRect(W-px-paD, (H-paW)/2, paD, paW);
  // Goal areas
  const gaD=W*.055, gaW=H*.26;
  ctx.strokeRect(px, (H-gaW)/2, gaD, gaW);
  ctx.strokeRect(W-px-gaD, (H-gaW)/2, gaD, gaW);
  // Goals
  const goD=W*.022, goW=H*.13;
  ctx.strokeStyle='rgba(255,255,255,.5)';
  ctx.strokeRect(px-goD, (H-goW)/2, goD, goW);
  ctx.strokeRect(W-px, (H-goW)/2, goD, goW);
  // Penalty spots
  ctx.fillStyle=lc;
  ctx.beginPath(); ctx.arc(px+W*.11, H/2, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W-px-W*.11, H/2, 2.5, 0, Math.PI*2); ctx.fill();
  // Penalty arcs
  ctx.strokeStyle=lc;
  ctx.beginPath(); ctx.arc(px+W*.11, H/2, H*.12, -.32*Math.PI, .32*Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(W-px-W*.11, H/2, H*.12, .68*Math.PI, 1.32*Math.PI); ctx.stroke();
}

function drawFutsalPitchLandscape(): void {
  const W=canvas.width, H=canvas.height;
  const lc='rgba(255,255,255,.32)';
  ctx.fillStyle='#1F4030'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=lc; ctx.lineWidth=1.5;
  const px=W*.04, py=H*.07;
  ctx.strokeRect(px, py, W-px*2, H-py*2);
  // Center line (vertical)
  ctx.beginPath(); ctx.moveTo(W/2, py); ctx.lineTo(W/2, H-py); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, H*.15, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle=lc; ctx.beginPath(); ctx.arc(W/2, H/2, 3, 0, Math.PI*2); ctx.fill();
  // D-arcs (left and right)
  const r=H*.30;
  ctx.beginPath(); ctx.arc(px, H/2, r, -Math.PI/2, Math.PI/2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W-px, H/2, r, Math.PI/2, Math.PI*1.5); ctx.stroke();
  // Goals
  const goD=W*.03, goW=H*.22;
  ctx.strokeStyle='rgba(255,255,255,.5)';
  ctx.strokeRect(px-goD, (H-goW)/2, goD, goW);
  ctx.strokeRect(W-px, (H-goW)/2, goD, goW);
  // Spots
  ctx.fillStyle=lc;
  ctx.beginPath(); ctx.arc(px+W*.12, H/2, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W-px-W*.12, H/2, 2.5, 0, Math.PI*2); ctx.fill();
}

// ── PLAYER / ARROW / ZONE DRAWING ────────────────────────────────────
function colorLuminance(hex: string): number {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return 0.299*r + 0.587*g + 0.114*b;
}

function drawPlayer(p: P, isHome: boolean): void {
  const r = Math.max(10, Math.min(14, canvas.width*.035));
  const fill = isHome ? homeColor : awayColor;
  const bright = colorLuminance(fill);
  const numColor = bright > 140 ? '#111' : '#fff';
  const strokeColor = bright > 140 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.2)';

  ctx.save();
  ctx.fillStyle=fill;
  ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
  ctx.shadowColor='transparent';
  ctx.strokeStyle=strokeColor; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.stroke();

  ctx.fillStyle=numColor;
  ctx.font=`bold ${Math.round(r*.85)}px Helvetica Neue,sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(String(p.n), p.x, p.y);
  if (p.name) { ctx.font = `${Math.max(9, r * 0.8)}px ${getComputedStyle(root).fontFamily}`; ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.textAlign = 'center'; ctx.fillText(p.name, p.x, p.y + r + 11); }
  if (p.pos) {
    ctx.font=`${Math.round(r*.62)}px Helvetica Neue,sans-serif`;
    ctx.fillStyle='rgba(255,255,255,.7)';
    ctx.fillText(p.pos, p.x, p.y+r+r*.65);
  }
  ctx.restore();
}

function drawBall(b: Ball): void {
  const r = Math.max(11, Math.min(15, canvas.width * .030));
  const size = Math.round(r * 2);
  const pad = r;
  // Render emoji to offscreen canvas first, then drawImage with shadow
  const ofc = document.createElement('canvas');
  ofc.width = size + pad*2; ofc.height = size + pad*2;
  const ofctx = ofc.getContext('2d')!;
  ofctx.font = `${size}px serif`;
  ofctx.textAlign = 'center';
  ofctx.textBaseline = 'middle';
  ofctx.fillText('⚽', ofc.width/2, ofc.height/2);
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=7; ctx.shadowOffsetY=2;
  ctx.drawImage(ofc, b.x - ofc.width/2, b.y - ofc.height/2);
  ctx.restore();
}

function ballAt(x: number, y: number): boolean {
  const r=Math.max(11,Math.min(15,canvas.width*.030));
  return (x-ball.x)**2+(y-ball.y)**2 < r*r;
}

function drawArrow(x1: number, y1: number, x2: number, y2: number, dashed = false): void {
  const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy);
  if (len<8) return;
  const ux=dx/len, uy=dy/len;
  const hl=Math.min(14,len*.32);
  ctx.strokeStyle='#E8C84A'; ctx.fillStyle='#E8C84A'; ctx.lineWidth=2;
  if (dashed) ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2-ux*hl*.5, y2-uy*hl*.5); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-ux*hl-uy*hl*.4, y2-uy*hl+ux*hl*.4);
  ctx.lineTo(x2-ux*hl+uy*hl*.4, y2-uy*hl-ux*hl*.4);
  ctx.closePath(); ctx.fill();
}

function drawPath(pts: { x: number; y: number }[], preview = false): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#E8C84A';
  ctx.lineWidth = preview ? 1.5 : 2;
  ctx.globalAlpha = preview ? 0.7 : 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i+1].x) / 2;
    const my = (pts[i].y + pts[i+1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
  ctx.stroke();
  ctx.restore();
}

function drawZone(x: number, y: number, w: number, h: number, preview = false): void {
  ctx.fillStyle='rgba(232,200,74,.12)';
  ctx.strokeStyle=preview?'rgba(232,200,74,.7)':'rgba(232,200,74,.5)';
  ctx.lineWidth=1.5;
  if (preview) ctx.setLineDash([5,4]);
  ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
  ctx.setLineDash([]);
}

function render(): void {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (mode==='futsal') {
    orientation==='landscape' ? drawFutsalPitchLandscape() : drawFutsalPitch();
  } else {
    orientation==='landscape' ? drawSoccerPitchLandscape() : drawSoccerPitch();
  }

  // Committed zones
  zones.forEach(z=>drawZone(z.x,z.y,z.w,z.h));

  // Freehand paths
  paths.forEach(pts=>drawPath(pts));
  if (currentPath && currentPath.length > 1) drawPath(currentPath, true);

  // Committed arrows
  arrows.forEach(a=>drawArrow(a.fx,a.fy,a.tx,a.ty));

  // Live drag preview
  if (dragState && dragState.type==='arrow') {
    const dx=mousePos.x-dragState.startX, dy=mousePos.y-dragState.startY;
    if (Math.sqrt(dx*dx+dy*dy)>8)
      drawArrow(dragState.startX,dragState.startY,mousePos.x,mousePos.y,true);
  }
  if (dragState && dragState.type==='zone') {
    const x=Math.min(dragState.startX,mousePos.x), y=Math.min(dragState.startY,mousePos.y);
    const w=Math.abs(mousePos.x-dragState.startX), h=Math.abs(mousePos.y-dragState.startY);
    if (w>4||h>4) drawZone(x,y,w,h,true);
  }

  // Ball (behind players)
  drawBall(ball);

  // Players
  awayPlayers.forEach(p=>drawPlayer(p,false));
  homePlayers.forEach(p=>drawPlayer(p,true));
}

// ── CANVAS COORDS ─────────────────────────────────────────────────────
function canvasXY(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*(canvas.width/r.width), y:(e.clientY-r.top)*(canvas.height/r.height)};
}

// ── MOUSE EVENTS ──────────────────────────────────────────────────────
canvas.addEventListener('contextmenu', e=>e.preventDefault());

canvas.addEventListener('mousedown', e=>{
  if (editTarget) { closePlayerEdit(); return; }
  const {x,y}=canvasXY(e);
  const hit=playerAt(x,y);

  if (e.button===2) {
    if (hit) {
      openPlayerEdit(hit.team, hit.idx, e.clientX, e.clientY);
    } else {
      dragState={type:'zone',startX:x,startY:y,moved:false};
    }
    return;
  }
  if (e.button!==0) return;

  if (hit) {
    const p=getPlayer(hit.team,hit.idx);
    dragState={type:'move',startX:x,startY:y,moved:false,team:hit.team,idx:hit.idx,ox:p.x-x,oy:p.y-y};
  } else if (ballAt(x,y)) {
    dragState={type:'ball',startX:x,startY:y,moved:false,ox:ball.x-x,oy:ball.y-y};
  } else {
    dragState={type:activeTool,startX:x,startY:y,moved:false};
    if (activeTool==='pen') currentPath=[{x,y}];
  }
});

canvas.addEventListener('mousemove', e=>{
  const {x,y}=canvasXY(e);
  mousePos={x,y};

  if (dragState) {
    const dx=x-dragState.startX, dy=y-dragState.startY;
    if (Math.sqrt(dx*dx+dy*dy)>4) dragState.moved=true;

    if (dragState.type==='move') {
      const p=getPlayer(dragState.team,dragState.idx);
      p.x=x+dragState.ox; p.y=y+dragState.oy;
      p._norm=[p.x/canvas.width, p.y/canvas.height];
    } else if (dragState.type==='ball') {
      ball.x=x+dragState.ox; ball.y=y+dragState.oy;
      ball._norm=[ball.x/canvas.width, ball.y/canvas.height];
    } else if (dragState.type==='pen' && currentPath) {
      const last=currentPath[currentPath.length-1];
      const dx=x-last.x, dy=y-last.y;
      if (dx*dx+dy*dy>4) currentPath.push({x,y});
    }
  }
  render();

  // Tooltip
  const tip=root.querySelector<HTMLElement>('#tip')!;
  const hit=playerAt(x,y);
  if (!dragState && hit) {
    const p=getPlayer(hit.team,hit.idx);
    tip.textContent=`${hit.team==='home'?'Home':'Away'} #${p.n}${p.pos?' · '+p.pos:''} — 우클릭: 수정`;
    tip.style.opacity='1'; tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY-28)+'px';
  } else if (!dragState && ballAt(x,y)) {
    tip.textContent='공 — 드래그로 이동';
    tip.style.opacity='1'; tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY-28)+'px';
  } else {
    tip.style.opacity='0';
  }
});

canvas.addEventListener('mouseup', e=>{
  if (!dragState) return;
  const {x,y}=canvasXY(e);

  if (dragState.type==='move') {
    // just drop — edit via right-click
  } else if (dragState.type==='ball') {
    // just drop
  } else if (dragState.type==='pen') {
    if (currentPath && currentPath.length > 1) paths.push([...currentPath]);
    currentPath = null;
  } else if (dragState.type==='arrow') {
    const dx=x-dragState.startX, dy=y-dragState.startY;
    if (Math.sqrt(dx*dx+dy*dy)>12)
      arrows.push({fx:dragState.startX,fy:dragState.startY,tx:x,ty:y});
  } else if (dragState.type==='zone') {
    const rx=Math.min(dragState.startX,x), ry=Math.min(dragState.startY,y);
    const rw=Math.abs(x-dragState.startX), rh=Math.abs(y-dragState.startY);
    if (rw>8&&rh>8) zones.push({x:rx,y:ry,w:rw,h:rh});
  }

  dragState=null;
  render();
});

canvas.addEventListener('mouseleave', ()=>{
  root.querySelector<HTMLElement>('#tip')!.style.opacity='0';
  if(dragState&&dragState.type!=='move'){dragState=null;render();}
  // keep move drag alive if mouse leaves (snap back on enter)
});

document.addEventListener('keydown', e=>{
  if (e.key==='Escape') { dragState=null; closePlayerEdit(); render(); }
});

// Close editor on outside click
document.addEventListener('mousedown', e=>{
  const overlay=root.querySelector<HTMLElement>('#player-edit')!;
  if (editTarget && !overlay.contains(e.target as Node) && e.target!==canvas) closePlayerEdit();
});

// ── TOUCH ─────────────────────────────────────────────────────────────
let lastPinchDist: number | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressTarget: { hit: Hit; clientX: number; clientY: number } | null = null;
function pinchDist(t: TouchList): number {
  const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY;
  return Math.sqrt(dx*dx+dy*dy);
}
function mkMouse(type: string, touch: Touch, btn = 0): MouseEvent {
  return new MouseEvent(type,{clientX:touch.clientX,clientY:touch.clientY,button:btn,bubbles:true});
}
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(e.touches.length===2){lastPinchDist=pinchDist(e.touches);return;}
  const t=e.touches[0];
  const {x,y}=canvasXY(t);
  const hit=playerAt(x,y);
  if(hit){
    const target = {hit, clientX:t.clientX, clientY:t.clientY};
    longPressTarget=target;
    longPressTimer=setTimeout(()=>{
      dragState=null;
      openPlayerEdit(target.hit.team,target.hit.idx,target.clientX,target.clientY);
      longPressTarget=null;
    },500);
  }
  canvas.dispatchEvent(mkMouse('mousedown',t));
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===2){
    const d=pinchDist(e.touches);
    if(lastPinchDist) changeZoom((d-lastPinchDist)*0.005);
    lastPinchDist=d; return;
  }
  lastPinchDist=null;
  clearTimeout(longPressTimer); longPressTimer=undefined; longPressTarget=null;
  canvas.dispatchEvent(mkMouse('mousemove',e.touches[0]));
},{passive:false});
canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  lastPinchDist=null;
  clearTimeout(longPressTimer); longPressTimer=undefined;
  if(e.touches.length===0) canvas.dispatchEvent(mkMouse('mouseup',e.changedTouches[0]));
},{passive:false});

// ── PLAYER NUMBER EDIT ────────────────────────────────────────────────
function openPlayerEdit(team: 'home' | 'away', idx: number, clientX: number, clientY: number): void {
  editTarget={team,idx};
  const p=getPlayer(team,idx);
  const numInput=root.querySelector<HTMLInputElement>('#player-num-input')!;
  numInput.value=String(p.n);
  root.querySelector<HTMLInputElement>('#player-pos-input')!.value=p.pos||'';
  const overlay=root.querySelector<HTMLElement>('#player-edit')!;
  overlay.classList.add('show');
  // Position near tap point, keep within viewport
  const ow=145, oh=155;
  let lx=clientX+16, ly=clientY-20;
  if(lx+ow>window.innerWidth) lx=clientX-ow-8;
  if(ly+oh>window.innerHeight) ly=window.innerHeight-oh-8;
  if(ly<8) ly=8;
  overlay.style.left=lx+'px'; overlay.style.top=ly+'px';
  setTimeout(()=>{numInput.focus();numInput.select();},50);
}

function confirmPlayerEdit(): void {
  if (!editTarget) return;
  const val=parseInt(root.querySelector<HTMLInputElement>('#player-num-input')!.value,10);
  if (!isNaN(val)&&val>=1&&val<=99) getPlayer(editTarget.team,editTarget.idx).n=val;
  getPlayer(editTarget.team,editTarget.idx).pos=root.querySelector<HTMLInputElement>('#player-pos-input')!.value.trim();
  closePlayerEdit();
  render();
}

function closePlayerEdit(): void {
  editTarget=null;
  root.querySelector<HTMLElement>('#player-edit')!.classList.remove('show');
}

['player-num-input','player-pos-input'].forEach(id=>{
  root.querySelector<HTMLElement>('#'+id)!.addEventListener('keydown', e=>{
    if(e.key==='Enter') confirmPlayerEdit();
    if(e.key==='Escape') closePlayerEdit();
  });
});

// ── CONTROLS ─────────────────────────────────────────────────────────
function setTeamColor(team: 'home' | 'away', color: string): void {
  if (team==='home') homeColor=color;
  else awayColor=color;
  render();
}

function setTool(t: 'arrow' | 'zone' | 'pen'): void {
  activeTool=t;
  root.querySelector<HTMLElement>('#tool-arrow')!.classList.toggle('active',t==='arrow');
  root.querySelector<HTMLElement>('#tool-zone')!.classList.toggle('active',t==='zone');
  root.querySelector<HTMLElement>('#tool-pen')!.classList.toggle('active',t==='pen');
  const hints: Record<string,string>={
    arrow:'선수 드래그: 이동 · 빈 공간 드래그: 화살표 · 우클릭 드래그: 존 · 선수 우클릭: 수정',
    zone: '선수 드래그: 이동 · 빈 공간 드래그: 존 생성 · 우클릭 드래그: 존 · 선수 우클릭: 수정',
    pen:  '선수 드래그: 이동 · 빈 공간 드래그: 자유 드로잉 · 우클릭 드래그: 존 · 선수 우클릭: 수정',
  };
  root.querySelector<HTMLElement>('#hint-text')!.textContent=hints[t]||'';
}

function setMode(m: 'soccer' | 'futsal'): void {
  mode=m;
  root.querySelector<HTMLElement>('#m-soccer')!.classList.toggle('active',m==='soccer');
  root.querySelector<HTMLElement>('#m-futsal')!.classList.toggle('active',m==='futsal');
  playerCount=m==='futsal'?5:11;
  root.querySelector<HTMLElement>('#count-val')!.textContent=String(playerCount);
  buildFormSelects();
  const opts=listFormations(playerCount);
  (root.querySelector('#home-form') as HTMLSelectElement).value=opts[0]?.key||'gk';
  (root.querySelector('#away-form') as HTMLSelectElement).value=(opts[1]??opts[0])?.key||'gk';
  arrows=[]; zones=[]; paths=[];
  initBoard();
  resize();
}

function changeCount(delta: number): void {
  const next=Math.max(1,Math.min(15,playerCount+delta));
  if(next===playerCount) return;
  playerCount=next;
  root.querySelector<HTMLElement>('#count-val')!.textContent=String(playerCount);
  buildFormSelects(); initBoard(); resize();
}

function clearAll(): void { arrows=[]; zones=[]; paths=[]; currentPath=null; dragState=null; render(); }

function changeZoom(delta: number): void {
  zoom=Math.max(0.4,Math.min(4.0,zoom+delta));
  root.querySelector<HTMLElement>('#zoom-val')!.textContent=Math.round(zoom*100)+'%';
  resize();
}
function resetZoom(): void {
  zoom=1.0;
  root.querySelector<HTMLElement>('#zoom-val')!.textContent='100%';
  resize();
}

canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  changeZoom(e.deltaY<0?0.1:-0.1);
},{passive:false});

// ── BOOT ─────────────────────────────────────────────────────────────
window.addEventListener('resize', resize);
orientation = (root.clientWidth || window.innerWidth) > 640 ? 'landscape' : 'portrait';
buildFormSelects();
const initOpts=listFormations(playerCount);
(root.querySelector('#home-form') as HTMLSelectElement).value=initOpts[0]?.key||'gk';
(root.querySelector('#away-form') as HTMLSelectElement).value=(initOpts[1]??initOpts[0])?.key||'gk';
homePlayers=buildPlayers((root.querySelector('#home-form') as HTMLSelectElement).value,false);
awayPlayers=buildPlayers((root.querySelector('#away-form') as HTMLSelectElement).value,true);
updateOrientBtn();
resize();

const on = (sel: string, fn: (el: HTMLElement) => void) => root.querySelectorAll<HTMLElement>(sel).forEach(fn);
on('#m-soccer', (b) => (b.onclick = () => setMode('soccer'))); on('#m-futsal', (b) => (b.onclick = () => setMode('futsal')));
on('#home-form', (s) => ((s as HTMLSelectElement).onchange = () => applyFormation('home', (s as HTMLSelectElement).value)));
on('#away-form', (s) => ((s as HTMLSelectElement).onchange = () => applyFormation('away', (s as HTMLSelectElement).value)));
on('#home-color', (i) => ((i as HTMLInputElement).oninput = () => setTeamColor('home', (i as HTMLInputElement).value)));
on('#away-color', (i) => ((i as HTMLInputElement).oninput = () => setTeamColor('away', (i as HTMLInputElement).value)));
on('#cnt-minus', (b) => (b.onclick = () => changeCount(-1))); on('#cnt-plus', (b) => (b.onclick = () => changeCount(1)));
on('#tool-arrow', (b) => (b.onclick = () => setTool('arrow'))); on('#tool-zone', (b) => (b.onclick = () => setTool('zone'))); on('#tool-pen', (b) => (b.onclick = () => setTool('pen')));
on('#orient-btn', (b) => (b.onclick = toggleOrientation)); on('#zoom-minus', (b) => (b.onclick = () => changeZoom(-0.2))); on('#zoom-plus', (b) => (b.onclick = () => changeZoom(0.2))); on('#zoom-reset', (b) => (b.onclick = resetZoom)); on('#clear-btn', (b) => (b.onclick = clearAll));
on('#edit-ok', (b) => (b.onclick = confirmPlayerEdit)); on('#edit-cancel', (b) => (b.onclick = closePlayerEdit));

const toP = (n: [number, number]): [number, number] => (orientation === 'portrait' ? n : [1 - n[1], n[0]]);
const fromP = (n: [number, number]): [number, number] => (orientation === 'portrait' ? n : [n[1], 1 - n[0]]);
const pack = (ps: P[]): PitchPlayer[] => ps.map((p) => { const [x, y] = toP(p._norm); return { n: p.n, pos: p.pos, x, y, ...(p.name ? { name: p.name } : {}) }; });
const unpack = (ps: PitchPlayer[]): P[] => ps.map((p) => { const norm = fromP([p.x, p.y]); const c = normToCanvas(norm); return { n: p.n, pos: p.pos, name: p.name, _norm: norm, x: c.x, y: c.y }; });
const api: PitchApi = {
  getState: () => ({ mode, count: playerCount, home: pack(homePlayers), away: pack(awayPlayers), homeColor, awayColor,
    formation: { home: (root.querySelector('#home-form') as HTMLSelectElement).value, away: (root.querySelector('#away-form') as HTMLSelectElement).value } }),
  setState: (s) => { setMode(s.mode); if (s.count !== playerCount) { playerCount = s.count; buildFormSelects(); } homeColor = s.homeColor; awayColor = s.awayColor; (root.querySelector('#home-color') as HTMLInputElement).value = homeColor; (root.querySelector('#away-color') as HTMLInputElement).value = awayColor;
    (root.querySelector('#home-form') as HTMLSelectElement).value = s.formation.home; (root.querySelector('#away-form') as HTMLSelectElement).value = s.formation.away;
    homePlayers = unpack(s.home); awayPlayers = unpack(s.away); arrows = []; zones = []; paths = []; render(); },
  loadSquad: (team, players) => { const arr = team === 'home' ? homePlayers : awayPlayers; players.slice(0, arr.length).forEach((q, i) => { arr[i].n = q.n; arr[i].name = q.name; arr[i].pos = q.pos || arr[i].pos; }); render(); },
  setMode: (m) => setMode(m), setCount: (n) => { playerCount = n; buildFormSelects(); initBoard(); (root.querySelector('#count-val') as HTMLElement).textContent = String(n); },
};

return api;
}
