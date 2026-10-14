<script lang="ts">
  import ClipboardPasteRow from "@components/build-panel/ClipboardPasteRow.svelte";
  import SectionCopyButtons from "@components/build-panel/SectionCopyButtons.svelte";
  import Tooltip from "@components/Tooltip.svelte";
  import { allSpells } from "@data/spells";
  import { allStances, type Stance, type StanceGroup } from "@data/stances";
  import type { Build, BuildStats, SpellChoiceRef, Vocation } from "@lib/damage-calc/build-state";
  import { packSection, SECTION_TAG } from "@lib/damage-calc/section-clipboard";
  import { compactStats, expandStats } from "@lib/damage-calc/url-pack";

  let {
    buildA = $bindable(),
    buildB = $bindable(),
    showSecondBuild,
    collapsed = $bindable(false),
  }: {
    buildA: Build;
    buildB: Build;
    showSecondBuild: boolean;
    collapsed: boolean;
  } = $props();

  const vocations: Vocation[] = ["knight", "paladin", "sorcerer", "druid", "monk"];

  const stanceTips: Record<Vocation | StanceGroup, string> = {
    knight:
      "Choosing Blood Rage has no effect, you still need to enter your final skill after utito. Choosing Protector reduces your final damage by 15%.",
    paladin: "Paladin tip…",
    sorcerer: "",
    druid: "Druid tip…",
    monk: "Only VoH has any effect. If you choose VoJ, you still need to input your final fist skill.",
    elemental: "Assumes that all of your spells receive the mastery element.",
    curse: "",
  };

  function tipFor(vocation: Vocation, group: StanceGroup | null): string {
    return stanceTips[group ?? vocation];
  }

  function setStatA<K extends keyof BuildStats>(key: K, value: BuildStats[K]) {
    buildA = { ...buildA, stats: { ...buildA.stats, [key]: value } };
  }
  function setStatB<K extends keyof BuildStats>(key: K, value: BuildStats[K]) {
    buildB = { ...buildB, stats: { ...buildB.stats, [key]: value } };
  }

  const spellVocations = new Map(allSpells.map((s) => [s.id, s.vocations]));
  function castableBy(rotation: SpellChoiceRef[], voc: Vocation): SpellChoiceRef[] {
    return rotation.filter((r) => (spellVocations.get(r.id) ?? []).includes(voc));
  }

  function setVocationA(voc: Vocation) {
    buildA = {
      ...buildA,
      stats: { ...buildA.stats, vocation: voc, stanceIds: [] },
      rotation: castableBy(buildA.rotation, voc),
    };
  }
  function setVocationB(voc: Vocation) {
    buildB = {
      ...buildB,
      stats: { ...buildB.stats, vocation: voc, stanceIds: [] },
      rotation: castableBy(buildB.rotation, voc),
    };
  }

  const stanceById: Record<number, Stance> = Object.fromEntries(allStances.map((s) => [s.id, s]));

  function stancesFor(vocation: Vocation, group: StanceGroup | null): Stance[] {
    return allStances.filter((s) => s.visible && s.vocation === vocation && (group === null || s.group === group));
  }

  function groupFor(vocation: Vocation, position: 0 | 1): StanceGroup | null {
    if (vocation !== "sorcerer") return null;
    return position === 0 ? "elemental" : "curse";
  }

  function hasStanceCell(build: Build, position: 0 | 1): boolean {
    if (build.stats.vocation !== "sorcerer" && position === 1) return false;
    return stancesFor(build.stats.vocation, groupFor(build.stats.vocation, position)).length > 0;
  }

  function stanceRowVisible(position: 0 | 1): boolean {
    return hasStanceCell(buildA, position) || (showSecondBuild && hasStanceCell(buildB, position));
  }

  function selectedStanceIdFor(stanceIds: number[], group: StanceGroup | null): number | null {
    for (const id of stanceIds) {
      const stance = stanceById[id];
      if (!stance) continue;
      if (group === null || stance.group === group) return id;
    }
    return null;
  }

  function replaceStanceForGroup(stanceIds: number[], group: StanceGroup | null, newId: number | null): number[] {
    const others = stanceIds.filter((id) => {
      const stance = stanceById[id];
      if (!stance) return false;
      if (group === null) return false;
      return stance.group !== group;
    });
    return newId == null ? others : [...others, newId];
  }

  type StatField = {
    key: keyof BuildStats;
    label: string;
    advanced?: boolean;
    tooltip?: string;
  };

  const statFields: StatField[] = [
    { key: "level", label: "Level" },
    { key: "bonus", label: "Wheel Damage", tooltip: "Bonus damage from Wheel of Destiny" },
    { key: "magicLevel", label: "Magic Level" },
    { key: "skill", label: "Skill" },
    { key: "critChance", label: "Crit Chance %" },
    { key: "critDamage", label: "Crit Damage %" },
  ];

  const statKeys = [
    "vocation",
    "stanceIds",
    "level",
    "bonus",
    "magicLevel",
    "skill",
    "critChance",
    "critDamage",
  ] as const;

  function copyAtoB() {
    const patch: Partial<BuildStats> = {};
    for (const k of statKeys) patch[k] = buildA.stats[k] as any;
    buildB = { ...buildB, stats: { ...buildB.stats, ...patch } };
  }
  function copyBtoA() {
    const patch: Partial<BuildStats> = {};
    for (const k of statKeys) patch[k] = buildB.stats[k] as any;
    buildA = { ...buildA, stats: { ...buildA.stats, ...patch } };
  }

  let pasteTarget: "a" | "b" | null = $state(null);

  function onCopyA(): string {
    return packSection(SECTION_TAG.basicStats, compactStats(buildA.stats));
  }
  function onCopyB(): string {
    return packSection(SECTION_TAG.basicStats, compactStats(buildB.stats));
  }
  function handlePaste(data: unknown) {
    const full = expandStats(data as any);
    const patch: Partial<BuildStats> = {};
    for (const k of statKeys) (patch as any)[k] = full[k];
    if (pasteTarget === "a") {
      buildA = { ...buildA, stats: { ...buildA.stats, ...patch } };
    } else {
      buildB = { ...buildB, stats: { ...buildB.stats, ...patch } };
    }
    pasteTarget = null;
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function statDiffers(key: keyof BuildStats): boolean {
    return showSecondBuild && buildA.stats[key] !== buildB.stats[key];
  }
  function stanceDiffers(position: 0 | 1): boolean {
    if (!showSecondBuild) return false;
    const a = selectedStanceIdFor(buildA.stats.stanceIds, groupFor(buildA.stats.vocation, position));
    const b = selectedStanceIdFor(buildB.stats.stanceIds, groupFor(buildB.stats.vocation, position));
    return a !== b;
  }
</script>

<tr class="section-header">
  <td>
    <h4>
      <button class="section-toggle" onclick={() => (collapsed = !collapsed)}>
        {collapsed ? "▶" : "▼"} Basic Stats
      </button>
    </h4>
  </td>
  <SectionCopyButtons {showSecondBuild} {collapsed} {copyAtoB} {copyBtoA} {onCopyA} {onCopyB} bind:pasteTarget />
</tr>
{#if pasteTarget && !collapsed}
  <ClipboardPasteRow sectionTag={SECTION_TAG.basicStats} {pasteTarget} {showSecondBuild} onPaste={handlePaste} />
{/if}

{#snippet vocCell(build: Build, buildId: string, setVocation: (voc: Vocation) => void)}
  <td>
    <select
      class="input-{buildId}"
      value={build.stats.vocation}
      onchange={(e) => setVocation(e.currentTarget.value as Vocation)}>
      {#each vocations as voc}
        <option value={voc}>{capitalize(voc)}</option>
      {/each}
    </select>
  </td>
{/snippet}

{#snippet stanceDropdown(
  build: Build,
  buildId: string,
  group: StanceGroup | null,
  setStat: (key: keyof BuildStats, value: BuildStats[keyof BuildStats]) => void,
)}
  {@const tip = tipFor(build.stats.vocation, group)}
  {#snippet stanceSelect()}
    <select
      class="input-{buildId}"
      value={selectedStanceIdFor(build.stats.stanceIds, group) ?? ""}
      onchange={(e) => {
        const raw = e.currentTarget.value;
        const newId = raw === "" ? null : Number(raw);
        setStat("stanceIds", replaceStanceForGroup(build.stats.stanceIds, group, newId));
      }}>
      <option value="">—</option>
      {#each stancesFor(build.stats.vocation, group) as s}
        <option value={s.id}>{s.name}</option>
      {/each}
    </select>
  {/snippet}
  {#if tip}
    <Tooltip {tip} wrap>
      {@render stanceSelect()}
    </Tooltip>
  {:else}
    {@render stanceSelect()}
  {/if}
{/snippet}

{#snippet stanceCell(
  build: Build,
  buildId: string,
  position: 0 | 1,
  setStat: (key: keyof BuildStats, value: BuildStats[keyof BuildStats]) => void,
)}
  <td>
    {#if hasStanceCell(build, position)}
      {@render stanceDropdown(build, buildId, groupFor(build.stats.vocation, position), setStat)}
    {/if}
  </td>
{/snippet}

{#snippet inputCell(
  key: keyof BuildStats,
  build: Build,
  buildId: string,
  setStat: (key: keyof BuildStats, value: BuildStats[keyof BuildStats]) => void,
)}
  <td>
    <input
      type="number"
      step="any"
      inputmode="numeric"
      class="input-{buildId}"
      value={build.stats[key]}
      oninput={(e) => setStat(key, e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} />
  </td>
{/snippet}

{#if !collapsed}
  <tr class="data-row" class:diff={statDiffers("vocation")}>
    <td>Vocation</td>
    {@render vocCell(buildA, "a", setVocationA)}
    {#if showSecondBuild}
      {@render vocCell(buildB, "b", setVocationB)}
    {/if}
  </tr>

  {#if stanceRowVisible(0)}
    <tr class="data-row" class:diff={stanceDiffers(0)}>
      <td>Stance</td>
      {@render stanceCell(buildA, "a", 0, setStatA)}
      {#if showSecondBuild}
        {@render stanceCell(buildB, "b", 0, setStatB)}
      {/if}
    </tr>
  {/if}
  {#if stanceRowVisible(1)}
    <tr class="data-row" class:diff={stanceDiffers(1)}>
      <td></td>
      {@render stanceCell(buildA, "a", 1, setStatA)}
      {#if showSecondBuild}
        {@render stanceCell(buildB, "b", 1, setStatB)}
      {/if}
    </tr>
  {/if}

  {#each statFields as field}
    <tr class="data-row" class:diff={statDiffers(field.key)}>
      {#if field.tooltip}
        <td>
          <Tooltip label={field.label} tip={field.tooltip} />
        </td>
      {:else}
        <td>{field.label}</td>
      {/if}
      {@render inputCell(field.key, buildA, "a", setStatA)}
      {#if showSecondBuild}
        {@render inputCell(field.key, buildB, "b", setStatB)}
      {/if}
    </tr>
  {/each}
{/if}
