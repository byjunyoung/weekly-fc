// src/react/game/views/free3d/index.tsx — 3D 자유 훈련장의 화면(2026-11-07 게임 묶음 5단계). GameView 약속 + 그림판을 스스로 여닫는 길(surface).
// 이 파일은 three.js 를 부르지 않는다 — 그림판은 3D 게임 셋이 같이 쓰는 묶음(match3d/surface3d)을 경기 화면이 열릴 때 받는다.
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
import type { Free3Config, Free3Input, Free3Settings, Free3State } from '../../../../lib/games/free3d';
import type { GameView, Surface, SurfaceIn } from '../types';
import { CONTROLS_3D } from '../match3d/Solo';
import { free2dView } from '../free2d';
import { detectFree3Sfx } from './sfx-detect';
import { Settings } from './Settings';
import { Solo } from './Solo';

type Mod = { createFreeSurface(o: SurfaceIn<Free3Config>): Surface<Free3State, Free3Config, Free3Input> | string };
let mod: Mod | null = null;
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  if (mod) return Promise.resolve();
  loading ??= import('../match3d/surface3d').then((m) => { mod = m; }).catch((e) => { loading = null; throw e; });
  return loading;
}

export const free3dView: GameView<Free3Config, Free3State, Free3Input, Free3Settings> = {
  id: 'free3d',
  mount: () => null,
  surface: {
    load,
    create(o) { return mod ? mod.createFreeSurface(o) : '화면을 불러오지 못했습니다 — 다시 열어 주세요.'; },
  },
  sfx: detectFree3Sfx,
  // 저절로 끝나지 않아 결과 상자가 뜨지 않는다 — 혹시 불리면 들어간 골 수만(2D 와 같다).
  result(final) {
    return { outcome: '훈련 끝', tone: 'draw', score: <>골 {final.goals}</>, sub: '자유 훈련장' };
  },
  entry: { sub: '3D · 시간도 점수도 없이', header: '3D 자유 훈련장 · 방을 만들면 초대 링크가 생기고, 들어온 사람 모두가 같이 찹니다' },
  minRoster: 1,
  Settings,
  hostHint: '공은 사람 수 + 2개(8개까지) · 골이 들어가면 그 공만 가운데로 돌아옵니다 · 멈추려면 경기 화면의 ✕',
  controls: `${CONTROLS_3D} · 숫자 1~6 한마디 · 방장은 [공 모으기]`,
  Solo,
  quit: free2dView.quit,   // 2D 와 같은 말(리뷰 #7)
  actions: [{ id: 'gather', label: '공 모으기', who: 'host' }],
};
