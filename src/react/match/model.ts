// src/react/match/model.ts — 매치 탭 계산. 화면(MatchApp)과 떨어뜨려 단위 테스트한다.
import type { MatchVideo } from '../../lib/match-videos.ts';

/** 유튜브 영상 id 모양 확인 — 시트 없이 ?v= 값만으로 상세를 그릴 때 엉뚱한 값을 막는다(옛 페이지와 같은 정규식). */
export const isValidVideoId = (id: string): boolean => /^[\w-]{11}$/.test(id);
export const findVideo = (list: MatchVideo[], id: string): MatchVideo | undefined => list.find((x) => x.id === id);
/** 카드 보조 줄 — 유형·장소를 가운뎃점으로. 옛 페이지의 meta() 그대로. */
export const videoMeta = (m: Pick<MatchVideo, 'type' | 'location'>): string => [m.type, m.location].filter(Boolean).join(' · ');
/** ?v= 값 읽기 — 브라우저에서만 부른다(빌드 시점엔 진짜 쿼리스트링이 없다). */
export const currentVideoId = (search: string): string => new URLSearchParams(search).get('v') ?? '';
