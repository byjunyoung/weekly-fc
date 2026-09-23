// 운영 탭 「봉사」 봉사표 — 연도 고르기, 월별 당번 두 명(대등하게 한 칸에 나란히), 완료. 관리자는 표에서 바로 고친다.
// 쓰기는 지금과 같은 write('writeRotation', …)이고, 성공하면 api.ts 가 refresh → wfc:data 로 다시 그려진다.
import { App, Button, Checkbox, Segmented, Select, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useState } from 'react';
import { serializeRotation, write } from '../../lib/api';
import { upcomingRows, yearRows } from '../../lib/rotation';
import type { RotationRow } from '../../lib/types';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';
import { useData } from '../useData';
import { changeRotation, dutyNameOptions, isCurrentMonth, yearOptions } from './model';
import type { DutyKey } from './model';

function Duty() {
  const { message } = App.useApp();
  const { data } = useData();
  const admin = useAdmin();
  // 이번 달·올해는 보는 사람의 시계로 — 표와 연도 고르기는 데이터가 온 뒤(브라우저)에만 그리므로 빌드 시각과 섞이지 않는다.
  const [now] = useState(() => new Date());
  const [year, setYear] = useState(() => now.getFullYear());
  // 기본은 이번 달부터 석 달 — 지난 달까지 열두 줄을 늘 펼쳐 두면 페이지 길이 대부분을 차지한다.
  const [all, setAll] = useState(false);
  // 저장 중인 줄 — 요청·새로고침이 끝날 때까지 방금 고른 값으로 보여주고, 그 줄은 잠가 같은 줄 덮어쓰기를 막는다.
  const [pending, setPending] = useState<Record<string, RotationRow>>({});
  const rowId = (r: RotationRow) => `${r.year}-${r.month}`;

  const save = async (r: RotationRow, key: DutyKey, value: string | boolean) => {
    const id = rowId(r);
    const next = changeRotation(pending[id] ?? r, key, value);
    setPending((p) => ({ ...p, [id]: next }));
    try {
      await write('writeRotation', serializeRotation(next));
      message.success('저장됨');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPending((p) => { const rest = { ...p }; delete rest[id]; return rest; });
    }
  };
  const names = data ? data.players.map((p) => p.name) : [];
  const pick = (r: RotationRow, k: 'p1' | 'p2') => {
    const id = rowId(r);
    const shown = pending[id] ?? r;
    return (
      <Select size="small" value={shown[k]} popupMatchSelectWidth={false} style={{ minWidth: 96 }} aria-label={`${r.month}월 당번 ${k === 'p1' ? 1 : 2}`}
        disabled={id in pending} loading={id in pending}
        options={dutyNameOptions(names, shown[k]).map((n) => ({ value: n, label: n }))} onChange={(v: string) => save(r, k, v)} />
    );
  };
  const cols: TableColumnsType<RotationRow> = [
    { title: '월', dataIndex: 'month', render: (m: number, r) => <>{r.year !== now.getFullYear() && `${r.year}년 `}{m}월{isCurrentMonth(r, now) && <> <span className="label">이번 달</span></>}</> },
    {
      title: '당번', key: 'pair',
      render: (_: unknown, r) => {
        const shown = pending[rowId(r)] ?? r;
        return <span className="duty-pair">{admin ? <>{pick(r, 'p1')}{pick(r, 'p2')}</> : <><b>{shown.p1}</b><b>{shown.p2}</b></>}</span>;
      },
    },
    {
      title: '완료', dataIndex: 'done', align: 'center',
      render: (_: boolean, r) => {
        const id = rowId(r);
        const shown = pending[id] ?? r;
        return admin
          ? <Checkbox checked={shown.done} aria-label={`${r.month}월 완료`} disabled={id in pending} onChange={(e) => save(r, 'done', e.target.checked)} />
          : shown.done ? '✓' : '';
      },
    },
  ];

  // id 자리는 데이터가 오기 전(빌드 때)에도 그린다 — 연도 고르기·표는 데이터가 온 뒤에.
  return (
    <>
      <div className="row rules-live-head">
        <span className="label">봉사표</span>
        <div id="duty-year" className="row">
          {data && all && <Segmented<number> size="small" value={year} aria-label="봉사표 연도" options={yearOptions(year).map((y) => ({ value: y, label: String(y) }))} onChange={setYear} />}
          {data && <Button size="small" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? '가까운 달만' : '1년 전체'}</Button>}
        </div>
      </div>
      <div id="duty-app">
        {data && <Table<RotationRow> size="small" rowKey={rowId} pagination={false} columns={cols}
          dataSource={all ? yearRows(data.players, data.rotation, year, now) : upcomingRows(data.players, data.rotation, now)}
          rowClassName={(r) => (isCurrentMonth(r, now) ? 'row-current' : '')} />}
      </div>
    </>
  );
}

export default function DutyLive() {
  return <ThemeRoot><div className="rules-live"><Duty /></div></ThemeRoot>;
}
