<script lang="ts">
  import ClipboardPasteRow from "@components/build-panel/ClipboardPasteRow.svelte";
  import SectionCopyButtons from "@components/build-panel/SectionCopyButtons.svelte";
  import Tooltip from "@components/Tooltip.svelte";
  import type { Build, BuildStats, ImbuementElement } from "@lib/damage-calc/build-state";
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

  function setStatA<K extends keyof BuildStats>(key: K, value: BuildStats[K]) {
    buildA = { ...buildA, stats: { ...buildA.stats, [key]: value } };
  }
  function setStatB<K extends keyof BuildStats>(key: K, value: BuildStats[K]) {
    buildB = { ...buildB, stats: { ...buildB.stats, [key]: value } };
  }

  function statDiffers(key: keyof BuildStats): boolean {
    return showSecondBuild && buildA.stats[key] !== buildB.stats[key];
  }
  function imbuementDiffers(): boolean {
    return (
      showSecondBuild &&
      (buildA.stats.imbuementElement !== buildB.stats.imbuementElement ||
        buildA.stats.imbuementValue !== buildB.stats.imbuementValue)
    );
  }

  const imbuementElements: ImbuementElement[] = ["death", "earth", "energy", "fire", "ice"];
  const imbuementTiers: { label: string; value: number }[] = [
    { label: "T1", value: 0.1 },
    { label: "T2", value: 0.25 },
    { label: "T3", value: 0.5 },
  ];
  const DEFAULT_IMBUEMENT_VALUE = 0.5;

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function setImbuementElement(build: Build, setStat: (k: keyof BuildStats, v: any) => void, raw: string) {
    const next = raw === "" ? null : (raw as ImbuementElement);
    setStat("imbuementElement", next);
    if (next === null) {
      setStat("imbuementValue", null);
    } else if (build.stats.imbuementValue === null) {
      setStat("imbuementValue", DEFAULT_IMBUEMENT_VALUE);
    }
  }

  function setImbuementValue(setStat: (k: keyof BuildStats, v: any) => void, raw: string) {
    setStat("imbuementValue", raw === "" ? null : Number(raw));
  }

  type StatField = {
    key: keyof BuildStats;
    label: string;
    tooltip?: string;
  };

  const statFields: StatField[] = [
    { key: "fatalChance", label: "Fatal Chance %" },
    {
      key: "transcendenceChance",
      label: "Transcendence Chance %",
      tooltip: "Assumes a 200ms delay between<br/>your auto-attack and spell",
    },
    {
      key: "hitPoints",
      label: "Hit Points",
      tooltip: "Required for Overpower",
    },
    {
      key: "manaPoints",
      label: "Mana Points",
      tooltip: "Required for Overflux",
    },
    {
      key: "baseMagicLevel",
      label: "Base Magic Level",
      tooltip: "Required for Runic Mastery",
    },
    {
      key: "axe",
      label: "Axe Fighting",
      tooltip:
        "Overrides <b>Skill</b> if set. Only needed when using a weapon with a secondary skill proficiency perk.",
    },
    {
      key: "club",
      label: "Club Fighting",
      tooltip:
        "Overrides <b>Skill</b> if set. Only needed when using a weapon with a secondary skill proficiency perk.",
    },
    {
      key: "sword",
      label: "Sword Fighting",
      tooltip:
        "Overrides <b>Skill</b> if set. Only needed when using a weapon with a secondary skill proficiency perk.",
    },
    {
      key: "fist",
      label: "Fist Fighting",
      tooltip:
        "Overrides <b>Skill</b> if set. Only needed when using a weapon with a secondary skill proficiency perk.",
    },
    {
      key: "distance",
      label: "Distance Fighting",
      tooltip:
        "Overrides <b>Skill</b> if set. Only needed when using a weapon with a secondary skill proficiency perk.",
    },
    { key: "shielding", label: "Shielding" },
    { key: "fishing", label: "Fishing" },
  ];

  const statKeys = [
    "fatalChance",
    "transcendenceChance",
    "hitPoints",
    "manaPoints",
    "baseMagicLevel",
    "axe",
    "club",
    "sword",
    "fist",
    "distance",
    "shielding",
    "fishing",
    "imbuementElement",
    "imbuementValue",
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
    return packSection(SECTION_TAG.advancedStats, compactStats(buildA.stats));
  }
  function onCopyB(): string {
    return packSection(SECTION_TAG.advancedStats, compactStats(buildB.stats));
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
</script>

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

{#snippet imbuementCell(
  build: Build,
  buildId: string,
  setStat: (key: keyof BuildStats, value: BuildStats[keyof BuildStats]) => void,
)}
  <td>
    <div class="tiered-select-cell">
      <select
        class="tiered-select-type input-{buildId}"
        value={build.stats.imbuementElement ?? ""}
        onchange={(e) => setImbuementElement(build, setStat, e.currentTarget.value)}>
        <option value="">No imbuement</option>
        {#each imbuementElements as el}
          <option value={el}>{capitalize(el)}</option>
        {/each}
      </select>
      <select
        class="tiered-select-tier input-{buildId}"
        disabled={build.stats.imbuementElement === null}
        value={build.stats.imbuementValue ?? ""}
        onchange={(e) => setImbuementValue(setStat, e.currentTarget.value)}>
        <option value="" disabled>—</option>
        {#each imbuementTiers as tier}
          <option value={tier.value}>{tier.label}</option>
        {/each}
      </select>
    </div>
  </td>
{/snippet}

<tr class="section-header">
  <td>
    <h4>
      <button class="section-toggle" onclick={() => (collapsed = !collapsed)}>
        {collapsed ? "▶" : "▼"} Advanced Stats
      </button>
    </h4>
  </td>
  <SectionCopyButtons {showSecondBuild} {collapsed} {copyAtoB} {copyBtoA} {onCopyA} {onCopyB} bind:pasteTarget />
</tr>
{#if pasteTarget && !collapsed}
  <ClipboardPasteRow sectionTag={SECTION_TAG.advancedStats} {pasteTarget} {showSecondBuild} onPaste={handlePaste} />
{/if}

{#if !collapsed}
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

  <tr class="data-row" class:diff={imbuementDiffers()}>
    <td>
      <Tooltip
        label="Elemental Attack Imbuement"
        tip="Converts a % of the weapon's physical damage to the chosen element.<br/>This should only be used for physical single target weapons." />
    </td>
    {@render imbuementCell(buildA, "a", setStatA)}
    {#if showSecondBuild}
      {@render imbuementCell(buildB, "b", setStatB)}
    {/if}
  </tr>
{/if}
