// 운영 규칙의 벌금 기준표 — 바뀌지 않는 내용이라 rules.astro 가 client 지시어 없이 불러 빌드 때만 그린다(JS 0).
import { Table } from 'antd';
import { fmtWon } from '../../lib/html';
import { FINE_AMOUNT, FINE_NOTE, FINE_TYPES } from '../../lib/rules';
import ThemeRoot from '../ThemeRoot';

const rows = FINE_TYPES.map((t) => ({ key: t, type: t, note: FINE_NOTE[t], amount: FINE_AMOUNT[t] }));

export default function FineRulesTable() {
  return (
    <ThemeRoot>
      <Table size="small" pagination={false} dataSource={rows}
        columns={[
          { title: '유형', dataIndex: 'type' },
          { title: '기준', dataIndex: 'note' },
          { title: '금액', dataIndex: 'amount', align: 'right', render: (a: number) => fmtWon(a) },
        ]} />
    </ThemeRoot>
  );
}
