// 상단바 버튼·모달 글자 — 화면과 떨어뜨려 단위 테스트한다(tests/unit/shell-labels.test.mjs).
import type { LoginResult } from '../../lib/api';
import type { Player } from '../../lib/types';

export const meLabel = (players: Pick<Player, 'num' | 'name'>[], me: number | null): string =>
  players.find((p) => p.num === me)?.name ?? '이름';
export const adminLabel = (admin: boolean): string => (admin ? '관리자 모드 끄기' : '관리자');
export const pickOrder = <T extends Pick<Player, 'num'>>(players: T[]): T[] => [...players].sort((a, b) => a.num - b.num);
export const pinError = (r: Exclude<LoginResult, 'ok'>): string =>
  r === 'bad-pin' ? 'PIN이 올바르지 않습니다.' : '연결에 실패했습니다 · 다시 시도';
