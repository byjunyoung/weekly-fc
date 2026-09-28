// src/react/player/StatHistory.tsx — 선수 페이지 「능력치 기록」(2026-09-28 "고친 기록 보는 거 좀 더 재밌게").
// 위: 항목 칩 + 주가 차트(선 하나, 마우스·손가락을 대면 그 시점 값과 누가 바꿨는지). 가운데: 팬 1호·천적(티어 게임 판정 합계).
// 아래: 날짜별로 묶은 게임 로그(▲ 초록 / ▼ 빨강). 계산은 lib/history.ts, 데이터는 서버 stat_history(전체 기록).
import { Button, Segmented } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { fetchStatHistory } from '../../lib/api';
import { byDay, change, judges, series, type HistKey, type Point } from '../../lib/history';
import { STAT_KO } from '../../lib/stats';
import { STAT_KEYS, type Player, type StatLogRow } from '../../lib/types';
import { href } from '../../lib/url';

const KEYS: Array<{ value: HistKey; label: string }> = [{ value: 'ovr', label: '종합' }, ...STAT_KEYS.map((k) => ({ value: k as HistKey, label: STAT_KO[k] }))];
const H = 180, PAD = { l: 34, r: 12, t: 12, b: 24 };

const mmdd = (ts: string): string => { const t = Date.parse(ts); if (Number.isNaN(t)) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const hhmm = (ts: string): string => { const t = Date.parse(ts); if (Number.isNaN(t)) return ''; const d = new Date(t + 9 * 3600e3); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
/** 이 줄이 왜 생겼나 — 누가 판정했는지, 배치인지, POTM 보상인지. */
function why(r: StatLogRow): string {
  if (r.via === 'potm') return 'POTM 보상';
  if (r.via === 'place') return `${r.byName || '관리자'} · 배치`;
  if (r.via === 'game') return `${r.byName || '누군가'}의 판정`;
  return `${r.byName || '누군지 모름'} · 직접 고침`;
}
const signed = (n: number): string => (n > 0 ? `▲${n}` : n < 0 ? `▼${-n}` : '±0');

function Chart({ pts, label }: { pts: Point[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // 폭은 칸을 재서 그린다 — viewBox 를 늘리면 넓은 화면에서 글자·선까지 같이 커진다.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vals = pts.map((p) => p.value);
  const lo = Math.max(0, Math.min(...vals) - 2), hi = Math.min(99, Math.max(...vals) + 2);
  const x = (i: number) => PAD.l + (pts.length < 2 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (pts.length - 1));
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / Math.max(1, hi - lo);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [hi, Math.round((hi + lo) / 2), lo];
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || !pts.length) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const hp = hover != null ? pts[hover] : null;
  return (
    <div className="sh-chart" ref={boxRef}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label} 변화 ${vals[0]}에서 ${vals[vals.length - 1]}`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="sh-grid" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="sh-axis">{t}</text>
          </g>
        ))}
        {pts.length > 0 && <text x={PAD.l} y={H - 6} className="sh-axis">{mmdd(pts[0].ts)}</text>}
        {pts.length > 1 && <text x={W - PAD.r} y={H - 6} textAnchor="end" className="sh-axis">{mmdd(pts[pts.length - 1].ts)}</text>}
        <path d={d} className="sh-line" />
        <circle cx={x(pts.length - 1)} cy={y(vals[vals.length - 1])} r={4} className="sh-dot" />
        {hp && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="sh-cross" />
            <circle cx={x(hover)} cy={y(hp.value)} r={5} className="sh-dot" />
          </g>
        )}
      </svg>
      <p className="sh-tip" aria-live="polite">
        {hp ? <><b>{hp.value}</b> {hp.row ? <>{hp.row.after > hp.row.before ? '▲' : '▼'} {STAT_KO[hp.row.field]} · {why(hp.row)} · {mmdd(hp.ts)} {hhmm(hp.ts)}</> : '처음 값'}</>
          : <span className="muted">선을 누르거나 대 보면 그때 누가 바꿨는지 나옵니다</span>}
      </p>
    </div>
  );
}

export default function StatHistory({ player }: { player: Player }) {
  const [rows, setRows] = useState<StatLogRow[] | null>(null);
  const [key, setKey] = useState<HistKey>('ovr');
  const [days, setDays] = useState(3);
  // 숫자가 바뀌면(대결·배치 뒤) 다시 읽는다.
  const sig = STAT_KEYS.map((k) => player[k]).join(',');
  useEffect(() => {
    let live = true;
    fetchStatHistory(player.num).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [player.num, sig]);

  const pts = useMemo(() => (rows ? series(rows, player, key) : []), [rows, player, key]);
  const j = useMemo(() => (rows ? judges(rows, player.num) : null), [rows, player.num]);
  const days_ = useMemo(() => (rows ? byDay(rows) : []), [rows]);

  if (rows == null) return <div className="card stathist"><h2>능력치 기록</h2><p className="muted">불러오는 중…</p></div>;
  if (!rows.length) return <div className="card stathist"><h2>능력치 기록</h2><p className="muted">아직 바뀐 적이 없습니다. 티어 게임 대결이 쌓이면 여기에 그려집니다.</p></div>;

  const now = pts.length ? pts[pts.length - 1].value : 0;
  const wk = change(pts, Date.now(), 7);
  const label = KEYS.find((k) => k.value === key)!.label;
  return (
    <div className="card stathist">
      <div className="card-head">
        <h2>능력치 기록</h2>
        <Segmented<HistKey> className="chips sh-keys" size="small" value={key} onChange={setKey} options={KEYS} />
      </div>
      <div className="sh-head">
        <b className="sh-now">{now}</b>
        <span className={`sh-wk ${wk > 0 ? 'is-up' : wk < 0 ? 'is-down' : ''}`}>{signed(wk)}</span>
        <span className="muted">{label} · 최근 7일</span>
      </div>
      <Chart pts={pts} label={label} />

      {j && (j.fan || j.rival) && (
        <div className="sh-judges">
          {j.fan && (
            <a className="sh-judge is-fan" href={href(`/squad/${j.fan.num}/`)}>
              <span className="sh-judge-tag">팬 1호</span><b>{j.fan.name}</b>
              <span className="sh-judge-n is-up">▲{j.fan.net}</span>
              <span className="muted">올려 준 판 {j.fan.up} · 깎은 판 {j.fan.down}</span>
            </a>
          )}
          {j.rival && (
            <a className="sh-judge is-rival" href={href(`/squad/${j.rival.num}/`)}>
              <span className="sh-judge-tag">천적</span><b>{j.rival.name}</b>
              <span className="sh-judge-n is-down">▼{-j.rival.net}</span>
              <span className="muted">올려 준 판 {j.rival.up} · 깎은 판 {j.rival.down}</span>
            </a>
          )}
        </div>
      )}

      <div className="sh-log">
        {days_.slice(0, days).map((g) => (
          <section key={g.day}>
            <h3 className="sh-day">{mmdd(`${g.day}T00:00:00+09:00`)}</h3>
            <ul>
              {g.rows.map((r, i) => {
                const dlt = r.after - r.before;
                return (
                  <li key={`${r.ts}-${r.field}-${i}`}>
                    <span className={`sh-delta ${dlt > 0 ? 'is-up' : 'is-down'}`}>{dlt > 0 ? `▲${dlt}` : `▼${-dlt}`}</span>
                    <span className="sh-field">{STAT_KO[r.field]}</span>
                    <span className="sh-why">{why(r)}</span>
                    <span className="sh-move muted">{r.before}→{r.after}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {days_.length > days && <Button size="small" onClick={() => setDays((n) => n + 5)}>이전 기록 더 보기</Button>}
      </div>
    </div>
  );
}
