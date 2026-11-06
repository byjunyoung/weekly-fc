// src/react/game/views/freekick3d/index.tsx — 3D 프리킥의 화면(2026-11-07 게임 묶음 6단계). GameView 약속 + 그림판을 스스로 여닫는 길(surface).
// 이 파일은 three.js 를 부르지 않는다 — 그림판은 3D 게임 다섯이 같이 쓰는 묶음(match3d/surface3d)을 경기 화면이 열릴 때 받는다.
// 2D 프리킥과 같은 것은 그대로 가져다 쓴다: 방 설정 칸(Settings), 결과 상자와 순위 줄(fkResult — 기기 기록 칸만 3D 따로), 소리(detectFkSfx), 그만두기 문구.
// 사용자: "두 모드 다 일관성 갖추게해".
import type { FkConfig, FkSettings, FkState } from '../../../../lib/games/freekick2d';
import type { Fk3State } from '../../../../lib/games/freekick3d';
import type { Pen3Input } from '../../../../lib/games/penalty3d';
import type { GameView, Surface, SurfaceIn } from '../types';
import { freekick2dView, fkResult } from '../freekick2d';
import { detectFkSfx } from '../freekick2d/sfx-detect';
import { Settings } from '../freekick2d/Settings';
import { CONTROLS_FK3, FK3_BEST_KEY, Solo } from './Solo';

type Mod = { createFreekickSurface(o: SurfaceIn<FkConfig>): Surface<Fk3State, FkConfig, Pen3Input> | string };
let mod: Mod | null = null;
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (mod) return Promise.resolve();
  loading ??= import('../match3d/surface3d').then((m) => { mod = m; }).catch((e) => { loading = null; throw e; });
  return loading;
}
/** 2D 판 함수에 넘길 때 — 3D 상태는 2D 상태의 차례·점수·기록 칸을 같은 이름으로 갖는다(공·키퍼만 모양이 다르다). */
const as2d = (s: Fk3State): FkState => s as unknown as FkState;

export const freekick3dView: GameView<FkConfig, Fk3State, Pen3Input, FkSettings> = {
  id: 'freekick3d',
  mount: () => null,
  surface: {
    load,
    create(o) { return mod ? mod.createFreekickSurface(o) : '화면을 불러오지 못했습니다 — 다시 열어 주세요.'; },
  },
  sfx: (prev, next) => detectFkSfx(prev ? as2d(prev) : null, as2d(next)),
  result: (final, config, o) => fkResult(as2d(final), config, o, FK3_BEST_KEY),
  entry: { sub: '3D · 벽을 넘겨 다섯 자리', header: '3D 프리킥 · 방을 만들면 초대 링크가 생기고, 들어온 사람이 차례로 같은 자리에서 찹니다' },
  minRoster: 1,
  Settings,
  hostHint: freekick2dView.hostHint,
  controls: `${CONTROLS_FK3} · 숫자 1~6 한마디`,
  Solo,
  quit: freekick2dView.quit,
};
