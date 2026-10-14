<script lang="ts">
  import ClipboardPasteRow from "@components/build-panel/ClipboardPasteRow.svelte";
  import SectionCopyButtons from "@components/build-panel/SectionCopyButtons.svelte";
  import FuzzySelect from "@components/FuzzySelect.svelte";
  import RemoveButton from "@components/RemoveButton.svelte";
  import Tooltip from "@components/Tooltip.svelte";
  import { allCharms } from "@data/charms";
  import { allCreatures } from "@data/creatures";
  import type { Build, CreatureChoiceRef } from "@lib/damage-calc/build-state";
  import { packSection, SECTION_TAG } from "@lib/damage-calc/section-clipboard";
  import { compactTargets, expandTargets } from "@lib/damage-calc/url-pack";

  let {
    buildA = $bindable(),
    buildB = $bindable(),
    showSecondBuild,
    collapsed = $bindable(false),
    targetOrder = $bindable(),
  }: {
    buildA: Build;
    buildB: Build;
    showSecondBuild: boolean;
    collapsed: boolean;
    targetOrder: number[];
  } = $props();

  const creatureRegistry = new Map(allCreatures.map((c) => [c.id, c]));
  const charmRegistry = new Map(allCharms.map((c) => [c.id, c]));

  const charmTiers: number[] = [1, 2, 3];
  const DEFAULT_CHARM_TIER = 2;

  function targetDiffers(id: number): boolean {
    if (!showSecondBuild) return false;
    const signature = (t: CreatureChoiceRef | undefined) =>
      t ? `${t.ratio}:${t.charmId ?? ""}:${t.charmTier ?? ""}` : "";
    return signature(buildA.targets.find((t) => t.id === id)) !== signature(buildB.targets.find((t) => t.id === id));
  }

  function addTarget(id: number) {
    buildA = { ...buildA, targets: [...buildA.targets, { id, ratio: 1 }] };
    if (showSecondBuild) {
      buildB = { ...buildB, targets: [...buildB.targets, { id, ratio: 1 }] };
    }
    if (!targetOrder.includes(id)) {
      targetOrder = [...targetOrder, id];
    }
  }

  function setTargetRatioA(id: number, ratio: number) {
    const exists = buildA.targets.some((t) => t.id === id);
    if (exists) {
      buildA = { ...buildA, targets: buildA.targets.map((t) => (t.id === id ? { ...t, ratio } : t)) };
    } else {
      buildA = { ...buildA, targets: [...buildA.targets, { id, ratio }] };
    }
  }
  function setTargetRatioB(id: number, ratio: number) {
    const exists = buildB.targets.some((t) => t.id === id);
    if (exists) {
      buildB = { ...buildB, targets: buildB.targets.map((t) => (t.id === id ? { ...t, ratio } : t)) };
    } else {
      buildB = { ...buildB, targets: [...buildB.targets, { id, ratio }] };
    }
  }

  function setTargetCharmA(id: number, charmId: number | null, charmTier: number | null) {
    buildA = {
      ...buildA,
      targets: buildA.targets.map((t) =>
        t.id === id ? { ...t, charmId: charmId ?? undefined, charmTier: charmTier ?? undefined } : t,
      ),
    };
  }
  function setTargetCharmB(id: number, charmId: number | null, charmTier: number | null) {
    buildB = {
      ...buildB,
      targets: buildB.targets.map((t) =>
        t.id === id ? { ...t, charmId: charmId ?? undefined, charmTier: charmTier ?? undefined } : t,
      ),
    };
  }

  function setCharmIdFor(
    target: CreatureChoiceRef | undefined,
    setCharm: (id: number, charmId: number | null, charmTier: number | null) => void,
    targetId: number,
    raw: string,
  ) {
    const next = raw === "" ? null : Number(raw);
    if (next === null) {
      setCharm(targetId, null, null);
    } else {
      setCharm(targetId, next, target?.charmTier ?? DEFAULT_CHARM_TIER);
    }
  }

  function setCharmTierFor(
    target: CreatureChoiceRef | undefined,
    setCharm: (id: number, charmId: number | null, charmTier: number | null) => void,
    raw: string,
  ) {
    if (target?.charmId == null) return;
    const tier = raw === "" ? null : Number(raw);
    setCharm(target.id, target.charmId, tier);
  }

  function removeTargetA(id: number) {
    buildA = { ...buildA, targets: buildA.targets.filter((t) => t.id !== id) };
    if (!buildB.targets.some((t) => t.id === id)) {
      targetOrder = targetOrder.filter((x) => x !== id);
    }
  }
  function removeTargetB(id: number) {
    buildB = { ...buildB, targets: buildB.targets.filter((t) => t.id !== id) };
    if (!buildA.targets.some((t) => t.id === id)) {
      targetOrder = targetOrder.filter((x) => x !== id);
    }
  }

  function syncOrder() {
    const allIds = new Set([...buildA.targets.map((t) => t.id), ...buildB.targets.map((t) => t.id)]);
    const kept = targetOrder.filter((id) => allIds.has(id));
    const added = [...allIds].filter((id) => !kept.includes(id));
    targetOrder = [...kept, ...added];
  }
  function copyAtoB() {
    buildB = { ...buildB, targets: buildA.targets.map((t) => ({ ...t })) };
    syncOrder();
  }
  function copyBtoA() {
    buildA = { ...buildA, targets: buildB.targets.map((t) => ({ ...t })) };
    syncOrder();
  }

  let pasteTarget: "a" | "b" | null = $state(null);

  function orderedTargets(build: Build) {
    return targetOrder.flatMap((id) => build.targets.filter((t) => t.id === id));
  }
  function onCopyA(): string {
    return packSection(SECTION_TAG.targets, compactTargets(orderedTargets(buildA)));
  }
  function onCopyB(): string {
    return packSection(SECTION_TAG.targets, compactTargets(orderedTargets(buildB)));
  }
  function handlePaste(data: unknown) {
    const pasted = expandTargets(data as any);
    if (pasteTarget === "a") {
      buildA = { ...buildA, targets: pasted };
    } else {
      buildB = { ...buildB, targets: pasted };
    }
    syncOrder();
    pasteTarget = null;
  }
