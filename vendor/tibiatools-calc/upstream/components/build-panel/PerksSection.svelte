<script lang="ts">
  import ClipboardPasteRow from "@components/build-panel/ClipboardPasteRow.svelte";
  import SectionCopyButtons from "@components/build-panel/SectionCopyButtons.svelte";
  import FuzzySelect from "@components/FuzzySelect.svelte";
  import RemoveButton from "@components/RemoveButton.svelte";
  import Tooltip from "@components/Tooltip.svelte";
  import { allPerks } from "@data/perks";
  import { allSpells } from "@data/spells";
  import type { Build } from "@lib/damage-calc/build-state";
  import { packSection, SECTION_TAG } from "@lib/damage-calc/section-clipboard";
  import { compactPerks, expandPerks } from "@lib/damage-calc/url-pack";

  let {
    buildA = $bindable(),
    buildB = $bindable(),
    showSecondBuild,
    collapsed = $bindable(false),
    perkOrder = $bindable(),
  }: {
    buildA: Build;
    buildB: Build;
    showSecondBuild: boolean;
    collapsed: boolean;
    perkOrder: number[];
  } = $props();

  const perkRegistry = new Map(allPerks.map((p) => [p.id, p]));
  const spellRegistry = new Map(allSpells.map((s) => [s.id, s]));
  function focusMasteryOptions(build: Build): { id: number; name: string }[] {
    const seen = new Set<string>();
    const options: { id: number; name: string }[] = [];
    for (const r of build.rotation) {
      const spell = spellRegistry.get(r.id);
      if (!spell || spell.isExtra || spell.spellType != "spell" || spell.isFocus || seen.has(spell.scope)) continue;
      seen.add(spell.scope);
      options.push({ id: spell.id, name: spell.displayName });
    }
    return options;
  }
  const revelationTiers: { label: string; value: number }[] = [
    { label: "—", value: 0 },
    { label: "Stage 1", value: 1 },
    { label: "Stage 2", value: 2 },
    { label: "Stage 3", value: 3 },
  ];
  const selectablePerks = $derived(
    allPerks.filter((p) => {
      if (!p.visible) return false;
      if (p.spell) {
        const spell = allSpells.find((s) => p.scopes.includes(s.scope));
        return (
          spell?.vocations.includes(buildA.stats.vocation) ||
          (showSecondBuild && spell?.vocations.includes(buildB.stats.vocation))
        );
      } else return true;
    }),
  );

  function perkDiffers(id: number): boolean {
    if (!showSecondBuild) return false;
    const a = buildA.perks.find((p) => p.id === id);
    const b = buildB.perks.find((p) => p.id === id);
    return (a?.value ?? null) !== (b?.value ?? null);
  }

  function addPerk(id: number) {
    buildA = { ...buildA, perks: [...buildA.perks, { id, value: 0 }] };
    if (showSecondBuild) {
      buildB = { ...buildB, perks: [...buildB.perks, { id, value: 0 }] };
    }
    if (!perkOrder.includes(id)) {
      perkOrder = [...perkOrder, id];
    }
  }

  function setPerkValueA(id: number, v: number) {
    const exists = buildA.perks.some((p) => p.id === id);
    if (exists) {
      buildA = { ...buildA, perks: buildA.perks.map((a) => (a.id === id ? { ...a, value: v } : a)) };
    } else {
      buildA = { ...buildA, perks: [...buildA.perks, { id, value: v }] };
    }
  }
  function setPerkValueB(id: number, v: number) {
    const exists = buildB.perks.some((p) => p.id === id);
    if (exists) {
      buildB = { ...buildB, perks: buildB.perks.map((a) => (a.id === id ? { ...a, value: v } : a)) };
    } else {
      buildB = { ...buildB, perks: [...buildB.perks, { id, value: v }] };
    }
  }
  function removePerkA(id: number) {
    buildA = { ...buildA, perks: buildA.perks.filter((a) => a.id !== id) };
    if (!buildB.perks.some((p) => p.id === id)) {
      perkOrder = perkOrder.filter((x) => x !== id);
    }
  }
  function removePerkB(id: number) {
    buildB = { ...buildB, perks: buildB.perks.filter((a) => a.id !== id) };
    if (!buildA.perks.some((p) => p.id === id)) {
      perkOrder = perkOrder.filter((x) => x !== id);
    }
  }

  function syncOrder() {
    const allIds = new Set([...buildA.perks.map((p) => p.id), ...buildB.perks.map((p) => p.id)]);
    const kept = perkOrder.filter((id) => allIds.has(id));
    const added = [...allIds].filter((id) => !kept.includes(id));
    perkOrder = [...kept, ...added];
  }
  function copyAtoB() {
    buildB = { ...buildB, perks: buildA.perks.map((p) => ({ ...p })) };
    syncOrder();
  }
  function copyBtoA() {
    buildA = { ...buildA, perks: buildB.perks.map((p) => ({ ...p })) };
    syncOrder();
  }

  let pasteTarget: "a" | "b" | null = $state(null);

  function orderedPerks(build: Build) {
    return perkOrder.flatMap((id) => build.perks.filter((p) => p.id === id));
  }
  function onCopyA(): string {
    return packSection(SECTION_TAG.perks, compactPerks(orderedPerks(buildA)));
  }
  function onCopyB(): string {
    return packSection(SECTION_TAG.perks, compactPerks(orderedPerks(buildB)));
  }
  function handlePaste(data: unknown) {
    const pasted = expandPerks(data as any);
    if (pasteTarget === "a") {
      buildA = { ...buildA, perks: pasted };
    } else {
      buildB = { ...buildB, perks: pasted };
    }
    syncOrder();
    pasteTarget = null;
  }
