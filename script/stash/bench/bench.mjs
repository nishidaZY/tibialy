// Runs an analyzer build on one screenshot outside the app and writes what it found.
//   node bench.mjs <out.json> <image> [x,y,w,h]
// ANALYZER, ATLAS (dir with atlas.json/png) and UI (ui.json) default to public/stash.
// Needs puppeteer-core (PUPPETEER_FROM = a package.json whose node_modules has it) and Chrome.
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);   // PUPPETEER_FROM: a package.json whose node_modules has puppeteer-core
const puppeteer = require('puppeteer-core');
const pub = fileURLToPath(new URL('../../../public/stash/', import.meta.url));
const [out, imgPath, selArg] = process.argv.slice(2);
const atlasDir = process.env.ATLAS || pub;
const atlas = JSON.parse(readFileSync(atlasDir + '/atlas.json')), ui = JSON.parse(readFileSync(process.env.UI || pub + 'ui.json'));
const b64 = p => `data:image/${p.endsWith('png') ? 'png' : 'jpeg'};base64,` + readFileSync(p).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('about:blank');
await page.addScriptTag({ content: readFileSync(process.env.ANALYZER || pub + 'analyzer.js', 'utf8') });
const t0 = Date.now();
const res = await page.evaluate(async (atlas, ui, atlasUrl, imgUrl, selArg) => {
  const shot = await StashAnalyzer.loadImage(imgUrl), atlasImg = await StashAnalyzer.loadImage(atlasUrl);
  let sel = selArg ? (([x, y, w, h]) => ({ x, y, w, h }))(selArg.split(',').map(Number)) : { x: 0, y: 0, w: shot.width, h: shot.height };
  sel = StashAnalyzer.fitSelection(shot, sel);
  const area = document.createElement('canvas'); area.width = Math.round(sel.w); area.height = Math.round(sel.h);
  area.getContext('2d', { willReadFrequently: true }).drawImage(shot, sel.x, sel.y, sel.w, sel.h, 0, 0, area.width, area.height);
  const r = await StashAnalyzer.analyze(area, { atlas, atlasImg, ui }, { debug: true }, () => {});
  return { sel, order: r.order, orderCosts: r.orderCosts, geo: r.geo, bg: r.bg, pitch: r.pitch, slots: r.slots.map(s => ({ ...s, id: s.itemId, ok: s.confident, cs: s.countSure })) };
}, atlas, ui, b64(atlasDir + '/atlas.png'), b64(imgPath), selArg || '');
res.ms = Date.now() - t0;
writeFileSync(out, JSON.stringify(res));
console.log(`${res.slots.length} slots, ${res.slots.filter(s => s.ok).length} sure, pitch ${res.pitch.toFixed(2)}, order ${res.order}, ${res.ms} ms`);
await browser.close();