</script>

{#snippet ratioCell(
  build: Build,
  buildId: string,
  targetId: number,
  setRatio: (id: number, ratio: number) => void,
  removeTarget: (id: number) => void,
)}
  <td>
    {#if build.targets.some((t) => t.id === targetId)}
      <div class="input-with-remove">
        <input
          type="number"
          step="any"
          class="input-{buildId}"
          value={build.targets.find((t) => t.id === targetId)?.ratio ?? 1}
          oninput={(e) => setRatio(targetId, Number(e.currentTarget.value))} />
        <RemoveButton onclick={() => removeTarget(targetId)} />
      </div>
    {:else}
      <div class="add-placeholder">
        <button type="button" class="add-btn input-{buildId}" onclick={() => setRatio(targetId, 1)}>+</button>
      </div>
    {/if}
  </td>
{/snippet}

{#snippet charmCell(
  build: Build,
  buildId: string,
  targetId: number,
  setCharm: (id: number, charmId: number | null, charmTier: number | null) => void,
)}
  <td>
    {#if build.targets.some((t) => t.id === targetId)}
      {@const target = build.targets.find((t) => t.id === targetId)}
      {@const selectedCharm = target?.charmId != null ? charmRegistry.get(target.charmId) : undefined}
      {@const missingStat =
        selectedCharm?.effect === "overpower" && !build.stats.hitPoints
          ? "Hit Points"
          : selectedCharm?.effect === "overflux" && !build.stats.manaPoints
            ? "Mana Points"
            : null}
      <div class="tiered-select-cell">
        <div class="tiered-select-type-wrap" class:has-warn={missingStat !== null}>
          {#if missingStat}
            <span class="tiered-select-warn input-{buildId}">
              <Tooltip tip="Requires setting {missingStat}<br/>in Advanced Stats">Error</Tooltip>
            </span>
          {/if}
          <select
            class="tiered-select-type input-{buildId}"
            value={target?.charmId ?? ""}
            onchange={(e) => setCharmIdFor(target, setCharm, targetId, e.currentTarget.value)}>
            <option value="">No charm</option>
            {#each allCharms as charm}
              <option value={charm.id}>{charm.displayName}</option>
            {/each}
          </select>
        </div>
        <select
          class="tiered-select-tier input-{buildId}"
          disabled={target?.charmId == null}
          value={target?.charmTier ?? ""}
          onchange={(e) => setCharmTierFor(target, setCharm, e.currentTarget.value)}>
          <option value="" disabled>—</option>
          {#each charmTiers as tier}
            <option value={tier}>T{tier}</option>
          {/each}
        </select>
      </div>
    {/if}
  </td>
{/snippet}

<tr class="section-header">
  <td>
    <h4>
      <button class="section-toggle" onclick={() => (collapsed = !collapsed)}>
        {collapsed ? "▶" : "▼"} Targets
      </button>
    </h4>
  </td>
  <SectionCopyButtons {showSecondBuild} {collapsed} {copyAtoB} {copyBtoA} {onCopyA} {onCopyB} bind:pasteTarget />
</tr>
{#if pasteTarget && !collapsed}
  <ClipboardPasteRow sectionTag={SECTION_TAG.targets} {pasteTarget} {showSecondBuild} onPaste={handlePaste} />
{/if}

{#if !collapsed}
  <tr class="data-row">
    <td>
      <FuzzySelect selectType="targets" all={allCreatures} selectedIds={targetOrder} onAdd={addTarget} />
    </td>

    <td class="sub-header">
      {#if targetOrder.length > 0}
        <div class="ratio-label">
          <span>Ratio and Charm</span>
        </div>
      {/if}
    </td>
    {#if showSecondBuild}
      <td class="sub-header">
        {#if targetOrder.length > 0}
          <div class="ratio-label">
            <span>Ratio and Charm</span>
          </div>
        {/if}
      </td>
    {/if}
  </tr>

  {#each targetOrder as id (id)}
    {@const def = creatureRegistry.get(id)}
    {#if def}
      <tr class="data-row group-start" class:diff={targetDiffers(id)}>
        <td class="item-name" rowspan="2">{def.name}</td>
        {@render ratioCell(buildA, "a", id, setTargetRatioA, removeTargetA)}
        {#if showSecondBuild}
          {@render ratioCell(buildB, "b", id, setTargetRatioB, removeTargetB)}
        {/if}
      </tr>
      <tr class="data-row" class:diff={targetDiffers(id)}>
        {@render charmCell(buildA, "a", id, setTargetCharmA)}
        {#if showSecondBuild}
          {@render charmCell(buildB, "b", id, setTargetCharmB)}
        {/if}
      </tr>
    {/if}
  {/each}
{/if}

<style>
  .sub-header {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding-bottom: 0;
    vertical-align: bottom;
  }

  .ratio-label {
    display: flex;
    gap: 0.25rem;
    padding-right: 1.65rem; /* account for remove button width */
  }

  .ratio-label span {
    flex: 1;
    text-align: center;
  }

  /* Horizontal divider between target entries (each target spans a ratio + charm row). */
  .group-start td {
    border-top: 1px solid var(--sub-border-color);
  }
</style>
