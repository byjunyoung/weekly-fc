// src/components/player-card.ts — FC 문법 선수 카드(게임 인터페이스 재설계 5절).
// 큰 OVR이 위계를 지배하고, 아래로 포지션·아바타 초상·이름·능력치 6종(2행 3열)이
// 따라온다. 등급(gold/silver/bronze)은 grade()의 84/69 경계를 그대로 쓰되
// 카드 배경을 덮지 않는다 — 테두리 색 + OVR 숫자 색으로만 표현한다(연구 5·6절의
// FC 카드 배경 프레이밍을 의도적으로 안 따르는 지점, 3절 팔레트의 절제와 맞춘다).
import { esc } from '../lib/html.ts';
import { STAT_CUTS, band, grade, ovr } from '../lib/stats.ts';
import { STAT_KEYS, type Player } from '../lib/types.ts';

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
export function playerCard(p: Player, avatarHtml = ''): string {
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
  return `<div class="card pcard pcard-${g}"><div class="pcard-body">${body}</div></div>`;
}
