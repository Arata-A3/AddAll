// AddAll の自動テスト。使い方: node tests/run.mjs
// 小さな HTTP サーバーで index.html を配り、ヘッドレス Chrome を DevTools プロトコルで動かして確かめる。
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  if (req.url.startsWith('/__blank')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>blank</title>'); return; }
  const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html')));
  if (!path.startsWith(ROOT) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'addall-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { } await sleep(200); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const waits = new Map(); const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; waits.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed'); return r.result.result.value; };
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// セーブを入れて開き直す（about:blank を挟むのは、閉じる前の自動保存が前の状態を書き戻さないように）
// 同じオリジンの空のページ（404）でセーブを書く。ゲームのページで書くと、閉じるときの自動保存が上書きしてしまう
async function open(save) {
  await send('Page.navigate', { url: BASE + '__blank' }); await sleep(300);
  await ev(`localStorage.clear(); ${save ? `localStorage.setItem('addall.save.v1', ${JSON.stringify(JSON.stringify(save))});` : ''} return 1;`);
  await send('Page.navigate', { url: BASE }); await sleep(2200);
}
const H = `const q = s => document.querySelector(s); const qa = s => [...document.querySelectorAll(s)]; const tab = t => q('.tabs [data-tab="' + t + '"]').click(); const sleep = ms => new Promise(r => setTimeout(r, ms)); const save = () => { q('#saveNow').click(); return JSON.parse(localStorage.getItem('addall.save.v1')); };`;

let fail = 0;
const results = [];
async function test(name, fn) {
  const before = errors.length;
  try { await fn(); if (errors.length > before) throw new Error('ページでエラー: ' + errors.slice(before).join(' / ')); results.push(['OK', name]); }
  catch (e) { fail++; results.push(['NG', name, String(e.message || e)]); }
}
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const now = Date.now();
const opened = { up: 1, mission: 1, book: 1, lab: 1, tools: 1, refine: 1, req: 1, stone: 1 };
const mid = {
  v: 6, mana: 1e30, run: 2, open: opened, unlocked: { a1: true, a2: true, a3: true }, up: { tool: 9, fam_a1: 24, fam_a2: 5, furnace: 12, eye: 8, autodis: 1 },
  homs: [{ u: 1, k: 'koro', lv: 9, xp: 0, f: 1, rk: { mason: 2, artisan: 1, keeper: -1 }, pk: [] }],
  homSeq: 2, st: { manual: 500, auto: 0, totalMana: 1e13, areaTaps: { a1: 5000, a2: 100 }, crafted: {}, homsMade: 1, fusions: 0, reqDone: 3 },
  reg: { stone: true, weed: true, copper: true, herb: true, catalyst: true, spiritCrystal: true, primal: true }, inv: { copper: 5000, weed: 9000, herb: 5000 },
  life: { totalMana: 1e13, prestiges: 1, bestStones: 2, mazeBest: 12 }, savedAt: now, fame: 3, pref: { num: 'ja', ver: '2.0', intro: true },
};

