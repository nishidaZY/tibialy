// Empacota a calculadora do TibiaTools (upstream/, intocado) em public/damage/.
// Uso: cd vendor/tibiatools-calc && npm install && npm run build
// Licença: EUPL-1.2 (ver LICENCE e NOTICE.md). O que este arquivo muda está marcado com "modificação".
import { readFile } from "node:fs/promises";
import path from "node:path";

import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(here, "../../public/damage");

// Os imports "@components/…", "@data/…", "@lib/…" e "@styles/…" do projeto original (tsconfig paths).
const aliases = {
  name: "aliases",
  setup(build) {
    const map = { components: "components", data: "data", lib: "lib", styles: "styles" };
    build.onResolve({ filter: /^@(components|data|lib|styles)\// }, async (args) => {
      const [, kind, rest] = args.path.match(/^@(\w+)\/(.*)$/);
      const base = path.join(here, "upstream", map[kind], rest);
      for (const p of [base, `${base}.ts`, path.join(base, "index.ts")]) {
        try {
          await readFile(p);
          return { path: p };
        } catch {}
      }
      return { path: base };
    });
  },
};

// modificação: os ícones moram em /damage/ aqui, não na raiz do site.
const iconPaths = {
  markup: ({ content }) => ({ code: content.replace(/"\/(check|copy|paste)\.svg"/g, '"/damage/$1.svg"') }),
};

await esbuild.build({
  entryPoints: { calculator: path.join(here, "entry.ts") },
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  target: "es2022",
  outdir: out,
  loader: { ".json": "json" },
  conditions: ["svelte", "browser"],
  mainFields: ["svelte", "browser", "module", "main"],
  plugins: [aliases, sveltePlugin({ preprocess: iconPaths, compilerOptions: { css: "external" } })],
  banner: {
    js: "/* TibiaTools damage calculator — https://github.com/kik-tibia/tibiatools — Licensed under the EUPL-1.2. Bundled for TibiaLootFinder; source in vendor/tibiatools-calc. */",
    css: "/* TibiaTools damage calculator styles — Licensed under the EUPL-1.2. */",
  },
  logLevel: "info",
});
