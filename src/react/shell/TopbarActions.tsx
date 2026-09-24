// 상단바 오른쪽 — 로그인(이메일 코드)·이름 차지·관리자 버튼, 토스트(window.wfcToast).
// 2026-09-24 본인인증: 자칭 "나" 고르기와 관리자 PIN 을 걷고 로그인으로 바꿨다. 설계: specs/2026-09-24-email-auth-design.md
// 옛 화면이 듣는 wfc:me · wfc:admin 은 auth.ts 가 계속 보낸다. 홈 「라커룸」 빈 자리는 wfc:open-me 로 이 창을 연다.
import { App, Button, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { claim, claimedNums, refreshMe } from '../../lib/api';
import { adminOn, cachedMe, logout, sendCode, setAdminOn, verifyCode, type Me } from '../../lib/auth';
import ThemeRoot from '../ThemeRoot';
import { useData } from '../useData';
import { adminLabel, meLabel, pickOrder } from './labels';

type Step = 'email' | 'code' | 'claim' | 'account';

function useMeState(): Me {
  const [me, setMe] = useState<Me>({ login: false });
  useEffect(() => {
    const read = () => setMe(cachedMe());
    read();
    window.addEventListener('wfc:me', read);
    return () => window.removeEventListener('wfc:me', read);
  }, []);
  return me;
}

function Actions() {
  const { message } = App.useApp();
  const { data } = useData();
  const players = data?.players ?? [];
  const me = useMeState();
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<number[]>([]);
  const codeRef = useRef<InputRef>(null);

  // 페이지마다 한 번 서버에서 다시 읽는다 — 다른 기기에서 차지했거나 관리자가 풀었으면 여기서 맞춰진다.
  useEffect(() => { refreshMe().catch(() => {}); }, []);
  useEffect(() => {
    const read = () => setOn(adminOn());
    read();
    window.addEventListener('wfc:admin', read);
    return () => window.removeEventListener('wfc:admin', read);
  }, []);

  const openFlow = () => {
    setErr(null);
    const m = cachedMe();
    const s: Step = !m.login ? 'email' : m.num ? 'account' : 'claim';
    setStep(s);
    if (s === 'claim') claimedNums().then(setTaken).catch(() => {});
    setOpen(true);
  };
  useEffect(() => {
    window.addEventListener('wfc:open-me', openFlow);
    return () => window.removeEventListener('wfc:open-me', openFlow);
  }, []);

  // 옛 화면의 toast()(src/lib/html.ts)가 부르는 다리.
  useEffect(() => {
    const w = window as unknown as { wfcToast?: (m: string) => void };
    w.wfcToast = (m: string) => { message.open({ content: m, duration: 2.2 }); };
    return () => { delete w.wfcToast; };
  }, [message]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message || '연결에 실패했습니다'); } finally { setBusy(false); }
  };
  const onSend = () => run(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('이메일 주소를 확인해 주세요');
    await sendCode(email);
    setCode(''); setStep('code');
    setTimeout(() => codeRef.current?.focus(), 50);
  });
  const onVerify = () => run(async () => {
    if (!/^\d{6}$/.test(code.trim())) throw new Error('메일로 온 6자리 숫자를 넣어 주세요');
    await verifyCode(email, code);
    const m = await refreshMe();
    if (m.num) { setOpen(false); message.success(`${m.name ?? ''} 로그인`); }
    else { setTaken(await claimedNums().catch(() => [])); setStep('claim'); }
  });
  const onClaim = (num: number) => run(async () => {
    const m = await claim(num);
    setOpen(false);
    message.success(`${m.name ?? ''}(으)로 등록했습니다`);
  });
  const onLogout = () => run(async () => { await logout(); setOpen(false); });

  const label = !me.login ? '로그인' : me.num ? meLabel(players, me.num) : '이름 고르기';
  const title = step === 'email' || step === 'code' ? '로그인' : step === 'claim' ? '나는 누구?' : '내 계정';

  return (
    <>
      <Button size="small" id="me-btn" onClick={openFlow}>{label}</Button>
      {me.admin && (
        <Button size="small" id="admin-btn" type={on ? 'primary' : 'default'} onClick={() => setAdminOn(!on)}>{adminLabel(on)}</Button>
      )}

      <Modal title={title} open={open} width={460} onCancel={() => setOpen(false)} destroyOnHidden
        footer={step === 'email' ? [
          <Button key="c" onClick={() => setOpen(false)}>닫기</Button>,
          <Button key="go" type="primary" loading={busy} onClick={onSend}>코드 받기</Button>,
        ] : step === 'code' ? [
          <Button key="back" disabled={busy} onClick={() => { setStep('email'); setErr(null); }}>이메일 다시</Button>,
          <Button key="go" type="primary" loading={busy} onClick={onVerify}>확인</Button>,
        ] : step === 'claim' ? [
          <Button key="out" disabled={busy} onClick={onLogout}>로그아웃</Button>,
        ] : [
          <Button key="out" loading={busy} onClick={onLogout}>로그아웃</Button>,
          <Button key="c" type="primary" onClick={() => setOpen(false)}>닫기</Button>,
        ]}>
        {step === 'email' && (
          <>
            <p className="muted">이메일로 6자리 코드를 보내 드립니다. 대결·꾸미기는 로그인해야 할 수 있습니다.</p>
            <Input id="login-email" type="email" inputMode="email" autoComplete="email" placeholder="이메일" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} onPressEnter={onSend} />
          </>
        )}
        {step === 'code' && (
          <>
            <p className="muted">{email.trim()} 로 보낸 6자리 코드를 넣어 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
            <Input ref={codeRef} id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onPressEnter={onVerify} />
          </>
        )}
        {step === 'claim' && (
          <>
            <p className="muted">명단에서 본인을 고르세요. 한 번 고르면 바꿀 수 없고, 잘못 골랐으면 관리자에게 풀어 달라고 하세요.
              회색 이름은 이미 다른 사람이 골랐습니다.</p>
            <div className="pick-list" id="me-list">
              {pickOrder(players).map((p) => (
                <Button key={p.num} disabled={busy || taken.includes(p.num)} onClick={() => onClaim(p.num)}>{p.num} {p.name}</Button>
              ))}
            </div>
          </>
        )}
        {step === 'account' && (
          <p>{me.name} <span className="muted">· {me.email}</span></p>
        )}
        {err && <p className="warn" id="login-err">{err}</p>}
      </Modal>
    </>
  );
}

export default function TopbarActions() {
  return <ThemeRoot><Actions /></ThemeRoot>;
}
