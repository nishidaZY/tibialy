// Learns the 1x look of the amount digits from slots whose item and amount are known (a bench.mjs
// result scored against its truth: the right ones give the item's art under each digit).
// Text model: T = U (1 - A) + B per 1x pixel of each digit's box (U = the slot without the
// amount); the screenshot is T through the screenshot's own resampling and blur (from the
// result), so the unknowns are linear: least squares by conjugate gradients, twice (the second
// time only for the pixels the first found to be part of a digit, taken as opaque).
//   node harvest.mjs <image> <x,y,w,h> <result.json> <truth.json> <out glyphs.json>
// ADV / RIGHT (env): digit spacing and the pen's right end in slot px (8 / 34 fit best).
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(process.env.PUPPETEER_FROM || import.meta.url);   // PUPPETEER_FROM: a package.json whose node_modules has puppeteer-core
const puppeteer = require('puppeteer-core');
const pub = fileURLToPath(new URL('../../../public/stash/', import.meta.url));
const [img, selArg, resPath, truthPath, outPath] = process.argv.slice(2);
const RES = JSON.parse(readFileSync(resPath)), T = JSON.parse(readFileSync(truthPath));
const atlas = JSON.parse(readFileSync(pub + 'atlas.json')), ui = JSON.parse(readFileSync(pub + 'ui.json'));
const nameOk = (id, names) => [atlas.items[id].n, ...(atlas.items[id].also || [])].some(n => names.map(x => x.toLowerCase()).includes(n.toLowerCase()));
// slots read right (item and amount): their item's look and the amount's text
const truth = RES.slots.filter(s => T[`r${s.r}c${s.c}`] && s.count === T[`r${s.r}c${s.c}`].count && nameOk(s.itemId, T[`r${s.r}c${s.c}`].names))
  .map(s => ({ r: s.r, c: s.c, cells: [s.cell], text: s.count.toLocaleString('en-US') }));
