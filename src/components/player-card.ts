// src/components/player-card.ts — EA SPORTS FC 아이템 카드.
// FC 아이템의 배치를 그대로 따른다: 좌상단 큰 OVR·포지션·번호, 우측 초상,
// 가운데 이름 띠, 아래 2열 3행 능력치. 등급(gold/silver/bronze)은 grade()의
// 84/69 경계를 그대로 쓰되 이번엔 테두리가 아니라 카드 면 전체를 금속
// 그라디언트로 덮는다 — 앞 단계에서 테두리만 칠했더니 게임이 아니라 대시보드로
// 읽혔다는 지적(2026-09-11)을 반영한 것으로, FC 원안이 원래 이 형태다.
import { esc } from '../lib/html.ts';
import { grade, ovr } from '../lib/stats.ts';
import type { Player, StatKey } from '../lib/types.ts';

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

// avatarHtml: 초상을 놓을 자리 — 생략하면 초상 없이 나간다.
export function playerCard(p: Player, avatarHtml = ''): string {
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
  return `<div class="pcard pcard-${g}"><div class="pcard-body">${body}</div></div>`;
}
