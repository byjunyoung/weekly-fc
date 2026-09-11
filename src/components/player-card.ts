// src/components/player-card.ts
import { esc } from '../lib/html.ts';
import { ovr, grade, band, STAT_CUTS } from '../lib/stats.ts';
import { STAT_KEYS, type Player } from '../lib/types.ts';
export const STAT_LABEL: Record<(typeof STAT_KEYS)[number], string> = { pace: 'PAC', dribble: 'DRI', pass: 'PAS', shoot: 'SHO', defend: 'DEF', stamina: 'PHY' };
export const STAT_KO: Record<(typeof STAT_KEYS)[number], string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '체력' };
// avatarHtml: 아바타 시스템(게임 인터페이스 재설계 4절)이 이 카드 안에 초상을 놓을 자리.
// 생략하면(홈의 "내 자리" 등 기존 호출부) 이전과 완전히 같은 마크업을 낸다.
export function playerCard(p: Player, avatarHtml = ''): string {
  const o = ovr(p);
  const bars = STAT_KEYS.map((k) => `<div class="bar" title="${STAT_KO[k]}"><span>${STAT_LABEL[k]}</span><i><b style="width:${Math.max(0, Math.min(100, p[k]))}%"></b></i><span class="val val-${band(p[k], STAT_CUTS)}">${p[k] || '–'}</span></div>`).join('');
  const info = `<div><div class="label">#${p.num}${p.vest ? ` · 조끼 ${p.vest}` : ''}</div><h2 style="font-size:var(--fs-lg)">${esc(p.name)}</h2>
        <div class="row pcard-row"><span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span><span class="muted">${esc(p.detail)}${p.foot ? ` · ${esc(p.foot)}` : ''}</span></div></div>`;
  const left = avatarHtml ? `<div class="row" style="align-items:flex-start">${avatarHtml}${info}</div>` : info;
  return `<div class="card pcard">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      ${left}
      <div style="text-align:right"><div class="label">OVR</div><div class="big grade-${grade(o)}">${o || '–'}</div></div>
    </div>
    <div class="bars pcard-bars">${bars}</div>
    ${p.note ? `<p class="muted pcard-note">${esc(p.note)}</p>` : ''}
  </div>`;
}
