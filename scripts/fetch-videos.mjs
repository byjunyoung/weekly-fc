// scripts/fetch-videos.mjs — 채널 영상 목록을 빌드 시점에 긁어 src/data/videos.json 에 박는다.
//
// 왜 이렇게 하나:
//   1) YouTube Data API 고급 서비스는 Apps Script 기본 GCP 프로젝트에서 켤 수 없다(에디터
//      수동 조작 필요). 2) RSS(feeds/videos.xml)는 2026-09 기준 채널 id 가 맞는데도 404 를
//      돌려준다 — 개인 맥에서도 같다. 남은 경로가 채널 페이지의 ytInitialData 뿐이다.
// 실패는 치명이 아니다: 이미 있는 videos.json 을 그대로 두고 종료한다. 목록이 최신이 아닐
// 뿐 화면은 뜬다. 유튜브가 마크업을 또 바꾸면 여기만 고치면 된다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CHANNEL = 'https://www.youtube.com/@WEEKLYFC2020/videos';
const OUT = new URL('../src/data/videos.ts', import.meta.url);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** 제목 앞머리 YYMMDD → ISO 날짜. 이 채널의 제목 규칙이 "260905 | 위클리FC …" 이라
 *  상대시간("3주 전")보다 정확하고, 매치 가져오기 파서와도 같은 근거를 쓴다. */
function dateFromTitle(title) {
  const m = /(\d{2})(\d{2})(\d{2})/.exec(title.trim());
  if (!m) return '';
  const [, yy, mm, dd] = m;
  const y = 2000 + Number(yy);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return '';
  return `${y}-${mm}-${dd}`;
}

function extract(html) {
  const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
  if (!m) throw new Error('ytInitialData 없음 — 유튜브 마크업이 바뀌었을 수 있다');
  const data = JSON.parse(m[1]);
  const out = [];
  const seen = new Set();
  // 2026-09 현재 채널 영상 목록은 lockupViewModel(구 videoRenderer) 로 온다.
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const lv = node.lockupViewModel;
    if (lv && typeof lv.contentId === 'string' && !seen.has(lv.contentId)) {
      const title = firstContent(lv.metadata);
      if (title) { seen.add(lv.contentId); out.push({ id: lv.contentId, title, published: dateFromTitle(title) }); }
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(data);
  return out;
}

/** metadata 트리에서 처음 나오는 의미 있는 content 문자열 = 영상 제목. */
function firstContent(node) {
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) { for (const v of node) { const r = firstContent(v); if (r) return r; } return ''; }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'content' && typeof v === 'string' && v.trim().length > 3) return v.trim();
    const r = firstContent(v);
    if (r) return r;
  }
  return '';
}

/** 생성 파일 본문. JSON 이 아니라 .ts 로 내는 이유: node --test 는 확장자 없는 JSON import 를
 *  못 풀고, import attributes 를 쓰면 TS·Vite 양쪽 설정이 늘어난다. 타입까지 붙어 나오는 게 낫다. */
const render = (videos) => `// src/data/videos.ts — 생성 파일. 직접 고치지 말 것.
// scripts/fetch-videos.mjs 가 채널 페이지에서 긁어 덮어쓴다(빌드 전 prebuild 로 자동 실행).
import type { Video } from '../lib/types';

export const VIDEOS: Video[] = [
${videos.map((v) => `  { id: ${JSON.stringify(v.id)}, title: ${JSON.stringify(v.title)}, published: ${JSON.stringify(v.published)} }`).join(',\n')},
];
`;

const keepExisting = (why) => {
  const had = existsSync(OUT) ? (readFileSync(OUT, 'utf8').match(/\{ id:/g) || []).length : 0;
  console.warn(`[videos] ${why} — 기존 목록 ${had}건 유지`);
  if (!had) writeFileSync(OUT, render([]));
};

try {
  const res = await fetch(CHANNEL, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) { keepExisting(`채널 페이지 ${res.status}`); process.exit(0); }
  const videos = extract(await res.text());
  if (!videos.length) { keepExisting('영상 0건'); process.exit(0); }
  videos.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  writeFileSync(OUT, render(videos));
  console.log(`[videos] ${videos.length}건 저장 · 최신 ${videos[0].published} ${videos[0].title}`);
} catch (e) {
  keepExisting(e.message);
}
