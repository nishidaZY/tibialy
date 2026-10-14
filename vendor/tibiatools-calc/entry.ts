// Monta a calculadora do TibiaTools (EUPL-1.2) na página /damage do TIBIALY.
// O estado vem do mesmo parâmetro ?s= do tibiatools.io, então links de lá abrem aqui.
import { mount } from "svelte";

import DamageCalc from "@components/DamageCalc.svelte";
import { defaultState } from "@lib/damage-calc/build-state";
import { unpackState } from "@lib/damage-calc/url-pack";
import "./theme.css";

// modificação: guarda o último estado no navegador e o recarrega quando a página abre sem ?s=.
const KEY = "damage-calc:s";
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (s: string) => { try { localStorage.setItem(KEY, s); } catch {} },
  clear: () => { try { localStorage.removeItem(KEY); } catch {} },
};

const target = document.getElementById("damage-calc");
if (target) {
  const params = new URLSearchParams(location.search);
  let s = params.get("s");
  if (!s && (s = store.get())) {
    // o componente lê o ?s= da URL viva, então o estado salvo entra por ela
    params.set("s", s);
    history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
  }
  const initial = unpackState(s) ?? defaultState();

  // a calculadora grava cada mudança com history.replaceState(?s=…); salvamos junto
  const replaceState = history.replaceState.bind(history);
  history.replaceState = (data, unused, url) => {
    replaceState(data, unused, url);
    const next = new URLSearchParams(location.search).get("s");
    if (next) store.set(next);
  };

  target.replaceChildren();
  mount(DamageCalc, { target, props: { initial } });

  // botão Reset na barra, ao lado de Share (mesma classe para herdar o estilo do original)
  const share = target.querySelector<HTMLButtonElement>(".toolbar button");
  if (share) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = share.className;
    reset.textContent = "Reset";
    reset.title = "Clear both builds and start over";
    reset.addEventListener("click", () => {
      if (!confirm("Reset the calculator? Your saved builds will be cleared.")) return;
      store.clear();
      location.replace(location.pathname);
    });
    share.after(reset);
  }
}
