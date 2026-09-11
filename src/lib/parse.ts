// src/lib/parse.ts — 유튜브 제목 → 매치 씨앗, 카톡 붙여넣기 → 참석자
import type { Match, MatchType, Player, Video } from './types.ts';

export type ParsedVideo = { id: string; date: string; type: MatchType; location: string; title: string };

export function parseVideoTitle(v: Video): ParsedVideo | null {
  const m = v.title.match(/^\s*(\d{6})\s*\|/);
  if (!m) return null;
  const d = m[1];
  const date = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
  const parts = v.title.split('|').map((s) => s.trim()).slice(1);
  const t = v.title.match(/(\d)파전/);
  const type: MatchType = t?.[1] === '2' ? '2파전' : t?.[1] === '3' ? '3파전' : '';
  const last = parts[parts.length - 1] ?? '';
  const location = parts.length >= 2 && /(공원|풋살장|구장)/.test(last) ? last : '';
  return { id: v.id, date, type, location, title: v.title };
}

export function proposeMatches(videos: Video[], matches: Match[]): Match[] {
  const have = new Set(matches.map((m) => m.date));
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const v of videos) {
    const p = parseVideoTitle(v);
    if (!p || have.has(p.date) || seen.has(p.date)) continue;
    seen.add(p.date);
    out.push({ id: p.date, date: p.date, location: p.location, youtube: p.id, type: p.type, attendees: [], teams: [], winner: '' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// 이름이 아닌 낱말 — 구획 머리말(참석·불참…)과 집계 낱말(명·합계…)이 이름으로 잡히지 않게 한다.
const STOP = new Set(['참석', '참여', '참가', '가능', '불참', '미참', '불가', '기권', '노쇼', '미정', '보류',
  '투표', '결과', '인원', '명', '용병', '정회원', '합계', '총', '님']);

/** 카톡 투표 결과에는 "참석 (15)" / "불참 (3)" 같은 구획 머리가 섞여 온다. 머리를 못 읽으면
 *  불참자까지 참석으로 들어가므로, 줄 단위로 어느 구획 안인지부터 판정한다.
 *  한 줄이 머리이면서 이름도 담는 경우("참석: 김현서, 이찬우")가 있어 머리 판정 후에도
 *  그 줄의 나머지를 같은 구획으로 이어서 읽는다. */
type Section = 'in' | 'out' | 'skip';
const IN_HEAD = /(참석|참여|가능|참가|ㅇㅇ|^o+$|^O+$)/i;
const OUT_HEAD = /(불참|미참|불가|안\s*감|못\s*감|노쇼|기권|^x+$|^X+$)/i;
const HOLD_HEAD = /(미정|보류|아직|모름)/;

export function sectionOf(line: string): Section | null {
  const t = line.trim();
  if (!t) return null;
  // 불참·미정을 먼저 본다 — "불참"에도 "참"이 들어 있어 순서를 뒤집으면 전부 참석으로 읽힌다.
  if (OUT_HEAD.test(t)) return 'out';
  if (HOLD_HEAD.test(t)) return 'skip';
  if (IN_HEAD.test(t)) return 'in';
  return null;
}

export function parseAttendance(text: string, players: Player[]): { matched: string[]; unmatched: string[] } {
  const names = players.map((p) => p.name).filter(Boolean);
  const matched: string[] = [], unmatched: string[] = [];
  const push = (arr: string[], n: string) => { if (!arr.includes(n)) arr.push(n); };
  const lines = text.split(/\r?\n/);
  // 구획 머리가 하나도 없으면 예전처럼 글 전체를 참석 명단으로 본다 — 이름만 죽 적어 보내는
  // 경우가 실제로 많고, 그때까지 못 읽게 만들 이유가 없다.
  const hasHead = lines.some((l) => sectionOf(l) !== null);
  // 머리가 있는 글이면 첫 머리가 나오기 전(제목·날짜 줄)은 어느 구획도 아니므로 버린다.
  let cur: Section = hasHead ? 'skip' : 'in';
  for (const line of lines) {
    let body = line;
    if (hasHead) {
      const head = sectionOf(line);
      if (head) { cur = head; body = line.replace(/^[^:：]*[:：]/, ''); }
      if (cur !== 'in') continue;
    }
    for (const raw of body.split(/[,、·/]+|\s+/)) {
      const tok = raw.replace(/[^가-힣]/g, '');
      if (!tok || STOP.has(tok)) continue;
      const exact = names.find((n) => n === tok);
      if (exact) { push(matched, exact); continue; }
      const partial = tok.length >= 2 ? names.filter((n) => n.includes(tok) || tok.includes(n)) : [];
      if (partial.length === 1) push(matched, partial[0]); else push(unmatched, tok);
    }
  }
  return { matched, unmatched };
}
