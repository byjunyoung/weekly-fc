// src/react/rules/model.ts — 운영 탭(벌금·봉사) 계산. 화면(FeesLive·DutyLive)과 떨어뜨려 단위 테스트한다.
// Node 단위 테스트가 바로 불러오므로 값 import 에는 .ts 를 붙인다.
import { FINE_AMOUNT, FINE_TYPES } from '../../lib/rules.ts';
import type { Fine, FineType, Player, RotationRow } from '../../lib/types.ts';

export type UnpaidRow = { name: string; unpaid: number; count: number; num: number | null };
/** 미납 현황 — 미납액이 있는 사람만, 많은 순(같으면 이름순). 명단에 없는 이름(퇴단 등)은 num=null 로 두어 링크 없이 그린다. */
export function unpaidRows(fines: Fine[], players: Pick<Player, 'num' | 'name'>[]): UnpaidRow[] {
  const byName = new Map<string, { unpaid: number; count: number }>();
  for (const f of fines) {
    if (f.paid) continue;
    const e = byName.get(f.player) ?? { unpaid: 0, count: 0 };
    e.unpaid += f.amount;
    e.count++;
    byName.set(f.player, e);
  }
  return [...byName]
    .map(([name, v]) => ({ name, unpaid: v.unpaid, count: v.count, num: players.find((p) => p.name === name)?.num ?? null }))
    .filter((r) => r.unpaid > 0)
    .sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name, 'ko'));
}

export const amountFor = (type: FineType): number => FINE_AMOUNT[type];

export type FineDraft = { date: string; player: string; type: FineType; amount: number };
/** 벌금 추가 모달의 처음 값 — 오늘, 명단 첫 사람, 지각, 지각 금액(지금 화면과 같다). */
export const emptyDraft = (today: string, players: Pick<Player, 'name'>[]): FineDraft =>
  ({ date: today, player: players[0]?.name ?? '', type: FINE_TYPES[0], amount: FINE_AMOUNT[FINE_TYPES[0]] });
/** 새 벌금 한 줄 — id 는 저장 시각(지금과 같다), 경기 연결 없음, 미납으로 시작. */
export const newFine = (d: FineDraft, now: number): Fine =>
  ({ id: String(now), date: d.date, match_id: '', player: d.player, type: d.type, amount: d.amount, paid: false });
export const togglePaid = (f: Fine): Fine => ({ ...f, paid: !f.paid });

// 내역 표 정렬 — antd Table 의 sorter 로 넘긴다. 문자열은 한국어 순.
export const byDate = (a: Fine, b: Fine): number => a.date.localeCompare(b.date);
export const byPlayer = (a: Fine, b: Fine): number => a.player.localeCompare(b.player, 'ko');
export const byType = (a: Fine, b: Fine): number => a.type.localeCompare(b.type, 'ko');
export const byAmount = (a: Fine, b: Fine): number => a.amount - b.amount;
export const byPaid = (a: Fine, b: Fine): number => Number(a.paid) - Number(b.paid);

/** 봉사표 연도 고르기 — 고른 해 앞뒤 한 해씩(지금 칩과 같다). */
export const yearOptions = (year: number): number[] => [year - 1, year, year + 1];
/** 당번 선택지 — 시트 값이 지금 명단에 없으면(퇴단 등) 맨 앞에 끼워 넣어, 저장된 값이 다른 이름으로 보이지 않게 한다. */
export function dutyNameOptions(names: string[], current: string): string[] {
  return current && !names.includes(current) ? [current, ...names] : names;
}
export type DutyKey = 'p1' | 'p2' | 'done';
export const changeRotation = (r: RotationRow, key: DutyKey, value: string | boolean): RotationRow => ({ ...r, [key]: value }) as RotationRow;
export const isCurrentMonth = (r: RotationRow, now: Date): boolean => r.year === now.getFullYear() && r.month === now.getMonth() + 1;
