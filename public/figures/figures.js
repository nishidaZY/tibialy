// Figuras de traço fino, isométricas, que respondem ao ponteiro — no estilo da biblioteca
// hairline (github.com/lucasmarkes/hairline), mas desenhadas para o TIBIALY:
//   stash(el)  — um baú: o ponteiro perto abre a tampa e os itens sobem de dentro
//   lootBag(el) — um saco de loot: inclina para o ponteiro e solta moedas quando ele chega perto
//   sword(el)  — uma espada cravada na pedra em chamas: o ponteiro a puxa para fora, inclina e aviva o fogo
// Cada função desenha dentro de `el` (largura do elemento, proporção 5:4) e devolve destroy().
// Cores pelas mesmas variáveis da hairline: --hairline-plate/-hi/-edge/-mid/-lo/-stroke.
// Sem ponteiro por perto (ou parado) a figura se anima sozinha em laço; com "reduzir movimento", fica parada.

const W = 400;
const H = 320;
const NS = "http://www.w3.org/2000/svg";
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// projeção isométrica: x para a direita-baixo, y para a esquerda-baixo, z para cima
const iso = (x, y, z, ox = 200, oy = 200) => [ox + (x - y) * 0.866, oy + (x + y) * 0.5 - z];
const pts = (list) => list.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
const poly = (list, cls) => `<polygon class="${cls}" points="${pts(list)}"/>`;
const line = (a, b, cls = "m") => `<line class="${cls}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;

/** Caixa alinhada aos eixos: só as três faces que o observador vê (topo, +x, +y). */
function box(x, y, z, w, d, h, o = {}) {
  const P = (a, b, c) => iso(a, b, c, o.ox, o.oy);
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  const front = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  return poly(right, "f e") + poly(front, "f e") + (o.noTop ? "" : poly(top, o.topCls ?? "f e"));
}

const plinth = (r = 120, oy = 200) => box(-r, -r, -12, 2 * r, 2 * r, 12, { oy, topCls: "f lo" });

const STYLE = `<style>
  .f{fill:var(--hairline-plate,#161513)}
  .e{stroke:var(--hairline-edge,#a19d96)} .m{stroke:var(--hairline-mid,#57534e)} .lo{stroke:var(--hairline-lo,#2a2826)} .hi{stroke:var(--hairline-hi,#e3b04a)}
  polygon,line,path,ellipse,circle,rect{stroke-width:var(--hairline-stroke,0.9);vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
  line,path.o{fill:none}
</style>`;

/**
 * Motor comum: mede o ponteiro (perto = 1, longe = 0; e de que lado está, -1…1), leva os valores
 * até o alvo com mola e redesenha a cada quadro.
 */
function figure(el, label, draw, { reach = 1.1 } = {}) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.style.cssText = "display:block;width:100%;height:auto;overflow:visible";
  el.replaceChildren(svg);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const s = { near: 0, side: 0, vNear: 0, vSide: 0, t: 0 };
  let alvo = null; // { near, side } do ponteiro; null = ninguém por perto → anima sozinho
  let quieto = 0;
  let raf = 0;
  let last = performance.now();

  const render = () => (svg.innerHTML = STYLE + draw(s));

  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(e.clientX - cx, e.clientY - cy) / (Math.max(r.width, r.height) * reach);
    alvo = { near: clamp(1 - d), side: clamp((e.clientX - cx) / (r.width * 0.8), -1, 1) };
    quieto = performance.now();
    wake();
  };

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    s.t = now;
    if (alvo && now - quieto > 2500) alvo = null; // o ponteiro parou: volta a se animar sozinho
    // ponteiro longe (fora do alcance da figura) não segura a figura parada: segue o laço sozinho
    const target = alvo && alvo.near > 0.15 ? alvo : { near: (Math.sin(now / 1700) + 1) / 2, side: Math.sin(now / 2600) * 0.7 };
    for (const [k, v] of [["near", "vNear"], ["side", "vSide"]]) {
      s[v] += ((target[k] - s[k]) * 60 - s[v] * 12) * dt; // mola amortecida
      s[k] += s[v] * dt;
    }
    render();
    raf = requestAnimationFrame(tick); // laço contínuo; o navegador pausa o rAF com a aba escondida
  }
  function wake() {
    if (!raf && !reduce) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  if (reduce) {
    s.near = 0.6;
    render();
  } else {
    addEventListener("pointermove", onMove, { passive: true });
    wake();
  }
  return {
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      el.replaceChildren();
    },
  };
}

// ── baú (stash) ────────────────────────────────────────────────────────────

export function stash(el) {
  return figure(el, "A stash chest that opens as the pointer comes near", ({ near, side, t }) => {
    const a = 0.05 + clamp(near) * 1.75; // abertura da tampa em radianos
    const x0 = -70, y0 = -50, w = 140, d = 100, h = 62, z0 = 0;
    const hz = z0 + h; // altura da dobradiça (borda de trás)
    // tampa: pontos girados em torno do eixo x na borda de trás
    const lid = (x, yy, zz) => {
      const yr = yy * Math.cos(a) - zz * Math.sin(a);
      const zr = yy * Math.sin(a) + zz * Math.cos(a);
      return iso(x, y0 + yr, hz + zr);
    };
    const T = 14; // espessura da tampa
    let out = plinth(130);
    // corpo: faces de fora + boca escura por cima
    out += box(x0, y0, z0, w, d, h, { noTop: true });
    out += poly([iso(x0, y0, hz), iso(x0 + w, y0, hz), iso(x0 + w, y0 + d, hz), iso(x0, y0 + d, hz)], "f lo");
    // faixas de metal e fechadura no corpo
    for (const zz of [14, 46]) out += line(iso(x0, y0 + d, zz), iso(x0 + w, y0 + d, zz)) + line(iso(x0 + w, y0, zz), iso(x0 + w, y0 + d, zz));
    // tampa: por dentro (vista quando aberta), frente e topo
    const L = [[x0, 0, 0], [x0 + w, 0, 0], [x0 + w, d, 0], [x0, d, 0]];
    const U = L.map(([x, yy]) => [x, yy, T]);
    const lp = (p) => lid(...p);
    out += poly(L.map(lp), "f lo"); // face de baixo da tampa
    out += poly([lp(L[3]), lp(L[2]), lp(U[2]), lp(U[3])], "f e"); // frente da tampa
    out += poly([lp(L[1]), lp(L[2]), lp(U[2]), lp(U[1])], "f e"); // lado
    if (a < 1.45) out += poly(U.map(lp), "f e"); // topo, enquanto ainda aponta para cima
    out += line(lid(x0 + w / 2 - 10, d, T * 0.5), lid(x0 + w / 2 + 10, d, T * 0.5), "hi"); // fecho
    // itens subindo de dentro (só com a tampa já bem aberta)
    const sobe = clamp((a - 0.9) / 0.8);
    if (sobe > 0) {
      const itens = [[-38, -20, 0], [-6, 6, 0.15], [26, -14, 0.3], [6, -30, 0.45]];
      for (const [ix, iy, atraso] of itens) {
        const k = clamp(sobe * 1.4 - atraso);
        const zz = hz - 14 + k * (34 + 6 * Math.sin(t / 400 + ix));
        out += box(ix - 8, iy - 8, zz, 16, 16, 16, { topCls: k > 0.8 ? "f hi" : "f e" });
      }
    }
    return out;
  });
}

// ── saco de loot ───────────────────────────────────────────────────────────

export function lootBag(el) {
  return figure(el, "A loot bag that tips toward the pointer and spills coins", ({ near, side, t }) => {
    const ang = side * 14 * (0.4 + near); // inclinação em graus
    const bx = 200, by = 230;
    let out = plinth(120, 238);
    // moedas: saem pela boca do saco em arco e caem na base, em leque para o lado do ponteiro
    const solta = clamp((near - 0.35) / 0.5);
    const moedas = [-1.2, -0.4, 0.5, 1.3];
    const coin = (cx, cy, glow) =>
      `<path class="f e" d="M${cx - 11} ${cy} v4 a11 5.5 0 0 0 22 0 v-4"/><ellipse class="f ${glow ? "hi" : "e"}" cx="${cx}" cy="${cy}" rx="11" ry="5.5"/>`;
    let atras = "", frente = "";
    moedas.forEach((m, i) => {
      const k = clamp(solta * 1.5 - i * 0.18);
      if (k <= 0) return;
      const fimX = bx + (m * 40 + side * 30), fimY = by + 18 + (i % 2) * 10;
      const ix = bx + side * 20, iy = by - 120;
      const x = ix + (fimX - ix) * k;
      const y = iy + (fimY - iy) * k - Math.sin(Math.PI * k) * 60;
      if (k < 1 && y < by - 40) atras += coin(x, y, true);
      else frente += coin(x, y, k >= 1);
    });
    out += atras;
    // o saco, desenhado em pé com origem na base, girado em torno dela
    const balanco = Math.sin(t / 900) * 1.5 * (1 - near);
    out += `<g transform="translate(${bx} ${by}) rotate(${(ang + balanco).toFixed(2)})">`;
    out += `<ellipse class="f e" cx="0" cy="0" rx="66" ry="20"/>`;
    out += `<path class="f e" d="M-66 0 C-82 -56 -46 -92 -18 -104 L18 -104 C46 -92 82 -56 66 0 A66 20 0 0 1 -66 0 Z"/>`;
    // dobras do tecido
    out += `<path class="o m" d="M-38 -14 C-48 -48 -32 -74 -14 -92"/><path class="o m" d="M30 -10 C42 -40 34 -70 16 -92"/><path class="o lo" d="M-4 6 C-8 -30 -4 -60 0 -96"/>`;
    // gargalo amarrado + boca
    const abre = 4 + solta * 10;
    out += `<path class="f e" d="M-18 -104 C-30 -116 -40 -${128 + abre} -14 -${132 + abre} C-4 -${124 + abre} 4 -${124 + abre} 14 -${132 + abre} C40 -${128 + abre} 30 -116 18 -104 Z"/>`;
    out += `<path class="f e" d="M-22 -102 L22 -102 L20 -110 L-20 -110 Z"/>`;
    out += `<path class="o hi" d="M20 -106 C34 -100 40 -88 32 -78 M20 -106 C30 -112 44 -108 42 -96"/>`; // cordão
    out += `<text x="0" y="-40" text-anchor="middle" font-size="30" font-family="Faustina, Georgia, serif" style="fill:var(--hairline-mid,#57534e)">$</text>`;
    out += `</g>`;
    out += frente;
    return out;
  });
}

// ── espada na pedra ────────────────────────────────────────────────────────

export function sword(el) {
  return figure(el, "A sword in a stone that the pointer pulls out", ({ near, side, t }) => {
    const puxa = clamp(near) * 55; // quanto sai da pedra
    const inclina = side * 9 * (0.3 + near);
    const oy = 236, alt = 40; // base da pedra e altura dela
    const sx = 200, sy = oy - alt; // onde a lâmina entra na pedra (centro do topo, na tela)
    let out = plinth(110, oy);
    // pedra: bloco com chanfro e rachaduras
    out += box(-62, -46, 0, 124, 92, alt, { oy });
    out += line(iso(-62, 46, 28, 200, oy), iso(-20, 46, 18, 200, oy)) + line(iso(-20, 46, 18, 200, oy), iso(-8, 46, 30, 200, oy));
    out += line(iso(62, -30, 34, 200, oy), iso(62, 10, 18, 200, oy)) + line(iso(62, 10, 18, 200, oy), iso(62, 24, 26, 200, oy));
    // fogo atrás da espada: línguas que sobem do topo da pedra e crescem conforme ela sai, mais brasas
    const fogo = 0.45 + 0.75 * clamp(near);
    const chamas = [[-48, -20, 30], [44, -10, 32], [-40, 20, 22], [50, 26, 20]]; // nas laterais, longe da lâmina
    // labareda grande logo atrás da lâmina (três camadas), o "fundo" da espada
    {
      const [fx, fy] = iso(0, -8, alt, 200, oy);
      const s = Math.sin(t / 300) * 5 + side * 10 * fogo;
      const h = (70 + 60 * clamp(near)) * (1 + 0.08 * Math.sin(t / 170));
      const camada = (hh, ww, cls) =>
        `<path class="${cls}" d="M${(fx - ww).toFixed(1)} ${fy.toFixed(1)} C${(fx - ww * 1.2).toFixed(1)} ${(fy - hh * 0.4).toFixed(1)} ${(fx - ww * 0.5 + s * 0.5).toFixed(1)} ${(fy - hh * 0.55).toFixed(1)} ${(fx - ww * 0.35 + s * 0.6).toFixed(1)} ${(fy - hh * 0.72).toFixed(1)} C${(fx - ww * 0.15 + s).toFixed(1)} ${(fy - hh * 0.85).toFixed(1)} ${(fx + s).toFixed(1)} ${(fy - hh * 0.9).toFixed(1)} ${(fx + s * 1.2).toFixed(1)} ${(fy - hh).toFixed(1)} C${(fx + ww * 0.5 + s).toFixed(1)} ${(fy - hh * 0.75).toFixed(1)} ${(fx + ww * 0.3 + s * 0.4).toFixed(1)} ${(fy - hh * 0.6).toFixed(1)} ${(fx + ww * 0.75).toFixed(1)} ${(fy - hh * 0.45).toFixed(1)} C${(fx + ww * 1.15).toFixed(1)} ${(fy - hh * 0.3).toFixed(1)} ${(fx + ww).toFixed(1)} ${(fy - hh * 0.1).toFixed(1)} ${(fx + ww).toFixed(1)} ${fy.toFixed(1)} Z"/>`;
      out += camada(h, 54, "f e") + camada(h * 0.72, 36, "f m") + camada(h * 0.5, 22, "f hi");
    }
    chamas.forEach(([x, y, h0], i) => {
      const [fx, fy] = iso(x, y, alt, 200, oy);
      const h = h0 * fogo * (1 + 0.18 * Math.sin(t / 140 + i * 1.7));
      const w = 7 + h0 / 6;
      const s = Math.sin(t / 230 + i * 2.1) * 4 + side * 8 * fogo; // ponta balança e foge do ponteiro
      const lingua = (hh, ww, cls) =>
        `<path class="${cls}" d="M${(fx - ww).toFixed(1)} ${fy.toFixed(1)} C${(fx - ww).toFixed(1)} ${(fy - hh * 0.45).toFixed(1)} ${(fx + s - ww * 0.4).toFixed(1)} ${(fy - hh * 0.7).toFixed(1)} ${(fx + s).toFixed(1)} ${(fy - hh).toFixed(1)} C${(fx + s + ww * 0.4).toFixed(1)} ${(fy - hh * 0.7).toFixed(1)} ${(fx + ww).toFixed(1)} ${(fy - hh * 0.45).toFixed(1)} ${(fx + ww).toFixed(1)} ${fy.toFixed(1)} Z"/>`;
      out += lingua(h, w, "f e") + lingua(h * 0.55, w * 0.5, "f hi");
    });
    for (let i = 0; i < 7; i++) {
      const k = ((t / 2600 + i / 7) % 1); // 0…1 em laço: sobe e apaga
      const [bx, by] = iso(-40 + i * 13, -20 + ((i * 17) % 30), alt, 200, oy);
      const ex = bx + Math.sin(t / 500 + i) * 6, ey = by - 10 - k * 90 * fogo;
      out += `<circle class="hi" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="1.4" fill="none" opacity="${(1 - k).toFixed(2)}"/>`;
    }
    // lâmina: cortada na superfície da pedra (o resto está dentro dela)
    out += `<clipPath id="acima"><rect x="0" y="0" width="${W}" height="${sy}"/></clipPath>`;
    out += `<g clip-path="url(#acima)"><g transform="translate(${sx} ${sy - puxa}) rotate(${inclina.toFixed(2)})">`;
    out += `<path class="f e" d="M0 50 L-8 32 L-8 -88 L8 -88 L8 32 Z"/>`; // ponta em 50: entra 50 na pedra
    out += `<line class="${near > 0.6 ? "hi" : "m"}" x1="0" y1="36" x2="0" y2="-85"/></g></g>`;
    // guarda, empunhadura e pomo (sempre acima da pedra)
    out += `<g transform="translate(${sx} ${sy - puxa}) rotate(${inclina.toFixed(2)})">`;
    out += `<rect class="f e" x="-30" y="-98" width="60" height="10" rx="3"/>`;
    out += `<rect class="f e" x="-6" y="-126" width="12" height="28" rx="2"/>`;
    for (let i = 0; i < 3; i++) out += `<line class="m" x1="-6" y1="${-121 + i * 9}" x2="6" y2="${-117 + i * 9}"/>`;
    out += `<circle class="f ${near > 0.6 ? "hi" : "e"}" cx="0" cy="-133" r="7"/>`;
    out += `</g>`;
    return out;
  });
}
