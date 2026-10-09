// Stash Analyzer engine: finds the slot grid in a screenshot of the Tibia stash, recognises the
// item in each slot and reads its count. Everything runs in the browser — the screenshot is never
// uploaded.
//
// How it works (validated on real screenshots, see lib/tasks/stash.rake):
//  1. Grid: the slot frames are lighter lines. Brightness profiles of the selected area give the
//     slot pitch (autocorrelation); a regular lattice is fitted and each line snapped to its local
//     maximum (screenshots are rescaled, so slots land on rounded pixels: a uniform grid drifts).
//  2. Items: every sprite of public/stash/atlas.png is composited on the slot background. A coarse
//     16x16 comparison keeps the 40 closest sprites, a full-resolution comparison (sprite size
//     calibrated per screenshot, +-2 px shifts) ranks them. The count corner and the tier marker
//     are left out of the comparison. When the stash is sorted by name, a dynamic programme picks
//     the candidates whose names come out in alphabetical order (fixes look-alike items).
//  3. Counts: right-aligned 5x7 digits on a fixed step, read right to left against templates
//     (public/stash/digits.json). A digit must be neutral grey (item art is colourful) and two
//     digits are separated by the dark outline.
(function () {
  'use strict';

  const N = 16;              // coarse fingerprint size
  const COARSE_KEEP = 40;    // candidates kept for the fine pass
  const SHIFT = 2;           // +- px tried in the fine pass

  // ── image helpers ──────────────────────────────────────────────────────────
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

  // Bilinear sample of a channel-interleaved RGBA ImageData at (x, y), channel ch
  function bilinear(img, x, y, ch) {
    const { width: W, height: H, data } = img;
    x = Math.min(Math.max(x - 0.5, 0), W - 1); y = Math.min(Math.max(y - 0.5, 0), H - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
    const fx = x - x0, fy = y - y0;
    const p = (xx, yy) => data[(yy * W + xx) * 4 + ch];
    return (p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy;
  }
  // w x h samples of the box (x0,y0)-(x1,y1); returns [r,g,b] per sample. When a sample covers
  // several source pixels (a big, zoomed-in screenshot) it averages ss x ss points over its area.
  function sampleBox(img, x0, y0, x1, y1, w, h) {
    const out = [], cw = (x1 - x0) / w, ch = (y1 - y0) / h;
    const ss = Math.max(1, Math.min(6, Math.round(Math.max(cw, ch))));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const acc = [0, 0, 0];
      for (let b = 0; b < ss; b++) for (let a = 0; a < ss; a++) {
        const x = x0 + (i + (a + 0.5) / ss) * cw, y = y0 + (j + (b + 0.5) / ss) * ch;
        for (let c = 0; c < 3; c++) acc[c] += bilinear(img, x, y, c);
      }
      out.push(acc.map(v => v / (ss * ss)));
    }
    return out;
  }
  const lum = p => (p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114);

  // ── 1. grid ────────────────────────────────────────────────────────────────
  function profiles(img) {
    const { width: W, height: H, data } = img;
    const cols = new Float64Array(W), rows = new Float64Array(H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      cols[x] += l / H; rows[y] += l / W;
    }
    return { cols, rows };
  }
  // autocorrelation of a mean-removed profile, normalised by the overlap length
  function autocorr(v, minLag, maxLag) {
    const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n;
    const z = Array.from(v, x => x - mean), out = {};
    for (let lag = minLag; lag <= Math.min(maxLag, n - 2); lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += z[i] * z[i + lag];
      out[lag] = s / (n - lag);
    }
    return out;
  }
  // slot pitch from both profiles together. Multiples of the pitch (2x, 3x) are peaks too and can
  // even be a little higher: take the SMALLEST lag whose local peak reaches 60 % of the best one.
  function pitchOf(cols, rows, minLag, maxLag) {
    const a = autocorr(cols, minLag, maxLag), b = autocorr(rows, minLag, maxLag);
    const lags = Object.keys(a).map(Number).filter(l => l in b);
    if (!lags.length) return null;
    const ac = Object.fromEntries(lags.map(l => [l, a[l] + b[l]]));
    const best = Math.max(...lags.map(l => ac[l]));
    for (const l of lags) {
      const isPeak = (ac[l - 1] ?? -Infinity) <= ac[l] && ac[l] >= (ac[l + 1] ?? -Infinity);
      if (isPeak && ac[l] >= 0.6 * best) {
        // sub-pixel: parabola through the peak and its neighbours
        const y0 = ac[l - 1] ?? ac[l], y2 = ac[l + 1] ?? ac[l], d = y0 - 2 * ac[l] + y2;
        return d ? l + 0.5 * (y0 - y2) / d : l;
      }
    }
    return null;
  }
  // refine a pitch with sub-pixel precision around an integer lag (parabola on the autocorrelation)
  function lattice(v, pitch) {
    const n = v.length;
    // phase: the offset whose lattice sits on the brightest lines
    let best = null;
    for (let ph = 0; ph < pitch; ph += 0.25) {
      let s = 0, k = 0;
      for (let x = ph; x < n; x += pitch) { s += v[Math.round(x)] || 0; k++; }
      if (!best || s / k > best.s) best = { ph, s: s / k };
    }
    // the gap between two slots is a light band 3-4 px wide; the brightest pixel is one of its
    // edges, the slot boundary is its centre (weighted centroid of the band above its base)
    const centre = x => {
      let lo = Infinity;
      for (let i = x - 4; i <= x + 4; i++) if (i >= 0 && i < n) lo = Math.min(lo, v[i]);
      let w = 0, sx = 0;
      for (let i = x - 3; i <= x + 3; i++) if (i >= 0 && i < n) { const e = Math.max(0, v[i] - lo - (v[x] - lo) * 0.4); w += e; sx += e * i; }
      return w ? sx / w : x;
    };
    const snapLine = x => {
      let bi = Math.round(x), bv = -Infinity;
      for (let i = Math.round(x) - 2; i <= Math.round(x) + 2; i++) if (i >= 0 && i < n && v[i] > bv) { bv = v[i]; bi = i; }
      return bi;
    };
    let lines = [];
    for (let x = best.ph; x < n; x += pitch) lines.push(snapLine(x));
    // least-squares pitch from the snapped lines, then snap again on the refined lattice
    if (lines.length >= 3) {
      const k = lines.map((_, i) => i), mk = (k.length - 1) / 2, ml = lines.reduce((a, b) => a + b, 0) / lines.length;
      let num = 0, den = 0;
      k.forEach((ki, i) => { num += (ki - mk) * (lines[i] - ml); den += (ki - mk) ** 2; });
      const p2 = num / den, ph2 = ml - p2 * mk;
      // the whole lattice across the profile, including lines right at its edges (a selection
      // drawn tight around the slots starts 1-2 px before the first frame line)
      const first = Math.ceil((-2 - ph2) / p2), last = Math.floor((n + 1 - ph2) / p2);
      lines = [];
      for (let i = first; i <= last; i++) {
        const x = ph2 + i * p2;
        if (x < -2 || x > n + 1) continue;
        // a line cut by the selection edge has its brightest pixel on the edge itself: keep the
        // lattice position there (snapping to the edge shifted the last column's digits by 2-3 px)
        const sx = snapLine(x);
        lines.push(Math.min(n - 1, Math.max(0, sx <= 0 || sx >= n - 1 ? Math.round(x) : sx)));
      }
      lines = [...new Set(lines)].sort((a, b) => a - b);
      return { lines, centres: lines.map(centre), pitch: p2 };
    }
    return { lines, centres: lines.map(centre), pitch };
  }

  function findGrid(img) {
    const { cols, rows } = profiles(img);
    // slots from ~18 px (small screenshot) to ~250 px (screenshot of a zoomed-in stash)
    const minLag = 18, maxLag = Math.min(250, Math.floor(Math.min(img.width, img.height) / 2));
    const p = pitchOf(cols, rows, minLag, maxLag);
    if (!p) return null;
    const X = lattice(cols, p), Y = lattice(rows, p);
    // xs/ys: brightest pixel of each gap (the count digits are measured from it);
    // cx/cy: centre of each gap (slot boxes, so sprites sit centred)
    return { xs: X.lines, ys: Y.lines, cx: X.centres, cy: Y.centres, pitch: (X.pitch + Y.pitch) / 2 };
  }

  // ── atlas: sprites composited on the slot background ───────────────────────
  async function loadImage(src) {
    const im = new Image();
    im.src = src;
    await im.decode();
    return im;
  }
  function compositeAtlas(atlasImg, bg, cellOut) {
    // whole atlas drawn on a bg-filled canvas at cellOut px per sprite, read back in one go
    const s = cellOut / 32;
    const c = canvas(atlasImg.width * s, atlasImg.height * s), x = ctx2d(c);
    x.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(atlasImg, 0, 0, c.width, c.height);
    return x.getImageData(0, 0, c.width, c.height);
  }

  // ── 2. items ───────────────────────────────────────────────────────────────
  function maskFn(s) {
    // skip the count (bottom 30 %, right 75 %) and the tier marker (top-left corner)
    return (x, y) => !((y >= s * 0.7 && x >= s * 0.25) || (y < s * 0.16 && x < s * 0.16));
  }

  // ── 3. counts ──────────────────────────────────────────────────────────────
  function norm(v) {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
    return v.map(x => (x - m) / sd);
  }
  // Reads it with the digits ±0.5 px around their expected place; when that is not a clear read
  // (the slot lines are found to the pixel, a resized screenshot can be 1 px off) the last digit
  // is searched ±1 px and the others follow its baseline. Wider from the start, grey item art
  // beside the number was read as extra digits.
  function readCount(img, right, bottom, P, digits) {
    const a = readDigits(img, right, bottom, P, digits, [-0.5, 0, 0.5]);
    if (a && a.worst >= 0.75) return { value: a.value, sure: true };
    const b = readDigits(img, right, bottom, P, digits, [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
    // the wide search found the same last digits but lost the first ones (908 -> 8): keep the long one
    const longer = (x, y) => String(x.value).length > String(y.value).length && String(x.value).endsWith(String(y.value));
    const best = !a ? b : !b ? a : longer(a, b) ? a : longer(b, a) ? b : b.worst > a.worst ? b : a;
    // sure only when every digit matched clearly (blurry digits and grey item art beside a number
    // score 0.6-0.75); the page asks the user to check the others
    return best ? { value: best.value, sure: best.worst >= 0.75 } : null;
  }

  function readDigits(img, right, bottom, P, digits, first) {
    const u = P / 30.75, step = 7 * u, gw = 5 * u, gh = 7 * u;
    // templates sample the box around a digit tw x th times; box = [left, top, right, bottom] in
    // px of a 1x screenshot, relative to the digit's bottom-right corner
    const tw = digits.w || 5, th = digits.h || 7, tn = tw * th, box = digits.box || [-5, -7, 0, 0];
    let out = '', worst = 1, ax = 0, ay = 0;
    for (let k = 0; k < 6; k++) {
      let top = null;
      const anchored = k && first.length > 3;
      const near = v => [v - 0.5, v - 0.25, v, v + 0.25, v + 0.5];
      const xsI = anchored ? near(ax) : first, ysI = anchored ? near(ay) : first;
      for (const dx of xsI) for (const dy of ysI) {
        const x1 = right - digits.aR * P + dx * u - k * step, y1 = bottom - digits.aB * P + dy * u;
        const px = sampleBox(img, x1 + box[0] * u, y1 + box[1] * u, x1 + box[2] * u, y1 + box[3] * u, tw, th), l = px.map(lum);
        if (Math.max(...l) - Math.min(...l) < 70) continue;
        // digits are neutral grey; colourful bright pixels are item art
        const bright = px.filter(p => (p[0] + p[1] + p[2]) / 3 > 120);
        if (!bright.length || bright.reduce((a, p) => a + Math.max(...p) - Math.min(...p), 0) / bright.length >= 28) continue;
        if (k > 0) {
          // the 2 px between this digit and the previous one is the dark outline
          const gx1 = x1 + 2 / 30.75 * P;
          const gap = sampleBox(img, x1, y1 - gh, gx1, y1, 2, 7).map(lum);
          if (gap.reduce((a, b) => a + b, 0) / gap.length >= 70) continue;
        }
        const n = norm(l);
        for (const [d, t] of Object.entries(digits.tmpl)) {
          let s = 0; for (let i = 0; i < tn; i++) s += n[i] * t[i];
          s /= tn;
          if (!top || s > top.s) top = { s, d, dx, dy };
        }
      }
      if (!top || top.s < 0.6) break;
      out = top.d + out; worst = Math.min(worst, top.s);
      if (!k) { ax = top.dx; ay = top.dy; }
    }
    return out ? { value: parseInt(out, 10), worst } : null;
  }

  // ── main ───────────────────────────────────────────────────────────────────
  // src: canvas with the selected area. data: { atlasImg, atlas, digits, names }.
  // opts.sortedByName: apply the alphabetical constraint. onProgress(fraction, label).
  // Everything below is tuned at ~31 px per slot (the digit templates, thresholds, shifts). A
  // zoomed-in screenshot is scaled down to that size first: same result, and much faster than
  // matching 90 px sprites.
  const WORK_PITCH = 30.75;
  function normalise(src) {
    const img0 = ctx2d(src).getImageData(0, 0, src.width, src.height);
    const g = findGrid(img0);
    if (!g || g.pitch <= WORK_PITCH * 1.3) return { src, f: 1 };
    const f = WORK_PITCH / g.pitch;
    let cur = src;
    // halve step by step, then the last step: keeps the downscale smooth (no aliasing)
    const targetW = src.width * f;
    while (targetW < cur.width / 2.2) {
      const half = canvas(cur.width / 2, cur.height / 2), hx = ctx2d(half);
      hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high';
      hx.drawImage(cur, 0, 0, half.width, half.height);
      cur = half;
    }
    const out = canvas(src.width * f, src.height * f), ox = ctx2d(out);
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(cur, 0, 0, out.width, out.height);
    return { src: out, f: out.width / src.width };
  }

  async function analyze(original, data, opts = {}, onProgress = () => {}) {
    const tick = () => new Promise(r => setTimeout(r, 0));
    const { src, f: scaleF } = normalise(original);
    const img = ctx2d(src).getImageData(0, 0, src.width, src.height);
    const origImg = scaleF === 1 ? img : ctx2d(original).getImageData(0, 0, original.width, original.height);
    // 16x16 fingerprint of a box of the source, downscaled by the canvas like the atlas is
    const small = canvas(N, N), smallX = ctx2d(small);
    smallX.imageSmoothingEnabled = true; smallX.imageSmoothingQuality = 'high';
    const fingerprint = (x, y, w, h) => {
      smallX.clearRect(0, 0, N, N);
      smallX.drawImage(src, x, y, w, h, 0, 0, N, N);
      const d = smallX.getImageData(0, 0, N, N).data, out = [];
      for (let i = 0; i < N * N; i++) out.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
      return out;
    };
    const grid = findGrid(img);
    if (!grid || grid.xs.length < 2 || grid.ys.length < 2) throw new Error('Não encontrei a grade de slots na área selecionada.');
    const P = grid.pitch;
    const cells = [];
    for (let r = 0; r + 1 < grid.ys.length; r++) for (let c = 0; c + 1 < grid.xs.length; c++) {
      // a slot is [3 px light border][1 px dark line][interior]: the interior runs from 0.13 of
      // a pitch after the brightest line to 0.03 before the next one (Tibia UI, any scale)
      const x0 = grid.xs[c] + 0.13 * P, x1 = grid.xs[c + 1] - 0.03 * P, y0 = grid.ys[r] + 0.13 * P, y1 = grid.ys[r + 1] - 0.03 * P;
      if (x1 - x0 < P * 0.65 || y1 - y0 < P * 0.65 || x1 - x0 > P * 1.1 || y1 - y0 > P * 1.1) continue;
      cells.push({ r, c, x0, y0, x1, y1, right: grid.xs[c + 1], bottom: grid.ys[r + 1] });
    }
    // slot background: median of points on an inner ring (18 % in) of every slot. The lines the
    // grid snaps to can be either frame of the gap between two slots, so a single point near a
    // frame sometimes lands on the border instead of the background.
    const ring = [];
    for (const k of cells) for (const [fx, fy] of [[0.18, 0.18], [0.5, 0.18], [0.82, 0.18], [0.18, 0.5], [0.82, 0.5], [0.5, 0.82]]) {
      const x = k.x0 + fx * (k.x1 - k.x0), y = k.y0 + fy * (k.y1 - k.y0);
      ring.push([0, 1, 2].map(ch => bilinear(img, x, y, ch)));
    }
    const bg = [0, 1, 2].map(ch => ring.map(p => p[ch]).sort((a, b) => a - b)[Math.floor(ring.length / 2)]);

    // empty slots: interior close to the background everywhere
    const s0 = Math.round(P * 0.845);
    const mask0 = maskFn(N);
    for (const k of cells) {
      const px = fingerprint(k.x0, k.y0, k.x1 - k.x0, k.y1 - k.y0);
      let diff = 0, n = 0;
      px.forEach((p, i) => { if (mask0(i % N, Math.floor(i / N))) { diff += Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]); n++; } });
      // a slot with a count is never empty, however small its item
      // digits are read on the original selection: a zoomed-in screenshot has them big and sharp
      k.count = readCount(origImg, k.right / scaleF, k.bottom / scaleF, P / scaleF, data.digits);
      k.empty = diff / n < 9 && k.count == null;
      k.coarse = px;
    }
    const full = cells.filter(k => !k.empty);
    onProgress(0.05, 'Preparando os sprites…'); await tick();

    // coarse fingerprints of every sprite
    const { atlas, atlasImg } = data;
    const nSprites = atlas.ids.length, cols = atlas.cols;
    const coarseAtlas = compositeAtlas(atlasImg, bg, N);
    const spriteCoarse = (j, x, y) => {
      const sx = (j % cols) * N + x, sy = Math.floor(j / cols) * N + y, i = (sy * coarseAtlas.width + sx) * 4;
      return [coarseAtlas.data[i], coarseAtlas.data[i + 1], coarseAtlas.data[i + 2]];
    };
    const coarseUse = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mask0(x, y)) coarseUse.push([x, y]);
    const spriteVecs = new Float32Array(nSprites * coarseUse.length * 3);
    for (let j = 0; j < nSprites; j++) coarseUse.forEach(([x, y], u) => {
      const p = spriteCoarse(j, x, y), o = (j * coarseUse.length + u) * 3;
      spriteVecs[o] = p[0]; spriteVecs[o + 1] = p[1]; spriteVecs[o + 2] = p[2];
    });
    function coarseTop(k) {
      const v = new Float32Array(coarseUse.length * 3);
      coarseUse.forEach(([x, y], u) => { const p = k.coarse[y * N + x]; v[u * 3] = p[0]; v[u * 3 + 1] = p[1]; v[u * 3 + 2] = p[2]; });
      const scores = new Array(nSprites);
      const L = v.length;
      for (let j = 0; j < nSprites; j++) {
        let d = 0; const o = j * L;
        for (let i = 0; i < L; i++) { const e = v[i] - spriteVecs[o + i]; d += e * e; }
        scores[j] = [d, j];
      }
      scores.sort((a, b) => a[0] - b[0]);
      return scores.slice(0, COARSE_KEEP).map(s => s[1]);
    }

    // fine pass at a given sprite size
    const fineAtlases = {};
    const fineAtlas = s => fineAtlases[s] ||= compositeAtlas(atlasImg, bg, s);
    const W = img.width, D = img.data;
    // ox, oy: where the sprite sits relative to the middle of the cell (calibrated below: the
    // lines the grid snaps to are not always the slot's own frame, so it is not always centred)
    let ox = 0, oy = 0;
    function fineScore(k, j, s, shift = SHIFT) {
      const A = fineAtlas(s), ax = (j % cols) * s, ay = Math.floor(j / cols) * s, m = maskFn(s);
      const cx = (k.x0 + k.x1) / 2 + ox, cy = (k.y0 + k.y1) / 2 + oy;
      let best = Infinity;
      for (let dy = -shift; dy <= shift; dy++) for (let dx = -shift; dx <= shift; dx++) {
        const px = Math.round(cx - s / 2 + dx), py = Math.round(cy - s / 2 + dy);
        let d = 0, n = 0;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          if (!m(x, y)) continue;
          const ii = ((py + y) * W + (px + x)) * 4, ai = ((ay + y) * A.width + (ax + x)) * 4;
          const e0 = D[ii] - A.data[ai], e1 = D[ii + 1] - A.data[ai + 1], e2 = D[ii + 2] - A.data[ai + 2];
          d += e0 * e0 + e1 * e1 + e2 * e2; n++;
        }
        if (d / n < best) best = d / n;
      }
      return best;
    }
    // calibrate the sprite size and its offset in the cell on a few slots (wide shift search),
    // then rank everything with the calibrated offset and a small search around it
    const probe = full.slice(0, 12);
    probe.forEach(k => { k.cand = coarseTop(k); });
    let size = s0, bestTot = Infinity;
    for (let s = s0 - 2; s <= s0 + 2; s++) {
      let tot = 0;
      for (const k of probe) tot += Math.min(...k.cand.slice(0, 6).map(j => fineScore(k, j, s, 4)));
      if (tot < bestTot) { bestTot = tot; size = s; }
    }
    {
      // offset: for each probe slot, where its best sprite fits best; take the median
      const offs = [];
      for (const k of probe) {
        let best = null;
        for (const j of k.cand.slice(0, 6)) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          ox = dx; oy = dy;
          const d = fineScore(k, j, size, 0);
          if (!best || d < best.d) best = { d, dx, dy };
        }
        offs.push(best);
      }
      const med = a => a.sort((x, y) => x - y)[a.length >> 1];
      ox = med(offs.map(o => o.dx)); oy = med(offs.map(o => o.dy));
    }
    // rank every slot
    for (let i = 0; i < full.length; i++) {
      const k = full[i];
      k.cand ||= coarseTop(k);
      k.ranked = k.cand.map(j => [fineScore(k, j, size), j]).sort((a, b) => a[0] - b[0]).slice(0, 8);
      if (i % 6 === 0) { onProgress(0.1 + 0.85 * i / full.length, `Reconhecendo itens… ${i + 1}/${full.length}`); await tick(); }
    }

    // alphabetical order (stash sorted by name): dynamic programme over the reading order
    const nameOf = j => (data.names[atlas.ids[j]] || '').toLowerCase();
    if (opts.sortedByName && full.length > 1) {
      let prev = null;
      for (const k of full) {
        const b0 = k.ranked[0][0] || 1;
        const cur = k.ranked.map(([d, j]) => ({ j, cost: d / b0, total: Infinity, from: -1 }));
        cur.forEach(cc => {
          if (!prev) { cc.total = cc.cost; return; }
          prev.forEach((pp, pk) => {
            const ok = nameOf(pp.j).localeCompare(nameOf(cc.j), 'en') <= 0;
            const t = pp.total + cc.cost + (ok ? 0 : 3);
            if (t < cc.total) { cc.total = t; cc.from = pk; }
          });
        });
        k.dp = cur; prev = cur;
      }
      let pick = prev.reduce((bi, c, i, a) => (c.total < a[bi].total ? i : bi), 0);
      for (let t = full.length - 1; t >= 0; t--) { const c = full[t].dp[pick]; full[t].pick = c.j; pick = c.from; }
    }

    onProgress(1, 'Pronto');
    return {
      grid, pitch: P, size, bg,
      slots: full.map(k => {
        const pick = k.pick ?? k.ranked[0][1];
        const ratio = k.ranked[1] ? k.ranked[1][0] / k.ranked[0][0] : 9;
        return {
          r: k.r, c: k.c, box: [k.x0, k.y0, k.x1, k.y1].map(v => v / scaleF),   // in the selection's pixels
          itemId: atlas.ids[pick],
          alternatives: k.ranked.slice(0, 5).map(([, j]) => atlas.ids[j]).filter(id => id !== atlas.ids[pick]).slice(0, 4),
          // sure: a clear winner that the name order did not have to overrule
          confident: pick === k.ranked[0][1] && ratio >= 1.35,
          count: k.count ? k.count.value : null,
          countSure: !!(k.count && k.count.sure),
        };
      }),
    };
  }

  window.StashAnalyzer = { analyze, findGrid, loadImage, _debug: { normalise, readCount, ctx2d, sampleBox, lum, norm } /* for the digit template harvester */ };
})();
