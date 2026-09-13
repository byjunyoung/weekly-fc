// src/lib/match-videos.ts — 매치 탭은 채널 영상 목록이다(2026-09-14 사용자 결정, 스펙 §3.4).
// 시트 매치 기록 대신 빌드 때 긁어 온 영상에서 날짜·유형·장소를 읽는다.
import { parseVideoTitle } from './parse.ts';
import type { MatchType, Video } from './types.ts';

export type MatchVideo = { id: string; date: string; type: MatchType; location: string; title: string };

export function matchVideos(videos: Video[]): MatchVideo[] {
  const seen = new Set<string>();
  const out: MatchVideo[] = [];
  for (const v of videos) {
    if (!v.id || seen.has(v.id)) continue;
    seen.add(v.id);
    const p = parseVideoTitle(v);
    out.push(p
      ? { id: v.id, date: p.date, type: p.type, location: p.location, title: v.title }
      : { id: v.id, date: v.published, type: '', location: '', title: v.title });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
