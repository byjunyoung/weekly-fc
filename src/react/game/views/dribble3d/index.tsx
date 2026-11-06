// src/react/game/views/dribble3d/index.tsx — 3D 드리블 훈련장의 화면(2026-11-07 게임 묶음 6단계). GameView 약속 + 그림판(surface).
// 이 파일은 three.js 를 부르지 않는다 — 그림판은 3D 게임 다섯이 같이 쓰는 묶음(match3d/surface3d)을 경기 화면이 열릴 때 받는다.
// 2D 드리블과 같은 것: 결과 상자와 순위 줄(drResult — 코스의 메달 시간과 기기 기록 칸만 3D 것), 소리(detectDrSfx), 그만두기 문구.
import type { DrConfig, DrSettings, DrState } from '../../../../lib/games/dribble2d';
import type { Dr3Config, Dr3State } from '../../../../lib/games/dribble3d';
import { course3 } from '../../../../lib/games/dribble3d';
import type { Input } from '../../../../lib/game3d/sim';
import type { GameView, Surface, SurfaceIn } from '../types';
import { dribble2dView, drResult } from '../dribble2d';
import { detectDrSfx } from '../dribble2d/sfx-detect';
import { CONTROLS_3D } from '../match3d/Solo';
import { Settings } from './Settings';
import { Solo, dribble3BestKey } from './Solo';

type Mod = { createDribbleSurface(o: SurfaceIn<Dr3Config>): Surface<Dr3State, Dr3Config, Input> | string };
let mod: Mod | null = null;
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (mod) return Promise.resolve();
  loading ??= import('../match3d/surface3d').then((m) => { mod = m; }).catch((e) => { loading = null; throw e; });
  return loading;
}
/** 2D 판 함수에 넘길 때 — 레인의 문·콘·벌점·도착 칸이 같은 이름이다(몸·공 모양만 다르다). */
const as2d = (s: Dr3State): DrState => s as unknown as DrState;

export const dribble3dView: GameView<Dr3Config, Dr3State, Input, DrSettings> = {
  id: 'dribble3d',
  mount: () => null,
  surface: {
    load,
    create(o) { return mod ? mod.createDribbleSurface(o) : '화면을 불러오지 못했습니다 — 다시 열어 주세요.'; },
  },
  sfx: (prev, next) => detectDrSfx(prev ? as2d(prev) : null, as2d(next)),
  result: (final, config, o) => { const c = course3(config.course); return drResult(as2d(final), config as unknown as DrConfig, o, c, dribble3BestKey(c.id)); },
  entry: { sub: '3D · 콘 사이로 기록 재기', header: '3D 드리블 훈련장 · 방을 만들면 초대 링크가 생기고, 들어온 사람이 나란한 레인에서 같이 달립니다' },
  minRoster: 1,
  Settings,
  hostHint: dribble2dView.hostHint,
  controls: `${CONTROLS_3D} · 숫자 1~6 한마디`,
  Solo,
  quit: dribble2dView.quit,
};
