// src/react/rules/model.ts — 운영 탭(봉사) 계산. 화면(DutyLive)과 떨어뜨려 단위 테스트한다.
// Node 단위 테스트가 바로 불러오므로 값 import 에는 .ts 를 붙인다.
import type { RotationRow } from '../../lib/types.ts';

/** 봉사표 연도 고르기 — 고른 해 앞뒤 한 해씩(지금 칩과 같다). */
export const yearOptions = (year: number): number[] => [year - 1, year, year + 1];
/** 당번 선택지 — 시트 값이 지금 명단에 없으면(퇴단 등) 맨 앞에 끼워 넣어, 저장된 값이 다른 이름으로 보이지 않게 한다. */
export function dutyNameOptions(names: string[], current: string): string[] {
  return current && !names.includes(current) ? [current, ...names] : names;
}
export type DutyKey = 'p1' | 'p2' | 'done';
export const changeRotation = (r: RotationRow, key: DutyKey, value: string | boolean): RotationRow => ({ ...r, [key]: value }) as RotationRow;
export const isCurrentMonth = (r: RotationRow, now: Date): boolean => r.year === now.getFullYear() && r.month === now.getMonth() + 1;
