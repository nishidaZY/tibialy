<script lang="ts">
  import { untrack } from "svelte";
  import ClipboardPasteRow from "@components/build-panel/ClipboardPasteRow.svelte";
  import SectionCopyButtons from "@components/build-panel/SectionCopyButtons.svelte";
  import FuzzySelect from "@components/FuzzySelect.svelte";
  import RemoveButton from "@components/RemoveButton.svelte";
  import { allSpells, AUTO_ATTACK_ID, beamScopes, spellOrdering, type Spell } from "@data/spells";
  import type { Build, SpellChoiceRef } from "@lib/damage-calc/build-state";
  import { packSection, SECTION_TAG } from "@lib/damage-calc/section-clipboard";
  import { compactRotation, expandRotation } from "@lib/damage-calc/url-pack";

  let {
    buildA = $bindable(),
    buildB = $bindable(),
    showSecondBuild,
    collapsed = $bindable(false),
    rotationOrder = $bindable(),
  }: {
    buildA: Build;
    buildB: Build;
    showSecondBuild: boolean;
    collapsed: boolean;
    rotationOrder: number[];
  } = $props();

  const spellRegistry = new Map(allSpells.map((s) => [s.id, s]));
  const isAutoAttack = (id: number) => id === AUTO_ATTACK_ID;

  const spellsByScope = new Map<string, Spell[]>();
  // e.g. "ice-burst" -> [39, 40, 41]. GDB includes the central beam spell here too.
  const stagedSpellsByScope = new Map<string, Spell[]>();
  for (const s of allSpells) {
    spellsByScope.set(s.scope, [...(spellsByScope.get(s.scope) ?? []), s]);
    if (s.stage == null) continue;
    stagedSpellsByScope.set(s.scope, [...(stagedSpellsByScope.get(s.scope) ?? []), s]);
  }
  for (const arr of stagedSpellsByScope.values()) arr.sort((a, b) => a.stage! - b.stage!);

  const groupScopes = new Set(stagedSpellsByScope.keys());
  const stagesOf = (scope: string) => stagedSpellsByScope.get(scope) ?? [];
  // The lowest stage is the default added from search and the stable rotationOrder key.
  const mainFromScope = (scope: string) => stagesOf(scope)[0]?.id ?? -1;
  const vocationCanCast = (scope: string, vocation: string) =>
    (spellsByScope.get(scope) ?? []).some((s) => s.vocations.includes(vocation));

  const displayNameByScope = new Map<string, string>();
  for (const s of allSpells) {
    if (s.isSelectable && !displayNameByScope.has(s.scope)) displayNameByScope.set(s.scope, s.displayName);
  }
  const displayNameFromScope = (scope: string) =>
    displayNameByScope.get(scope) ?? spellRegistry.get(mainFromScope(scope))?.displayName ?? scope;

  const buildOf = (b: string) => (b === "a" ? buildA : buildB);
  function setRotation(b: string, rotation: SpellChoiceRef[]) {
    if (b === "a") buildA = { ...buildA, rotation };
    else buildB = { ...buildB, rotation };
  }
  const rotationHasGroupSpell = (build: Build, scope: string) =>
    build.rotation.some((r) => spellRegistry.get(r.id)?.scope === scope);
  const scopeRatioOwner = (build: Build, scope: string) =>
    build.rotation.map((r) => spellRegistry.get(r.id)).find((d): d is Spell => !!d && d.scope === scope && !d.isExtra);
  // The selected stage: the highest-`stage` spell present (a stage-0 base spell loses to it).
  const currentStageSpellFromScope = (build: Build, scope: string) => {
    let best: Spell | undefined;
    for (const r of build.rotation) {
      const d = spellRegistry.get(r.id);
      if (!d || d.scope !== scope || d.stage == null) continue;
      if (!best || d.stage > best.stage!) best = d;
    }
    return best;
  };
  const spellChoiceRefById = (build: Build, id: number) => build.rotation.find((r) => r.id === id);

  function rotationKeyDiffers(key: number): boolean {
    if (!showSecondBuild) return false;
    const def = spellRegistry.get(key);
    if (!def) return false;
    const signature = (build: Build) =>
      (groupScopes.has(def.scope)
        ? build.rotation.filter((r) => spellRegistry.get(r.id)?.scope === def.scope)
        : build.rotation.filter((r) => r.id === key)
      )
        .map((r) => `${r.id}:${r.ratio}:${r.targets}`)
        .sort()
        .join("|");
    return signature(buildA) !== signature(buildB);
  }

  // Keep rotationOrder in sync. Group spells just use the main spell id.
  $effect(() => {
    const presentKeys: number[] = [];
    const seen = new Set<number>();
    for (const r of [...buildA.rotation, ...buildB.rotation]) {
      const d = spellRegistry.get(r.id);
      if (!d) continue;
      const key = groupScopes.has(d.scope) ? mainFromScope(d.scope) : d.isExtra ? -1 : d.id;
      if (key < 0 || seen.has(key)) continue;
      seen.add(key);
      presentKeys.push(key);
    }
    untrack(() => {
      const wanted = new Set(presentKeys);
      const kept = rotationOrder.filter((id) => wanted.has(id));
      const added = presentKeys.filter((id) => !kept.includes(id));
      let next = [...kept, ...added];
      if (next.includes(AUTO_ATTACK_ID)) next = [AUTO_ATTACK_ID, ...next.filter((x) => x !== AUTO_ATTACK_ID)];
      const changed = next.length !== rotationOrder.length || next.some((v, i) => v !== rotationOrder[i]);
      if (changed) rotationOrder = next;
    });
  });

  let selectableSpells = $derived.by(() => {
    const entries: { id: number; name: string; scope: string }[] = [];
    const seenGroups = new Set<string>();
    for (const s of allSpells) {
      if (!s.isSelectable) continue;
      const vocOk =
        s.vocations.includes(buildA.stats.vocation) || (showSecondBuild && s.vocations.includes(buildB.stats.vocation));
      if (!vocOk) continue;
      if (groupScopes.has(s.scope)) {
        if (seenGroups.has(s.scope)) continue;
        seenGroups.add(s.scope);
        entries.push({ id: mainFromScope(s.scope), name: s.displayName, scope: s.scope });
      } else {
        entries.push({ id: s.id, name: s.displayName, scope: s.scope });
      }
    }

    // Order the selectable spells as per the spell ordering file (and if two vocations, interleave them)
    const vocSpellOrderings: string[][] = spellOrdering
      .filter((s) => s.vocation == buildA.stats.vocation || (showSecondBuild && s.vocation == buildB.stats.vocation))
      .map((s) => s.order);
    const acc: string[] = [];
    const max = Math.max(0, ...vocSpellOrderings.map((a) => a.length));
    for (let i = 0; i < max; i++) {
      for (const a of vocSpellOrderings) {
        if (i < a.length) acc.push(a[i]);
      }
    }
    const ordering = [...new Set(acc)];
    return entries.toSorted((a, b) => {
      let ai = ordering.indexOf(a.scope);
      let bi = ordering.indexOf(b.scope);

      // Force spells to the bottom if they aren't included in the ordering
      if (ai == -1) ai = ordering.length;
      if (bi == -1) bi = ordering.length;

      return ai - bi;
    });
  });

  function spellEntries(mainId: number, vocation: string): SpellChoiceRef[] {
    return (spellRegistry.get(mainId)?.spells ?? [mainId])
      .map((sid) => spellRegistry.get(sid))
      .filter((d): d is Spell => !!d && d.vocations.includes(vocation))
      .map((d) => ({ id: d.id, targets: 1, ratio: 1 }));
  }

  function addSpellToRotation(id: number) {
    buildA = { ...buildA, rotation: [...buildA.rotation, ...spellEntries(id, buildA.stats.vocation)] };
    if (showSecondBuild)
      buildB = { ...buildB, rotation: [...buildB.rotation, ...spellEntries(id, buildB.stats.vocation)] };
  }

  function addGroup(b: string, scope: string) {
    const other = b === "a" ? buildB : buildA;
    const stageId = currentStageSpellFromScope(other, scope)?.id ?? mainFromScope(scope);
    setRotation(b, [...buildOf(b).rotation, ...spellEntries(stageId, buildOf(b).stats.vocation)]);
  }
  function addId(b: string, id: number) {
    setRotation(b, [...buildOf(b).rotation, ...spellEntries(id, buildOf(b).stats.vocation)]);
  }

  function removeScope(b: string, scope: string) {
    setRotation(
      b,
      buildOf(b).rotation.filter((r) => spellRegistry.get(r.id)?.scope !== scope),
    );
  }
  function removeId(b: string, id: number) {
    setRotation(
      b,
      buildOf(b).rotation.filter((r) => r.id !== id),
    );
  }

  function restageScope(build: Build, scope: string, stageNum: number): SpellChoiceRef[] | null {
    const newStage = stagesOf(scope).find((s) => s.stage === stageNum);
    if (!newStage) return null;
    const owner = scopeRatioOwner(build, scope);
    const oldStage = currentStageSpellFromScope(build, scope);
    const sharedRatio = owner ? (spellChoiceRefById(build, owner.id)?.ratio ?? 1) : 1;
    const oldStageTargets = oldStage ? (spellChoiceRefById(build, oldStage.id)?.targets ?? 1) : 1;
    return newStage.spells.map((sid) => {
      const existing = spellChoiceRefById(build, sid);
      const targets = existing?.targets ?? (sid === newStage.id ? oldStageTargets : 1);
      return { id: sid, targets, ratio: sharedRatio };
    });
  }

  function setStage(b: string, scope: string, newStageId: number) {
    const build = buildOf(b);
    const stageNum = spellRegistry.get(newStageId)?.stage;
    if (stageNum == null) return;
    const scopes = beamScopes.includes(scope)
      ? beamScopes.filter((sc) => sc === scope || rotationHasGroupSpell(build, sc))
      : [scope];
    let rotation = build.rotation;
    for (const sc of scopes) {
      const newEntries = restageScope(build, sc, stageNum);
      if (!newEntries) continue;
      rotation = [...rotation.filter((r) => spellRegistry.get(r.id)?.scope !== sc), ...newEntries];
    }
    setRotation(b, rotation);
  }

  function setRatio(b: string, id: number, v: number) {
    const scope = spellRegistry.get(id)?.scope;
    const matched = new Set(allSpells.filter((s) => s.scope === scope && (s.id === id || s.isExtra)).map((s) => s.id));
    setRotation(
      b,
      buildOf(b).rotation.map((r) => (matched.has(r.id) ? { ...r, ratio: v } : r)),
    );
  }
  function setTargets(b: string, id: number, v: number) {
    setRotation(
      b,
      buildOf(b).rotation.map((r) => (r.id === id ? { ...r, targets: v } : r)),
    );
  }

  function copyAtoB() {
    buildB = { ...buildB, rotation: buildA.rotation.map((r) => ({ ...r })) };
  }
  function copyBtoA() {
    buildA = { ...buildA, rotation: buildB.rotation.map((r) => ({ ...r })) };
  }

  let pasteTarget: "a" | "b" | null = $state(null);

  function orderedRotation(build: Build) {
    return rotationOrder.flatMap((key) => {
      const d = spellRegistry.get(key);
      if (!d) return [];
      if (groupScopes.has(d.scope)) return build.rotation.filter((r) => spellRegistry.get(r.id)?.scope === d.scope);
      return build.rotation.filter((r) => r.id === key);
    });
  }
  function onCopyA(): string {
    return packSection(SECTION_TAG.rotation, compactRotation(orderedRotation(buildA)));
  }
  function onCopyB(): string {
    return packSection(SECTION_TAG.rotation, compactRotation(orderedRotation(buildB)));
  }
  function handlePaste(data: unknown) {
    const pasted = expandRotation(data as any);
    if (pasteTarget === "a") buildA = { ...buildA, rotation: pasted };
    else buildB = { ...buildB, rotation: pasted };
    pasteTarget = null;
  }
