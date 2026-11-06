// 경기 화면의 소리 켬/끔 버튼(✕ 왼쪽). 고른 값은 기기에 남는다.
// 브라우저는 사람이 한 번 누르기 전엔 소리를 못 내서, 경기 화면이 뜨면 첫 누름·키 입력에서 소리 장치를 깨운다(아이폰은 그 안에서만 된다).
import { useEffect, useState } from 'react';
import { isMuted, setMuted, unlock } from './sfx';

export default function SoundToggle() {
  const [off, setOff] = useState(() => isMuted());
  useEffect(() => {
    unlock();   // 방금 [시작]을 눌렀으니 대개 여기서 바로 깨어난다
    const wake = (): void => unlock();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
  }, []);
  return (
    <button type="button" className={`game-snd${off ? ' is-off' : ''}`} aria-pressed={!off} aria-label={off ? '소리 켜기' : '소리 끄기'}
      onClick={() => { unlock(); setMuted(!off); setOff(!off); }}>♪</button>
  );
}