const origins = Object.fromEntries(RES.slots.map(s => [s.r + ',' + s.c, s.origin])); const GEO = RES.geo, BG = RES.bg;
const b64 = p => `data:image/${p.endsWith('png') ? 'png' : 'jpeg'};base64,` + readFileSync(p).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000 });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
page.on('console', m => console.log(m.text()));
await page.goto('about:blank');
await page.evaluate((a, r) => { globalThis.ADV = a; globalThis.RIGHT = r; }, process.env.ADV || '8', process.env.RIGHT || '34');
await page.addScriptTag({ content: readFileSync(pub + 'analyzer.js', 'utf8') });
console.log(truth.length + ' slots read right');
const out = await page.evaluate(async (atlas, ui, atlasUrl, imgUrl, selArg, truth, origins, GEO, BG) => {
  const D = StashAnalyzer._debug;
  const shot = await StashAnalyzer.loadImage(imgUrl), atlasImg = await StashAnalyzer.loadImage(atlasUrl);
  let sel = selArg ? (([x, y, w, h]) => ({ x, y, w, h }))(selArg.split(',').map(Number)) : { x: 0, y: 0, w: shot.width, h: shot.height };
  sel = StashAnalyzer.fitSelection(shot, sel);
  const c = document.createElement('canvas'); c.width = Math.round(sel.w); c.height = Math.round(sel.h);
  c.getContext('2d', { willReadFrequently: true }).drawImage(shot, sel.x, sel.y, sel.w, sel.h, 0, 0, c.width, c.height);
  const src = D.normalise(c).src;
  const im = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height), P = D.planes(im), g = StashAnalyzer.findGrid(im), k = g.pitch / D.NP;
  const A = D.atlasPixels(atlasImg), S = 34, KB = D.gauss(GEO.sigma);
  const GX0 = -2, GW = 9, GY0 = 19, GH = 15, ADV = +globalThis.ADV, RIGHT = +globalThis.RIGHT;   // digit box: [pen-2, pen+7) x [19, 34), pens ADV apart, the last at RIGHT-ADV
  const NPX = GW * GH, NU = 10 * NPX * 2;
  const idxA = (d, gx, gy) => (d * NPX + gy * GW + gx) * 2, idxB = (d, gx, gy) => idxA(d, gx, gy) + 1;
  const U = new Float32Array(S * S * 3), H = new Float32Array(S * 64 * 3), base = new Float32Array(64 * 64 * 3);
  const zone = { u0: 1.5, u1: 32.5, v0: 1.5, v1: 18, skipMark: true };
  const owners = (text) => {
    // which glyph (digit, gx, gy) owns each 1x pixel: later (right) glyphs win the overlap
    const own = new Int32Array(S * S).fill(-1), ds = text.replace(/,/g, '').split('').map(Number);
    const n = ds.length;
    for (let i = 0; i < n; i++) {
      const pen = RIGHT - ADV * (n - i);
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const qx = pen + GX0 + gx, qy = GY0 + gy;
        if (qx < 0 || qx >= S || qy >= S) continue;
        own[qy * S + qx] = idxA(ds[i], gx, gy);
      }
    }
    return own;
  };
  const run = mask => {
    const AtA = new Float64Array(NU * NU), Atr = new Float64Array(NU); let used = 0, rr0 = 0;
  for (const t of truth) {
    if (t.text.includes(',')) continue;
    const [X0, Y0] = origins[t.r + ',' + t.c];
    const f = D.footprint(X0, Y0, k, P, GEO.kernel);
    // the item's best look (animation phase) on the part above the amount
    let best = null;
    for (const j of t.cells) {
      D.synth(U, A, atlas.cols, j, BG, -1, '', ui); D.render(U, f, base, H); D.blurPatch(base, f.nx, f.ny, KB, new Float32Array(64 * 64 * 3));
      const e = D.err(base, f, zone); if (!best || e < best.e) best = { e, j };
    }
    D.synth(U, A, atlas.cols, best.j, BG, -1, '', ui); D.render(U, f, base, H); D.blurPatch(base, f.nx, f.ny, KB, new Float32Array(64 * 64 * 3));
    const own = owners(t.text);
    const { nx, ny, u, v, o } = f;
    for (let j = 0; j < ny; j++) {
      if (v[j + 1] <= GY0 - 1) continue;
      for (let i = 0; i < nx; i++) {
        // 1x weights of this screenshot pixel: resampling taps, then the blur
        const wq = new Map();
        const br = KB ? KB.r : 0;
        for (let dyb = -br; dyb <= br; dyb++) for (let dxb = -br; dxb <= br; dxb++) {
          const jj = Math.min(ny - 1, Math.max(0, j + dyb)), ii = Math.min(nx - 1, Math.max(0, i + dxb));
          const gw = KB ? KB.w[dyb + br] * KB.w[dxb + br] : 1;
          for (let ty = 0; ty < f.ty.cnt[jj]; ty++) for (let tx = 0; tx < f.tx.cnt[ii]; tx++) {
            const q = f.ty.idx[jj * 16 + ty] * S + f.tx.idx[ii * 16 + tx];
            wq.set(q, (wq.get(q) || 0) + gw * f.ty.w[jj * 16 + ty] * f.tx.w[ii * 16 + tx]);
          }
        }
        const terms = [];
        for (const [q, wgt] of wq) if (own[q] >= 0 && Math.abs(wgt) > 1e-4) terms.push([own[q], wgt, q]);
        if (!terms.length) continue;
        for (let ch = 0; ch < 3; ch++) {
          // pass 2: opaque glyph pixels replace the art: r = O - R(U) + sum w U (over masked pixels)
          let r = o[(j * nx + i) * 3 + ch] - base[(j * nx + i) * 3 + ch];
          if (mask) for (const [ia, wgt, q] of terms) if (mask[ia >> 1]) r += wgt * U[q * 3 + ch];
          const row = [];
          for (const [ia, wgt, q] of terms) { if (mask) { if (mask[ia >> 1]) row.push([ia, wgt]); } else { row.push([ia, -wgt * U[q * 3 + ch]]); row.push([ia + 1, wgt]); } }
          rr0 += r * r;
          for (const [a, va] of row) { Atr[a] += va * r; for (const [b, vb] of row) AtA[a * NU + b] += va * vb; }
          used++;
        }
      }
    }
  }
  // ridge toward "no text" and conjugate gradients
  let diag = 0; for (let i = 0; i < NU; i++) diag += AtA[i * NU + i]; const lam = 1e-4 * diag / NU;
  for (let i = 0; i < NU; i++) AtA[i * NU + i] += lam;
  const xv = new Float64Array(NU), rr = Float64Array.from(Atr), p = Float64Array.from(rr), Ap = new Float64Array(NU);
  let rs = rr.reduce((a, b) => a + b * b, 0);
  for (let it = 0; it < 600 && rs > 1e-10; it++) {
    for (let a = 0; a < NU; a++) { let s = 0; const o = a * NU; for (let b = 0; b < NU; b++) s += AtA[o + b] * p[b]; Ap[a] = s; }
    let pAp = 0; for (let a = 0; a < NU; a++) pAp += p[a] * Ap[a];
    const al = rs / pAp;
    for (let a = 0; a < NU; a++) { xv[a] += al * p[a]; rr[a] -= al * Ap[a]; }
    const rs2 = rr.reduce((s, b) => s + b * b, 0);
    for (let a = 0; a < NU; a++) p[a] = rr[a] + (rs2 / rs) * p[a];
    rs = rs2;
  }
    let fit = rr0; for (let a = 0; a < NU; a++) { fit -= 2 * xv[a] * Atr[a]; let s = 0; for (let b = 0; b < NU; b++) s += AtA[a * NU + b] * xv[b]; fit += xv[a] * s; }
    return { xv, used, fit: fit / used };
  };
  const p1 = run(null), C = [];
  for (let d = 0; d < 10; d++) for (let q = 0; q < NPX; q++) C.push(BG[1] * (1 - p1.xv[(d * NPX + q) * 2]) + p1.xv[(d * NPX + q) * 2 + 1]);
  const mask = C.map(v => Math.abs(v - BG[1]) > 10 ? 1 : 0);
  const p2 = run(mask); const xv = p2.xv, used = p2.used; console.log('fit pass1', p1.fit.toFixed(1), 'pass2', p2.fit.toFixed(1));
  const glyphs = {};
  for (let d = 0; d < 10; d++) {
    const Av = [], Bv = [];
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) { const q = d * NPX + gy * GW + gx; Av.push(mask[q]); Bv.push(mask[q] ? +Math.max(0, Math.min(255, xv[q * 2])).toFixed(1) : 0); }
    glyphs[d] = { A: Av, B: Bv };
  }
  return { used, glyphs, box: { GX0, GW, GY0, GH, ADV, RIGHT } };
}, atlas, ui, b64(pub + 'atlas.png'), b64(img), selArg, truth, origins, GEO, BG);
writeFileSync(outPath, JSON.stringify(out));
console.log('equations', out.used);
await browser.close();
