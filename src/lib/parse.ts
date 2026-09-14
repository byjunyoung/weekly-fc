// src/lib/parse.ts — 유튜브 제목 → 매치 씨앗
import type { Match, MatchType, Video } from './types.ts';

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
