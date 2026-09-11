// src/lib/motion.ts — 모션 원칙을 한 곳에. 인터랙션(게임 인터페이스 재설계 8절)은
// "상태 변화가 있는 자리에만" 두고, prefers-reduced-motion이면 전부 끈다.
// 막대 차오름·카드 뒤집기는 CSS 트랜지션/애니메이션만으로 충분해 여기 없다
// (styles/tokens.css의 관련 규칙과 그 안의 reduced-motion 미디어쿼리 참고).
// 카운트업만 텍스트 내용을 프레임마다 바꿔야 해서 JS가 필요하다.

export function reducedMotion(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** el의 텍스트를 0→target으로 easeOutCubic으로 센다. target<=0이거나
 * reduced-motion이면 애니메이션 없이 바로 최종 텍스트를 넣는다. */
export function countUp(el: HTMLElement, target: number, format: (n: number) => string = (n) => String(n), duration = 600): void {
  if (target <= 0 || reducedMotion()) { el.textContent = format(Math.max(0, target)); return; }
  const start = performance.now();
  const tick = (now: number): void => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
