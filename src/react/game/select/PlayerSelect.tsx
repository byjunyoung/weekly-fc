// src/react/game/select/PlayerSelect.tsx — 오락실식 선수 선택 화면(2026-11-07). 2D·3D 어느 게임이든 끼워 쓰게 만들었다 — 경기 계산도, 데이터 불러오기도 없다.
// 사용자: "모드 선택, 선수 선택 (능력치도 보이게) 선택한 선수 크게 오른쪽에 다른 선수 리스트 선택 가능하게하면 좋을듯. 약간 옛날 오락실게임에서 고르듯이".
//
// 구성: 큰 칸(고른 선수 — 전신 도트 아바타·이름·등번호·포지션·주발·티어·종합·능력치 막대) + 명단 격자(얼굴 칸, 등번호 순) + 부르는 쪽 버튼 줄.
// PC·가로 화면은 큰 칸 왼쪽 · 명단 오른쪽("선택한 선수 크게 오른쪽에 다른 선수 리스트"). 폰 세로는 큰 칸을 위에 줄여 두고 명단은 아래,
// 버튼 줄은 화면 아래에 붙어 명단을 다 내리지 않아도 누를 수 있다.
// 손짓: 칸에 마우스를 올리거나 누르면 그 선수가 크게 뜬다(= 고름). 방향키로 커서가 움직이고 Enter·Space 가 주 버튼(onConfirm).
// 이미 고른 칸을 다시 눌러도 아무것도 시작하지 않는다 — 시작은 늘 버튼으로.
// 모양은 포털 것이다(어느 게임의 선택 화면도 베끼지 않는다) — 어두운 칸, 제목만 도트 글꼴, 금색 굵은 테두리 커서, 계단식 깜빡임.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { avatarFaceSvg, avatarSvg } from '../../../components/avatar';
import { avatarSpecFor } from '../../../lib/avatar';
import { FOOT_LABEL, tierByNum } from '../../../lib/card';
import type { Tier } from '../../../lib/tier';
import type { Player } from '../../../lib/types';
import { play as playSfx, unlock } from '../sfx';
import { disabledReason, initialCursor, keyToCursor, moveCursor, sortRoster, statRows, type Disabled } from './select-model';

export type PlayerSelectProps = {
  /** 명단 전체. 순서는 상관없다(등번호 순으로 세운다). 티어는 이 명단 안에서 매긴다. */
  roster: Player[];
  /** 지금 고른 선수(num). null 이면 아직 없음. */
  value: number | null;
  /** 고를 수 있는 칸을 가리키면 불린다(마우스 올림·누름·방향키). */
  onChange: (num: number) => void;
  /** Enter·Space — 부르는 쪽의 주 버튼(방 만들기 등). 없으면 키로는 아무것도 안 시작한다. */
  onConfirm?: () => void;
  /** 못 고르는 선수와 이유(누르면 이유가 뜬다). */
  disabled?: Disabled;
  /** 명단 위 제목(도트 글꼴). 예: "선수 선택". */
  title: string;
  /** 제목 옆 작은 한 줄(모드·방 정보). */
  header?: ReactNode;
  /** 큰 칸 아래 버튼 줄(폰에선 화면 아래에 붙는다). */
  actions?: ReactNode;
  /** 능력치 아래 한 줄. 기본 "능력치는 경기에서 조금만 반영됩니다". */
  statNote?: string;
};

const BIG_H = 256;   // 전신 24×32 격자의 8배 — 도트가 정수배로 커져 또렷하다. 폰은 CSS 가 절반(4배)으로 줄인다.

