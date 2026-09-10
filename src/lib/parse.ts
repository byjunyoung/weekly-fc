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

const STOP = new Set(['참석', '불참', '미정', '투표', '결과', '명', '용병', '정회원', '합계', '총', '님']);

export function parseAttendance(text: string, players: Player[]): { matched: string[]; unmatched: string[] } {
  const names = players.map((p) => p.name).filter(Boolean);
  const matched: string[] = [], unmatched: string[] = [];
  const push = (arr: string[], n: string) => { if (!arr.includes(n)) arr.push(n); };
  for (const raw of text.split(/[\n,、·/]+|\s+/)) {
    const tok = raw.replace(/[^가-힣]/g, '');
    if (!tok || STOP.has(tok)) continue;
    const exact = names.find((n) => n === tok);
    if (exact) { push(matched, exact); continue; }
    const partial = tok.length >= 2 ? names.filter((n) => n.includes(tok) || tok.includes(n)) : [];
    if (partial.length === 1) push(matched, partial[0]); else push(unmatched, tok);
  }
  return { matched, unmatched };
}
