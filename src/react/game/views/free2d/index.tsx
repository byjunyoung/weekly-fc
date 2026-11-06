// src/react/game/views/free2d/index.tsx — 자유 훈련장의 화면(2026-11-07 게임 묶음 2단계). GameView 약속.
// 바닥·크기 맞추기·카메라·스틱 돌리기는 경기 화면의 것(stage·view)을 그대로 쓰고, 그리기만 render.ts.
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
import type { FreeConfig, FreeInput, FreeSettings, FreeState } from '../../../../lib/games/free2d';
import { pitchOf } from '../../../../lib/game/sim';
import type { Camera, GameView, Scene } from '../types';
import { buildSprites, drawBubbles } from '../match2d/render';
import { attachStage } from '../match2d/stage';
import { aimCamera, stickToSim } from '../match2d/view';
import { drawFree, ringColors } from './render';
import { detectFreeSfx } from './sfx-detect';
import { Settings } from './Settings';
import { Solo } from './Solo';

export const free2dView: GameView<FreeConfig, FreeState, FreeInput, FreeSettings> = {
  id: 'free2d',

  mount({ root, canvas, config, roster }): Scene<FreeState, FreeConfig, FreeInput> | null {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const stage = attachStage(root, canvas, pitchOf(config.field));
    const sprites = buildSprites(config, roster);
    const rings = ringColors(config, roster);
    let cam: Camera | null = null;
    let gather = false;   // [공 모으기] 를 눌렀다 — 다음 입력 한 번에 싣는다
    return {
      draw(f) {
        const st = stage.get();
        if (!st) return;
        // 큰 경기장이면 화면이 내 선수를 따라간다(구경이면 첫 공).
        const focus = f.myId !== null && f.state.players[f.myId] ? f.state.players[f.myId] : f.state.balls[0] ?? { x: 0, y: 0 };
        const v = aimCamera(st.view, focus);
        cam = { cx: v.cx, cy: v.cy, scale: v.scale, follow: v.follow };
        drawFree(ctx, f.state, f.config, v, st.field, sprites, rings, { dpr: st.dpr, topInset: st.topInset, me: f.myId });
        drawBubbles(ctx, f.state, f.config, v, f.bubbles);
      },
      toInput(h) {
        const st = stage.get();
        const d = st ? stickToSim(st.view, h.x, h.y) : { x: 0, y: 0 };
        const g = gather;
        gather = false;
        return { x: d.x, y: d.y, kick: h.kick, gather: g };
      },
      camera: () => cam,
      act(id) { if (id === 'gather') gather = true; },
      dispose() { stage.dispose(); },
    };
  },

  sfx: detectFreeSfx,

  // 저절로 끝나지 않아 결과 상자가 뜨지 않는다 — 혹시 불리면 들어간 골 수만.
  result(final) {
    return { outcome: '훈련 끝', tone: 'draw', score: <>골 {final.goals}</>, sub: '자유 훈련장' };
  },

  entry: { sub: '2D · 시간도 점수도 없이', header: '2D 자유 훈련장 · 방을 만들면 초대 링크가 생기고, 들어온 사람 모두가 같이 찹니다' },
  minRoster: 1,
  Settings,
  hostHint: '공은 사람 수 + 2개(8개까지) · 골이 들어가면 그 공만 가운데로 돌아옵니다 · 멈추려면 경기 화면의 ✕',
  controls: 'PC: 방향키·WASD 이동, 스페이스·Shift 킥, 숫자 1~6 한마디 · 폰: 왼쪽을 끌어 이동, 오른쪽 버튼으로 킥 · 방장은 [공 모으기]',
  Solo,
  actions: [{ id: 'gather', label: '공 모으기', who: 'host' }],
};
