// src/react/game/views/dribble2d/index.tsx — 드리블 훈련장의 화면(2026-11-07 게임 묶음 3단계). GameView 약속.
// 내 레인을 그리고(폰 세로면 세워서 따라간다), 다른 사람은 유령과 순위 줄로. 스틱 돌리기·카메라는 경기 화면(view.ts) 것 그대로.
import type { DrConfig, DrSettings, DrState } from '../../../../lib/games/dribble2d';
import { courseOf, drRanking, laneTime, medalOf } from '../../../../lib/games/dribble2d';
import type { Input } from '../../../../lib/game/sim';
import type { Camera, GameView, ResultView, Scene } from '../types';
import { buildSprites } from '../match2d/render';
import { readInsets } from '../match2d/stage';
import { aimCamera, stickToSim, type View } from '../match2d/view';
import { dribbleBestKey, offerBest, readBest } from '../best';
import { laneView } from './layout';
import { MEDAL, drawDribble, secText } from './render';
import { detectDrSfx } from './sfx-detect';
import { Settings } from './Settings';
import { Solo } from './Solo';

const once = new WeakMap<object, ResultView>();

export const dribble2dView: GameView<DrConfig, DrState, Input, DrSettings> = {
  id: 'dribble2d',

  mount({ root, canvas, config, roster }): Scene<DrState, DrConfig, Input> | null {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const sprites = buildSprites(config, roster);
    const course = courseOf(config.course);
    const best = config.players.length === 1 ? readBest(dribbleBestKey(course.id)) : null;
    let lay: { v: View; dpr: number; top: number } | null = null;
    const layout = (): void => {
      const vw = root.clientWidth, vh = root.clientHeight;
      if (!vw || !vh) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      const ins = readInsets();
      lay = { v: laneView(vw, vh, ins), dpr, top: ins.top };
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    window.addEventListener('orientationchange', layout);
    let cam: Camera | null = null;
    let lastPen = -1, popAt = -1, lastLane = -1;
    return {
      draw(f) {
        if (!lay) return;
        const st = f.state;
        // 내 레인, 구경이면 앞선 사람의 레인
        const lane = f.myId !== null && st.lanes[f.myId] ? f.myId : drRanking(st)[0] ?? 0;
        const l = st.lanes[lane];
        if (!l) return;
        if (lane !== lastLane) { lastLane = lane; lastPen = l.pen; }
        if (l.pen > lastPen) popAt = st.tick;   // 콘 — "+1초"
        lastPen = l.pen;
        const v = aimCamera(lay.v, l.p);
        cam = { cx: v.cx, cy: v.cy, scale: v.scale, follow: v.follow };
        drawDribble(ctx, st, f.config, v, sprites, { me: f.myId, lane, dpr: lay.dpr, topInset: lay.top, bubbles: f.bubbles, popAt, best });
      },
      toInput(h) {
        const d = lay ? stickToSim(lay.v, h.x, h.y) : { x: 0, y: 0 };
        return { x: d.x, y: d.y, kick: h.kick };
      },
      camera: () => cam,
      dispose() { ro.disconnect(); window.removeEventListener('orientationchange', layout); },
    };
  },

  sfx: detectDrSfx,

  result(final, config, { myId, solo }) {
    const hit = once.get(final);
    if (hit) return hit;
    const c = courseOf(config.course), order = drRanking(final);
    const detail = (
      <ul className="dr-rows">
        {order.map((i, r) => {
          const p = config.players[i], l = final.lanes[i], t = laneTime(l), m = medalOf(c, t);
          return (
            <li key={i} className={i === myId ? 'is-me' : undefined}>
              <span className="dr-rank">{r + 1}</span>
              <span className="dr-name">{p.jersey ? `${p.jersey} ` : ''}{p.name}</span>
              <span className="dr-medal" style={m !== null ? { color: MEDAL[m].color } : undefined}>{m !== null ? MEDAL[m].name : ''}</span>
              <span className="dr-time">{t !== null ? `${secText(t)}${l.pen ? ` (콘 ${l.pen})` : ''}` : `문 ${l.gate}/${c.gates.length}`}</span>
            </li>
          );
        })}
      </ul>
    );
    let out: ResultView;
    const medalLine = `금 ${c.medals[0]}초 · 은 ${c.medals[1]}초 · 동 ${c.medals[2]}초`;
    if (solo || config.players.length === 1) {
      const l = final.lanes[0], t = laneTime(l), m = medalOf(c, t);
      const b = t !== null && solo ? offerBest(dribbleBestKey(c.id), t, (a, z) => a < z) : { prev: readBest(dribbleBestKey(c.id)), isNew: false };
      const bestText = b.isNew ? (b.prev !== null ? ' · 새 최고 기록' : ' · 첫 기록') : b.prev !== null ? ` · 최고 ${secText(b.prev)}` : '';
      out = {
        outcome: t === null ? '시간 끝' : m !== null ? `${MEDAL[m].name}메달` : '완주', tone: m === 0 || m === 1 ? 'win' : t === null ? 'lose' : 'draw',
        score: t === null ? <>문 {l.gate}/{c.gates.length}</> : <>{secText(t)}</>, sub: `${c.name}${l.pen ? ` · 콘 ${l.pen}개(+${l.pen}초)` : ''}${bestText} · ${medalLine}`,
      };
    } else {
      const rank = myId === null ? -1 : order.indexOf(myId), top = config.players[order[0]], tt = laneTime(final.lanes[order[0]]);
      out = {
        outcome: myId === null ? `${top.name} 1등` : rank === 0 ? '1등!' : `${rank + 1}등`, tone: rank === 0 || myId === null ? 'win' : 'draw',
        score: <>{top.name} {tt !== null ? secText(tt) : '—'}</>, sub: `${c.name} · ${config.players.length}명 · ${medalLine}`, detail,
      };
    }
    once.set(final, out);
    return out;
  },

  entry: { sub: '2D · 콘 사이로 기록 재기', header: '2D 드리블 훈련장 · 방을 만들면 초대 링크가 생기고, 들어온 사람이 나란한 레인에서 같이 달립니다' },
  minRoster: 1,
  Settings,
  hostHint: '방 사람 모두가 자기 레인에서 동시에 출발(8명까지, 나머지는 구경) · 문을 건너뛰면 그 문으로 돌아가야 합니다 · 콘을 치면 1초',
  controls: 'PC: 방향키·WASD 이동, 스페이스·Shift 킥, 숫자 1~6 한마디 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥',
  Solo,
  quit: { title: '연습을 그만할까요?', content: '이번 기록은 남지 않습니다.' },
};
