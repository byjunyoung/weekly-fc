// 상단바 오른쪽 — 이름·관리자 버튼과 두 모달, 토스트(window.wfcToast).
// 옛 화면(운영·선수 상세·스쿼드)이 듣는 wfc:admin 은 계속 보낸다. 홈 「내 선수」 타일은 #me-btn 을 대신 누른다.
// Modal 이 맡는 것: 포커스 트랩, Esc 닫기, role="dialog"·aria-modal, 스크롤 잠금, 닫을 때 포커스 복귀.
import { App, Button, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { login, logout } from '../../lib/api';
import { setMe } from '../../lib/me';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { useMe } from '../useMe';
import { adminLabel, meLabel, pickOrder, pinError } from './labels';

function Actions() {
  const { message } = App.useApp();
  const { data } = useData();
  const players = data?.players ?? [];
  const me = useMe();
  const admin = useAdmin();
  const [meOpen, setMeOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<InputRef>(null);

  // 옛 화면의 toast()(src/lib/html.ts)가 부르는 다리. 섬이 뜨기 전 알림은 없다 — 알림은 모두 사용자 조작 뒤에 난다.
  useEffect(() => {
    const w = window as unknown as { wfcToast?: (m: string) => void };
    w.wfcToast = (m: string) => { message.open({ content: m, duration: 2.2 }); };
    return () => { delete w.wfcToast; };
  }, [message]);

  const onAdmin = () => {
    if (admin) { logout(); window.dispatchEvent(new Event('wfc:admin')); return; }
    setPin(''); setPinErr(null); setPinOpen(true);
  };
  const submitPin = async () => {
    if (busy) return;
    setBusy(true);
    const r = await login(pin.trim());
    setBusy(false);
    if (r === 'ok') { setPinOpen(false); window.dispatchEvent(new Event('wfc:admin')); }
    else setPinErr(pinError(r));
  };
  const pick = (num: number | null) => { setMe(num); setMeOpen(false); };

  return (
    <>
      <Button size="small" id="me-btn" onClick={() => setMeOpen(true)}>{meLabel(players, me)}</Button>
      <Button size="small" id="admin-btn" type={admin ? 'primary' : 'default'} onClick={onAdmin}>{adminLabel(admin)}</Button>

      <Modal title="관리자 모드" open={pinOpen} width={460} onCancel={() => setPinOpen(false)}
        afterOpenChange={(open) => { if (open) pinRef.current?.focus(); }}
        footer={[
          <Button key="cancel" onClick={() => setPinOpen(false)}>취소</Button>,
          <Button key="ok" type="primary" loading={busy} onClick={submitPin}>확인</Button>,
        ]}>
        <p className="muted">관리자 PIN을 입력하세요.</p>
        <Input.Password ref={pinRef} id="pin-input" inputMode="numeric" maxLength={8} autoComplete="off" visibilityToggle={false}
          value={pin} onChange={(e) => setPin(e.target.value)} onPressEnter={submitPin} />
        {pinErr && <p className="warn" id="pin-err">{pinErr}</p>}
      </Modal>

      <Modal title="내 이름 고르기" open={meOpen} width={460} onCancel={() => setMeOpen(false)}
        footer={[
          <Button key="clear" onClick={() => pick(null)}>지우기</Button>,
          <Button key="close" onClick={() => setMeOpen(false)}>닫기</Button>,
        ]}>
        <p className="muted">명단에서 본인을 고르면 이 기기에 기억됩니다.</p>
        <div className="pick-list" id="me-list">
          {pickOrder(players).map((p) => (
            <Button key={p.num} type={p.num === me ? 'primary' : 'default'} onClick={() => pick(p.num)}>{p.num} {p.name}</Button>
          ))}
        </div>
      </Modal>
    </>
  );
}

export default function TopbarActions() {
  return <ThemeRoot><Actions /></ThemeRoot>;
}
