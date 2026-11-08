// src/react/player/model.ts — 선수 상세 계산. 화면(PlayerDetail)과 떨어뜨려 단위 테스트한다.
import type { Player, StatLogRow } from '../../lib/types.ts';

export type PlayerFormValues = {
  num: number; jersey: number; name: string; pos: Player['pos']; detail: string; foot: string; vest: number | null; rot: number | null; phone: string;
  pace: number; dribble: number; pass: number; shoot: number; defend: number; stamina: number; note: string;
};
/** 편집 폼 기본값 — 있으면 그 선수 값, 없으면(새 선수) 번호만 넣고 능력치는 70(지금 폼과 같다). */
export function playerFormDefaults(num: number, existing: Player | undefined): PlayerFormValues {
  if (existing) return {
    num: existing.num, jersey: existing.jersey, name: existing.name, pos: existing.pos, detail: existing.detail, foot: existing.foot,
    vest: existing.vest, rot: existing.rot, phone: existing.phone ?? '',
    pace: existing.pace, dribble: existing.dribble, pass: existing.pass, shoot: existing.shoot, defend: existing.defend, stamina: existing.stamina,
    note: existing.note,
  };
  return { num, jersey: num, name: '', pos: '', detail: '', foot: '', vest: null, rot: null, phone: '', pace: 70, dribble: 70, pass: 70, shoot: 70, defend: 70, stamina: 70, note: '' };
}

/** 폼 값 → 저장할 Player. avatar 는 이 폼에 없는 필드다(잠금 없는 별도 에디터가 전담) — writePlayer 가 열을 통째로
 *  덮어쓰므로, 여기서 지금 저장된 값을 그대로 옮기지 않으면 빈 문자열로 지워진다. */
export const playerFromForm = (v: PlayerFormValues, prevAvatar: string): Player => ({
  num: v.num, jersey: v.jersey, name: v.name.trim(), pos: v.pos, detail: v.detail.trim(), foot: v.foot.trim(), vest: v.vest, note: v.note.trim(), rot: v.rot,
  pace: v.pace, dribble: v.dribble, pass: v.pass, shoot: v.shoot, defend: v.defend, stamina: v.stamina, phone: v.phone.trim(), avatar: prevAvatar,
});

/** 이 줄이 왜 생겼나 — 대결 상대·배치·POTM 보상. 판정자 이름은 관리자에게만(2026-09-29 "팀원에겐 익명") —
 *  서버가 관리자가 아니면 이름을 비워 보내고, 관리자도 관리자 모드를 켰을 때만 보여 준다.
 *  본인이 낀 대결의 판정만은 누구에게나 「본인 판정」(2026-11-08). */
export function why(r: StatLogRow, showJudge: boolean): string {
  if (r.via === 'potm') return 'POTM 보상';
  if (r.via === 'game' && r.oppName && r.by != null && (r.by === r.num || r.by === r.opp)) return `vs ${r.oppName} · 본인 판정`;
  if (!showJudge || !r.byName) {
    if (r.via === 'game') return r.oppName ? `vs ${r.oppName}` : '대결';
    if (r.via === 'place') return '배치';
    return '직접 고침';
  }
  if (r.via === 'place') return `${r.byName || '관리자'} · 배치`;
  if (r.via === 'game') {
    const who = r.byName || '누군가';
    return r.oppName ? `vs ${r.oppName} · ${who}의 판정` : `${who}의 판정`;
  }
  return `${r.byName || '누군지 모름'} · 직접 고침`;
}
