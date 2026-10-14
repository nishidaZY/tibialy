<script lang="ts">
  import { onMount } from "svelte";
  import BuildPanel from "@components/build-panel/BuildPanel.svelte";
  import BuildBadge from "@components/BuildBadge.svelte";
  import ResultsTable from "@components/ResultsTable.svelte";
  import type { SpellRawEffective } from "@data/spells";
  import { computeDamageFromCharms, computeDamagePerHit, computeDamagePerTurn, computeResults } from "@lib/damage-calc";
  import {
    buildTabTitle,
    defaultCollapsed,
    type Build,
    type CalculatorState,
    type CollapsedSections,
  } from "@lib/damage-calc/build-state";
  import {
    resolveCreatures,
    resolvePerks,
    resolveSpellDamages,
    resolveSpells,
    resolveStances,
    resolveWeapon,
  } from "@lib/damage-calc/build-state-resolver";
  import { packState, unpackState } from "@lib/damage-calc/url-pack";

  let { initial }: { initial: CalculatorState } = $props();

  // Seed from the live URL, not just `initial`: replaceState keeps it current, so
  // in-progress edits survive HMR re-init. On a fresh load this equals `initial`.
  const seed: CalculatorState =
    typeof window !== "undefined"
      ? (unpackState(new URLSearchParams(window.location.search).get("s")) ?? initial)
      : initial;

  let A: Build = $state(seed.A);
  let B: Build = $state(seed.B);
  let perkOrder: number[] = $state(seed.perkOrder ?? []);
  let rotationOrder: number[] = $state(seed.rotationOrder ?? []);
  let targetOrder: number[] = $state(seed.targetOrder ?? []);
  let showSecondBuild: boolean = $state(!!seed.showSecondBuild);
  let collapsed: CollapsedSections = $state(seed.collapsed ?? defaultCollapsed());
  let buildName: string = $state(seed.buildName ?? "");

  function currentState(): CalculatorState {
    return { version: 2, A, B, perkOrder, rotationOrder, targetOrder, showSecondBuild, collapsed, buildName };
  }

  let stancesA = $derived(resolveStances(A.stats.stanceIds));
  let stancesB = $derived(resolveStances(B.stats.stanceIds));
  let weaponChoiceA = $derived(resolveWeapon(A.weapon));
  let weaponChoiceB = $derived(resolveWeapon(B.weapon));
  let perkChoicesA = $derived(resolvePerks(A.perks));
  let perkChoicesB = $derived(resolvePerks(B.perks));
  let spellChoicesA = $derived(resolveSpells(A.rotation));
  let spellChoicesB = $derived(resolveSpells(B.rotation));
  let targetChoicesA = $derived(resolveCreatures(A.targets));
  let targetChoicesB = $derived(resolveCreatures(B.targets));
  let resultsA = $derived(
    computeResults(A.stats, stancesA, weaponChoiceA, perkChoicesA, spellChoicesA, targetChoicesA),
  );
  let resultsB = $derived(
    computeResults(B.stats, stancesB, weaponChoiceB, perkChoicesB, spellChoicesB, targetChoicesB),
  );
  let spellDamageChoicesA = $derived(resolveSpellDamages(A.rotation, resultsA));
  let spellDamageChoicesB = $derived(resolveSpellDamages(B.rotation, resultsB));
  let effectiveDptA = $derived(computeDamagePerTurn(spellDamageChoicesA));
  let effectiveDptB = $derived(computeDamagePerTurn(spellDamageChoicesB));
  let effectiveDphA = $derived(computeDamagePerHit(spellDamageChoicesA));
  let effectiveDphB = $derived(computeDamagePerHit(spellDamageChoicesB));
  let damageFromCharmsA = $derived(computeDamageFromCharms(spellDamageChoicesA));
  let damageFromCharmsB = $derived(computeDamageFromCharms(spellDamageChoicesB));

  const toMap = (arr: SpellRawEffective[]) => new Map(arr.map((x) => [x.id, x]));
  let mapA = $derived(toMap(resultsA));
  let mapB = $derived(toMap(resultsB));
  const isAHigher = (id: number) =>
    Number(mapA.get(id)?.effective.avg ?? 0) >= Number(mapB.get(id)?.effective.avg ?? 0);
  const isBHigher = (id: number) =>
    Number(mapB.get(id)?.effective.avg ?? 0) >= Number(mapA.get(id)?.effective.avg ?? 0);
  const epsilon = 1e-9;
  let isDptAHigher = $derived(effectiveDptA >= effectiveDptB - epsilon);
  let isDptBHigher = $derived(effectiveDptB >= effectiveDptA - epsilon);
  let isDphAHigher = $derived(effectiveDphA >= effectiveDphB - epsilon);
  let isDphBHigher = $derived(effectiveDphB >= effectiveDphA - epsilon);
  let isDamageFromCharmsAHigher = $derived(damageFromCharmsA >= damageFromCharmsB - epsilon);
  let isDamageFromCharmsBHigher = $derived(damageFromCharmsB >= damageFromCharmsA - epsilon);
  let pctIncreaseA = $derived((effectiveDptA / effectiveDptB - 1) * 100);
  let pctIncreaseB = $derived((effectiveDptB / effectiveDptA - 1) * 100);
  let showIncrease = $derived(Number.isFinite(pctIncreaseA) && Number.isFinite(pctIncreaseB));

  function writePackedToUrl() {
    const q = new URLSearchParams(window.location.search);
    q.set("s", packState(currentState()));

    const qs = q.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }

  let didHydrate = false;
  let t: number | undefined;

  function scheduleWrite() {
    if (!didHydrate) return;
    if (t) window.clearTimeout(t);
    t = window.setTimeout(writePackedToUrl, 150);
  }

  onMount(() => {
    didHydrate = true;
    const onPop = () => {
      const s = new URLSearchParams(window.location.search).get("s");
      const st = unpackState(s);
      if (!st) return;
      A = st.A;
      B = st.B;
      perkOrder = st.perkOrder ?? [];
      rotationOrder = st.rotationOrder ?? [];
      targetOrder = st.targetOrder ?? [];
      showSecondBuild = !!st.showSecondBuild;
      collapsed = st.collapsed ?? defaultCollapsed();
      buildName = st.buildName ?? "";
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  $effect(() => {
    A;
    B;
    perkOrder;
    rotationOrder;
    targetOrder;
    showSecondBuild;
    buildName;
    collapsed.basicStats;
    collapsed.advancedStats;
    collapsed.weapon;
    collapsed.perks;
    collapsed.rotation;
    collapsed.targets;
    scheduleWrite();
  });

  $effect(() => {
    document.title = buildTabTitle(buildName);
  });

  let copied = $state(false);
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<section class="toolbar">
  <label class="build-name">
    Build name:
    <input type="text" bind:value={buildName} />
  </label>
</section>

<section class="toolbar">
  <button type="button" onclick={copyLink}>{copied ? "Copied!" : "Share"}</button>
  <button
    type="button"
    class="compare-btn"
    class:active={showSecondBuild}
    onclick={() => {
      showSecondBuild = !showSecondBuild;
      scheduleWrite();
    }}>
    {showSecondBuild ? "Hide comparison" : "Compare builds"}
  </button>
</section>

<section class="main-grid" class:comparing={showSecondBuild}>
  <div class="panel build-panel">
    <BuildPanel
      bind:buildA={A}
      bind:buildB={B}
      bind:perkOrder
      bind:rotationOrder
      bind:targetOrder
      {showSecondBuild}
      bind:collapsed />
  </div>

  <div class="panel results-panel-a">
    <h3 class="results-title">
      {#if showSecondBuild}
        <BuildBadge build="a">Build A</BuildBadge>
        {#if showIncrease}
          <span class="pct-diff" class:positive={pctIncreaseA > 0} class:negative={pctIncreaseA < 0}>
            {pctIncreaseA > 0 ? "+" : ""}{pctIncreaseA.toFixed(2)}% per turn
          </span>
        {/if}
      {/if}
    </h3>
    <ResultsTable
      results={resultsA}
      vocation={A.stats.vocation}
      rotation={A.rotation}
      effectiveDpt={effectiveDptA}
      effectiveDph={effectiveDphA}
      damageFromCharms={damageFromCharmsA}
      showHighlighting={showSecondBuild}
      isDptHigher={isDptAHigher}
      isDphHigher={isDphAHigher}
      isDamageFromCharmsHigher={isDamageFromCharmsAHigher}
      isHigher={isAHigher} />
  </div>

  {#if showSecondBuild}
    <div class="panel results-panel-b">
      <h3 class="results-title">
        <BuildBadge build="b">Build B</BuildBadge>
        {#if showIncrease}
          <span class="pct-diff" class:positive={pctIncreaseB > 0} class:negative={pctIncreaseB < 0}>
            {pctIncreaseB > 0 ? "+" : ""}{pctIncreaseB.toFixed(2)}% per turn
          </span>
        {/if}
      </h3>
      <ResultsTable
        results={resultsB}
        vocation={B.stats.vocation}
        rotation={B.rotation}
        effectiveDpt={effectiveDptB}
        effectiveDph={effectiveDphB}
        damageFromCharms={damageFromCharmsB}
        showHighlighting={true}
        isDptHigher={isDptBHigher}
        isDphHigher={isDphBHigher}
        isDamageFromCharmsHigher={isDamageFromCharmsBHigher}
        isHigher={isBHigher} />
    </div>
  {/if}
</section>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .toolbar button {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--input-border);
    border-radius: 0.5rem;
    background: transparent;
    cursor: pointer;
    color: inherit;
  }

  .toolbar button:hover {
    background: var(--btn-hover-bg);
  }

  .compare-btn.active {
    background: var(--btn-active-bg);
    border-color: var(--btn-active-border);
  }

  .build-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .build-name input {
    padding: 0.25rem 0.4rem;
    font: inherit;
    border: 1px solid var(--input-border);
    border-radius: 0.25rem;
    background: var(--input-bg);
    color: inherit;
  }

  .build-name input:focus {
    outline: none;
    box-shadow: var(--focus-ring);
    border-color: var(--focus-border);
  }

  .panel {
    display: grid;
    grid-template-rows: auto 1fr;
    min-width: 0;
  }

  .results-title {
    margin: 0 0 0.5rem 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .pct-diff {
    font-size: 0.9rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    background: var(--input-bg);
    border-radius: 0.25rem;
  }

  .pct-diff.positive {
    color: var(--positive-color);
  }

  .pct-diff.negative {
    color: var(--negative-color);
  }

  @media (min-width: 750px) {
    .main-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: 450px 420px;
      grid-template-areas: "build resultsA";
    }

    .main-grid.comparing {
      grid-template-columns: 620px 420px 420px;
      grid-template-areas: "build resultsA resultsB";
    }

    .build-panel {
      grid-area: build;
    }
    .results-panel-a {
      grid-area: resultsA;
    }
    .results-panel-b {
      grid-area: resultsB;
    }
  }

  @media (max-width: 749px) {
    .main-grid {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .build-panel {
      width: 450px;
      flex-shrink: 0;
    }

    .comparing .build-panel {
      width: 620px;
    }

    .main-grid.comparing {
      display: grid;
      gap: 1.5rem;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "build build"
        "resultsA resultsB";
    }

    .main-grid.comparing .build-panel {
      grid-area: build;
    }

    .main-grid.comparing .results-panel-a,
    .main-grid.comparing .results-panel-b {
      border-top: 1px solid var(--border-color);
      padding-top: 1rem;
    }

    .main-grid.comparing .results-panel-a {
      grid-area: resultsA;
    }

    .main-grid.comparing .results-panel-b {
      grid-area: resultsB;
    }
  }
</style>
