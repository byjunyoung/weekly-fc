// src/react/stats/StatsApp.tsx — 관리자 통계(2026-09-28 "누가 얼마나 접속했고 사용자 현황 파악"). 관리자 모드에서만.
// 위: 요약 숫자 넷. 가운데: 날짜별 막대 둘(방문 기기 · 대결 판수) — 단위가 달라 한 차트에 겹치지 않는다.
// 아래: 선수별 표(계정 연결·최근 활동·방문·대결·방명록·POTM 표)와 아직 계정을 안 붙인 선수.
// 방문 기록은 2026-09-28 부터 쌓인다 — 로그인 안 한 방문은 기기 수로만 잡히고 누구인지 모른다.
import { Button, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { fetchAdminStats, type AdminStats, type StatDay, type StatPerson } from '../../lib/api';
import { ACTIVITY_KO, activityOf, ago, kpis, lastActive, type Activity } from '../../lib/adminStats';
import { href } from '../../lib/url';
import Loading from '../Loading';
import ThemeRoot from '../ThemeRoot';
import { useAdmin } from '../useAdmin';

const H = 160, PAD = { l: 30, r: 8, t: 10, b: 22 };
const md = (day: string) => { const [, m, d] = day.split('-').map(Number); return `${m}/${d}`; };

/** 막대 하나짜리 날짜별 차트. 대면 그날 숫자(와 보조 숫자)를 아래 한 줄에. */
function Bars({ days, value, sub, label }: { days: StatDay[]; value: (d: StatDay) => number; sub: (d: StatDay) => string; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vals = days.map(value);
  const max = Math.max(1, ...vals);
  const step = (W - PAD.l - PAD.r) / Math.max(1, days.length);
  const bw = Math.max(2, step - 2);   // 막대 사이 2px
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const i = Math.floor(((e.clientX - b.left) / b.width * W - PAD.l) / step);
    setHover(i >= 0 && i < days.length ? i : null);
  };
  const h = hover != null ? days[hover] : days[days.length - 1];
  return (
    <div className="st-chart" ref={boxRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 최근 ${days.length}일`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {[max, Math.round(max / 2), 0].map((t) => (
          <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="sh-grid" /><text x={PAD.l - 5} y={y(t) + 4} textAnchor="end" className="sh-axis">{t}</text></g>
        ))}
        {days.map((d, i) => {
          const v = vals[i];
          const top = y(v);
          return <rect key={d.day} x={PAD.l + i * step + 1} y={top} width={bw} height={Math.max(0, H - PAD.b - top)} className={`st-bar${hover === i ? ' is-on' : ''}`} rx={2} />;
        })}
        {days.length > 0 && <text x={PAD.l} y={H - 6} className="sh-axis">{md(days[0].day)}</text>}
        {days.length > 0 && <text x={W - PAD.r} y={H - 6} textAnchor="end" className="sh-axis">{md(days[days.length - 1].day)}</text>}
      </svg>
      <p className="sh-tip">{h ? <><b>{value(h)}</b> {label} · {md(h.day)}{sub(h) ? ` · ${sub(h)}` : ''}</> : null}</p>
    </div>
  );
}

function Stats() {
  const admin = useAdmin();
  const [s, setS] = useState<AdminStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = () => { setErr(null); fetchAdminStats().then((x) => { setS(x); setNow(Date.now()); }).catch((e) => setErr((e as Error).message)); };
  useEffect(() => { if (admin) load(); }, [admin]);

  const head = (
    <div className="page-head"><h1>통계</h1><div className="actions">{admin && <Button onClick={load}>새로고침</Button>}</div></div>
  );
  if (!admin) return <>{head}<div className="card"><p className="muted">관리자 모드에서만 볼 수 있습니다.</p></div></>;
  if (err) return <>{head}<div className="card"><p className="muted">{err}</p></div></>;
  if (!s) return <Loading title="통계" />;

  const k = kpis(s, now);
  const people = [...s.people].sort((a, b) => (Date.parse(lastActive(b) ?? '0') || 0) - (Date.parse(lastActive(a) ?? '0') || 0) || a.num - b.num);
  const unclaimed = s.people.filter((p) => !p.claimedAt);
  const cols: TableColumnsType<StatPerson> = [
    { title: '선수', key: 'name', fixed: 'left', render: (_, p) => <a href={href(`/squad/${p.num}/`)}>{p.name}</a> },
    { title: '최근 활동', key: 'act', sorter: (a, b) => (Date.parse(lastActive(a) ?? '0') || 0) - (Date.parse(lastActive(b) ?? '0') || 0),
      render: (_, p) => { const a: Activity = activityOf(p, now); return <span className={`st-act st-act-${a}`}>{a === 'none' && !lastActive(p) ? ACTIVITY_KO.none : ago(lastActive(p), now)}</span>; } },
    { title: '계정', key: 'claimed', sorter: (a, b) => Number(!!a.claimedAt) - Number(!!b.claimedAt),
      render: (_, p) => (p.claimedAt ? <span>연결</span> : <span className="muted">미연결</span>) },
    { title: '방문일(30일)', dataIndex: 'visitDays', align: 'right', sorter: (a, b) => a.visitDays - b.visitDays },
    { title: '페이지뷰(30일)', dataIndex: 'views', align: 'right', sorter: (a, b) => a.views - b.views },
    { title: '대결', dataIndex: 'duels', align: 'right', sorter: (a, b) => a.duels - b.duels },
    { title: '대결(7일)', dataIndex: 'duels7d', align: 'right', sorter: (a, b) => a.duels7d - b.duels7d },
    { title: '방명록', dataIndex: 'guestbook', align: 'right', sorter: (a, b) => a.guestbook - b.guestbook },
    { title: 'POTM 표', dataIndex: 'potmVotes', align: 'right', sorter: (a, b) => a.potmVotes - b.potmVotes },
  ];

  return (
    <>
      {head}
      <div className="stack">
        <div className="st-kpis">
          <div className="card st-kpi"><span className="label">오늘 방문</span><b>{k.todayDevices}</b><span className="muted">기기 · 페이지뷰 {k.todayViews}</span></div>
          <div className="card st-kpi"><span className="label">오늘 접속 팀원</span><b>{k.todayMembers}</b><span className="muted">로그인한 사람만</span></div>
          <div className="card st-kpi"><span className="label">7일 활동 팀원</span><b>{k.active7}</b><span className="muted">/ {k.total}명 · 대결 {k.duels7}판</span></div>
          <div className="card st-kpi"><span className="label">계정 연결</span><b>{k.claimed}</b><span className="muted">/ {k.total}명 ({Math.round((k.claimed / Math.max(1, k.total)) * 100)}%)</span></div>
        </div>

        <div className="st-charts">
          <div className="card"><h2>날짜별 방문</h2>
            <Bars days={s.days} value={(d) => d.devices} label="기기" sub={(d) => `팀원 ${d.members} · 페이지뷰 ${d.views}`} />
          </div>
          <div className="card"><h2>날짜별 대결</h2>
            <Bars days={s.days} value={(d) => d.duels} label="판" sub={() => ''} />
          </div>
        </div>
        <p className="muted st-note">방문 기록은 9/28부터 쌓입니다. 로그인 안 한 방문은 기기 수로만 잡혀 누구인지 모릅니다. 폰과 PC로 들어오면 기기 둘로 셉니다.</p>

        <div className="card">
          <div className="card-head"><h2>선수별 현황</h2><span className="muted">최근 활동 순 · 머리를 누르면 정렬</span></div>
          <Table<StatPerson> size="small" rowKey="num" pagination={false} columns={cols} dataSource={people} scroll={{ x: 'max-content' }} showSorterTooltip={false} />
        </div>

        {unclaimed.length > 0 && (
          <div className="card">
            <div className="card-head"><h2>아직 계정 안 붙인 선수</h2><span className="muted">{unclaimed.length}명 — 로그인해 이름을 고르면 대결·투표를 할 수 있습니다</span></div>
            <p className="st-chips">{unclaimed.map((p) => <a key={p.num} className="tm-chip" href={href(`/squad/${p.num}/`)}><b>{p.name}</b></a>)}</p>
          </div>
        )}
      </div>
    </>
  );
}

export default function StatsApp() {
  return <ThemeRoot><Stats /></ThemeRoot>;
}
