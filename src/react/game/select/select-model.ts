// src/react/game/select/select-model.ts — 선수 선택 화면의 순수 계산(2026-11-07). 그리기·DOM 없이 node 테스트가 그대로 가져온다.
// 사용자: "모드 선택, 선수 선택 (능력치도 보이게) 선택한 선수 크게 오른쪽에 다른 선수 리스트 선택 가능하게하면 좋을듯. 약간 옛날 오락실게임에서 고르듯이".
// 하는 일: ① 명단 정렬(등번호 순), ② 격자 안 커서 이동(줄 끝·마지막 덜 찬 줄에서 감아 돌기), ③ 큰 칸에 보일 능력치 줄(배치 전 구분), ④ 못 고르는 이유.
import { cardModel, type CardModel } from '../../../lib/card.ts';
import type { Tier } from '../../../lib/tier.ts';
import type { Player } from '../../../lib/types.ts';

/** 등번호(jersey) 순, 같으면 고유 번호(num) 순 — 사람이 아는 번호대로 줄을 세운다. 원본은 그대로. */
export function sortRoster(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => (a.jersey || 9999) - (b.jersey || 9999) || a.num - b.num);
}

export type CursorKey = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

/** 키보드 이름 → 커서 방향. 모르는 키는 null. */
export function keyToCursor(key: string): CursorKey | null {
  switch (key) {
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'Home': return 'home';
    case 'End': return 'end';
    default: return null;
  }
}

/** 격자(count 칸, 한 줄 cols 칸) 안에서 커서를 옮긴다. 감아 돌기 규칙:
 *  - 좌우는 줄을 넘어 이어진다(오른쪽 끝 → 다음 줄 처음, 마지막 칸 → 첫 칸, 첫 칸에서 왼쪽 → 마지막 칸).
 *  - 위: 첫 줄이면 같은 칸의 맨 아래 줄로(그 줄이 덜 차서 그 칸이 없으면 한 줄 위).
 *  - 아래: 아래 칸이 있으면 그리로. 마지막 줄이면 같은 칸의 첫 줄로. 마지막 줄이 덜 차서 바로 아래가 비었으면 마지막 칸으로.
 *  count 0 이면 -1, 이상한 cols·index 는 안쪽으로 자른다. */
export function moveCursor(index: number, key: CursorKey, count: number, cols: number): number {
  if (count <= 0) return -1;
  const c = Math.max(1, Math.floor(cols) || 1);
  const i = Math.min(count - 1, Math.max(0, Math.floor(index) || 0));
  const lastRow = Math.floor((count - 1) / c), row = Math.floor(i / c), col = i % c;
  switch (key) {
    case 'left': return i === 0 ? count - 1 : i - 1;
    case 'right': return i === count - 1 ? 0 : i + 1;
    case 'home': return 0;
    case 'end': return count - 1;
    case 'up': {
      if (row > 0) return i - c;
      const t = lastRow * c + col;
      return t < count ? t : t - c;
    }
    case 'down': {
      if (i + c < count) return i + c;
      if (row < lastRow) return count - 1;   // 덜 찬 마지막 줄 — 바로 아래가 비었다
      return col;                            // 마지막 줄 → 같은 칸의 첫 줄
    }
  }
}

/** 큰 칸의 능력치. 여섯 칸이 모두 0 이면 아직 배치 전(rated=false) — 막대 대신 "배치 전". 순서는 포털 카드와 같다. */
export function statRows(p: Player, tier: Tier | null | undefined): { model: CardModel; rated: boolean } {
  const model = cardModel(p, tier);
  return { model, rated: model.stats.some((s) => s.value > 0) };
}

/** 못 고르는 선수와 그 이유. 이유가 비었으면 기본 문구. */
export type Disabled = ReadonlyMap<number, string>;
export function disabledReason(num: number, disabled: Disabled | undefined): string | null {
  if (!disabled || !disabled.has(num)) return null;
  return disabled.get(num) || '고를 수 없는 선수';
}

/** 처음 커서 자리 — 고른 선수, 없으면 첫 번째 고를 수 있는 선수, 그것도 없으면 0. */
export function initialCursor(list: readonly Player[], selected: number | null, disabled?: Disabled): number {
  const i = selected === null ? -1 : list.findIndex((p) => p.num === selected);
  if (i >= 0) return i;
  const j = list.findIndex((p) => !disabled?.has(p.num));
  return j >= 0 ? j : 0;
}
