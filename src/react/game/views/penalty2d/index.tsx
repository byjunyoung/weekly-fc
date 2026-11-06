// src/react/game/views/penalty2d/index.tsx — 승부차기의 화면(2026-11-07 게임 묶음 2단계). GameView 약속.
// 조준은 이 장면 안에만 있다 — 스틱이 조준 표시를 옮기고, 킥을 떼는 그 틱의 입력에만 조준이 실린다(그 전엔 aim: null).
// 상태와 다른 사람의 화면에는 조준이 없으므로 키퍼(사람)는 공이 나가기 전엔 어디를 겨눴는지 모른다.
import type { PenConfig, PenInput, PenSettings, PenState } from '../../../../lib/games/penalty2d';
import { TEAM } from '../../teams';
import type { GameView, Scene } from '../types';
import { buildSprites } from '../match2d/render';
import { readInsets } from '../match2d/stage';
import { AIM_START, penInput, type AimLocal } from './aim';
import { penLayout, type PenLayout } from './layout';
import { drawPenalty } from './render';
import { detectPenSfx } from './sfx-detect';
import { Settings } from './Settings';
import { Solo } from './Solo';

export const penalty2dView: GameView<PenConfig, PenState, PenInput, PenSettings> = {
  id: 'penalty2d',

  mount({ root, canvas, config, roster }): Scene<PenState, PenConfig, PenInput> | null {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const sprites = buildSprites(config, roster);
    let lay: { l: PenLayout; dpr: number } | null = null;
    const layout = (): void => {
      const vw = root.clientWidth, vh = root.clientHeight;
      if (!vw || !vh) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      const ins = readInsets();
      lay = { l: penLayout(vw, vh, ins), dpr };
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    window.addEventListener('orientationchange', layout);

    let local: AimLocal = AIM_START;
    let role: 'kick' | 'keep' | null = null, phase = 'ready';
    return {
      draw(f) {
        if (!lay) return;
        const st = f.state;
        if (st.kickNo !== local.kickNo) local = { ...AIM_START, kickNo: st.kickNo };   // 새 차기 — 조준은 가운데에서
        role = f.myId === null ? null : st.kicker === f.myId ? 'kick' : st.keeper === f.myId ? 'keep' : null;
        phase = st.phase;
        drawPenalty(ctx, st, f.config, lay.l, sprites, { me: f.myId, aim: role === 'kick' ? local.aim : null, bubbles: f.bubbles }, lay.dpr);
      },
      toInput(h) {
        const r = penInput(local, h, role, phase);
        local = r.local;
        return r.input;
      },
      camera: () => (lay ? { cx: 0, cy: 0, scale: lay.l.scale, follow: false } : null),
      dispose() { ro.disconnect(); window.removeEventListener('orientationchange', layout); },
    };
  },

  sfx: detectPenSfx,

  result(final, config, { myId, solo }) {
    const w = final.winner ?? 'draw';
    const mySide = myId !== null ? config.players[myId]?.side ?? null : null;
    const outcome = w === 'draw' ? '무승부' : solo ? (w === 0 ? '승!' : '패!') : mySide === null ? `${TEAM[w].short} 승` : w === mySide ? '승!' : '패';
    const tone = w === 'draw' ? 'draw' : mySide === null && !solo ? 'win' : w === (solo ? 0 : mySide) ? 'win' : 'lose';
    const score = (
      <><span style={{ color: TEAM[0].color }}>{TEAM[0].short}</span> {final.scored[0]} : {final.scored[1]} <span style={{ color: TEAM[1].color }}>{TEAM[1].short}</span></>
    );
    const sdPairs = Math.max(0, Math.min(final.taken[0], final.taken[1]) - config.kicks);
    const sub = `${config.kicks}번씩${sdPairs ? ` · 서든데스 ${sdPairs}번` : ''} · 차기 ${final.taken[0] + final.taken[1]}번`;
    // 선수별 성공/차기 — 찬 사람만, 편 차례대로. 번호는 등번호.
    const rows = config.players.map((p) => {
      const mine = final.log.filter((e) => e.kicker === p.id);
      return { p, taken: mine.length, scored: mine.filter((e) => e.out === 'goal').length };
    }).filter((r) => r.taken > 0);
    const detail = (
      <ul className="pen-rows">
        {rows.map(({ p, taken, scored }) => (
          <li key={p.id} className={p.id === myId ? 'is-me' : undefined}>
            <span className="pen-dot" style={{ background: TEAM[p.side].color }} aria-hidden="true" />
            <span className="pen-name">{p.jersey ? `${p.jersey} ` : ''}{p.name}{p.bot ? ' · 봇' : ''}</span>
            <span className="pen-count">{scored}/{taken}</span>
          </li>
        ))}
      </ul>
    );
    return { outcome, tone, score, sub, detail };
  },

  entry: { sub: '2D · 번갈아 차고 막기', header: '2D 승부차기 · 방을 만들면 초대 링크가 생기고, 사람이 없는 편은 봇이 찹니다' },
  minRoster: 2,
  Settings,
  hostHint: '편마다 사람이 차례로 차고, 상대 편 사람이 차례로 막습니다 · 사람이 없는 편은 봇 편 · 대기 칸은 구경',
  controls: 'PC: ←→ 겨누기·옆걸음, 스페이스·Shift 를 누르고 있다가 떼면 슛(키퍼는 몸 던지기), 숫자 1~6 한마디 · 폰: 왼쪽을 좌우로 끌기, 오른쪽 버튼',
  Solo,
};
