// src/react/home/model.ts — 홈 대시보드 계산. 화면(HomeApp)과 떨어뜨려 단위 테스트한다.
import { matchVideos } from '../../lib/match-videos.ts';
import { rotationFor } from '../../lib/rotation.ts';
import { fineSummary, ovr } from '../../lib/stats.ts';
import { monthLabel } from '../../lib/html.ts';
import type { Data, Video } from '../../lib/types.ts';

export type MeTile = { kind: 'picked'; ovr: number; name: string; pos: string; num: number } | { kind: 'empty' };
export type DutyTile = { p1: string; p2: string; monthLabel: string; sub: string };
export type RecentMatch = { id: string; typeLabel: string; date: string } | null; // typeLabel: 매치 유형(예 "2파전") — 영상 제목이 아니다
export type HomeSummary = {
  meTile: MeTile; squadCount: number; posSummary: string; matchCount: number;
  duty: DutyTile; dutyNext: DutyTile; unpaidAmount: number; unpaidCount: number;
  videoCount: number; thumbIds: string[]; recentMatch: RecentMatch; stamp: string;
};

/** 다음 달 — 12월 다음은 다음 해 1월. */
export const nextMonthOf = (y: number, mo: number): { y: number; mo: number } => (mo >= 12 ? { y: y + 1, mo: 1 } : { y, mo: mo + 1 });

export function computeHomeSummary(data: Data, videos: Video[], me: number | null, now: Date): HomeSummary {
  const y = now.getFullYear(), mo = now.getMonth() + 1;
  const dutyRow = rotationFor(data.players, data.rotation, y, mo, now);
  const nm = nextMonthOf(y, mo);
  const dutyNextRow = rotationFor(data.players, data.rotation, nm.y, nm.mo, now);
  const fs = fineSummary(data.fines);
  const p = data.players.find((x) => x.num === me);
  const meTile: MeTile = p ? { kind: 'picked', ovr: ovr(p), name: p.name, pos: p.pos || '–', num: p.num } : { kind: 'empty' };
  const posSummary = (['GK', 'DF', 'MF', 'FW'] as const).map((k) => `${k} ${data.players.filter((x) => x.pos === k).length}`).join(' · ');
  const mv = matchVideos(videos);
  const first = mv[0];
  return {
    meTile, squadCount: data.players.length, posSummary, matchCount: mv.length,
    duty: { p1: dutyRow.p1, p2: dutyRow.p2, monthLabel: monthLabel(y, mo), sub: dutyRow.done ? '완료' : '대관비·조끼·정산' },
    dutyNext: { p1: dutyNextRow.p1, p2: dutyNextRow.p2, monthLabel: monthLabel(nm.y, nm.mo), sub: monthLabel(nm.y, nm.mo) },
    unpaidAmount: fs.unpaid, unpaidCount: fs.unpaidCount,
    videoCount: videos.length, thumbIds: videos.slice(0, 4).map((v) => v.id),
    recentMatch: first ? { id: first.id, typeLabel: first.type || '매치', date: first.date } : null,
    stamp: `${data.players.length}명 · 영상 ${videos.length}`,
  };
}
