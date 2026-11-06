// src/lib/games/entry.ts — 등록부에 오르는 게임 한 줄의 모양(2026-11-07). 타입만 — 실행되는 코드가 없다.
// 설계: docs/superpowers/specs/2026-11-07-games-program-design.md §2
//
// 따로 둔 이유: 메시지 검사(net.ts)와 세션은 "게임을 id 로 찾는 함수"(GameLookup)만 받아 쓴다. 등록부(registry.ts)를 직접 부르면
// 그 안의 2D 경기 계산까지 딸려 와서, 세션이 2D 경기에 몰래 기대지 않는다는 걸 보일 수 없다(테스트가 가짜 게임으로 세션을 돌린다).
import type { Player } from '../types.ts';
import type { RoomState } from '../game/room.ts';
import type { GameAdapter } from './adapter.ts';

/** 사용자: "그냥 모드를 2d 모드, 3d 모드로 정의하고" — 목록이 모드별 탭이고, 방은 그 방 게임의 모드 안에서만 게임을 바꾼다. */
export type GameMode = '2d' | '3d';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GameEntry<C = any, S = any, I = any, T = any> = {
  adapter: GameAdapter<C, S, I>;
  mode: GameMode;
  /** 카드·게임 종류 칩에 쓰는 이름(예: '경기'). */
  name: string;
  /** 목록 카드의 한두 문장. */
  describe: string;
  /** 목록 카드의 작은 꼬리표. */
  tags: readonly string[];
  /** 방을 만들거나 이 게임으로 처음 바꿀 때의 설정. 방이 복사해서 쓴다(이 객체는 고치지 않는다). */
  defaultSettings: T;
  /** 채널에서 온 방 설정의 모양 검사(room 메시지 — 지금 게임 것과 saved 에 든 것 모두). */
  okSettings(v: unknown): v is T;
  /** 방장이 설정을 고칠 때(순수). 범위 밖은 자르고, 바뀐 게 없으면 cur 그대로(같은 객체 — 방이 "보낼 게 없다"를 안다). */
  applySettings(cur: T, patch: unknown): T;
  /** 시작 — 방과 명단으로 이 판의 설정을 만든다. slots[i] = i 번 자리를 조종하는 clientId(봇이면 null).
   *  못 만들면 RangeError(startBlock 이 미리 막는 경우). 난수는 rnd 로만. */
  buildConfig(room: RoomState<T>, roster: Player[], rnd: () => number): { config: C; slots: (string | null)[] };
  /** [시작] 을 막는 이유(화면 문구). 없으면 null. 없는 게임은 늘 시작할 수 있다. */
  startBlock?(room: RoomState<T>, roster: Player[]): string | null;
  /** 방 화면의 팀 칸에 흐리게 보일 봇 자리 수(편마다). 편이 없는 게임은 두지 않는다(봇 칸을 안 그린다). */
  botSeats?(room: RoomState<T>): [number, number];
  /** 방 화면의 사람 칸(2026-11-07 2단계 — 자유 훈련장). 'teams'(없을 때와 같다) = 주황 | 대기 | 흰 세 칸, 방장이 옮기고 자동 나누기.
   *  'all' = 편이 없는 게임 — "참가" 한 칸에 방 사람 모두, 옮기기·자동 나누기·봇 칸이 없다. buildConfig 는 칸(team)을 보지 말고
   *  방 사람을 들어온 차례로 앞에서부터 MAX_HUMANS(8)명 뛰게 하고 나머지는 구경시킨다(방장이 맨 앞이라 늘 뛴다). */
  lobby?: 'teams' | 'all';
};

/** id → 등록된 게임(없으면 undefined). 세션·메시지 검사는 이 함수만 받는다. */
export type GameLookup = (id: string) => GameEntry | undefined;
