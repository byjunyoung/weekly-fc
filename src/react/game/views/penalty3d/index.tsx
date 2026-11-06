// src/react/game/views/penalty3d/index.tsx — 3D 승부차기의 화면(2026-11-07 게임 묶음 5단계). GameView 약속 + 그림판을 스스로 여닫는 길(surface).
// 이 파일은 three.js 를 부르지 않는다 — 그림판은 3D 게임 셋이 같이 쓰는 묶음(match3d/surface3d)을 경기 화면이 열릴 때 받는다.
// 2D 승부차기와 같은 것은 그대로 가져다 쓴다: 방 설정 칸(Settings), 결과 상자와 선수별 줄(result), 소리(detectPenSfx — 같은 사건에 같은 소리).
// 사용자: "두 모드 다 일관성 갖추게해".
import type { PenConfig, PenSettings, PenState } from '../../../../lib/games/penalty2d';
import type { Pen3Input, Pen3State } from '../../../../lib/games/penalty3d';
import type { GameView, Surface, SurfaceIn } from '../types';
import { penalty2dView } from '../penalty2d';
import { detectPenSfx } from '../penalty2d/sfx-detect';
import { Settings } from '../penalty2d/Settings';
import { CONTROLS_PEN3, Solo } from './Solo';

type Mod = { createPenaltySurface(o: SurfaceIn<PenConfig>): Surface<Pen3State, PenConfig, Pen3Input> | string };
let mod: Mod | null = null;
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (mod) return Promise.resolve();
  loading ??= import('../match3d/surface3d').then((m) => { mod = m; }).catch((e) => { loading = null; throw e; });
  return loading;
}
/** 2D 판 함수에 넘길 때 — 3D 상태는 2D 상태의 차례·점수·기록 칸을 같은 이름으로 갖는다(공·키퍼만 모양이 다르다). */
const as2d = (s: Pen3State): PenState => s as unknown as PenState;

export const penalty3dView: GameView<PenConfig, Pen3State, Pen3Input, PenSettings> = {
  id: 'penalty3d',
  mount: () => null,
  surface: {
    load,
    create(o) { return mod ? mod.createPenaltySurface(o) : '화면을 불러오지 못했습니다 — 다시 열어 주세요.'; },
  },
  sfx: (prev, next) => detectPenSfx(prev ? as2d(prev) : null, as2d(next)),
  result: (final, config, o) => penalty2dView.result(as2d(final), config, o),
  entry: { sub: '3D · 번갈아 차고 막기', header: '3D 승부차기 · 방을 만들면 초대 링크가 생기고, 사람이 없는 편은 봇이 찹니다' },
  minRoster: 2,
  Settings,
  hostHint: penalty2dView.hostHint,
  controls: `${CONTROLS_PEN3} · 숫자 1~6 한마디`,
  Solo,
};
