// src/components/player-card.ts — FC 문법 선수 카드(게임 인터페이스 재설계 5절).
// 큰 OVR이 위계를 지배하고, 아래로 포지션·아바타 초상·이름·능력치 6종(2행 3열)이
// 따라온다. 등급(gold/silver/bronze)은 grade()의 84/69 경계를 그대로 쓰되
// 카드 배경을 덮지 않는다 — 테두리 색 + OVR 숫자 색으로만 표현한다(연구 5·6절의
// FC 카드 배경 프레이밍을 의도적으로 안 따르는 지점, 3절 팔레트의 절제와 맞춘다).
import { esc, fmtDate } from '../lib/html.ts';
import { RATE_CUTS, STAT_CUTS, attendance, band, grade, ovr, wins } from '../lib/stats.ts';
import { STAT_KEYS, type Match, type Player } from '../lib/types.ts';
import { conditionBadge } from './condition.ts';

export const STAT_LABEL: Record<(typeof STAT_KEYS)[number], string> = { pace: 'PAC', dribble: 'DRI', pass: 'PAS', shoot: 'SHO', defend: 'DEF', stamina: 'PHY' };
export const STAT_KO: Record<(typeof STAT_KEYS)[number], string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '체력' };

function statCell(p: Player, k: (typeof STAT_KEYS)[number]): string {
  const v = p[k];
  const pct = Math.max(0, Math.min(100, v));
  return `<div class="pcard-stat" title="${STAT_KO[k]}">
    <span class="pcard-stat-label">${STAT_LABEL[k]}</span>
    <b class="pcard-stat-val val val-${band(v, STAT_CUTS)}">${v || '–'}</b>
    <i class="pcard-stat-bar"><b style="--fill:${pct}%"></b></i>
  </div>`;
}

// avatarHtml: 아바타 시스템(4절)이 초상을 놓을 자리 — 생략하면(홈의 "내 자리" 등
// 기존 호출부) 초상 없이 헤더·이름·능력치만 있는 카드를 낸다.
// back: 카드 뒷면(참여 이력 요약, playerCardBack) HTML. 주면 카드가 뒤집기 가능한
// 상태로 나가고, 생략하면 앞면만 있는 정적 카드로 — 뒤집기는 선수 페이지 전용(8절).
export function playerCard(p: Player, avatarHtml = '', back = ''): string {
  const o = ovr(p);
  const g = grade(o);
  const stats = STAT_KEYS.map((k) => statCell(p, k)).join('');
  const body = `
    <div class="pcard-head">
      <div class="pcard-ovr-block">
        <b class="pcard-ovr grade-${g}" data-ovr="${o}">${o || '–'}</b>
        <span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span>
      </div>
      <span class="label">#${p.num}${p.vest ? ` · 조끼 ${p.vest}` : ''}</span>
    </div>
    ${avatarHtml ? `<div class="pcard-portrait">${avatarHtml}</div>` : ''}
    <div class="pcard-name">${esc(p.name)}</div>
    <div class="muted pcard-detail">${esc(p.detail)}${p.foot ? ` · ${esc(p.foot)}` : ''}</div>
    <div class="pcard-stats">${stats}</div>
    ${p.note ? `<p class="muted pcard-note">${esc(p.note)}</p>` : ''}`;
  if (!back) return `<div class="card pcard pcard-${g}"><div class="pcard-body">${body}</div></div>`;
  return `<div class="card pcard pcard-${g}">
    <div class="pcard-flip" data-pcard-flip-inner>
      <div class="pcard-face pcard-face-front"><div class="pcard-body">${body}</div></div>
      <div class="pcard-face pcard-face-back">${back}</div>
    </div>
    <button type="button" class="pcard-flip-btn" data-pcard-flip>카드 뒤집기 · 참여 이력 ⇄</button>
  </div>`;
}

/** 카드 뒷면(8절) — 전체 참여 이력 표는 그 아래 별도 섹션이 맡으므로, 여기는 카드
 * 한 장에 들어갈 요약만: 출석률·승률·컨디션 + 최근 참석 매치 3건. */
export function playerCardBack(p: Player, matches: Match[]): string {
  const a = attendance(p.name, matches);
  const w = wins(p.name, matches);
  const recent = matches.filter((m) => m.attendees.includes(p.name)).slice(0, 3);
  return `<div class="pcard-back-body">
    <div class="label label-gap">참여 이력 요약</div>
    <div class="pcard-back-stats">
      <div><span class="label">출석률</span>${a.total ? `<b class="val val-${band(a.rate, RATE_CUTS)}">${a.rate}%</b>` : '<b class="muted">–</b>'}</div>
      <div><span class="label">승률</span>${w.played ? `<b>${w.rate}%</b>` : '<b class="muted">–</b>'}</div>
      <div><span class="label">컨디션</span><div>${conditionBadge(p.name, matches)}</div></div>
    </div>
    ${recent.length ? `<ul class="pcard-recent">${recent.map((m) => `<li>${fmtDate(m.date)} · ${esc(m.location) || '장소 미정'}</li>`).join('')}</ul>` : '<p class="muted">아직 참석 기록이 없습니다.</p>'}
  </div>`;
}
