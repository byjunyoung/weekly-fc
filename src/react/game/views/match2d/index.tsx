// src/react/game/views/match2d/index.tsx — 2D 경기의 화면(2026-11-07 게임 묶음 토대). 그리기·조작·HUD·소리·결과 문구를 GameView 약속으로 묶는다.
// 새로 그리는 것은 없다 — 1·2단계의 render.ts(캔버스·점수판·말풍선)·stage.ts(크기 맞추기)·view.ts(카메라·스틱 돌리기)·sfx-detect.ts 를
// 그대로 부르고, SoloMatch·OnlineMatch 에 있던 카메라 고르기와 결과 문구만 여기로 옮겼다(모양·느낌 같음).
import type { MatchConfig, MatchState, Input } from '../../../../lib/game/sim';
import { pitchOf } from '../../../../lib/game/sim';
import type { RoomSettings } from '../../../../lib/games/match2d-room';
import { resultOf } from '../../../../lib/games/match2d';
import { TEAM } from '../../teams';
import type { Camera, GameView, Scene } from '../types';
import { buildSprites, drawBubbles, drawFrame } from './render';
import { detectSfx } from './sfx-detect';
import { Settings } from './Settings';
import { Solo } from './Solo';
import { sidesText } from './solo-setup';
import { attachStage } from './stage';
import { aimCamera, clockText, stickToSim, type View } from './view';

/** 그린 view → 디버그용 카메라 값. */
const cameraOf = (v: View): Camera => ({ cx: v.cx, cy: v.cy, scale: v.scale, follow: v.follow });

export const match2dView: GameView<MatchConfig, MatchState, Input, RoomSettings> = {
  id: 'match2d',

  mount({ root, canvas, config, roster }): Scene<MatchState, MatchConfig, Input> | null {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const stage = attachStage(root, canvas, pitchOf(config.field));
    const sprites = buildSprites(config, roster);   // 동기 — 첫 프레임부터 얼굴이 있다
    let cam: Camera | null = null;
    return {
      draw(f) {
        const st = stage.get();
        if (!st) return;
        // 큰 경기장이면 화면이 따라간다 — 내 선수, 구경이면 공(스펙 2026-11-07 §2). 스틱은 그래도 "화면 방향"이다(stickToSim 은 돌리기만 한다).
        const focus = f.myId !== null && f.state.players[f.myId] ? f.state.players[f.myId] : f.state.ball;
        const v = aimCamera(st.view, focus);
        cam = cameraOf(v);
        drawFrame(ctx, f.state, f.config, v, st.field, sprites, { dpr: st.dpr, topInset: st.topInset, humanId: f.myId });
        drawBubbles(ctx, f.state, f.config, v, f.bubbles);
      },
      toInput(h) {
        const st = stage.get();
        const d = st ? stickToSim(st.view, h.x, h.y) : { x: 0, y: 0 };   // 화면 기준 → 시뮬레이션 기준(세로면 돌린다)
        return { x: d.x, y: d.y, kick: h.kick };
      },
      camera: () => cam,
      dispose() { stage.dispose(); },
    };
  },

  sfx: detectSfx,

  result(final, config, { myId, solo }) {
    const r = resultOf(final);
    const sub = `${clockText(config.minutes * 60)} 경기 · ${sidesText(config)}`;
    const score = (
      <><span style={{ color: TEAM[0].color }}>{TEAM[0].short}</span> {r.score[0]} : {r.score[1]} <span style={{ color: TEAM[1].color }}>{TEAM[1].short}</span></>
    );
    if (solo) {   // 혼자: 사람은 늘 0 편. "승!"·"패!"·"무승부"(예전 SoloMatch 그대로)
      const o = r.winner === 'draw' ? '무승부' : r.winner === 0 ? '승' : '패';
      return { outcome: o === '무승부' ? o : `${o}!`, tone: o === '승' ? 'win' : o === '패' ? 'lose' : 'draw', score, sub };
    }
    // 온라인: 구경이면 "주황 승", 뛰었으면 "승!"·"패"(예전 OnlineMatch 그대로)
    const mySide = myId !== null ? config.players[myId]?.side ?? null : null;
    const outcome = r.winner === 'draw' ? '무승부' : mySide === null ? `${TEAM[r.winner].short} 승` : r.winner === mySide ? '승!' : '패';
    const tone = r.winner === 'draw' ? 'draw' : mySide === null || r.winner === mySide ? 'win' : 'lose';
    return { outcome, tone, score, sub };
  },

  entry: { sub: '2D · 같이 한 판, 또는 혼자서 봇과', header: '2D 경기 · 방을 만들면 초대 링크가 생기고, 빈자리는 봇이 채웁니다' },
  minRoster: 2,
  Settings,
  hostHint: '한 편이 봇으로 채울 수보다 적으면 봇이 들어갑니다 · 두 편 인원이 달라도 됩니다 · 한 편 6명까지',
  controls: 'PC: 방향키·WASD 이동, 스페이스·Shift 킥, 숫자 1~6 한마디 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥',
  Solo,
};
