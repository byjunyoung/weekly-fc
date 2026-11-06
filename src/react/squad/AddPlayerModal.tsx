// src/react/squad/AddPlayerModal.tsx — 명단에서 바로 선수 추가(2026-09-28). 능력치는 여기서 넣지 않는다 —
// 저장 뒤 배치 대결(/squad/place/)에서 기존 선수들과 비교해 정한다(스펙 2026-09-28-admin-roster-design.md §3).
import { App, Button, Form, Input, Modal, Segmented, Select } from 'antd';
import { useState } from 'react';
import { serializePlayer, write, refresh } from '../../lib/api';
import { FOOT_OPTIONS } from '../../lib/card';
import type { Player } from '../../lib/types';
import { href } from '../../lib/url';
import { newPlayer, nextFreeJersey, POS_OPTIONS } from './model';
import NumberPicker from './NumberPicker';

type Values = { name: string; jersey: number; pos: Player['pos']; foot: string };

export default function AddPlayerModal({ open, onClose, players }: { open: boolean; onClose: () => void; players: Player[] }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState<'place' | 'only' | null>(null);

  const save = async (then: 'place' | 'only') => {
    let v: Values;
    try { v = await form.validateFields(); } catch { return; }
    setSaving(then);
    try {
      // 고유 번호는 화면이 정한다 — 낡은 명단으로 정하면 이미 있는 선수와 겹쳐 그 선수를 덮어쓴다(서버는 같은 num 이면 고친다).
      // 그래서 저장 직전에 명단을 새로 읽고, 못 읽으면 저장하지 않는다.
      const fresh = (await refresh()).players;
      if (fresh.some((p) => p.jersey === v.jersey)) { message.error(`${v.jersey}번은 이미 쓰는 등번호입니다`); setSaving(null); return; }
      const np = newPlayer(fresh, v);
      await write('writePlayer', serializePlayer(np));
      location.href = href(then === 'place' ? `/squad/place/?num=${np.num}` : `/squad/${np.num}/`);
    } catch (e) {
      message.error((e as Error).message);
      setSaving(null);
    }
  };

  return (
    <Modal title="선수 추가" open={open} width={520} destroyOnHidden onCancel={onClose}
      maskClosable={!saving} closable={!saving} keyboard={!saving}
      footer={[
        <Button key="only" disabled={!!saving} loading={saving === 'only'} onClick={() => save('only')}>저장만</Button>,
        <Button key="place" type="primary" disabled={!!saving} loading={saving === 'place'} onClick={() => save('place')}>저장하고 능력치 배치</Button>,
      ]}>
      <Form<Values> form={form} layout="vertical" clearOnDestroy
        initialValues={{ name: '', jersey: nextFreeJersey(players) ?? undefined, pos: '', foot: '오른발' }}>
        <Form.Item name="name" label="이름" rules={[{ required: true, whitespace: true, message: '이름을 넣으세요' }]}><Input autoFocus maxLength={20} /></Form.Item>
        <Form.Item name="pos" label="포지션"><Segmented className="chips" options={POS_OPTIONS} /></Form.Item>
        <Form.Item name="foot" label="주발"><Select options={FOOT_OPTIONS.map((x) => ({ value: x, label: x }))} /></Form.Item>
        <Form.Item name="jersey" label="등번호" rules={[{ required: true, message: '번호를 고르세요' }]}><NumberPicker players={players} /></Form.Item>
      </Form>
      <p className="muted">능력치는 다음 화면에서 기존 선수들과 한 명씩 비교해 정합니다.</p>
    </Modal>
  );
}
