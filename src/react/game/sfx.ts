// 효과음 — 파일 없이 WebAudio 로 그 자리에서 만든다(2026-11-07 "효과음도 넣어야지"). 받아 올 소리 파일도, 저작권 걱정도 없다.
// 브라우저는 사람이 한 번 누르기 전엔 소리를 못 내므로 unlock() 을 누름·키 입력에서 부른다(아이폰은 그 안에서 resume 해야 한다).

// move·confirm 은 경기가 아니라 선수 선택 화면의 작은 소리(2026-11-07 "약간 옛날 오락실게임에서 고르듯이") — 여기서 찾지 않고 화면이 직접 낸다.
// 소리 종류는 모든 게임이 같이 쓴다(2026-11-07 게임 묶음 — 어느 게임이 어떤 사건에 어떤 소리를 낼지는 그 게임의 화면이 정한다).
/** shot·catch·tackle 은 3D 가 쓴다(src/react/game3d/sfx3d.ts). 같은 모듈이라 골·휘슬·킥·튕김은 두 모드가 같은 소리다. */
export type Sfx = { kind: 'kick' | 'bounce' | 'goal' | 'whistle' | 'end' | 'move' | 'confirm' | 'shot' | 'catch' | 'tackle'; vol: number };

const KEY = 'wfc.game.sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* 저장소를 못 읽어도 소리는 난다 */ }
const lastAt: Record<string, number> = {};
/** 같은 소리가 이 간격(ms) 안에 다시 오면 건너뛴다 — 예측을 다시 돌리며 같은 킥이 두 번 잡히거나 벽에 비벼 연달아 튕길 때. */
const GAP: Record<Sfx['kind'], number> = { kick: 70, bounce: 60, goal: 1500, whistle: 700, end: 2000, move: 45, confirm: 250, shot: 120, catch: 250, tackle: 150 };

export const isMuted = (): boolean => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* 저장 못 해도 이번 판은 반영된다 */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.02);
}

/** 사람의 누름 안에서 부른다 — 소리 장치를 만들고 깨운다. 여러 번 불러도 된다. */
/** 다시 깨워야 하나(순수 — 테스트용으로 뗌). 아이폰은 앱을 바꿨다 오면 'interrupted' 가 되고, 'running' 이라고 해도 소리가 안 나는 일이 있어
 *  화면이 다시 보이면 stale 로 표시해 다음 손짓에 한 번 더 resume 한다(2026-11-07 리뷰 #4). closed 면 새로 만든다. */
export function needsWake(state: string | null, stale: boolean): 'create' | 'resume' | 'none' {
  if (state === null || state === 'closed') return 'create';
  return state !== 'running' || stale ? 'resume' : 'none';
}
let stale = false;
/** 화면이 다시 보였다 — 다음 손짓에서 소리 장치를 한 번 더 깨운다. 부르기 싸다. */
export function markStale(): void { stale = true; }

export function unlock(): void {
  try {
    const w = needsWake(ctx ? ctx.state : null, stale);
    if (w === 'none') return;
    stale = false;
    if (w === 'create') { ctx = null; master = null; }
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state !== 'running') void ctx.resume();
    else if (w === 'resume') void ctx.resume();   // running 이라도 다시 보인 뒤 첫 손짓엔 한 번 더(아이폰)
  } catch { ctx = null; master = null; }
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q: number, at = 0, swell = false): void {
  if (!ctx || !master) return;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;   // 소리 재료일 뿐 — 경기 계산과 무관하다
  const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  if (swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  else { g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
}

/** 휘슬 한 번 — 높은 음에 빠른 떨림. */
function blast(dur: number, at: number, vol: number): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 2350; lfo.frequency.value = 38; depth.gain.value = 130;
  lfo.connect(depth); depth.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
}

export function play(s: Sfx): void {
  if (!ctx || !master || muted || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (lastAt[s.kind] ?? -1e9) < GAP[s.kind]) return;
  lastAt[s.kind] = now;
  const v = Math.max(0.05, Math.min(1, s.vol));
  switch (s.kind) {
    case 'kick': tone('sine', 190, 62, 0.11, 0.9 * v); noise(0.03, 0.35 * v, 1800, 0.8); break;      // 묵직한 "툭"
    case 'bounce': tone('triangle', 300, 170, 0.06, 0.28 * v); break;                                   // 가벼운 "통"
    case 'whistle': blast(0.32, 0, 0.2 * v); break;
    case 'end': blast(0.22, 0, 0.2); blast(0.22, 0.3, 0.2); blast(0.6, 0.6, 0.22); break;               // 삑 삑 삐—
    case 'goal':                                                                                          // 함성 + 올라가는 세 음
      noise(1.5, 0.5, 900, 0.6, 0, true);
      tone('square', 523, 523, 0.12, 0.16, 0); tone('square', 659, 659, 0.12, 0.16, 0.13); tone('square', 784, 784, 0.3, 0.16, 0.26);
      break;
    // 선수 선택 화면 — 아주 작게. 커서가 움직일 때 짧은 "틱", 고를 때 두 음 "띠링". 소리 끔·첫 누름 전엔 위의 검사에서 이미 걸러진다.
    case 'move': tone('square', 880, 880, 0.035, 0.05 * v); break;
    case 'confirm': tone('square', 660, 660, 0.06, 0.07 * v); tone('square', 990, 990, 0.09, 0.07 * v, 0.06); break;
    // 3D 에서 더한 셋(2026-11-07 "3d도 당연히 효과음 있어야지 두 모드 다 일관성 갖추게해") — 같은 재료(짧은 음·잡음)로
    case 'shot': tone('sine', 150, 45, 0.16, 1.0 * v); noise(0.06, 0.55 * v, 1400, 0.7); break;        // 킥보다 낮고 긴 "펑"
    case 'catch': tone('triangle', 120, 80, 0.09, 0.7 * v); noise(0.05, 0.3 * v, 500, 0.9); break;     // 장갑에 받는 "팍"
    case 'tackle': noise(0.09, 0.45 * v, 650, 1.2); tone('sine', 110, 70, 0.07, 0.5 * v); break;       // 몸 부딪치는 "턱"
  }
}