</script>

{#snippet labels()}
  <td class="sub-header">
    {#if rotationOrder.length > 0}
      <div class="rotation-labels">
        <span>Ratio</span>
        <span>Targets</span>
      </div>
    {/if}
  </td>
{/snippet}

{#snippet groupCell(b: string, scope: string)}
  {@const build = buildOf(b)}
  <td>
    {#if rotationHasGroupSpell(build, scope)}
      {@const stageSpell = currentStageSpellFromScope(build, scope)}
      {@const owner = scopeRatioOwner(build, scope)}
      {@const stages = stagesOf(scope)}
      <div class="group-cell">
        <div class="group-head">
          {#if stages.length > 1 && stageSpell}
            <select
              class="stage-select input-{b}"
              value={stageSpell.id}
              onchange={(e) => setStage(b, scope, Number(e.currentTarget.value))}>
              {#each stages as st (st.id)}
                <option value={st.id}>Stage {st.stage}</option>
              {/each}
            </select>
          {:else if stageSpell}
            <span class="stage-static">Stage {stageSpell.stage}</span>
          {/if}
          <RemoveButton onclick={() => removeScope(b, scope)} />
        </div>
        {#if stageSpell && stageSpell.spells.length > 1}
          <!-- Bundled stage: shared ratio (on the owner) on its own row, then a labelled targets row each. -->
          {#if owner}
            <div class="ratio-line">
              <input
                type="number"
                step="any"
                class="input-{b}"
                value={spellChoiceRefById(build, owner.id)?.ratio ?? 1}
                oninput={(e) => setRatio(b, owner.id, Number(e.currentTarget.value))} />
            </div>
          {/if}
          {#each stageSpell.spells as sid, k (k)}
            {@const entry = spellChoiceRefById(build, sid)}
            <div class="targets-line">
              <span class="row-label">{spellRegistry.get(sid)?.targetsLabel ?? ""}</span>
              <input
                type="number"
                step="any"
                class="input-{b}"
                value={entry?.targets ?? 1}
                oninput={(e) => setTargets(b, sid, Number(e.currentTarget.value))} />
            </div>
          {/each}
        {:else if stageSpell}
          <!-- Single spell (e.g. stage 0, or Divine Grenade): ratio + targets on one line, like a regular spell. -->
          {@const entry = spellChoiceRefById(build, stageSpell.id)}
          <div class="sub-grid">
            <input
              type="number"
              step="any"
              class="input-{b}"
              value={entry?.ratio ?? 1}
              oninput={(e) => setRatio(b, stageSpell.id, Number(e.currentTarget.value))} />
            <input
              type="number"
              step="any"
              class="input-{b}"
              value={entry?.targets ?? 1}
              oninput={(e) => setTargets(b, stageSpell.id, Number(e.currentTarget.value))} />
            <span class="cell-spacer" aria-hidden="true"></span>
          </div>
        {/if}
      </div>
    {:else if vocationCanCast(scope, build.stats.vocation)}
      <div class="add-placeholder">
        <button type="button" class="add-btn input-{b}" onclick={() => addGroup(b, scope)}>+</button>
      </div>
    {/if}
  </td>
{/snippet}

{#snippet singleCell(b: string, def: Spell)}
  {@const build = buildOf(b)}
  <td>
    {#if spellChoiceRefById(build, def.id)}
      {@const entry = spellChoiceRefById(build, def.id)}
      <div class="sub-grid">
        {#if isAutoAttack(def.id)}
          <span class="cell-spacer" aria-hidden="true"></span>
        {:else}
          <input
            type="number"
            step="any"
            class="input-{b}"
            value={entry?.ratio ?? 1}
            oninput={(e) => setRatio(b, def.id, Number(e.currentTarget.value))} />
        {/if}
        <input
          type="number"
          step="any"
          class="input-{b}"
          value={entry?.targets ?? 1}
          oninput={(e) => setTargets(b, def.id, Number(e.currentTarget.value))} />
        <RemoveButton onclick={() => removeId(b, def.id)} />
      </div>
    {:else if vocationCanCast(def.scope, build.stats.vocation)}
      <div class="add-placeholder">
        <button type="button" class="add-btn input-{b}" onclick={() => addId(b, def.id)}>+</button>
      </div>
    {/if}
  </td>
{/snippet}

<tr class="section-header">
  <td>
    <h4>
      <button class="section-toggle" onclick={() => (collapsed = !collapsed)}>
        {collapsed ? "▶" : "▼"} Rotation
      </button>
    </h4>
  </td>
  <SectionCopyButtons {showSecondBuild} {collapsed} {copyAtoB} {copyBtoA} {onCopyA} {onCopyB} bind:pasteTarget />
</tr>
{#if pasteTarget && !collapsed}
  <ClipboardPasteRow sectionTag={SECTION_TAG.rotation} {pasteTarget} {showSecondBuild} onPaste={handlePaste} />
{/if}

{#if !collapsed}
  <tr class="data-row">
    <td>
      <FuzzySelect selectType="spells" all={selectableSpells} selectedIds={rotationOrder} onAdd={addSpellToRotation} />
    </td>
    {@render labels()}
    {#if showSecondBuild}
      {@render labels()}
    {/if}
  </tr>

  {#each rotationOrder as key (key)}
    {@const def = spellRegistry.get(key)}
    {#if def && groupScopes.has(def.scope)}
      {@const scope = def.scope}
      <tr class="data-row group-start" class:diff={rotationKeyDiffers(key)}>
        <td class="item-name group-title">{displayNameFromScope(scope)}</td>
        {@render groupCell("a", scope)}
        {#if showSecondBuild}
          {@render groupCell("b", scope)}
        {/if}
      </tr>
    {:else if def}
      <tr class="data-row group-start" class:diff={rotationKeyDiffers(key)}>
        <td class="item-name">{def.displayName}</td>
        {@render singleCell("a", def)}
        {#if showSecondBuild}
          {@render singleCell("b", def)}
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

  /* Single-spell rows and the column-header labels share one 3-column grid
     (ratio | targets | remove) so they line up under the headers. */
  .sub-grid,
  .rotation-labels {
    display: grid;
    grid-template-columns: 1fr 1fr var(--remove-btn-width);
    column-gap: 0.25rem;
    align-items: center;
  }

  .rotation-labels span {
    text-align: center;
  }

  /* Grouped spells stack vertically: a stage-select header, a dedicated ratio row
     (so the ratio reads as applying to the whole spell), then one targets row per
     bundled spell with its label sitting just left of the input. Each line reuses the
     same ratio | targets | remove columns as the headers. */
  .group-cell {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .group-cell > div {
    display: grid;
    grid-template-columns: 1fr 1fr var(--remove-btn-width);
    column-gap: 0.25rem;
    align-items: center;
  }

  /* The stage <select> spans the ratio + targets columns; the × lands in the remove column. */
  .group-head > .stage-select,
  .group-head > .stage-static {
    grid-column: 1 / 3;
    width: 100%;
  }

  .stage-select {
    text-align: center;
    text-align-last: center;
  }

  .stage-static {
    padding: 0.2rem 0.4rem;
  }

  .ratio-line > input {
    grid-column: 1;
  }

  .targets-line > .row-label {
    grid-column: 1;
    text-align: right;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .targets-line > input {
    grid-column: 2;
  }

  /* Keep a group's title aligned with the top (stage-select) line of its cell. */
  .group-title {
    vertical-align: top;
  }

  /* Horizontal divider between rotation entries. */
  .group-start td {
    border-top: 1px solid var(--sub-border-color);
  }
</style>