await test('はじめて開くと、はじまりの話が出てエラーがない', async () => {
  await open(null);
  const r = await ev(`${H} return { story: !q('#storyBg').hidden, title: q('#storyTitle').textContent, tap: !!q('#tap') };`);
  ok(r.story && r.title === 'はじまり' && r.tap, JSON.stringify(r));
});
await test('画面の版と変更の記録の最新がそろっている', async () => {
  const r = await ev(`${H} q('#verBtn').click(); await sleep(50); return { btn: q('#verBtn').textContent, first: q('#verList .vh-item b').textContent };`);
  ok(r.btn === r.first && /^v\d+\.\d+$/.test(r.btn), JSON.stringify(r));
});
await test('画面とコードに絵文字がない', async () => {
  const r = await ev(`const t = document.documentElement.outerHTML; return [...new Set(t.match(/\\p{Extended_Pictographic}/gu) || [])];`);
  ok(r.length === 0, r.join(' '));
});
await test('第1.8版のセーブ（依頼が配列、挑戦なし）を読み込める', async () => {
  await open({ ...mid, reqs: [{ id: 'stone', n: 5, rw: 10 }], pref: { num: 'ja', ver: '1.8' } });
  const r = await ev(`${H} const s = save(); return { reqs: Array.isArray(s.reqs), met: Object.keys(s.met).length, taps: s.life.taps, main: q('#main').innerText.length };`);
  ok(!r.reqs && r.met >= 2 && r.taps >= 500 && r.main > 50, JSON.stringify(r));
});
await test('挑戦や研究があった頃のセーブを読み込める（挑戦と研究は消える）', async () => {
  await open({ ...mid, ch: 'nofam', nextCh: 'noup', rs: { gather: 2 }, chDone: { nohom: true } });
  const r = await ev(`${H} const s = save(); return { main: q('#main').innerText.length, ch: s.ch, rs: s.rs, cd: s.chDone };`);
  ok(r.main > 50 && r.ch === undefined && r.rs === undefined && r.cd === undefined, JSON.stringify(r));
});
await test('町の画面に町の人とミッションが並び、頼みごとをかなえると仲とマナが増える', async () => {
  await open(mid);
  const r = await ev(`${H} tab('mission'); await sleep(150);
    const both = !!q('[data-act="req"], [data-act="reqfill"]') && !!q('[data-act="claim"]');
    const b = q('[data-act="req"]:not([disabled])') || q('[data-act="reqfill"]:not([disabled])'); const id = b.dataset.id; b.click(); await sleep(50);
    const s = save(); return { both, id, bond: s.bond[id], reqs: s.life.reqs, label: q('.tabs [data-tab="mission"]').textContent };`);
  ok(r.both && r.bond === 1 && r.reqs >= 4 && r.label.startsWith('町'), JSON.stringify(r));
});
await test('図鑑と古いノートは工房の中、実績は強化の中にある', async () => {
  const r = await ev(`${H} tab('lab'); await sleep(100); const lab = qa('[data-act="labview"]').map(b => b.dataset.id).join(',');
    q('[data-act="labview"][data-id="book"]').click(); await sleep(100); const book = !!q('.book');
    q('[data-act="labview"][data-id="journal"]').click(); await sleep(100); const jr = !!q('.journal');
    tab('up'); await sleep(100); q('[data-act="upview"][data-id="ach"]').click(); await sleep(100);
    return { lab, book, jr, ach: q('#main').innerText.includes('終わりのない実績'), bookTab: !!q('.tabs [data-tab="book"]') };`);
  ok(r.lab === 'dg,craft,refine,book,journal' && r.book && r.jr && r.ach && !r.bookTab, JSON.stringify(r));
});
await test('同じ種類が何人もいる古いセーブは1人にまとまり、技能は道のランクに、過ぎた節目の道を選べる', async () => {
  const a = { u: 1, k: 'koro', lv: 12, xp: 0, f: 1, s: { str: 30, spd: 5, luk: 3, int: 5, exp: 6, dex: 9 }, sk: [{ id: 'power', r: 2 }], pk: [{ t: 's', o: ['str'] }] };
  const b = { u: 2, k: 'koro', lv: 4, xp: 0, f: 0, s: { str: 10, spd: 20, luk: 3, int: 5, exp: 6, dex: 9 }, sk: [{ id: 'power', r: 4 }, { id: 'skill', r: 1 }], pk: [] };
  await open({ ...mid, homs: [a, b], homSeq: 3 });
  const r = await ev(`${H} const s = save(); const h = s.homs[0];
    return { n: s.homs.length, lv: h.lv, rk: h.rk, sk: h.sk, st: h.s, pk: h.pk.map(p => p.t).join('') };`);
  ok(r.n === 1 && r.lv === 12 && r.rk.mason === 4 && r.rk.artisan === 1 && r.rk.keeper === -1 && !r.sk && !r.st && r.pk === 'pp', JSON.stringify(r));
});
await test('v2.2 のセーブ（道の段と技能）は道のランクに引き継がれる', async () => {
  const h = { u: 1, k: 'koro', lv: 11, xp: 0, f: 2, s: { str: 20, spd: 5, luk: 3, int: 5, exp: 6, dex: 9 }, sk: [{ id: 'power', r: 3 }, { id: 'jackpot', r: 5 }], pk: [{ t: 'k', o: ['power'] }, { t: 'p' }], path: ['mason', 'keeper'] };
  await open({ ...mid, homs: [h], homSeq: 2 });
  const r = await ev(`${H} const s = save(); const x = s.homs[0]; return { rk: x.rk, pk: x.pk.length };`);
  ok(r.rk.mason === 4 && r.rk.keeper === 0 && r.rk.artisan === -1 && r.pk === 1, JSON.stringify(r));
});
await test('節目で道を選ぶとランクが上がり、採取力が大きく伸びる', async () => {
  const h = { u: 1, k: 'koro', lv: 20, xp: 0, f: 0, rk: { mason: 0, artisan: -1, keeper: -1 }, pk: [{ t: 'p' }, { t: 'p' }, { t: 'p' }, { t: 'p' }] };
  await open({ ...mid, homs: [h], homSeq: 2 });
  const r = await ev(`${H} tab('gather'); await sleep(100); const p0 = Number(qa('.stat b')[0].textContent.replace(/[^0-9.]/g, ''));
    const btn = !!q('.grow [data-act="gotab"]');
    tab('tools'); await sleep(150);
    const opts = qa('[data-act="pick"]').length;
    for (let i = 0; i < 4; i++) { q('[data-act="pick"][data-v="mason"]').click(); await sleep(60); }
    tab('gather'); await sleep(150); const p1 = Number(qa('.stat b')[0].textContent.replace(/[^0-9.]/g, ''));
    const s = save(); return { btn, opts, rk: s.homs[0].rk.mason, pk: s.homs[0].pk.length, ratio: p1 / p0, grow: q('.grow').innerText };`);
  ok(r.btn && r.opts === 3 && r.rk === 4 && r.pk === 0 && r.ratio > 4 && r.grow.includes('石工 A'), JSON.stringify(r));
});
await test('相棒の絵が出て、採取すると笑い、連れていく子を選べる', async () => {
  await open({ ...mid, homs: [...mid.homs, { u: 2, k: 'kiri', lv: 3, xp: 0, f: 0, rk: { keeper: 0 }, pk: [] }], homSeq: 3 });
  const r = await ev(`${H} tab('gather'); await sleep(300);
    const b0 = q('#buddy img').getAttribute('src');
    q('#tap').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true })); await sleep(50);
    const b1 = q('#buddy img').getAttribute('src');
    tab('tools'); await sleep(300);
    const imgs = qa('#main img.himg'); const broken = imgs.filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src'));
    q('[data-act="fav"][data-id="kiri"]').click(); await sleep(100);
    tab('gather'); await sleep(200);
    return { b0, b1, n: imgs.length, broken, fav: save().fav, b2: q('#buddy img').getAttribute('src'), grow: q('.grow').innerText };`);
  ok(r.b0 === 'img/hom/pebble_0.webp' && r.b1 === 'img/hom/pebble_1.webp' && r.n >= 6 && !r.broken.length && r.fav === 'kiri' && r.b2.startsWith('img/hom/mist_') && r.grow.includes('ミスティア'), JSON.stringify(r));
});
await test('レベルは時間でゆっくり上がり、採取を連打しても節目は1回ずつ', async () => {
  const h = { u: 1, k: 'koro', lv: 4, xp: 0, f: 0, rk: { mason: 0 }, pk: [] };
  await open({ ...mid, homs: [h], homSeq: 2, up: { ...mid.up, fam_a1: 200 } });
  const r = await ev(`${H} tab('gather'); await sleep(100);
    for (let i = 0; i < 50; i++) q('#tap').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true }));
    await sleep(1500); const s = save(); return { lv: s.homs[0].lv, xp: s.homs[0].xp };`);
  ok(r.lv === 4 && r.xp > 5 && r.xp < 40, JSON.stringify(r));
});
await test('節目がたまったら、おまかせで残りが片付く', async () => {
  const h = { u: 1, k: 'koro', lv: 20, xp: 0, f: 0, rk: { mason: 2, artisan: 0, keeper: -1 }, pk: [{ t: 'p' }, { t: 'p' }, { t: 'p' }] };
  await open({ ...mid, homs: [h], homSeq: 2 });
  const r = await ev(`${H} tab('tools'); await sleep(150); const has = !!q('.picks');
    q('[data-act="pickauto"]').click(); await sleep(80); const s = save(); return { has, left: !!q('.picks'), pk: s.homs[0].pk.length, rk: s.homs[0].rk };`);
  ok(r.has && !r.left && r.pk === 0 && r.rk.mason === 5, JSON.stringify(r));
});
await test('周回すると相棒は Lv1 に戻り、道のランクと通算の記録が残る', async () => {
  const h = { u: 1, k: 'koro', lv: 20, xp: 0, f: 0, rk: { mason: 3, artisan: 1, keeper: -1 }, pk: [{ t: 'p' }] };
  await open({ ...mid, homs: [h], homSeq: 2 });
  const r = await ev(`${H} tab('up'); await sleep(100); q('[data-act="upview"][data-id="stone"]').click(); await sleep(100);
    q('[data-act="prestige"]').click(); await sleep(30); q('[data-act="prestige"]').click(); await sleep(200);
    const s = save(); const x = s.homs[0]; return { run: s.run, lv: x.lv, rk: x.rk, f: x.f, mazeBest: s.life.mazeBest };`);
  ok(r.run === 3 && r.lv === 1 && r.rk.mason === 4 && r.rk.artisan === 1 && r.f === 1 && r.mazeBest === 12, JSON.stringify(r));
});
await test('明るさの設定が保存され、開き直しても当たる', async () => {
  await ev(`${H} q('#gear').click(); await sleep(50); q('[data-theme-v="light"]').click(); await sleep(50); return 1;`);
  await send('Page.navigate', { url: BASE + '__blank' }); await sleep(300);
  await send('Page.navigate', { url: BASE }); await sleep(800);
  const r = await ev(`return document.documentElement.dataset.theme || 'none';`);
  ok(r === 'light', r);
});
await test('サービスワーカーが動き、つながらなくても開ける', async () => {
  await ev(`await navigator.serviceWorker.ready; await new Promise(r => setTimeout(r, 800)); return 1;`);
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.navigate', { url: BASE }); await sleep(1500);
  const r = await ev(`return { title: document.title, tap: !!document.getElementById('tap') };`);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  ok(r.title === 'AddAll' && r.tap, JSON.stringify(r));
});

for (const [s, n, m] of results) console.log(`${s}  ${n}${m ? '\n      ' + m : ''}`);
console.log(fail ? `\n${fail}件 失敗` : '\nすべて成功');
ws.close(); chrome.kill(); server.close();
process.exit(fail ? 1 : 0);
