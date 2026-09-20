// src/react/player/model.ts — 선수 상세 계산. 화면(PlayerDetail)과 떨어뜨려 단위 테스트한다.
import type { Fine, Player } from '../../lib/types.ts';

export type PlayerFineSummary = { fines: Fine[]; unpaid: number; total: number };
/** 이 선수의 벌금 내역 — 미납 합계·전체 합계. 표의 정렬은 antd Table 의 sorter 가 맡으므로 원본 순서를 그대로 돌려준다. */
export function playerFineSummary(fines: Fine[], playerName: string): PlayerFineSummary {
  const mine = fines.filter((f) => f.player === playerName);
  const unpaid = mine.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0);
  const total = mine.reduce((s, f) => s + f.amount, 0);
  return { fines: mine, unpaid, total };
}

export type PlayerFormValues = {
  num: number; name: string; pos: Player['pos']; detail: string; foot: string; vest: number | null; rot: number | null; phone: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; note: string;
};
/** 편집 폼 기본값 — 있으면 그 선수 값, 없으면(새 선수) 번호만 넣고 능력치는 70(지금 폼과 같다). */
export function playerFormDefaults(num: number, existing: Player | undefined): PlayerFormValues {
  if (existing) return {
    num: existing.num, name: existing.name, pos: existing.pos, detail: existing.detail, foot: existing.foot,
    vest: existing.vest, rot: existing.rot, phone: existing.phone ?? '',
    pace: existing.pace, dribble: existing.dribble, pass: existing.pass, shoot: existing.shoot, defend: existing.defend, stamina: existing.stamina,
    note: existing.note,
  };
  return { num, name: '', pos: '', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' };
}

/** 폼 값 → 저장할 Player. avatar 는 이 폼에 없는 필드다(잠금 없는 별도 에디터가 전담) — writePlayer 가 열을 통째로
 *  덮어쓰므로, 여기서 지금 저장된 값을 그대로 옮기지 않으면 빈 문자열로 지워진다. */
export const playerFromForm = (v: PlayerFormValues, prevAvatar: string): Player => ({
  num: v.num, name: v.name.trim(), pos: v.pos, detail: v.detail.trim(), foot: v.foot.trim(), vest: v.vest, note: v.note.trim(), rot: v.rot,
  pace: v.pace, dribble: v.dribble, pass: v.pass, shoot: v.shoot, defend: v.defend, stamina: v.stamina, phone: v.phone.trim(), avatar: prevAvatar,
});

/** 번호를 바꾸려는 값이 이미 다른 선수 번호와 겹치는지. 번호를 안 바꾸면(newNum === currentNum) 겹침이 아니다. */
export const numClash = (players: Player[], newNum: number, currentNum: number): Player | undefined =>
  newNum !== currentNum ? players.find((p) => p.num === newNum) : undefined;

// 벌금 내역 표 정렬(스펙 §5 "정렬 포함"). 문자열은 한국어 순.
export const byDate = (a: Fine, b: Fine): number => a.date.localeCompare(b.date);
export const byType = (a: Fine, b: Fine): number => a.type.localeCompare(b.type, 'ko');
export const byAmount = (a: Fine, b: Fine): number => a.amount - b.amount;
export const byPaid = (a: Fine, b: Fine): number => Number(a.paid) - Number(b.paid);
