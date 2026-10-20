// End to end on the real page: paste a screenshot into /stash, drag the selection, analyze, read the
// table back and score it against a truth file.
//   node e2e.mjs <image> <x,y,w,h> <truth.json> [url]
// Needs puppeteer-core (PUPPETEER_FROM = a package.json whose node_modules has it) and Chrome.
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);   // PUPPETEER_FROM: a package.json whose node_modules has puppeteer-core
const puppeteer = require('puppeteer-core');
const [img, selArg, truthPath, url = 'http://localhost:3000/stash'] = process.argv.slice(2);
const truth = JSON.parse(readFileSync(truthPath));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1400, height: 1000 });
await page.goto(url, { waitUntil: 'networkidle0' });
await (await page.$('#file-input')).uploadFile(img);
await page.waitForSelector('#stage-wrap:not(.hidden)');
await page.evaluate(() => document.getElementById('stage').scrollIntoView({ block: 'start' }));
await new Promise(r => setTimeout(r, 1200));
// the stage shows the screenshot scaled: drag the selection in its coordinates
const [x, y, w, h] = selArg.split(',').map(Number);
const box = await page.evaluate(() => { const c = document.getElementById('stage'), r = c.getBoundingClientRect(); return { left: r.left, top: r.top, scale: r.width / c.width, cw: c.width }; });
const natural = await page.evaluate(src => new Promise(res => { const i = new Image(); i.onload = () => res(i.width); i.src = src; }), 'data:image/jpeg;base64,' + readFileSync(img).toString('base64'));
const s = box.cw / natural * box.scale;
await page.mouse.move(box.left + x * s + 1, box.top + y * s + 1);
await page.mouse.down();
await page.mouse.move(box.left + (x + w) * s - 1, box.top + (y + h) * s - 1, { steps: 5 });
await page.mouse.up();
const t0 = Date.now();
console.log('analyze enabled:', await page.evaluate(() => !document.getElementById('analyze-btn').disabled));
await page.click('#analyze-btn');
const poll = setInterval(async () => { try { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', await page.evaluate(() => document.getElementById('progress-label').textContent)); } catch {} }, 5000);
await page.waitForFunction(() => !document.getElementById('results-container').classList.contains('hidden') || /text-\[#f0524f\]/.test(document.getElementById('status-bar').className), { timeout: 120000 }).catch(() => {});
if (await page.evaluate(() => document.getElementById('results-container').classList.contains('hidden'))) {
  console.log('no results. status:', await page.evaluate(() => document.getElementById('status-bar').textContent), 'errors:', errors);
  await page.screenshot({ path: '/tmp/e2e_fail.png' }); await browser.close(); process.exit(1);
}
await new Promise(r => setTimeout(r, 800));
const out = await page.evaluate(() => ({
  status: document.getElementById('status-bar').textContent,
  rows: [...document.querySelectorAll('#results-body tr[data-i]')].map(tr => ({ i: +tr.dataset.i, name: tr.querySelector('[data-name]').value, qty: +tr.querySelector('[data-qty]').value, warn: !!tr.querySelector('[title^="Not sure"]') })),
  summary: document.getElementById('sum-unsure').textContent,
}));
clearInterval(poll);
const ms = Date.now() - t0;
// rows come back in table order; slot order = data-i; truth keys follow the reading order
const keys = Object.keys(truth);
let item = 0, qty = 0;
const bad = [];
out.rows.sort((a, b) => a.i - b.i).forEach((r, i) => {
  const t = truth[keys[i]]; if (!t) return;
  const names = t.names.map(n => n.toLowerCase());
  if (names.includes(r.name.toLowerCase())) item++; else bad.push(`${keys[i]} ${r.name} ≠ ${t.names[0]}`);
  if (r.qty === t.count) qty++;
});
console.log(`${out.rows.length} rows in ${ms} ms | items ${item}/${keys.length} | amounts ${qty}/${keys.length} | ${out.summary}`);
console.log('status:', out.status.trim());
if (bad.length) console.log(bad.join('\n'));
if (errors.length) console.log('page errors:', errors);
await browser.close();
