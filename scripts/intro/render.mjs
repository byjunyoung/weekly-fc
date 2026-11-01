// node scripts/intro/render.mjs <출력 폴더> [ball|team|kick] [주인공 번호] — 인트로 프레임 PNG 들과 효과음 WAV 를 만든다.
// 지금 포털 명단·아바타로 그린다(누가 꾸미거나 명단이 바뀌면 다시 돌리면 된다).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? 'intro-out');
const variant = process.argv[3] ?? 'ball';
const star = process.argv[4] ?? '';
const frames = join(out, `frames-${variant}`);
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });

const js = (await build({ entryPoints: [join(here, 'entry.ts')], bundle: true, write: false, format: 'iife', target: 'es2022' })).outputFiles[0].text;
const html = join(out, 'intro.html');
writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:"Galmuri9";src:url("https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/Galmuri9.woff2") format("woff2")}
body{margin:0;background:#000}</style><canvas></canvas><script>${js.replace(/<\/script/g, '<\\/script')}</script>`);

const port = 9334;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${out}/.chrome`, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let tabs; for (let i = 0; i < 40 && !tabs; i++) { await new Promise((r) => setTimeout(r, 500)); tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
await send('Page.navigate', { url: 'file://' + html + '#' + variant + (star ? ':' + star : '') });
await new Promise((r) => setTimeout(r, 1500));
const n = await ev('window.introReady');
for (let i = 0; i < n; i++) {
  const url = await ev(`window.frame(${i})`);
  writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
chrome.kill();
execFileSync('python3', [join(here, 'sfx.py'), join(out, `sfx-${variant}.wav`), variant], { stdio: 'inherit' });
console.log(`${n} frames → ${frames}, sfx → ${out}/sfx-${variant}.wav`);
process.exit(0);
