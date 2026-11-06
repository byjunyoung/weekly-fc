// 경기 화면의 소리 켬/끔 버튼(✕ 왼쪽). 고른 값은 기기에 남는다.
// 브라우저는 사람이 한 번 누르기 전엔 소리를 못 내서, 경기 화면이 뜨면 첫 누름·키 입력에서 소리 장치를 깨운다(아이폰은 그 안에서만 된다).
import { useEffect, useState } from 'react';
import { isMuted, markStale, setMuted, unlock } from './sfx';

export default function SoundToggle() {
  const [off, setOff] = useState(() => isMuted());
  useEffect(() => {
    unlock();   // 방금 [시작]을 눌렀으니 대개 여기서 바로 깨어난다
    // 표준상 터치의 pointerdown 은 "사용자 활성화"가 아니다 — 아이폰은 pointerup·touchend·click 안에서만 소리 장치를 깨운다(리뷰 #4).
    // 경기 화면은 조이스틱 쪽 touchstart 를 막아 click 이 안 날 수 있어 셋 다 캡처 단계로 단다. unlock 은 깨울 게 없으면 바로 돌아간다(싸다).
    const wake = (): void => unlock();
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    const kinds = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
    for (const k of kinds) window.addEventListener(k, wake, opts);
    const onVis = (): void => { if (!document.hidden) markStale(); };   // 앱을 바꿨다 오면 다음 손짓에 다시 깨운다
    document.addEventListener('visibilitychange', onVis);
    return () => {
      for (const k of kinds) window.removeEventListener(k, wake, opts);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return (
    <button type="button" className={`game-snd${off ? ' is-off' : ''}`} aria-pressed={!off} aria-label={off ? '소리 켜기' : '소리 끄기'}
      onClick={() => { unlock(); setMuted(!off); setOff(!off); }}>♪</button>
  );
}
