// 브라우저 쪽 — 지금 명단을 읽어 인트로 그리기를 window 에 걸어 둔다(render.mjs 가 프레임마다 부른다).
import { fetchData } from '../../src/lib/api.ts';
import { ensureShareFonts } from '../../src/components/share-image.ts';
import { makeIntro, TIMES, FPS, type Variant } from './intro.ts';

const w = window as unknown as { introReady: Promise<number>; frame: (i: number) => string };
w.introReady = (async () => {
  await ensureShareFonts();
  const data = await fetchData();
  const canvas = document.querySelector('canvas')!;
  // 주소 끝 #변종 또는 #kick:번호
  const [v, n] = location.hash.slice(1).split(':');
  const variant = (v || 'ball') as Variant;
  const draw = makeIntro(canvas, data.players, variant, n ? Number(n) : undefined);
  w.frame = (i: number) => { draw(i / FPS); return canvas.toDataURL('image/png'); };
  return Math.round(TIMES[variant].end * FPS);
})();
