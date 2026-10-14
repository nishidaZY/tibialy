// Monta a calculadora do TibiaTools (EUPL-1.2) na página /damage do TibiaLootFinder.
// O estado vem do mesmo parâmetro ?s= do tibiatools.io, então links de lá abrem aqui.
import { mount } from "svelte";

import DamageCalc from "@components/DamageCalc.svelte";
import { defaultState } from "@lib/damage-calc/build-state";
import { unpackState } from "@lib/damage-calc/url-pack";

import "./theme.css";

const target = document.getElementById("damage-calc");
if (target) {
  const initial = unpackState(new URLSearchParams(location.search).get("s")) ?? defaultState();
  target.replaceChildren();
  mount(DamageCalc, { target, props: { initial } });
}
