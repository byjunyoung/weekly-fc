// src/react/game/views/match3d/index.tsx — 3D 경기의 화면(2026-11-07 게임 묶음 4단계 "3D 경기 온라인"). 2D 경기 화면(views/match2d)과 같은 약속(GameView)에
// 그림판을 스스로 여닫는 길(surface — views/types.ts)을 더해 끼운다. 그래서 방·혼자 하기·✕·♪·한마디·결과·구경이 2D 와 같은 틀에서 돈다.
// 사용자: "자유 훈련장, 여러 드리블 훈련장, 승부차기, 프리킥 같은 게임 만들어서 온라인 가능하게 하자. 다 2d, 3d 모드 별로 가능하게 하고."
// 스펙 §3.5 "3D: 지금 시제품을 온라인으로 — 시제품 딱지를 뗀다." — 그래서 이 화면의 문구에는 "시제품"이 없다.
//
// 이 파일은 three.js 를 부르지 않는다(등록부 views/index.ts 가 이걸 바로 부르고, 그 등록부는 /game/ 섬 묶음에 들어간다).
// three.js 묶음(surface3d.ts + scene.ts)은 경기 화면이 열릴 때 load() 가 받는다 — 2D 게임·목록·다른 페이지는 그 무게를 안 진다.
import type { Input, MatchConfig, MatchState } from '../../../../lib/game3d/sim';
import { TICK_HZ } from '../../../../lib/game3d/sim';
import type { Room3dSettings } from '../../../../lib/games/match3d-room';
import { resultOf3d } from '../../../../lib/games/match3d';
import { TEAM } from '../../teams';
import type { GameView, Surface, SurfaceIn } from '../types';
import { detectSfx3d } from './sfx3d';
import { Settings } from './Settings';
import { CONTROLS_3D, Solo } from './Solo';
import { clockText } from './view3d';

type Mod = { createSurface3d(o: SurfaceIn<MatchConfig>): Surface<MatchState, MatchConfig, Input> | string };
let mod: Mod | null = null;
let loading: Promise<void> | null = null;
/** three.js 묶음 받기 — 한 번만(실패하면 다음에 다시). */
function load(): Promise<void> {
  if (mod) return Promise.resolve();
  loading ??= import('./surface3d').then((m) => { mod = m; }).catch((e) => { loading = null; throw e; });
  return loading;
}

/** "5대5"·"4대5" — 골키퍼까지 센다. */
function sidesText(config: MatchConfig): string {
  const a = config.players.filter((p) => p.side === 0).length, b = config.players.length - a;
  return `${a}대${b}`;
}

export const match3dView: GameView<MatchConfig, MatchState, Input, Room3dSettings> = {
  id: 'match3d',

  // 2D 캔버스 길은 쓰지 않는다 — 공용 틀은 surface 가 있으면 이걸 부르지 않는다.
  mount: () => null,
  surface: {
    load,
    create(o) {
      if (!mod) return '화면을 불러오지 못했습니다 — 다시 열어 주세요.';
      return mod.createSurface3d(o);
    },
  },

  // 효과음 — 2D 와 같은 모듈·같은 끔 설정, 상태 변화로 알아낸다(슛 세기·땅 튕김·골키퍼 잡기·태클은 3D 에만).
  sfx: (prev, next, config) => (config ? detectSfx3d(prev, next, config) : []),

  // 결과 글은 2D 와 같게(2026-11-07 "두 모드 다 일관성 갖추게해") — 승! / 패 / 무승부, 편 이름은 팀 색 글자 「주황」「흰」.
  result(final, config, { myId, solo }) {
    const r = resultOf3d(final);
    const sub = `${clockText(config.minutes * 60 * TICK_HZ, TICK_HZ)} 경기 · ${sidesText(config)}`;
    const score = (
      <><span style={{ color: TEAM[0].color }}>{TEAM[0].short}</span> {r.score[0]} : {r.score[1]} <span style={{ color: TEAM[1].color }}>{TEAM[1].short}</span></>
    );
    const mySide = myId !== null ? config.players[myId]?.side ?? null : null;
    if (solo) {   // 혼자: "승!"·"패!"·"무승부"(2D 혼자 하기와 같은 말)
      const o = r.winner === 'draw' ? '무승부' : r.winner === (mySide ?? 0) ? '승' : '패';
      return { outcome: o === '무승부' ? o : `${o}!`, tone: o === '승' ? 'win' : o === '패' ? 'lose' : 'draw', score, sub };
    }
    // 온라인: 구경이면 "주황 승", 뛰었으면 "승!"·"패"(2D 온라인과 같은 말)
    const outcome = r.winner === 'draw' ? '무승부' : mySide === null ? `${TEAM[r.winner].short} 승` : r.winner === mySide ? '승!' : '패';
    const tone = r.winner === 'draw' ? 'draw' : mySide === null || r.winner === mySide ? 'win' : 'lose';
    return { outcome, tone, score, sub };
  },

  entry: { sub: '3D · 같이 한 판, 또는 혼자서 봇과', header: '3D 경기 · 방을 만들면 초대 링크가 생기고, 골키퍼와 빈자리는 봇이 채웁니다' },
  // 가장 작은 판(3대3 = 필드 둘 + 골키퍼)도 여섯 명이 있어야 한다.
  minRoster: 6,
  Settings,
  hostHint: '골키퍼는 늘 봇입니다 · 한 편 필드가 고른 인원보다 적으면 봇이 채웁니다 · 한 편 필드 4명까지 · 시점은 경기 중에 각자 ✕ 아래 버튼으로',
  controls: `${CONTROLS_3D} · 숫자 1~6 한마디`,
  Solo,
};
