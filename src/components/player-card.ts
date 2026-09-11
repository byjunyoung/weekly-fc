// src/components/player-card.ts — EA SPORTS FC 아이템 카드.
// FC 아이템의 배치를 그대로 따른다: 좌상단 큰 OVR·포지션·번호, 우측 초상,
// 가운데 이름 띠, 아래 2열 3행 능력치. 등급(gold/silver/bronze)은 grade()의
// 84/69 경계를 그대로 쓰되 이번엔 테두리가 아니라 카드 면 전체를 금속
// 그라디언트로 덮는다 — 앞 단계에서 테두리만 칠했더니 게임이 아니라 대시보드로
// 읽혔다는 지적(2026-09-11)을 반영한 것으로, FC 원안이 원래 이 형태다.
import { esc, fmtDate } from '../lib/html.ts';
import { RATE_CUTS, attendance, band, grade, ovr, wins } from '../lib/stats.ts';
import type { Match, Player, StatKey } from '../lib/types.ts';
import { conditionBadge } from './condition.ts';

export const STAT_LABEL: Record<StatKey, string> = { pace: 'PAC', dribble: 'DRI', pass: 'PAS', shoot: 'SHO', defend: 'DEF', stamina: 'PHY' };
export const STAT_KO: Record<StatKey, string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '체력' };

/** 카드 위 능력치 배열 순서 — FC 아이템은 좌열 PAC·SHO·PAS, 우열 DRI·DEF·PHY다.
 *  DOM은 행 우선으로 채워지므로 (PAC DRI)(SHO DEF)(PAS PHY) 순으로 낸다.
 *  STAT_KEYS(표·편집 폼의 순서)와는 목적이 달라 따로 둔다. */
export const CARD_STAT_ORDER: StatKey[] = ['pace', 'dribble', 'shoot', 'defend', 'pass', 'stamina'];

// FC 아이템은 능력치를 막대 없이 숫자만 보여준다. 앞 단계에서 넣었던 차오름 막대는
// 금속 면 위에서 선이 흩어져 보여 뺐다 — 막대(색 구간)는 표에 그대로 남아 있다.
function statCell(p: Player, k: StatKey): string {
  const v = p[k];
  return `<div class="pcard-stat" title="${STAT_KO[k]}">
    <b class="pcard-stat-val">${v || '–'}</b>
    <span class="pcard-stat-label">${STAT_LABEL[k]}</span>
  </div>`;
}

// avatarHtml: 아바타 시스템(4절)이 초상을 놓을 자리 — 생략하면 초상 없이 나간다.
// back: 카드 뒷면(참여 이력 요약) HTML. 주면 뒤집기 가능한 카드로, 생략하면 앞면만.
export function playerCard(p: Player, avatarHtml = '', back = ''): string {
  const o = ovr(p);
  const g = grade(o);
  const pos = p.pos ? p.pos.toLowerCase() : 'mf';
  const stats = CARD_STAT_ORDER.map((k) => statCell(p, k)).join('');
  const sub = [p.detail, p.foot].filter(Boolean).map(esc).join(' · ');
  const body = `
    <div class="pcard-head">
      <div class="pcard-ovr-block pcard-acc-${pos}">
        <b class="pcard-ovr" data-ovr="${o}">${o || '–'}</b>
        <span class="pcard-pos">${esc(p.pos) || '–'}</span>
        <span class="pcard-num">#${p.num}${p.vest ? ` · 조끼 ${p.vest}` : ''}</span>
      </div>
      ${avatarHtml ? `<div class="pcard-portrait">${avatarHtml}</div>` : ''}
    </div>
    <div class="pcard-name">${esc(p.name)}</div>
    ${sub ? `<div class="pcard-detail">${sub}</div>` : ''}
    <div class="pcard-stats">${stats}</div>
    ${p.note ? `<p class="pcard-note">${esc(p.note)}</p>` : ''}`;
  if (!back) return `<div class="pcard pcard-${g}"><div class="pcard-body">${body}</div></div>`;
  return `<div class="pcard pcard-${g}">
    <div class="pcard-flip" data-pcard-flip-inner>
      <div class="pcard-face pcard-face-front"><div class="pcard-body">${body}</div></div>
      <div class="pcard-face pcard-face-back">${back}</div>
    </div>
    <button type="button" class="pcard-flip-btn" data-pcard-flip>카드 뒤집기 ⇄</button>
  </div>`;
}

/** 카드 뒷면 — 전체 참여 이력 표는 아래 별도 섹션이 맡으므로 여기는 요약만:
 *  출석률·승률·컨디션 + 최근 참석 매치 3건. */
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