export function PlayerSelect({ roster, value, onChange, onConfirm, disabled, title, header, actions, statNote = '능력치는 경기에서 조금만 반영됩니다' }: PlayerSelectProps) {
  const list = useMemo(() => sortRoster(roster), [roster]);
  const tiers = useMemo(() => tierByNum(roster), [roster]);
  const [cursor, setCursor] = useState(() => initialCursor(list, value, disabled));
  const [notice, setNotice] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusNext = useRef(false);

  // 바깥에서 고른 선수가 바뀌면(로그인 선수가 늦게 왔다 등) 커서도 따라간다.
  useEffect(() => {
    const i = value === null ? -1 : list.findIndex((p) => p.num === value);
    if (i >= 0) setCursor((c) => (list[c]?.num === value ? c : i));
  }, [value, list]);
  useLayoutEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    tileRefs.current[cursor]?.focus();
  }, [cursor]);

  const shown = list.find((p) => p.num === value) ?? null;

  /** 한 줄에 몇 칸인가 — 격자는 CSS 가 폭에 맞춰 정하므로 그려진 칸의 세로 위치로 센다. */
  const colCount = (): number => {
    const tiles = tileRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (tiles.length < 2) return 1;
    const top = tiles[0].offsetTop;
    let n = 0;
    while (n < tiles.length && tiles[n].offsetTop === top) n++;
    return Math.max(1, n);
  };

  /** 칸 i 를 가리킨다. 고를 수 있으면 고르고, 아니면 이유만 띄운다. */
  const point = (i: number, sound: boolean, focus: boolean): void => {
    const p = list[i];
    if (!p) return;
    if (focus) focusNext.current = true;
    setCursor(i);
    const why = disabledReason(p.num, disabled);
    setNotice(why ? `${p.name} — ${why}` : null);
    if (!why && p.num !== value) {
      onChange(p.num);
      if (sound) playSfx({ kind: 'move', vol: 1 });
    }
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const dir = keyToCursor(e.key);
    if (dir) {
      e.preventDefault();
      unlock();
      point(moveCursor(cursor, dir, list.length, colCount()), true, true);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();   // Space 가 칸 버튼을 눌러 버리지 않게 — 키로는 주 버튼만
      const p = list[cursor];
      if (!p || disabledReason(p.num, disabled) || !onConfirm) return;
      unlock();
      if (p.num !== value) onChange(p.num);
      playSfx({ kind: 'confirm', vol: 1 });
      onConfirm();
    }
  };

  return (
    <section className="sel" aria-label={title}>
      <div className="sel-head">
        <h2 className="sel-title">{title}</h2>
        {header && <div className="sel-sub muted">{header}</div>}
      </div>
      <div className="sel-body">
        <div className="sel-hero" aria-live="polite" aria-atomic="true">
          {shown ? <Hero key={shown.num} p={shown} tier={tiers.get(shown.num) ?? null} note={statNote} /> : <p className="sel-empty muted">아래 명단에서 선수를 골라 주세요</p>}
        </div>
        {actions && <div className="sel-actions">{actions}</div>}
        <div className="sel-roster">
          <div className="sel-grid" role="listbox" aria-label="선수 명단" ref={gridRef} onKeyDown={onKey}>
            {list.map((p, i) => {
              const why = disabledReason(p.num, disabled);
              const on = p.num === value, cur = i === cursor;
              return (
                <button type="button" role="option" key={p.num} ref={(el) => { tileRefs.current[i] = el; }}
                  className={`sel-tile${on ? ' is-on' : ''}${cur ? ' is-cursor' : ''}${why ? ' is-off' : ''}`}
                  aria-selected={on} aria-disabled={!!why} tabIndex={cur ? 0 : -1}
                  aria-label={`${p.name} #${p.jersey}${why ? ` — ${why}` : ''}`} title={why ?? undefined}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') point(i, true, false); }}
                  onClick={() => { unlock(); point(i, true, false); }}>
                  <span className="sel-tile-face" aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: avatarFaceSvg(avatarSpecFor(p.num, p.avatar), 40, p.jersey, true) }} />
                  <span className="sel-tile-num">{p.jersey}</span>
                  <span className="sel-tile-name">{p.name}</span>
                </button>
              );
            })}
          </div>
          <p className="sel-notice muted" role="status">{notice ?? '방향키로 고르고 Enter 로 시작 · 칸을 누르면 크게 보입니다'}</p>
        </div>
      </div>
    </section>
  );
}

/** 큰 칸 — 고른 선수 하나. key 가 바뀔 때마다 새로 붙어 짧게 번쩍인다(움직임 줄이기 설정이면 안 번쩍인다). */
function Hero({ p, tier, note }: { p: Player; tier: Tier | null; note: string }) {
  const { model, rated } = statRows(p, tier);
  const t = model.tier ?? 'none';
  const svg = avatarSvg(avatarSpecFor(p.num, p.avatar), BIG_H, p.jersey, true);
  return (
    <div className="sel-hero-card">
      <div className="sel-figure" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="sel-info">
        <div className="sel-name-row">
          <b className="sel-name">{model.name}</b>
          <span className="sel-jersey">#{model.jersey}</span>
        </div>
        <div className="sel-meta">
          <span className={`fcard-tier tier-${t}`} aria-label={model.tier ? `티어 ${model.tier}` : '티어 없음'}>{model.tier ?? '–'}</span>
          <span className="sel-ovr" aria-label={`종합 ${model.ovr || '없음'}`}>{model.ovr || '–'}</span>
          <span className={`pos pos-${model.pos.toLowerCase()}`}>{model.pos || '–'}</span>
          {p.detail && <span className="muted">{p.detail}</span>}
          <span className="muted">{FOOT_LABEL[model.foot]}</span>
        </div>
      </div>
      {rated ? (
          <dl className="sel-stats">
            {model.stats.map((s) => (
              <div className="sel-stat" key={s.key}>
                <dt>{s.label}</dt>
                <dd>
                  <i className="attr-bar"><b className={`val-${s.band}`} style={{ '--fill': `${Math.max(0, Math.min(100, s.value))}%` } as CSSProperties} /></i>
                  <span className="sel-stat-val">{s.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : <p className="sel-unrated">배치 전 <span className="muted">— 능력치가 아직 없습니다</span></p>}
      <p className="sel-note muted">{note}</p>
    </div>
  );
}
