// scripts/migrate-to-supabase.mjs — 구글 시트(Apps Script) → Supabase 한 번에 옮기기.
// 여러 번 돌려도 같다(덮어쓰기·기록은 겹치면 건너뜀) — 전환 뒤 한 번 더 돌려 그 사이 쓰인 걸 따라잡는다.
// PIN 은 저장소에 안 올라가는 .env.local 에서만 읽는다: WFC_PIN=...
import { readFileSync } from 'node:fs';
import { rpc } from '../src/lib/api.ts';

const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyUDTkTHsKszkiOeJKmNDHDkVJobrVUjbRqufU251PNKmlyrvC0BZ3ir9x0vM_lCJkkmg/exec';

function envPin() {
  let text = '';
  try { text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8'); } catch { /* 없음 */ }
  const m = /^WFC_PIN=(.*)$/m.exec(text);
  const pin = (m ? m[1] : process.env.WFC_PIN || '').trim().replace(/^["']|["']$/g, '');
  if (!pin) { console.error('.env.local 에 WFC_PIN=관리자PIN 을 적어 주세요.'); process.exit(1); }
  return pin;
}

const pin = envPin();
const url = new URL(APPS_SCRIPT);
url.searchParams.set('action', 'getAllFull');
url.searchParams.set('pin', pin);
const sheet = await (await fetch(url)).json();
if (sheet.error) { console.error('시트 읽기 실패:', sheet.error); process.exit(1); }

try { await rpc('set_admin_pin', { p_pin: pin }); console.log('관리자 PIN 설정'); }
catch (e) { if (!/이미 PIN이 설정되어 있습니다/.test(e.message)) throw e; }
await rpc('verify_pin', { p_pin: pin });

const n = await rpc('import_all', { p_pin: pin, p_data: sheet });
const db = await rpc('get_all_full', { p_pin: pin });

const sum = (xs) => xs.reduce((a, f) => a + Number(f.amount || 0), 0);
const rows = [
  ['선수', sheet.players.length, db.players.length],
  ['봉사표', sheet.rotation.filter((r) => r.year && r.month).length, db.rotation.length],
  ['벌금 건수', sheet.fines.filter((f) => f.id).length, db.fines.length],
  ['벌금 합', sum(sheet.fines), sum(db.fines)],
  ['능력치 기록', sheet.statLog.length, db.statLog.length],
];
console.log('이번에 넣음:', n);
console.log('항목        시트    Supabase  같나');
for (const [k, a, b] of rows) console.log(`${k.padEnd(10)} ${String(a).padStart(6)} ${String(b).padStart(9)}  ${a === b ? '예' : '아니오 ←'}`);
if (rows.some(([, a, b]) => a !== b)) process.exit(2);
