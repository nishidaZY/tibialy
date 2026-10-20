// Stash Analyzer engine: finds the slot grid in a screenshot of the Tibia stash, recognises the
// item in each slot and reads its amount. Everything runs in the browser — the screenshot is never
// uploaded.
//
// How it works (measured on hand-checked screenshots at several resolutions, see script/stash/bench):
//  1. Grid: the slot frames are lighter lines. Brightness profiles of the selected area give the
//     slot pitch (autocorrelation); a lattice is fitted and each line snapped to its maximum.
//  2. The slot model: at 1x a stash slot is 34x34 px, 37 apart; the client draws the item's own
//     32x32 sprite at (1,1) (public/stash/atlas.png, taken from the client's files by
//     script/stash/build_client_atlas.py), a coloured rarity edge in its top-left corner and the
//     amount in bold 11 px digits with a black outline, right-aligned at the bottom (public/stash/
//     ui.json). A screenshot is that picture resized by k = pitch / 37 with some filter, plus JPEG
//     blur. The filter (box, triangle, cubic, Lanczos) and blur are picked per screenshot on a few
//     slots, and every candidate is drawn the same way and compared pixel by pixel (analysis by
//     synthesis: no upscaling, which adds no information — the candidates are brought down to the
//     screenshot's own resolution instead).
//  3. Per slot: a coarse 8x8 fingerprint keeps the closest 60 items, the full picture ranks them,
//     the slot's sub-pixel position is fitted, the amount is read right to left (beam search over
//     digits drawn over the item's own art), and the items are compared again with their amount
//     drawn (a stackable item's look depends on it: 1, 2, 3, 4, 5-9, 10-24, 25-49, 50+).
//  4. The stash as a whole: the client sorts by name, by amount or by total NPC value. The order
//     the slots agree with is detected (none: no constraint) and a dynamic programme picks, per
//     slot, the (item, amount) that fit the order; a slot that breaks it is searched again among
//     every item (and every amount) that fits between its neighbours. A slot is "sure" when it
//     keeps the order and no other item the order allows comes close.
(function () {
  'use strict';
  // ── image helpers ──────────────────────────────────────────────────────────
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

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
        // a line right beside other UI (the scrollbar after the last column) can snap to that
        // UI's bright edge instead: more than 1 px off the lattice, the lattice position is kept
        const sx = snapLine(x);
        lines.push(Math.min(n - 1, Math.max(0, sx <= 0 || sx >= n - 1 || Math.abs(sx - x) > 1.25 ? Math.round(x) : sx)));
      }
      lines = [...new Set(lines)].sort((a, b) => a - b);
      return { lines, centres: lines.map(centre), pitch: p2 };
    }
    return { lines, centres: lines.map(centre), pitch };
  }

  function findGrid(img) {
    const { cols, rows } = profiles(img);
    // slots from ~13 px (a tiny screenshot) to ~250 px (screenshot of a zoomed-in stash)
    const minLag = 13, maxLag = Math.min(250, Math.floor(Math.min(img.width, img.height) / 2));
    const p = pitchOf(cols, rows, minLag, maxLag);
    if (!p) return null;
    const X = lattice(cols, p), Y = lattice(rows, p);
    // xs/ys: brightest pixel of each gap (the count digits are measured from it);
    // cx/cy: centre of each gap (slot boxes, so sprites sit centred)
    return { xs: X.lines, ys: Y.lines, cx: X.centres, cy: Y.centres, pitch: (X.pitch + Y.pitch) / 2 };
  }

  // A selection drawn by hand often cuts the outer slots (a column 3 px short was dropped and
  // every count after it moved one slot). A side whose edge falls inside a slot is moved out to
  // that slot's frame. It is a slot when the frame lines of the grid carry on across the strip
  // (the scrollbar beside the last column is dark like a slot, but has no frame lines).
  function fitSelection(image, sel) {
    const IW = image.naturalWidth || image.width, IH = image.naturalHeight || image.height;
    const grab = (x, y, w, h) => {
      const c = canvas(w, h);
      ctx2d(c).drawImage(image, x, y, w, h, 0, 0, c.width, c.height);
      return ctx2d(c).getImageData(0, 0, c.width, c.height);
    };
    const g = findGrid(grab(sel.x, sel.y, sel.w, sel.h));
    if (!g || g.xs.length < 2 || g.ys.length < 2) return sel;
    const P = g.pitch;
    // the selection and a slot more around it, in screenshot pixels
    const ex = Math.max(0, Math.floor(sel.x - P)), ey = Math.max(0, Math.floor(sel.y - P));
    const E = grab(ex, ey, Math.min(IW, Math.ceil(sel.x + sel.w + P)) - ex, Math.min(IH, Math.ceil(sel.y + sel.h + P)) - ey);
    const L = (x, y) => {
      x = Math.round(x - ex); y = Math.round(y - ey);
      if (x < 0 || y < 0 || x >= E.width || y >= E.height) return NaN;
      const i = (y * E.width + x) * 4; return E.data[i] * 0.299 + E.data[i + 1] * 0.587 + E.data[i + 2] * 0.114;
    };
    const mean = a => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : NaN; };
    const xs = g.xs.map(v => v + sel.x), ys = g.ys.map(v => v + sel.y);
    // for each frame line: how much brighter it is than the slot borders beside it, across the
    // strip [a, b) of columns (lines = the rows of the grid) or rows (lines = its columns)
    const contrast = (a, b, lines, vertical) => lines.map(l => {
      const on = [], off = [];
      for (let t = a; t < b; t++) {
        on.push(vertical ? L(l, t) : L(t, l));
        // just beside the line: the slot's own dark border (items hardly reach it)
        for (const d of [-0.1 * P, 0.1 * P]) off.push(vertical ? L(l + d, t) : L(t, l + d));
      }
      return mean(on) - mean(off);
    });
    const m = Math.round(0.15 * P), grow = [0, 0, 0, 0];
    const sides = [
      // [space before the first line, strip just outside it, the full slot just inside it]
      [xs[0] - sel.x, [xs[0] - P + m, xs[0] - m], [xs[0] + m, xs[0] + P - m], ys.slice(0, -1), false],
      [sel.x + sel.w - 1 - xs[xs.length - 1], [xs[xs.length - 1] + m, xs[xs.length - 1] + P - m], [xs[xs.length - 1] - P + m, xs[xs.length - 1] - m], ys.slice(0, -1), false],
      [ys[0] - sel.y, [ys[0] - P + m, ys[0] - m], [ys[0] + m, ys[0] + P - m], xs.slice(0, -1), true],
      [sel.y + sel.h - 1 - ys[ys.length - 1], [ys[ys.length - 1] + m, ys[ys.length - 1] + P - m], [ys[ys.length - 1] - P + m, ys[ys.length - 1] - m], xs.slice(0, -1), true],
    ];
    sides.forEach(([gap, strip, ref, lines, vertical], i) => {
      if (gap <= 0.12 * P || gap >= P - 1) return;
      const r = contrast(Math.round(ref[0]), Math.round(ref[1]), lines, vertical).filter(Number.isFinite);
      const rm = r.reduce((p, q) => p + q, 0) / (r.length || 1);
      const ok = contrast(Math.round(strip[0]), Math.round(strip[1]), lines, vertical).map(v => v > 0.5 * rm);
      // most frame lines carry on; except under the last row, which is often only partly filled
      // from the left (no frames after its last item): its first slots are enough
      let lead = 0; while (lead < ok.length && ok[lead]) lead++;
      const slot = ok.filter(Boolean).length >= 0.6 * ok.length || (i === 3 && lead >= Math.min(2, ok.length));
      if (rm > 8 && slot) grow[i] = P - gap + 2;
    });
    if (!grow.some(Boolean)) return sel;
    const x = Math.max(0, sel.x - grow[0]), y = Math.max(0, sel.y - grow[2]);
    return { x, y, w: Math.min(IW, sel.x + sel.w + grow[1]) - x, h: Math.min(IH, sel.y + sel.h + grow[3]) - y };
  }

  async function loadImage(src) {
    const im = new Image();
    im.src = src;
    await im.decode();
    return im;
  }

  // ── the slot model ─────────────────────────────────────────────────────────
  // At 1x (no UI scaling, unresized screenshot) a stash slot is 34x34 px with a 3 px gap to the next
  // one (pitch 37). The item is drawn at (1,1) as its 32x32 client sprite; the rarity edge (a small
  // coloured triangle) over its top-left corner; the amount in the client's Verdana10px bitmap
  // font (grey 192 with a black outline), right-aligned at the bottom. Everything else is the dark
  // slot background. A screenshot is that picture shrunk (or enlarged) by k = pitch / 37 and
  // blurred a little by the resizing and the JPEG: the same is done to every candidate here and
  // the one that reproduces the slot best wins.
  const NP = 37, SLOT = 34;
  const Z0 = 1.5, Z1 = 32.5;                      // compared part of the slot (slot px)
  const TEXT_V = 22;                              // rows from here down can hold the amount
  const MARK = 7;                                 // the rarity edge fits in the top-left 7x7
  const WORK_PITCH = 37;                          // bigger screenshots are scaled down to 1x first

  // channels of an ImageData as float planes
  function planes(img) {
    const n = img.width * img.height, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), d = img.data;
    for (let i = 0; i < n; i++) { R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2]; }
    return { W: img.width, H: img.height, R, G, B };
  }

  function normalise(src) {
    const img0 = ctx2d(src).getImageData(0, 0, src.width, src.height);
    const g = findGrid(img0);
    if (!g || g.pitch <= WORK_PITCH * 1.08) return { src, f: 1 };
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

  // atlas pixels, read once per atlas image
  let atlasPx = null;
  function atlasPixels(atlasImg) {
    if (atlasPx && atlasPx.img === atlasImg) return atlasPx;
    const c = canvas(atlasImg.width, atlasImg.height), x = ctx2d(c);
    x.drawImage(atlasImg, 0, 0);
    atlasPx = { img: atlasImg, W: c.width, data: x.getImageData(0, 0, c.width, c.height).data };
    return atlasPx;
  }

  // 1x picture of a slot: background, sprite of atlas cell j (-1: none), rarity edge m (-1: none), amount text
  function synth(T, A, cols, j, bg, m, text, ui, layout) {
    for (let i = 0; i < SLOT * SLOT; i++) { T[i * 3] = bg[0]; T[i * 3 + 1] = bg[1]; T[i * 3 + 2] = bg[2]; }
    if (j >= 0) {
      const ax = (j % cols) * 32, ay = Math.floor(j / cols) * 32, d = A.data, W = A.W;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const s = ((ay + y) * W + ax + x) * 4, a = d[s + 3] / 255;
        if (!a) continue;
        const t = ((y + 1) * SLOT + x + 1) * 3;
        T[t] += (d[s] - T[t]) * a; T[t + 1] += (d[s + 1] - T[t + 1]) * a; T[t + 2] += (d[s + 2] - T[t + 2]) * a;
      }
    }
    if (m >= 0) {
      const e = ui.edges[m];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const p = e[y * 8 + x], a = p[3] / 255;
        if (!a) continue;
        const t = ((y + 1) * SLOT + x + 1) * 3;
        T[t] += (p[0] - T[t]) * a; T[t + 1] += (p[1] - T[t + 1]) * a; T[t + 2] += (p[2] - T[t + 2]) * a;
      }
    }
    if (text) drawText(T, text, ui, layout);
  }
  // The amount: Verdana Bold 11px with a 1 px black outline (the shapes match screenshots exactly;
  // tone and place fitted to them, tools: harvest.mjs + fontglyphs.py). Per character a box of grey
  // levels (-1 = untouched); digits 8 px apart, a thousands comma 4, right-aligned in the slot.
  // A number wider than the slot (2,860) keeps its glyphs but gets tighter spacing to fit box.FIT
  // px (at most 15 % tighter; longer ones stick out to the left): the pens move toward its right end, to fractional places (the glyphs are blended over two
  // columns there). layout: the whole number's shape ('#,###') when text is only its right end
  // (it is read right to left).
  function drawText(T, text, ui, layout = text) {
    const { box, px } = ui.digits;
    const pens = [];
    let pen = box.RIGHT;
    for (let i = layout.length - 1; i >= 0; i--) { pen -= layout[i] === ',' ? box.COMMA : box.ADV; pens[i] = pen; }
    const width = box.RIGHT - pens[0];
    if (width > box.FIT) { const f = Math.max(0.85, box.FIT / width); for (let i = 0; i < pens.length; i++) pens[i] = box.RIGHT - (box.RIGHT - pens[i]) * f; }
    const skip = layout.length - text.length;
    for (let i = 0; i < text.length; i++) {
      const g = px[text[i]], p = pens[i + skip], ip = Math.floor(p), fx = p - ip;
      for (let gy = 0; gy < box.GH; gy++) {
        const y = box.GY0 + gy;
        if (y >= SLOT) break;
        // this glyph row, shifted by the fraction: coverage and premultiplied grey per slot column
        for (let gx = -1; gx < box.GW; gx++) {
          const x = ip + box.GX0 + gx + 1;
          if (x < 0 || x >= SLOT) continue;
          const left = gx >= 0 ? g[gy * box.GW + gx] : -1, right = gx + 1 < box.GW ? g[gy * box.GW + gx + 1] : -1;
          // column x takes (1 - fx) of glyph column gx+1 and fx of glyph column gx
          const aR = right >= 0 ? 1 - fx : 0, aL = left >= 0 ? fx : 0, a = aR + aL;
          if (!a) continue;
          const v = ((right >= 0 ? right : 0) * aR + (left >= 0 ? left : 0) * aL) / a;
          const t = (y * SLOT + x) * 3;
          T[t] = T[t] * (1 - a) + v * a; T[t + 1] = T[t + 1] * (1 - a) + v * a; T[t + 2] = T[t + 2] * (1 - a) + v * a;
        }
      }
    }
  }

  // How the 1x picture became the screenshot's pixels: resampled by k with one of the usual filters
  // (box = area average, triangle, Catmull-Rom cubic, Lanczos-3; picked per screenshot), then a small
  // gaussian blur (JPEG). For each screenshot pixel of a slot: the 1x pixels it takes (taps) and how much.
  const KERNELS = {
    box: null,
    tri: { r: 1, f: d => Math.max(0, 1 - Math.abs(d)) },
    cubic: { r: 2, f: d => { d = Math.abs(d); return d < 1 ? 1.5 * d ** 3 - 2.5 * d ** 2 + 1 : d < 2 ? -0.5 * d ** 3 + 2.5 * d ** 2 - 4 * d + 2 : 0; } },
    lanczos: { r: 3, f: d => { if (!d) return 1; if (Math.abs(d) >= 3) return 0; const p = Math.PI * d; return 3 * Math.sin(p) * Math.sin(p / 3) / (p * p); } },
  };
  const MAXT = 16;
  function taps(lo, n, X0, k, kernel) {
    // output pixels lo..lo+n-1 along one axis: 1x indices (0..SLOT-1) and weights
    const idx = new Int16Array(n * MAXT), w = new Float32Array(n * MAXT), cnt = new Uint8Array(n);
    const K = KERNELS[kernel];
    for (let i = 0; i < n; i++) {
      let m = 0, sum = 0;
      if (!K) {
        const u0 = (lo + i - X0) / k, u1 = (lo + i + 1 - X0) / k;
        for (let q = Math.floor(u0); q < Math.ceil(u1) && m < MAXT; q++) {
          if (q < 0 || q >= SLOT) continue;
          const ov = Math.min(u1, q + 1) - Math.max(u0, q);
          if (ov > 0) { idx[i * MAXT + m] = q; w[i * MAXT + m] = ov; sum += ov; m++; }
        }
      } else {
        const s = Math.min(1, k);                    // a downscale stretches the filter by 1/k
        const c = (lo + i + 0.5 - X0) / k, r = K.r / s;
        for (let q = Math.ceil(c - r - 0.5); q <= Math.floor(c + r - 0.5) && m < MAXT; q++) {
          if (q < 0 || q >= SLOT) continue;
          const v = K.f((q + 0.5 - c) * s);
          if (v) { idx[i * MAXT + m] = q; w[i * MAXT + m] = v; sum += v; m++; }
        }
      }
      for (let t = 0; t < m; t++) w[i * MAXT + t] /= sum || 1;
      cnt[i] = m;
    }
    return { idx, w, cnt };
  }
  function footprint(X0, Y0, k, P, kernel = 'box') {
    const xa = Math.ceil(X0 + Z0 * k), xb = Math.floor(X0 + Z1 * k), ya = Math.ceil(Y0 + Z0 * k), yb = Math.floor(Y0 + Z1 * k);
    const nx = Math.max(0, xb - xa), ny = Math.max(0, yb - ya);
    const u = new Float32Array(nx + 1), v = new Float32Array(ny + 1);
    for (let i = 0; i <= nx; i++) u[i] = (xa + i - X0) / k;
    for (let j = 0; j <= ny; j++) v[j] = (ya + j - Y0) / k;
    const o = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const s = (ya + j) * P.W + xa + i, t = (j * nx + i) * 3;
      o[t] = P.R[s]; o[t + 1] = P.G[s]; o[t + 2] = P.B[s];
    }
    return { xa, ya, nx, ny, u, v, o, tx: taps(xa, nx, X0, k, kernel), ty: taps(ya, ny, Y0, k, kernel) };
  }
  // the template seen through the taps: rows first, then columns
  function render(T, f, out, H) {
    const { nx, ny, tx, ty } = f;
    for (let r = 0; r < SLOT; r++) for (let i = 0; i < nx; i++) {
      let a = 0, b = 0, c = 0;
      for (let t = 0; t < tx.cnt[i]; t++) { const q = (r * SLOT + tx.idx[i * MAXT + t]) * 3, w = tx.w[i * MAXT + t]; a += w * T[q]; b += w * T[q + 1]; c += w * T[q + 2]; }
      const h = (r * nx + i) * 3; H[h] = a; H[h + 1] = b; H[h + 2] = c;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let a = 0, b = 0, c = 0;
      for (let t = 0; t < ty.cnt[j]; t++) { const h = (ty.idx[j * MAXT + t] * nx + i) * 3, w = ty.w[j * MAXT + t]; a += w * H[h]; b += w * H[h + 1]; c += w * H[h + 2]; }
      const o = (j * nx + i) * 3; out[o] = a; out[o + 1] = b; out[o + 2] = c;
    }
  }
  function gauss(sigma) {
    if (sigma <= 0.05) return null;
    const r = Math.max(1, Math.ceil(sigma * 2.5)), w = [];
    for (let i = -r; i <= r; i++) w.push(Math.exp(-i * i / (2 * sigma * sigma)));
    const s = w.reduce((a, b) => a + b, 0);
    return { r, w: w.map(x => x / s) };
  }
  function blurPatch(p, nx, ny, K, tmp) {
    if (!K) return p;
    const { r, w } = K;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let d = -r; d <= r; d++) { const x = Math.min(nx - 1, Math.max(0, i + d)); s += w[d + r] * p[(j * nx + x) * 3 + c]; }
      tmp[(j * nx + i) * 3 + c] = s;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let d = -r; d <= r; d++) { const y = Math.min(ny - 1, Math.max(0, j + d)); s += w[d + r] * tmp[(y * nx + i) * 3 + c]; }
      p[(j * nx + i) * 3 + c] = s;
    }
    return p;
  }
  // mean squared error over the pixels whose footprint lies in the slot zone [vLo, vHi) x [uLo, uHi)
  // and outside the skipped boxes
  function err(pred, f, zone) {
    const { nx, ny, u, v, o } = f;
    let s = 0, n = 0;
    for (let j = 0; j < ny; j++) {
      const vm = (v[j] + v[j + 1]) / 2;
      if (vm < zone.v0 || vm >= zone.v1) continue;
      for (let i = 0; i < nx; i++) {
        const um = (u[i] + u[i + 1]) / 2;
        if (um < zone.u0 || um >= zone.u1) continue;
        if (zone.skipMark && um < MARK && vm < MARK) continue;
        if (zone.skipText && vm >= TEXT_V && um >= zone.textU) continue;
        const t = (j * nx + i) * 3;
        const e0 = pred[t] - o[t], e1 = pred[t + 1] - o[t + 1], e2 = pred[t + 2] - o[t + 2];
        s += e0 * e0 + e1 * e1 + e2 * e2; n++;
      }
    }
    return n ? s / n : Infinity;
  }
  // integral image of a plane (float64): box means with fractional edges
  function integral(P) {
    const W = P.W + 1, H = P.H + 1, I = [new Float64Array(W * H), new Float64Array(W * H), new Float64Array(W * H)];
    [P.R, P.G, P.B].forEach((src, c) => {
      const S = I[c];
      for (let y = 0; y < P.H; y++) {
        let row = 0;
        for (let x = 0; x < P.W; x++) { row += src[y * P.W + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + row; }
      }
    });
    return { W, H, I };
  }
  function boxMean(J, x0, y0, x1, y1, c) {
    const S = J.I[c], W = J.W;
    const at = (x, y) => {
      x = Math.min(J.W - 1.000001, Math.max(0, x)); y = Math.min(J.H - 1.000001, Math.max(0, y));
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const a = S[j * W + i], b = S[j * W + i + 1], cc = S[(j + 1) * W + i], d = S[(j + 1) * W + i + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
    };
    return (at(x1, y1) - at(x0, y1) - at(x1, y0) + at(x0, y0)) / ((x1 - x0) * (y1 - y0));
  }

  // coarse fingerprint: 8x8 blocks of 4x4 slot px over the item, without the rarity edge and the
  // bottom-right corner where the amount is written
  const BLOCKS = [];
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    if (bx === 0 && by === 0) continue;
    if (by >= 6 && bx >= 2) continue;
    BLOCKS.push([1 + bx * 4, 1 + by * 4]);
  }
  let fpCache = null;
  function atlasFingerprints(A, atlas, bg) {
    const key = bg.map(Math.round).join(',');
    if (fpCache && fpCache.A === A && fpCache.key === key) return fpCache.v;
    const n = atlas.ids.length, cols = atlas.cols, L = BLOCKS.length * 3, v = new Float32Array(n * L), d = A.data, W = A.W;
    for (let j = 0; j < n; j++) {
      const ax = (j % cols) * 32, ay = Math.floor(j / cols) * 32;
      BLOCKS.forEach(([sx, sy], b) => {
        let r = 0, g = 0, bl = 0;
        for (let y = sy - 1; y < sy + 3; y++) for (let x = sx - 1; x < sx + 3; x++) {
          const s = ((ay + y) * W + ax + x) * 4, a = d[s + 3] / 255;
          r += bg[0] + (d[s] - bg[0]) * a; g += bg[1] + (d[s + 1] - bg[1]) * a; bl += bg[2] + (d[s + 2] - bg[2]) * a;
        }
        const o = j * L + b * 3; v[o] = r / 16; v[o + 1] = g / 16; v[o + 2] = bl / 16;
      });
    }
    fpCache = { A, key, v };
    return v;
  }

  const fmt = n => n.toLocaleString('en-US');      // the client writes 2,860
  const pattern = n => n < 5 ? Math.max(0, n - 1) : n < 10 ? 4 : n < 25 ? 5 : n < 50 ? 6 : 7;

  async function analyze(original, data, opts = {}, onProgress = () => {}) {
    // let the page draw the progress bar; a message, not setTimeout: a hidden tab throttles timers to
    // one a second (or a minute), which made a long analysis take minutes
    const tick = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
    const { atlas, atlasImg, ui } = data;
    const meta = atlas.items, cols = atlas.cols;
    const { src, f: scaleF } = normalise(original);
    const img = ctx2d(src).getImageData(0, 0, src.width, src.height);
    const P = planes(img), J = integral(P);
    const grid = findGrid(img);
    if (!grid || grid.xs.length < 2 || grid.ys.length < 2) throw new Error('Não encontrei a grade de slots na área selecionada.');
    const pitch = grid.pitch, k = pitch / NP;
    const A = atlasPixels(atlasImg);

    // slots between two gap lines one pitch apart
    const cells = [];
    for (let r = 0; r + 1 < grid.cy.length; r++) for (let c = 0; c + 1 < grid.cx.length; c++) {
      const w = grid.cx[c + 1] - grid.cx[c], h = grid.cy[r + 1] - grid.cy[r];
      if (w < 0.85 * pitch || w > 1.15 * pitch || h < 0.85 * pitch || h > 1.15 * pitch) continue;
      cells.push({ r, c, mx: (grid.cx[c] + grid.cx[c + 1]) / 2, my: (grid.cy[r] + grid.cy[r + 1]) / 2 });
    }
    // slot background: median of the inner ring of every slot
    const ring = [];
    for (const s of cells) for (const [fx, fy] of [[-0.32, -0.32], [0, -0.32], [0.32, -0.32], [-0.32, 0], [0.32, 0], [0, 0.32]])
      ring.push([0, 1, 2].map(c => boxMean(J, s.mx + fx * pitch - 0.5, s.my + fy * pitch - 0.5, s.mx + fx * pitch + 0.5, s.my + fy * pitch + 0.5, c)));
    const bg = [0, 1, 2].map(c => ring.map(p => p[c]).sort((a, b) => a - b)[ring.length >> 1]);

    const fps = atlasFingerprints(A, atlas, bg), L = BLOCKS.length * 3, nCells = atlas.ids.length;
    const T = new Float32Array(SLOT * SLOT * 3), H = new Float32Array(SLOT * 64 * 3), pred = new Float32Array(64 * 64 * 3), tmp = new Float32Array(64 * 64 * 3);
    let geo = { dx: 0, dy: 0, sigma: 0.4, kernel: 'box' };
    let K = gauss(geo.sigma);
    const origin = s => [s.mx - 17 * k + geo.dx + (s.ox || 0), s.my - 17 * k + geo.dy + (s.oy || 0)];
    const fpOf = s => {
      const [X0, Y0] = origin(s), v = new Float32Array(L);
      BLOCKS.forEach(([sx, sy], b) => { for (let c = 0; c < 3; c++) v[b * 3 + c] = boxMean(J, X0 + sx * k, Y0 + sy * k, X0 + (sx + 4) * k, Y0 + (sy + 4) * k, c); });
      return v;
    };
    // best cell per item, coarse distance
    const coarse = (s, keep) => {
      const v = fpOf(s), best = new Map();
      for (let j = 0; j < nCells; j++) {
        let d = 0; const o = j * L;
        for (let i = 0; i < L; i++) { const e = v[i] - fps[o + i]; d += e * e; }
        const id = atlas.ids[j], b = best.get(id);
        if (!b || d < b[0]) best.set(id, [d, j]);
      }
      return [...best.values()].sort((a, b) => a[0] - b[0]).slice(0, keep).map(x => x[1]);
    };
    const fpCacheSlot = new Map();
    const foot = s => { const key = s.r + ',' + s.c + ',' + geo.dx + ',' + geo.dy + ',' + geo.kernel + ',' + (s.ox || 0) + ',' + (s.oy || 0); let f = fpCacheSlot.get(key); if (!f) { const [X0, Y0] = origin(s); f = footprint(X0, Y0, k, P, geo.kernel); fpCacheSlot.set(key, f); } return f; };
    // Thin line art (hooks, staffs) loses contrast in a resize + JPEG more than the model predicts:
    // the drawn part's strength against the background is fitted per slot (least squares, 0.6-1.15)
    const score = (s, j, m, text, zone) => {
      const f = foot(s);
      synth(T, A, cols, j, bg, m, text, ui);
      render(T, f, pred, H);
      blurPatch(pred, f.nx, f.ny, K, tmp);
      if (j >= 0) gainFit(pred, f, zone);
      return err(pred, f, zone);
    };
    const gainFit = (p, f, zone) => {
      const { nx, ny, u, v, o } = f;
      let od = 0, dd = 0;
      for (let jj = 0; jj < ny; jj++) {
        const vm = (v[jj] + v[jj + 1]) / 2; if (vm < zone.v0 || vm >= zone.v1) continue;
        for (let i = 0; i < nx; i++) {
          const um = (u[i] + u[i + 1]) / 2; if (um < zone.u0 || um >= zone.u1) continue;
          const t = (jj * nx + i) * 3;
          for (let c = 0; c < 3; c++) { const d = p[t + c] - bg[c]; od += (o[t + c] - bg[c]) * d; dd += d * d; }
        }
      }
      const g = dd ? Math.min(1.15, Math.max(0.6, od / dd)) : 1;
      if (g !== 1) for (let t = 0; t < nx * ny * 3; t += 3) for (let c = 0; c < 3; c++) p[t + c] = bg[c] + g * (p[t + c] - bg[c]);
    };
    // the amount over a known picture: the text's contrast varies with the resizing (a zoomed-in
    // screenshot keeps it bright and sharp), so its strength is fitted (least squares, clamped)
    const base = new Float32Array(64 * 64 * 3);
    const textBase = (s, j, m) => { const f = foot(s); synth(T, A, cols, j, bg, m, '', ui); render(T, f, base, H); blurPatch(base, f.nx, f.ny, K, tmp); return f; };
    const scoreText = (s, j, m, text, f, layout) => {
      synth(T, A, cols, j, bg, m, text, ui, layout);
      render(T, f, pred, H);
      blurPatch(pred, f.nx, f.ny, K, tmp);
      const { nx, ny, u, v, o } = f;
      let od = 0, dd = 0;
      const idx = [];
      for (let jj = 0; jj < ny; jj++) {
        const vm = (v[jj] + v[jj + 1]) / 2; if (vm < TEXT_V - 1 || vm >= Z1) continue;
        for (let i = 0; i < nx; i++) {
          const um = (u[i] + u[i + 1]) / 2; if (um < Z0 || um >= Z1) continue;
          const t = (jj * nx + i) * 3; idx.push(t);
          for (let c = 0; c < 3; c++) { const d = pred[t + c] - base[t + c]; od += (o[t + c] - base[t + c]) * d; dd += d * d; }
        }
      }
      const a = dd ? Math.min(1.6, Math.max(0.6, od / dd)) : 1;
      let e = 0;
      for (const t of idx) for (let c = 0; c < 3; c++) { const r = o[t + c] - base[t + c] - a * (pred[t + c] - base[t + c]); e += r * r; }
      return idx.length ? e / idx.length : Infinity;
    };
    const ZONE_ITEM = { u0: Z0, u1: Z1, v0: Z0, v1: Z1, skipMark: true, skipText: true, textU: 8 };
    const ZONE_ALL = { u0: Z0, u1: Z1, v0: Z0, v1: Z1 };
    const ZONE_TEXT = { u0: Z0, u1: Z1, v0: TEXT_V - 1, v1: Z1 };

    // rarity edge: the coloured triangle in the top-left corner, or none
    const ZONE_MARK = { u0: Z0, u1: 6, v0: Z0, v1: 6 };
    const markerOf = s => {
      let best = { e: Infinity, m: -1 };
      for (let m = 0; m < ui.edges.length; m++) { const e = score(s, -1, m, '', ZONE_MARK); if (e < best.e) best = { e, m }; }
      return best.e < 900 ? best.m : -1;
    };

    // empty slots: the background alone explains them
    onProgress(0.03, 'Procurando os slots…'); await tick();
    // every stash slot shows its amount: no bright digit pixel at the bottom right = no slot there
    // (a row cut by the window's edge, the window's frame, an empty slot)
    const digitMax = s => {
      const [X0, Y0] = [s.mx - 17 * k + 2 * k, s.my - 17 * k + 1.75 * k];
      let m = 0;
      for (let y = Math.floor(Y0 + 22 * k); y < Math.ceil(Y0 + 33 * k); y++) for (let x = Math.floor(X0 + 16 * k); x < Math.ceil(X0 + 34 * k); x++) {
        if (x < 0 || y < 0 || x >= P.W || y >= P.H) continue;
        const i = y * P.W + x, l = P.R[i] * 0.299 + P.G[i] * 0.587 + P.B[i] * 0.114;
        if (l > m && Math.max(P.R[i], P.G[i], P.B[i]) - Math.min(P.R[i], P.G[i], P.B[i]) < 40) m = l;
      }
      return m;
    };
    cells.forEach(s => { s.digitMax = digitMax(s); });
    const dm = cells.map(s => s.digitMax).sort((a, b) => a - b), digitThr = Math.min(140, Math.max(90, 0.55 * dm[Math.floor(dm.length * 0.75)]));
    for (const s of cells) s.empty = s.digitMax < digitThr || score(s, -1, -1, '', ZONE_ALL) < 40;
    const full = cells.filter(s => !s.empty);
    if (!full.length) return { grid, pitch, slots: [] };

    // calibrate where the 1x slot sits in the cell (the gap lines are found to ~0.3 px) and the blur,
    // on a few slots with their best coarse candidates
    onProgress(0.06, 'Calibrando…'); await tick();
    const probe = full.filter((_, i) => i % Math.max(1, Math.floor(full.length / 16)) === 0).slice(0, 16);
    probe.forEach(s => { s.m = markerOf(s); s.cand = coarse(s, 6); });
    const probeCost = () => probe.reduce((a, s) => a + Math.min(...s.cand.map(j => score(s, j, s.m, '', ZONE_ITEM))), 0);
    {
      // the 1x slot starts ~2 px right of and ~1.75 px below where the gap-line lattice puts it;
      // search around that, then again around the best with fresh shortlists
      const search = (cx, cy, span, step) => {
        let best = { e: Infinity };
        for (let dy = cy - span; dy <= cy + span + 1e-9; dy += step) for (let dx = cx - span; dx <= cx + span + 1e-9; dx += step) {
          geo = { ...geo, dx, dy };
          const e = probeCost();
          if (e < best.e) best = { e, dx, dy };
        }
        geo = { ...geo, dx: best.dx, dy: best.dy };
        probe.forEach(s => { s.cand = coarse(s, 6); });
      };
      geo.dx = 2 * k; geo.dy = 1.75 * k;
      probe.forEach(s => { s.cand = coarse(s, 6); });
      search(geo.dx, geo.dy, 1.2 * k, 0.3 * k);
      search(geo.dx, geo.dy, 0.3 * k, 0.1 * k);
      let bs = { e: Infinity };
      for (const kernel of ['box', 'tri', 'cubic', 'lanczos']) for (const sigma of [0, 0.3, 0.5, 0.7, 0.9, 1.2]) {
        geo.kernel = kernel; K = gauss(sigma);
        const e = probeCost(); if (e < bs.e) bs = { e, sigma, kernel };
      }
      geo.sigma = bs.sigma; geo.kernel = bs.kernel; K = gauss(geo.sigma);
    }

    // every slot: shortlist, item without its amount, amount read over the best items, then the
    // item again with its amount drawn (and the stack look that amount gives it)
    const cellsOf = new Map();
    atlas.ids.forEach((id, j) => { if (!cellsOf.has(id)) cellsOf.set(id, []); cellsOf.get(id).push(j); });
    const cellsFor = (id, count) => {
      const all = cellsOf.get(id), st = meta[id].stack;
      if (!st || count == null) return all;
      const p = pattern(count), m = all.filter(j => atlas.pat[j] === p);
      return m.length ? m : all;
    };
    // Amounts are read right to left with a beam search. Up to 999 the digits sit at fixed places;
    // a longer number is squeezed to fit the slot, so its digits move with its length: each length
    // gets its own search, with the places that length gives (only when something is written left
    // of where a 3-digit number ends).
    const shape = L => { let p = ''; for (let i = 0; i < L; i++) p = (i && i % 3 === 0 ? '#,' : '#') + p; return p; };
    const leftText = s => {
      const [X0, Y0] = origin(s);
      let n = 0;
      for (let y = Math.ceil(Y0 + 23 * k); y < Math.floor(Y0 + 32 * k); y++) for (let x = Math.ceil(X0 + 1.5 * k); x < Math.floor(X0 + 8.5 * k); x++) {
        const i = y * P.W + x, l = P.R[i] * 0.299 + P.G[i] * 0.587 + P.B[i] * 0.114;
        if (l > 140 && Math.max(P.R[i], P.G[i], P.B[i]) - Math.min(P.R[i], P.G[i], P.B[i]) < 40) n++;
      }
      return n >= 2;
    };
    const beamRead = (s, j, f, L) => {
      // L: digits of the whole number (null: up to 3, unsqueezed)
      const layout = L && shape(L), maxD = L || 3;
      let beam = [{ t: '' }];
      const done = [];
      for (let d0 = 0; d0 < maxD && beam.length; d0++) {
        const next = [];
        for (const b of beam) {
          const sep = d0 && d0 % 3 === 0 ? ',' : '';
          for (let d = 0; d <= 9; d++) {
            const t = d + sep + b.t;
            next.push({ t, e: scoreText(s, j, s.m, t, f, layout ? layout.slice(layout.length - t.length) && layout : undefined) });
          }
        }
        next.sort((a, b) => a.e - b.e);
        beam = next.slice(0, 5);
        for (const b of beam) if (b.t[0] !== '0' && (!L || d0 === L - 1)) done.push(b);
      }
      return done;
    };
    const readCount = (s, j) => {
      const f = textBase(s, j, s.m);
      const done = beamRead(s, j, f, null);
      if (leftText(s)) for (let L = 4; L <= 6; L++) done.push(...beamRead(s, j, f, L));
      done.sort((a, b) => a.e - b.e);
      const seen = new Set();
      return done.filter(d => !seen.has(d.t) && seen.add(d.t)).slice(0, 4).map(d => ({ n: parseInt(d.t.replace(/,/g, ''), 10), e: d.e }));
    };
    // best sub-pixel offset of the slot for one item look, around (cx, cy)
    const alignFor = (s, j, cx, cy, zone = ZONE_ITEM, text = '') => {
      let b = null;
      for (const oy of [-0.6, -0.3, 0, 0.3, 0.6]) for (const ox of [-0.6, -0.3, 0, 0.3, 0.6]) {
        s.ox = cx + ox; s.oy = cy + oy;
        const e = score(s, j, s.m, text, zone);
        if (!b || e < b.e) b = { e, ox: s.ox, oy: s.oy };
      }
      return b;
    };
    const rankWith = (s, ids) => {
      const n = s.counts[0]?.n ?? 1, out = [];
      for (const id of ids) {
        let b = null;
        for (const j of cellsFor(id, n)) { const e = score(s, j, s.m, fmt(n), ZONE_ALL); if (!b || e < b.e) b = { id, j, e }; }
        out.push(b);
      }
      return out.sort((a, b) => a.e - b.e);
    };
    for (let i = 0; i < full.length; i++) {
      const s = full[i];
      s.m ??= markerOf(s);
      const short = coarse(s, 60);
      if (opts.debug && opts.debugItems) { const all = coarse(s, 100000); s.coarseRank = opts.debugItems.map(id => all.findIndex(j => atlas.ids[j] === id)); }
      // item only (amount and edge left out)
      let first = short.map(j => ({ j, e: score(s, j, s.m, '', ZONE_ITEM) })).sort((a, b) => a.e - b.e);
      // this slot's own sub-pixel position (the lattice drifts a little across a big selection),
      // fitted to the best of the first three guesses
      {
        let b = { e: first[0].e, ox: 0, oy: 0 };
        for (const x of first.slice(0, 3)) {
          const al = alignFor(s, x.j, 0, 0);
          if (al.e < b.e) b = al;
        }
        s.ox = b.ox; s.oy = b.oy;
        if (b.ox || b.oy) first = first.slice(0, 24).map(x => ({ j: x.j, e: score(s, x.j, s.m, '', ZONE_ITEM) })).sort((a, b) => a.e - b.e);
      }
      if (opts.debug) s.firstTop = first.slice(0, 5).map(x => [meta[atlas.ids[x.j]].n, +x.e.toFixed(0)]);
      // amount, read with the best item's art behind it
      s.counts = readCount(s, first[0].j); s.countItem = atlas.ids[first[0].j];
      // everything drawn: each item with its best look for that amount
      s.ranked = rankWith(s, [...new Set(first.slice(0, 24).map(x => atlas.ids[x.j]))]);
      if (i % 4 === 0) { onProgress(0.1 + 0.8 * i / full.length, `Reconhecendo itens… ${i + 1}/${full.length}`); await tick(); }
    }

    // ── the stash as a whole ─────────────────────────────────────────────────
    // Each slot gets (item, amount) hypotheses with a cost in noise units: squared error over the
    // slot divided by the typical error of a right answer (TEMP: a pixel is not an independent
    // measurement, the JPEG and the model err together).
    onProgress(0.92, 'Conferindo a ordem do stash…'); await tick();
    const TEMP = 4;
    const pixels = (f, zone) => { let n = 0; for (let j = 0; j < f.ny; j++) { const vm = (f.v[j] + f.v[j + 1]) / 2; if (vm < zone.v0 || vm >= zone.v1) continue; for (let i = 0; i < f.nx; i++) { const um = (f.u[i] + f.u[i + 1]) / 2; if (um >= zone.u0 && um < zone.u1) n++; } } return n; };
    let noise = full.map(s => s.ranked[0].e).sort((a, b) => a - b)[full.length >> 1] || 1;
    // a first or last row that nothing explains is cut (by the window's edge or the selection)
    {
      const rowsOf = [...new Set(full.map(s => s.r))].sort((a, b) => a - b);
      const med = r => { const v = full.filter(s => s.r === r).map(s => s.ranked[0].e).sort((a, b) => a - b); return v[v.length >> 1]; };
      const cut = new Set([rowsOf[0], rowsOf[rowsOf.length - 1]].filter(r => rowsOf.length > 2 && med(r) > 3 * noise));
      if (cut.size) { for (let i = full.length - 1; i >= 0; i--) if (cut.has(full[i].r)) full.splice(i, 1); }
      noise = full.map(s => s.ranked[0].e).sort((a, b) => a - b)[full.length >> 1] || 1;
    }
    const name = id => meta[id].n.toLowerCase(), value = h => h.n * meta[h.id].npc;
    const hypsOf = (s, extra = []) => {
      const na = pixels(foot(s), ZONE_ALL), nt = pixels(foot(s), ZONE_TEXT), c0 = s.counts[0];
      const out = [];
      for (const r of [...s.ranked.slice(0, 12), ...extra]) for (const c of (s.counts.length ? s.counts.slice(0, 3) : [{ n: 1, e: 0 }])) {
        out.push({ id: r.id, j: r.j, n: c.n, eI: r.e, eT: c.e, cost: (r.e * na + (c.e - (c0 ? c0.e : 0)) * nt) / (noise * TEMP) });
      }
      for (const p of s.pairs || []) out.push({ id: p.id, j: p.j, n: p.n, eI: p.eI, eT: p.eT, ox: p.ox, oy: p.oy, cost: (p.eI * na + (p.eT - (c0 ? c0.e : 0)) * nt) / (noise * TEMP) });
      const m = Math.min(...out.map(h => h.cost));
      out.forEach(h => { h.cost -= m; });
      return out;
    };
    full.forEach(s => { s.hyp = hypsOf(s); });
    // which order is the stash in? (the client sorts by name, by amount or by total value)
    const ORDERS = {
      value: (a, b) => value(a) >= value(b), valueAsc: (a, b) => value(a) <= value(b),
      name: (a, b) => name(a.id).localeCompare(name(b.id), 'en') <= 0, nameDesc: (a, b) => name(a.id).localeCompare(name(b.id), 'en') >= 0,
      amount: (a, b) => a.n >= b.n, amountAsc: (a, b) => a.n <= b.n,
    };
    // best path through the hypotheses: costs plus a price for every break of the order
    const BREAK = 12;
    let order = null, s_best = null;
    const decode = () => {
      const ok = order ? ORDERS[order] : () => true;
      let prev = null;
      for (const s of full) {
        const cur = s.hyp.map(h => ({ h, tot: Infinity, from: -1 }));
        for (const c of cur) {
          if (!prev) { c.tot = c.h.cost; continue; }
          for (let p = 0; p < prev.length; p++) {
            const t = prev[p].tot + c.h.cost + (ok(prev[p].h, c.h) ? 0 : BREAK);
            if (t < c.tot) { c.tot = t; c.from = p; }
          }
        }
        s.dp = cur; prev = cur;
      }
      let p = prev.reduce((bi, c, i, a) => (c.tot < a[bi].tot ? i : bi), 0);
      for (let t = full.length - 1; t >= 0; t--) { const c = full[t].dp[p]; full[t].pick = c.h; p = c.from; }
    };
    // which order? decode with each and keep the one the slots agree with at little cost (a random
    // order costs ~BREAK every other slot)
    let orderCost = Infinity; const orderCosts = {};
    if (full.length >= 6 && opts.order !== 'none') {
      for (const k2 of Object.keys(ORDERS)) {
        if (opts.order && opts.order !== 'auto' && opts.order !== k2) continue;
        order = k2; decode();
        const c = full[full.length - 1].dp.reduce((a, b) => Math.min(a, b.tot), Infinity) / full.length;
        orderCosts[k2] = +c.toFixed(3);
        if (c < orderCost) { orderCost = c; s_best = k2; }
      }
      const second = Math.min(...Object.entries(orderCosts).filter(([k2]) => k2 !== s_best).map(([, v]) => v));
      order = orderCost < 4 && orderCost < 0.75 * second ? s_best : null;
    }
    const orderFit = orderCost;
    decode();
    // a slot the order disagrees with: every item whose value (or name) fits between its
    // neighbours' is drawn and compared — it finds items the shortlist missed
    if (order) {
      const byName = order.startsWith('name') ? Object.keys(meta).map(Number).sort((a, b) => name(a).localeCompare(name(b), 'en')) : null;
      for (let pass = 0; pass < 2; pass++) {
        let changed = false;
        // the amount was read over the first guess's art: another item chosen, read it again over its own
        for (const s of full) {
          if (s.pick.id === s.countItem) continue;
          if (s.pick.ox != null) { s.ox = s.pick.ox; s.oy = s.pick.oy; }
          else { const al = alignFor(s, s.pick.j, s.ox, s.oy); s.ox = al.ox; s.oy = al.oy; }
          s.counts = readCount(s, s.pick.j); s.countItem = s.pick.id; s.pairs = (s.pairs || []).filter(p => p.ox == null);
          s.ranked = rankWith(s, s.ranked.map(r => r.id));
          s.hyp = hypsOf(s); changed = true;
        }
        if (changed) decode();
        for (let i = 0; i < full.length; i++) {
          const s = full[i], h = s.pick, best = s.hyp.reduce((a, b) => (b.cost < a.cost ? b : a));
          const prevH = full[i - 1]?.pick, nextH = full[i + 1]?.pick, ok = ORDERS[order];
          const broken = (prevH && !ok(prevH, h)) || (nextH && !ok(h, nextH));
          if (!broken && h === best) continue;
          if (s.searched) continue;
          s.searched = true;
          // value order: the amounts that fit between the neighbours, for the likely items
          if (order.startsWith('value')) {
            const vp = prevH ? value(prevH) : Infinity, vn = nextH ? value(nextH) : 0;
            const [lo, hi] = order === 'value' ? [vn, vp] : [vp === Infinity ? 0 : vp, nextH ? vn : Infinity];
            const have = new Set(s.hyp.map(x => x.id + ':' + x.n));
            s.pairs ??= [];
            for (const r of s.ranked.slice(0, 4)) {
              const price = meta[r.id].npc;
              if (!price) continue;
              // the first slot has no upper bound: the next few hundred amounts above the lower one
              const n0 = Math.max(1, Math.ceil(lo / price)), n1 = hi === Infinity ? n0 + 400 : Math.floor(hi / price);
              if (n1 < n0 || n1 - n0 > 400) continue;
              const f = textBase(s, r.j, s.m);
              for (let n = n0; n <= n1; n++) {
                if (have.has(r.id + ':' + n)) continue;
                const t = fmt(n), L = t.replace(/,/g, '').length;
                s.pairs.push({ id: r.id, j: r.j, n, eI: r.e, eT: scoreText(s, r.j, s.m, t, f, L > 3 ? t : undefined) });
              }
            }
          }
          let ids;
          if (byName) {
            const lo = prevH ? name(prevH.id) : '', hi = nextH ? name(nextH.id) : null;
            ids = byName.filter(id => { const n = name(id); return (order === 'name' ? n.localeCompare(lo, 'en') >= 0 && (hi == null || n.localeCompare(hi, 'en') <= 0) : (hi == null || n.localeCompare(hi, 'en') >= 0) && n.localeCompare(lo || '￿', 'en') <= 0); });
          } else if (order.startsWith('value')) {
            const vp = prevH ? value(prevH) : Infinity, vn = nextH ? value(nextH) : 0;
            const [lo, hi] = order === 'value' ? [vn, vp] : [vp === Infinity ? 0 : vp, nextH ? vn : Infinity];
            const ns = s.counts.slice(0, 3).map(c => c.n);
            ids = Object.keys(meta).map(Number).filter(id => ns.some(n => { const v = n * meta[id].npc; return v >= lo && v <= hi; }));
          } else continue;
          const known = new Set(s.ranked.map(r => r.id));
          ids = ids.filter(id => !known.has(id));
          if (opts.debug) s.win = (s.win || []).concat([[pass, ids.length, prevH && meta[prevH.id].n, prevH && prevH.n, nextH && meta[nextH.id].n, nextH && nextH.n]]);
          if (!ids.length || ids.length > 400) continue;
          const n = h.n, extra = [];
          for (const id of ids) {
            let b = null;
            for (const j of cellsFor(id, n)) { const e = score(s, j, s.m, fmt(n), ZONE_ALL); if (!b || e < b.e) b = { id, j, e }; }
            extra.push(b);
          }
          extra.sort((a, b) => a.e - b.e);
          // the best of them with the amount read over their own art (a wrong first guess misreads it)
          const keep = [s.ox, s.oy];
          for (const x of extra.slice(0, 2)) {
            const al = alignFor(s, x.j, keep[0], keep[1]);
            s.ox = al.ox; s.oy = al.oy;
            for (const c of readCount(s, x.j).slice(0, 2)) {
              let b = null;
              for (const j of cellsFor(x.id, c.n)) { const e = score(s, j, s.m, fmt(c.n), ZONE_ALL); if (!b || e < b.e) b = { j, e }; }
              (s.pairs ??= []).push({ id: x.id, j: b.j, n: c.n, eI: b.e, eT: c.e, ox: al.ox, oy: al.oy });
            }
          }
          s.ox = keep[0]; s.oy = keep[1];
          s.ranked = [...s.ranked, ...extra.slice(0, 6)].sort((a, b) => a.e - b.e);
          s.hyp = hypsOf(s);
          changed = true;
        }
        if (!changed) break;
        decode();
      }
    }
    // how sure: the order kept, and no other item (or amount) the order allows here comes close;
    // the item's picture also has to be about as close as most slots' (not a look-alike of a missing one)
    const ok = order ? ORDERS[order] : () => true;
    full.forEach((s, i) => {
      const fits = h => (!full[i - 1] || ok(full[i - 1].pick, h)) && (!full[i + 1] || ok(h, full[i + 1].pick));
      const other = s.hyp.filter(h => h.id !== s.pick.id && fits(h)).reduce((a, b) => (!a || b.cost < a.cost ? b : a), null);
      const otherN = s.hyp.filter(h => h.id === s.pick.id && h.n !== s.pick.n && fits(h)).reduce((a, b) => (!a || b.cost < a.cost ? b : a), null);
      s.margin = other ? other.cost - s.pick.cost : 99; s.marginN = otherN ? otherN.cost - s.pick.cost : 99;
      s.fitI = s.pick.eI / noise;
      s.fitT = s.pick.eT / (full.map(q => q.counts[0]?.e ?? 0).sort((x, y) => x - y)[full.length >> 1] || 1);
      s.broken = (full[i - 1] && !ok(full[i - 1].pick, s.pick)) || (full[i + 1] && !ok(s.pick, full[i + 1].pick));
      s.sure = !s.broken && s.margin >= 4 && s.pick.eI < 3 * noise;
      // a number of 1,000 or more is squeezed into the slot: trusted only when the value order backs it
      s.countSure = !s.broken && s.marginN >= 4 && (s.pick.n < 1000 || (order || '').startsWith('value'));
      const seen = new Set([s.pick.id]);
      s.alts = s.hyp.slice().sort((a, b) => a.cost - b.cost).filter(h => !seen.has(h.id) && seen.add(h.id)).slice(0, 4).map(h => h.id);
    });

    onProgress(1, 'Pronto');
    return {
      grid, pitch, geo, bg, order, orderFit, orderCosts, digitMax: cells.map(c => [c.r, c.c, Math.round(c.digitMax)]), rowErr: [...new Set(cells.map(c => c.r))].map(r => { const v = cells.filter(c => c.r === r && c.ranked).map(c => c.ranked[0].e).sort((a, b) => a - b); return v.length ? +v[v.length >> 1].toFixed(0) : null; }), noise,
      slots: full.map(s => ({
        r: s.r, c: s.c, box: [s.mx - pitch / 2, s.my - pitch / 2, s.mx + pitch / 2, s.my + pitch / 2].map(v => v / scaleF),
        itemId: s.pick.id, cell: s.pick.j, score: s.pick.cost,
        alternatives: s.alts,
        confident: s.sure,
        count: s.pick.n, countSure: s.countSure,
        marker: s.m, origin: origin(s), k, ...(opts.debug ? { firstTop: s.firstTop, ox: s.ox, oy: s.oy, coarseRank: s.coarseRank, win: s.win, broken: !!s.broken, fitI: +s.fitI.toFixed(2), fitT: +s.fitT.toFixed(2), margin: +s.margin.toFixed(2), marginN: +s.marginN.toFixed(2), hyp: s.hyp.slice().sort((a, b) => a.cost - b.cost).slice(0, 8).map(h => [meta[h.id].n, h.n, +h.cost.toFixed(1)]), counts: s.counts.map(c => [c.n, +c.e.toFixed(0)]) } : {}),
      })),
    };
  }

  window.StashAnalyzer = { analyze, findGrid, fitSelection, loadImage, _debug: { synth, render, footprint, planes, gauss, blurPatch, err, atlasPixels, integral, boxMean, normalise, SLOT, NP } };
})();
