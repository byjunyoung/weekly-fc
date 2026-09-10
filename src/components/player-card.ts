// src/components/player-card.ts
import { esc } from '../lib/html.ts';
import { ovr, grade, band, STAT_CUTS } from '../lib/stats.ts';
import { STAT_KEYS, type Player } from '../lib/types.ts';
export const STAT_LABEL: Record<(typeof STAT_KEYS)[number], string> = { pace: 'PAC', dribble: 'DRI', pass: 'PAS', shoot: 'SHO', defend: 'DEF', stamina: 'PHY' };
export const STAT_KO: Record<(typeof STAT_KEYS)[number], string> = { pace: '페이스', dribble: '드리블', pass: '패스', shoot: '슈팅', defend: '수비', stamina: '체력' };
export function playerCard(p: Player): string {
  const o = ovr(p);
  const bars = STAT_KEYS.map((k) => `<div class="bar" title="${STAT_KO[k]}"><span>${STAT_LABEL[k]}</span><i><b style="width:${Math.max(0, Math.min(100, p[k]))}%"></b></i><span class="val val-${band(p[k], STAT_CUTS)}">${p[k] || '–'}</span></div>`).join('');
  return `<div class="card pcard">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><div class="label">#${p.num}${p.vest ? ` · 조끼 ${p.vest}` : ''}</div><h2 style="font-size:var(--fs-lg)">${esc(p.name)}</h2>
        <div class="row" style="margin-top:6px"><span class="pos pos-${p.pos.toLowerCase()}">${p.pos || '–'}</span><span class="muted">${esc(p.detail)}${p.foot ? ` · ${esc(p.foot)}` : ''}</span></div></div>
      <div style="text-align:right"><div class="label">OVR</div><div class="big grade-${grade(o)}">${o || '–'}</div></div>
    </div>
    <div class="bars" style="margin-top:14px">${bars}</div>
    ${p.note ? `<p class="muted" style="margin:12px 0 0;font-size:var(--fs-sm)">${esc(p.note)}</p>` : ''}
  </div>`;
}
