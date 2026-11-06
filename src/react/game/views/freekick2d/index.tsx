// src/react/game/views/freekick2d/index.tsx — 프리킥의 화면(2026-11-07 게임 묶음 3단계). GameView 약속.
// 조준과 감기는 이 장면 안에만 있다(aim.ts) — 모으던 킥을 떼는 틱의 입력에만 실린다. 구경하는 사람의 화면엔 조준이 없다.
import type { FkConfig, FkSettings, FkState } from '../../../../lib/games/freekick2d';
import { FK_MAX_POINTS, FK_SPOTS, fkRanking } from '../../../../lib/games/freekick2d';
import type { PenInput } from '../../../../lib/games/penalty2d';
import type { GameView, ResultView, Scene } from '../types';
import { buildSprites } from '../match2d/render';
import { readInsets } from '../match2d/stage';
import { penLayout, type PenLayout } from '../penalty2d/layout';
import { FK_BEST_KEY, offerBest, readBest } from '../best';
import { FK_LOCAL, fkInput, type FkLocal } from './aim';
import { drawFreekick } from './render';
import { detectFkSfx } from './sfx-detect';
import { Settings } from './Settings';
import { Solo } from './Solo';

/** 프리킥이 그리는 논리 범위 — 먼 측면 자리(±280, 430)와 그 뒤 키커까지. */
export const FK_EXTENT = { wx: 330, y0: -80, y1: 500 };

/** 결과 상자는 한 판에 한 번만 최고 기록을 적게 — 같은 끝 상태로 여러 번 불려도 처음 계산을 돌려준다. */
const once = new WeakMap<object, ResultView>();

/** 결과 상자(2026-11-07 6단계에 꺼냄 — 3D 프리킥도 같은 상자를 쓴다, 혼자 최고 기록 칸만 다르게). 내용은 예전 그대로. */
export function fkResult(final: FkState, config: FkConfig, { myId, solo }: { myId: number | null; solo: boolean }, bestKey: string): ResultView {
  const hit = once.get(final);
  if (hit) return hit;
  const order = fkRanking(final.points, final.log);
  const goals = (i: number): number => final.log.filter((e) => e.kicker === i && e.out === 'goal').length;
  const mark = (i: number): string => FK_SPOTS.map((_, s) => { const e = final.log.find((x) => x.kicker === i && x.spot === s); return e ? (e.out === 'goal' ? '●' : '✕') : '○'; }).join('');
  const detail = (
    <ul className="fk-rows">
      {order.map((i, r) => {
        const p = config.players[i];
        return (
          <li key={i} className={i === myId ? 'is-me' : undefined}>
            <span className="fk-rank">{r + 1}</span>
            <span className="fk-name">{p.jersey ? `${p.jersey} ` : ''}{p.name}</span>
            <span className="fk-marks" aria-label={`자리별 ${mark(i).replace(/●/g, '골 ').replace(/✕/g, '실패 ').trim()}`}>{mark(i)}</span>
            <span className="fk-pts">{final.points[i]}점</span>
          </li>
        );
      })}
    </ul>
  );
  let out: ResultView;
  if (solo || config.players.length === 1) {
    const pts = final.points[0];
    const b = solo ? offerBest(bestKey, pts, (a, c) => a > c) : { prev: null, isNew: false };
    const sub = `다섯 자리 · 골 ${goals(0)}개${b.isNew ? (b.prev !== null ? ' · 새 최고 기록' : ' · 첫 기록') : b.prev !== null ? ` · 최고 기록 ${b.prev}점` : ''}`;
    out = { outcome: `${pts}점`, tone: pts >= 6 ? 'win' : 'draw', score: <>{pts} / {FK_MAX_POINTS}점</>, sub, detail };
  } else {
    const rank = myId === null ? -1 : order.indexOf(myId);
    const top = config.players[order[0]];
    const outcome = myId === null ? `${top.name} 1등` : rank === 0 ? '1등!' : `${rank + 1}등`;
    out = { outcome, tone: rank === 0 || myId === null ? 'win' : 'draw', score: <>{top.name} {final.points[order[0]]}점</>, sub: `${config.players.length}명 · 자리 다섯 · ${FK_MAX_POINTS}점 만점`, detail };
  }
  once.set(final, out);
  return out;
}

export const freekick2dView: GameView<FkConfig, FkState, PenInput, FkSettings> = {
  id: 'freekick2d',

  mount({ root, canvas, config, roster }): Scene<FkState, FkConfig, PenInput> | null {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const sprites = buildSprites(config, roster);
    const best = config.players.length === 1 ? readBest(FK_BEST_KEY) : null;
    let lay: { l: PenLayout; dpr: number } | null = null;
    const layout = (): void => {
      const vw = root.clientWidth, vh = root.clientHeight;
      if (!vw || !vh) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      lay = { l: penLayout(vw, vh, readInsets(), FK_EXTENT), dpr };
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    window.addEventListener('orientationchange', layout);
    let local: FkLocal = FK_LOCAL;
    let kicker = false, phase = 'ready';
    return {
      draw(f) {
        if (!lay) return;
        const st = f.state;
        if (st.kickNo !== local.kickNo) local = { ...FK_LOCAL, kickNo: st.kickNo, aim: -Math.sign(FK_SPOTS[st.spot].x || 1) * 60 };   // 새 차기 — 조준은 열린 쪽에서 시작
        kicker = f.myId !== null && st.kicker === f.myId;
        phase = st.phase;
        drawFreekick(ctx, st, f.config, lay.l, sprites, { me: f.myId, aim: kicker ? local.aim : null, curl: local.curl, bubbles: f.bubbles, best }, lay.dpr);
      },
      toInput(h) {
        const r = fkInput(local, h, kicker, phase);
        local = r.local;
        return r.input;
      },
      camera: () => (lay ? { cx: 0, cy: 0, scale: lay.l.scale, follow: false } : null),
      dispose() { ro.disconnect(); window.removeEventListener('orientationchange', layout); },
    };
  },

  sfx: detectFkSfx,

  result: (final, config, o) => fkResult(final, config, o, FK_BEST_KEY),

  entry: { sub: '2D · 벽을 넘겨 다섯 자리', header: '2D 프리킥 · 방을 만들면 초대 링크가 생기고, 들어온 사람이 차례로 같은 자리에서 찹니다' },
  minRoster: 1,
  Settings,
  hostHint: '방 사람 모두가 자리마다 차례로 한 번씩(8명까지, 나머지는 구경) · 정면 1점, 옆 2점, 먼 측면 3점',
  controls: 'PC: ←→ 겨누기, 스페이스·Shift 를 누르고 있다가 떼면 슛, 누르는 동안 ←→ 감아차기, 숫자 1~6 한마디 · 폰: 왼쪽을 좌우로 끌기, 오른쪽 버튼',
  Solo,
  quit: { title: '프리킥을 그만할까요?', content: '이번 판 점수는 남지 않습니다.' },
};
