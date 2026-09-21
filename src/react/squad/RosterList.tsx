// src/react/squad/RosterList.tsx — 명단 목록·카드·표 + 포지션 필터·검색·보기 전환.
// 어느 보기를 쓸지는 부르는 쪽이 정한다 — /squad/ 는 표·카드, /lineup/ 은 좁은 칸에 들어가는 목록 하나.
// 목록·카드는 옛 문자열(dangerouslySetInnerHTML) 그대로, 표만 진짜 antd Table 로 바꾼다
// (옛 표의 정렬 시 행 이동 애니메이션은 접는다 — antd Table 자체 동작을 받아들인다, 3단계와 같은 결).
import { Input, Segmented, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { avatarSvg, avatarFaceSvg } from '../../components/avatar';
import { playerCard, STAT_LABEL } from '../../components/player-card';
import { avatarSpecFor } from '../../lib/avatar';
import { href } from '../../lib/url';
import { isStarter, type LineupState } from '../../lib/lineup';
import { band, grade, ovr, STAT_CUTS } from '../../lib/stats';
import { STAT_KEYS, type Player } from '../../lib/types';
import { ALL_VIEWS, byOvr, type View } from './model';

const VIEW_LABEL: Record<View, string> = { list: '목록', card: '카드', table: '표' };

export default function RosterList({ view, onViewChange, views = ALL_VIEWS, pos, onPosChange, q, onQChange, rows, st, onPick }: {
  view: View; onViewChange: (v: View) => void;
  /** 이 화면이 고를 수 있는 보기. 하나뿐이면 전환 칩을 아예 그리지 않는다(라인업은 목록 고정). */
  views?: View[];
  pos: string; onPosChange: (p: string) => void;
  q: string; onQChange: (q: string) => void;
  rows: Player[]; st: LineupState; onPick: (num: number) => void;
}) {
  // 목록·카드 뷰의 「선발/넣기」 버튼은 옛 문자열 템플릿 안 data-pick 속성으로 남아 있다 — 행마다
  // 리스너를 안 붙이고 바깥 한 곳에서 위임으로 받는다(옛 코드와 같은 이유: 다시 그릴 때마다 innerHTML 이
  // 통째로 바뀐다).
  const onBodyClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    if (el) onPick(Number(el.dataset.pick));
  };
  const onBodyKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"][data-pick]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(Number(el.dataset.pick)); }
  };

  const columns: TableColumnsType<Player> = [
    { title: '선발', key: 'pick', align: 'center', width: 64,
      render: (_, p) => { const on = isStarter(st, p.num);
        return <button type="button" className={on ? 'primary' : ''} onClick={() => onPick(p.num)} aria-pressed={on}>{on ? '선발' : '넣기'}</button>; } },
    { title: '', key: 'avatar', align: 'center', width: 44,
      render: (_, p) => <span dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 32, p.num) }} /> },
    { title: '#', dataIndex: 'num', key: 'num', align: 'right', sorter: (a, b) => a.num - b.num },
    { title: '이름', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name, 'ko'),
      render: (_, p) => <a href={href(`/squad/${p.num}/`)}><b>{p.name}</b></a> },
    { title: '포지션', dataIndex: 'pos', key: 'pos', sorter: (a, b) => a.pos.localeCompare(b.pos, 'ko'),
      render: (_, p) => <span className="cell-pos"><span className={`pos pos-${p.pos.toLowerCase()}`}>{p.pos || '–'}</span><span className="muted">{p.detail}</span></span> },
    ...STAT_KEYS.map((k) => ({
      title: STAT_LABEL[k], dataIndex: k, key: k, align: 'right' as const,
      sorter: (a: Player, b: Player) => a[k] - b[k],
      render: (_: unknown, p: Player) => <span className={`val val-${band(p[k], STAT_CUTS)}`}>{p[k] || '–'}</span>,
    })),
    { title: 'OVR', key: 'ovr', align: 'right', sorter: (a, b) => ovr(a) - ovr(b), defaultSortOrder: 'descend' as const,
      render: (_, p) => <b className={`val val-${band(ovr(p), STAT_CUTS)}`}>{ovr(p) || '–'}</b> },
  ];

  return (
    <>
      <div className="bd-list-head">
        <Segmented className="chips" value={pos} onChange={(v) => onPosChange(String(v))}
          options={[{ label: '전체', value: 'ALL' }, { label: 'GK', value: 'GK' }, { label: 'DF', value: 'DF' }, { label: 'MF', value: 'MF' }, { label: 'FW', value: 'FW' }]} />
        <Input className="w-search" placeholder="이름" allowClear value={q} onChange={(e) => onQChange(e.target.value)} />
        {views.length > 1 && (
          <Segmented className="chips" value={view} onChange={(v) => onViewChange(v as View)}
            options={views.map((v) => ({ label: VIEW_LABEL[v], value: v }))} />
        )}
      </div>
      <div id="list-body" className={view === 'table' ? 'tbl-wrap' : view === 'card' ? 'pcard-wall' : ''}
        onClick={view !== 'table' ? onBodyClick : undefined} onKeyDown={view !== 'table' ? onBodyKeyDown : undefined}>
        {view === 'table' ? (
          <Table<Player> size="small" rowKey="num" pagination={false} columns={columns} dataSource={rows}
            locale={{ emptyText: '명단이 비어 있습니다' }} />
        ) : view === 'card' ? (
          rows.length ? byOvr(rows).map((p) => {
            const on = isStarter(st, p.num);
            return (
              <div className="bd-cardcell" key={p.num}>
                <div className={`bd-cardpick${on ? ' is-on' : ''}`} role="button" tabIndex={0} data-pick={p.num} aria-pressed={on}
                  dangerouslySetInnerHTML={{ __html: playerCard(p, avatarSvg(avatarSpecFor(p.num, p.avatar), 112, p.num, true)) }} />
                <a className="bd-card-link" href={href(`/squad/${p.num}/`)}>선수 페이지 ›</a>
              </div>
            );
          }) : <p className="pcard-empty">명단이 비어 있습니다</p>
        ) : rows.length ? (
          <div className="bd-rows">
            {byOvr(rows).map((p) => {
              const on = isStarter(st, p.num);
              return (
                <div className={`bd-row${on ? ' is-on' : ''}`} key={p.num}>
                  <button type="button" className="bd-pick" data-pick={p.num} aria-pressed={on}>
                    <span className={`pos pos-${p.pos.toLowerCase()}`}>{p.pos || '–'}</span><b>{p.name}</b>
                    <span className={`bd-row-ovr grade-${grade(ovr(p))}`}>{ovr(p) || '–'}</span>
                    {on ? <span className="bd-on">선발</span> : <span />}
                  </button>
                  <a className="bd-row-link" href={href(`/squad/${p.num}/`)} aria-label={`${p.name} 선수 페이지`}>›</a>
                </div>
              );
            })}
          </div>
        ) : <p className="pcard-empty">명단이 비어 있습니다</p>}
      </div>
    </>
  );
}