</script>

{#snippet perkCell(
  build: Build,
  buildId: string,
  perkId: number,
  setPerkValue: (id: number, value: number) => void,
  removePerk: (id: number) => void,
)}
  {@const binary = perkRegistry.get(perkId)?.bonusType === "runic-mastery"}
  {@const revelation = perkRegistry.get(perkId)?.revelation ?? false}
  <td>
    {#if build.perks.some((p) => p.id === perkId)}
      <div class="input-with-remove">
        {#if revelation}
          <select
            class="tiered-select-tier input-{buildId}"
            value={build.perks.find((p) => p.id === perkId)?.value ?? 0}
            onchange={(e) => setPerkValue(perkId, Number(e.currentTarget.value))}>
            {#each revelationTiers as tier}
              <option value={tier.value}>{tier.label}</option>
            {/each}
          </select>
        {:else if perkRegistry.get(perkId)?.bonusType === "focus-mastery"}
          {@const options = focusMasteryOptions(build)}

          <Tooltip tip="Choose the spell that you cast after UE<br/> that receives the bonus damage." wrap>
            <select
              class="tiered-select-tier focus-spell-select input-{buildId}"
              value={build.perks.find((p) => p.id === perkId)?.value ?? 0}
              onchange={(e) => setPerkValue(perkId, Number(e.currentTarget.value))}>
              <option value={0}>Choose spell</option>
              {#each options as opt (opt.id)}
                <option value={opt.id}>{opt.name}</option>
              {/each}
            </select>
          </Tooltip>
        {:else if binary && !build.stats.baseMagicLevel}
          <span class="perk-toggle input-{buildId}">
            <Tooltip tip="Requires setting Base Magic Level<br/>in Advanced Stats">Error</Tooltip>
          </span>
        {:else if binary}
          <span class="perk-toggle input-{buildId}">
            <img class="perk-check" src="/check.svg" alt="" width="12" height="12" />
          </span>
        {:else if (perkRegistry.get(perkId)?.bonusType === "alpha-strike" || perkRegistry.get(perkId)?.bonusType === "omega-strike") && (build.rotation.length == 0 || build.targets.length == 0)}
          <span class="perk-toggle input-{buildId}">
            <Tooltip tip="For more accurate results,<br/>set Rotation and Targets">Error</Tooltip>
          </span>
          <input
            type="number"
            step="any"
            class="input-{buildId}"
            value={build.perks.find((p) => p.id === perkId)?.value ?? 0}
            oninput={(e) => setPerkValue(perkId, Number(e.currentTarget.value))} />
        {:else}
          <input
            type="number"
            step="any"
            class="input-{buildId}"
            value={build.perks.find((p) => p.id === perkId)?.value ?? 0}
            oninput={(e) => setPerkValue(perkId, Number(e.currentTarget.value))} />
        {/if}
        <RemoveButton onclick={() => removePerk(perkId)} />
      </div>
    {:else}
      <div class="add-placeholder">
        <button type="button" class="add-btn input-{buildId}" onclick={() => setPerkValue(perkId, 0)}>+</button>
      </div>
    {/if}
  </td>
{/snippet}

<tr class="section-header">
  <td>
    <h4>
      <button class="section-toggle" onclick={() => (collapsed = !collapsed)}>
        {collapsed ? "▶" : "▼"} Perks
      </button>
    </h4>
  </td>
  <SectionCopyButtons {showSecondBuild} {collapsed} {copyAtoB} {copyBtoA} {onCopyA} {onCopyB} bind:pasteTarget />
</tr>
{#if pasteTarget && !collapsed}
  <ClipboardPasteRow sectionTag={SECTION_TAG.perks} {pasteTarget} {showSecondBuild} onPaste={handlePaste} />
{/if}

{#if !collapsed}
  <tr class="data-row">
    <td>
      <FuzzySelect selectType="perks" all={selectablePerks} selectedIds={perkOrder} onAdd={addPerk} />
    </td>
    <td></td>
    {#if showSecondBuild}<td></td>{/if}
  </tr>

  {#each perkOrder as id (id)}
    {@const def = perkRegistry.get(id)}
    {#if def}
      <tr class="data-row" class:diff={perkDiffers(id)}>
        {#if def.bonusType.includes("pierce")}
          <td class="item-name">
            <Tooltip
              tip="If this pierce perk comes from a weapon proficiency, choose the <b>weapon</b> pierce type which does not affect charms. Otherwise choose the <b>regular</b> pierce type which does affect charms.">
              {def.name}
            </Tooltip>
          </td>
        {:else if def.bonusType.startsWith("homing-missile")}
          <td class="item-name">
            <Tooltip tip="Enter the level% damage (200 or 300)">
              {def.name}
            </Tooltip>
          </td>
        {:else}
          <td class="item-name">{def.name}</td>
        {/if}
        {@render perkCell(buildA, "a", id, setPerkValueA, removePerkA)}
        {#if showSecondBuild}
          {@render perkCell(buildB, "b", id, setPerkValueB, removePerkB)}
        {/if}
      </tr>
    {/if}
  {/each}
{/if}

<style>
  .focus-spell-select {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
