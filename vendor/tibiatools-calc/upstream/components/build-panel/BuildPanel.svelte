<script lang="ts">
  import AdvancedStatsSection from "@components/build-panel/AdvancedStatsSection.svelte";
  import BasicStatsSection from "@components/build-panel/BasicStatsSection.svelte";
  import PerksSection from "@components/build-panel/PerksSection.svelte";
  import RotationSection from "@components/build-panel/RotationSection.svelte";
  import TargetsSection from "@components/build-panel/TargetsSection.svelte";
  import WeaponSection from "@components/build-panel/WeaponSection.svelte";
  import BuildBadge from "@components/BuildBadge.svelte";
  import type { Build, CollapsedSections } from "@lib/damage-calc/build-state";
  import "@styles/build-table.css";

  let {
    buildA = $bindable(),
    buildB = $bindable(),
    perkOrder = $bindable(),
    rotationOrder = $bindable(),
    targetOrder = $bindable(),
    showSecondBuild = false,
    collapsed = $bindable(),
  }: {
    buildA: Build;
    buildB: Build;
    perkOrder: number[];
    rotationOrder: number[];
    targetOrder: number[];
    showSecondBuild?: boolean;
    collapsed: CollapsedSections;
  } = $props();

  function copyAtoB() {
    buildB = $state.snapshot(buildA);
  }
  function copyBtoA() {
    buildA = $state.snapshot(buildB);
  }
</script>

<table class="build-table" class:two-builds={showSecondBuild}>
  <colgroup>
    <col class="col-labels" />
    <col class="col-build" />
    {#if showSecondBuild}
      <col class="col-build" />
    {/if}
  </colgroup>
  <thead>
    <tr>
      <th>Build Stats</th>
      <th>
        {#if showSecondBuild}
          <div class="build-header">
            <BuildBadge build="a">Build A</BuildBadge>
            <button class="copy-btn" onclick={copyBtoA}>Copy entire build from B</button>
          </div>
        {/if}
      </th>
      {#if showSecondBuild}
        <th>
          <div class="build-header">
            <BuildBadge build="b">Build B</BuildBadge>
            <button class="copy-btn" onclick={copyAtoB}>Copy entire build from A</button>
          </div>
        </th>
      {/if}
    </tr>
  </thead>
  <tbody>
    <BasicStatsSection bind:buildA bind:buildB {showSecondBuild} bind:collapsed={collapsed.basicStats} />
    <AdvancedStatsSection bind:buildA bind:buildB {showSecondBuild} bind:collapsed={collapsed.advancedStats} />
    <WeaponSection bind:buildA bind:buildB {showSecondBuild} bind:collapsed={collapsed.weapon} />
    <PerksSection bind:buildA bind:buildB {showSecondBuild} bind:collapsed={collapsed.perks} bind:perkOrder />
    <RotationSection bind:buildA bind:buildB {showSecondBuild} bind:collapsed={collapsed.rotation} bind:rotationOrder />
    <TargetsSection bind:buildA bind:buildB {showSecondBuild} bind:collapsed={collapsed.targets} bind:targetOrder />
  </tbody>
</table>

<style>
  .build-table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
    border: 1px solid var(--border-color);
  }

  col.col-build {
    width: 170px;
  }

  /* Header row */
  thead th {
    text-align: left;
    padding: 0.5rem 0.4rem;
    border: 1px solid var(--border-color);
    vertical-align: top;
  }

  .build-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }
</style>
