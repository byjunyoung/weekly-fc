// 상단바 버튼·모달 글자 — 화면과 떨어뜨려 단위 테스트한다(tests/unit/shell-labels.test.mjs).
import type { Player } from '../../lib/types';

export const meLabel = (players: Pick<Player, 'num' | 'name'>[], me: number | null): string =>
  players.find((p) => p.num === me)?.name ?? '이름';
/** 이름 메뉴의 관리자 전환 항목(2026-09-28 — 따로 있던 [관리자] 버튼을 이름 메뉴로 옮김). */
export const adminLabel = (admin: boolean): string => (admin ? '관리자 모드 끄기' : '관리자 모드 켜기');
export const pickOrder = <T extends Pick<Player, 'num'>>(players: T[]): T[] => [...players].sort((a, b) => a.num - b.num);
