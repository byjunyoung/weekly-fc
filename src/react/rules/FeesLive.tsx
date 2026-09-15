// 운영 탭 「비용·벌금」의 살아 있는 부분 — 미납 현황, 내역, 관리자 벌금 추가·납부 처리·삭제.
// 쓰기는 지금과 같은 api.ts 호출이고, 성공하면 api.ts 가 refresh → wfc:data 로 표가 다시 그려진다.
import { App, Button, DatePicker, Form, InputNumber, Modal, Popconfirm, Select, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { serializeFine, write } from '../../lib/api';
import { fmtDate, fmtWon, seoulToday } from '../../lib/html';
import { FINE_TYPES } from '../../lib/rules';
import { fineSummary } from '../../lib/stats';
import type { Fine, FineType } from '../../lib/types';
import { href } from '../../lib/url';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { amountFor, byAmount, byDate, byPaid, byPlayer, byType, emptyDraft, newFine, togglePaid, unpaidRows } from './model';
import type { FineDraft, UnpaidRow } from './model';

// 날짜 선택 달력이 필요한 곳이 이 섬뿐이라, 로케일도 모든 페이지가 아니라 여기서만 켠다.
dayjs.locale('ko');

type FormValues = { date: Dayjs; player: string; type: FineType; amount: number };

function Fees() {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  const [form] = Form.useForm<FormValues>();
  const [open, setOpen] = useState(false); // 모달 열림 여부 — draft 와 분리해 닫는 애니메이션 중에도 내용이 남아 있게 한다
  const [draft, setDraft] = useState<FineDraft | null>(null); // null 이면 폼 초기값 없음(애니메이션 끝난 뒤 비운다)
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set()); // 줄별 진행 표시 — `${id}:pay` / `${id}:del`

  // 관리자 모드가 꺼지면(핀 재확인 실패 등) 모달도 같이 닫는다.
  useEffect(() => { if (!admin) setOpen(false); }, [admin]);

  const summary = data ? fineSummary(data.fines) : null;
  const playerLink = (name: string) => {
    const p = data?.players.find((x) => x.name === name);
    return p ? <a href={href(`/squad/${p.num}/`)}>{name}</a> : name;
  };
  // 납부 처리·삭제 — 누른 줄만 진행 표시, 실패하면 오류 문구만 띄운다.
  const run = async (key: string, action: string, payload: unknown) => {
    setBusy((b) => new Set(b).add(key));
    try {
      await write(action, payload);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(key); return next; });
    }
  };
  const save = async (v: FormValues) => {
    setSaving(true);
    try {
      await write('writeFine', serializeFine(newFine({ date: v.date.format('YYYY-MM-DD'), player: v.player, type: v.type, amount: v.amount }, Date.now())));
      setOpen(false);
      message.success('저장됨');
    } catch (e) {
      message.error((e as Error).message); // 모달·입력값은 그대로 둔다(스펙 §6)
    } finally {
      setSaving(false);
    }
  };

  const unpaidCols: TableColumnsType<UnpaidRow> = [
    { title: '이름', dataIndex: 'name', render: (_: string, r) => (r.num != null ? <a href={href(`/squad/${r.num}/`)}>{r.name}</a> : r.name) },
    { title: '건수', dataIndex: 'count', align: 'right', render: (c: number) => `${c}건` },
    { title: '미납액', dataIndex: 'unpaid', align: 'right', render: (u: number) => <b className="warn">{fmtWon(u)}</b> },
  ];
  const fineCols: TableColumnsType<Fine> = [
    { title: '날짜', dataIndex: 'date', sorter: byDate, defaultSortOrder: 'descend', render: (d: string) => fmtDate(d) },
    { title: '이름', dataIndex: 'player', sorter: byPlayer, render: (n: string) => playerLink(n) },
    { title: '유형', dataIndex: 'type', sorter: byType },
    { title: '금액', dataIndex: 'amount', align: 'right', sorter: byAmount, render: (a: number) => fmtWon(a) },
    {
      title: '납부', dataIndex: 'paid', sorter: byPaid,
      render: (_: boolean, f) => (admin
        ? <Button size="small" type={f.paid ? 'default' : 'primary'} loading={busy.has(`${f.id}:pay`)} onClick={() => run(`${f.id}:pay`, 'writeFine', serializeFine(togglePaid(f)))}>{f.paid ? '완료' : '납부 처리'}</Button>
        : f.paid ? '완료' : <span className="warn">미납</span>),
    },
    ...(admin ? [{
      key: 'del', title: '',
      render: (_: unknown, f: Fine) => (
        <Popconfirm title="이 벌금 기록을 지울까요?" okText="삭제" cancelText="취소" okButtonProps={{ danger: true }} onConfirm={() => run(`${f.id}:del`, 'deleteFine', { id: f.id })}>
          <Button size="small" danger loading={busy.has(`${f.id}:del`)}>삭제</Button>
        </Popconfirm>
      ),
    }] : []),
  ];

  // id 자리는 데이터가 오기 전(빌드 때)에도 그린다 — 표·버튼만 데이터가 온 뒤에.
  return (
    <>
      <div className="row rules-live-head">
        <span className="label">미납 현황 <span id="fees-total">{summary && `· ${fmtWon(summary.unpaid)} (${summary.unpaidCount}건)`}</span></span>
        <span id="fees-actions">{admin && data && <Button id="fees-add" onClick={() => { setDraft(emptyDraft(seoulToday(), data.players)); setOpen(true); }}>벌금 추가</Button>}</span>
      </div>
      <div id="fees-unpaid">
        {data && <Table<UnpaidRow> size="small" rowKey="name" pagination={false} columns={unpaidCols} dataSource={unpaidRows(data.fines, data.players)} locale={{ emptyText: '미납 없음' }} />}
      </div>
      <span className="label">내역</span>
      <div id="fees-app">
        {data && <Table<Fine> size="small" rowKey="id" pagination={false} scroll={{ x: 'max-content' }} showSorterTooltip={false} columns={fineCols} dataSource={data.fines} locale={{ emptyText: '벌금 기록이 없습니다' }} />}
      </div>
      <Modal title="벌금 기록" open={open} width={460} destroyOnHidden afterClose={() => setDraft(null)} onCancel={() => setOpen(false)}
        okText="저장" cancelText="취소" confirmLoading={saving} onOk={() => form.submit()}
        cancelButtonProps={{ disabled: saving }} maskClosable={!saving} closable={!saving} keyboard={!saving}>
        {draft && data && (
          <Form<FormValues> form={form} id="fine-form" layout="vertical" clearOnDestroy initialValues={{ ...draft, date: dayjs(draft.date) }} onFinish={save}
            onValuesChange={(changed: Partial<FormValues>) => { if (changed.type) form.setFieldValue('amount', amountFor(changed.type)); }}>
            <Form.Item name="date" label="날짜" rules={[{ required: true, message: '날짜를 고르세요' }]}>
              <DatePicker format="YYYY-MM-DD" allowClear={false} inputReadOnly style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="player" label="이름" rules={[{ required: true, message: '이름을 고르세요' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} options={data.players.map((p) => ({ value: p.name, label: p.name }))} />
            </Form.Item>
            <Form.Item name="type" label="유형">
              <Select options={FINE_TYPES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="amount" label="금액" rules={[{ required: true, message: '금액을 넣으세요' }]}>
              <InputNumber min={0} step={10000} suffix="원" style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  );
}

export default function FeesLive() {
  return <ThemeRoot><div className="rules-live"><Fees /></div></ThemeRoot>;
}
