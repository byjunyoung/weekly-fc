// 공유 이미지 두 곳(라인업·티어표)이 같이 쓰는 파일 공유 도우미. ShareModal 에서 떼어 냈다(2026-09-24).
import type { ShareEnv } from '../lib/share';

export function shareEnv(file: File | null): ShareEnv {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  let canShareFiles = false;
  try { canShareFiles = !!file && typeof nav.share === 'function' && !!nav.canShare?.({ files: [file] }); } catch { canShareFiles = false; }
  return { canShareFiles, ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints || 0 };
}
/** data:URL → File. toBlob 콜백/프라미스를 거치지 않아 완전히 동기다 — 그려진 파일을 바로
 *  navigator.share 에 넘겨야 사용자 제스처가 유지된다. */
export function dataUrlToFile(url: string, name: string): File {
  const base64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'image/png' });
}
