<script lang="ts">
  import Tooltip from "@components/Tooltip.svelte";
  import { spellOrdering, type SpellRawEffective } from "@data/spells";
  import type { SpellChoiceRef, Vocation } from "@lib/damage-calc/build-state";

  let {
    results = [],
    vocation,
    rotation,
    effectiveDpt,
    effectiveDph,
    damageFromCharms,
    showHighlighting,
    isDptHigher,
    isDphHigher,
    isDamageFromCharmsHigher,
    isHigher = () => false,
  }: {
    results?: SpellRawEffective[];
    vocation: Vocation;
    rotation: SpellChoiceRef[];
    effectiveDpt: number;
    effectiveDph: number;
    damageFromCharms: number;
    showHighlighting: boolean;
    isDptHigher: boolean;
    isDphHigher: boolean;
    isDamageFromCharmsHigher: boolean;
    isHigher?: (id: number) => boolean;
  } = $props();

  let vocResults = $derived(results.filter((i) => i.visible && i.vocations.includes(vocation)));
  let vocSpellOrdering = $derived(spellOrdering.find((s) => s.vocation == vocation)?.order ?? []);
  let rotationIds = $derived(rotation.map((r) => r.id));
  let resultsOrdered = $derived(
    vocResults.toSorted((a, b) => {
      const aInRot = rotationIds.includes(a.id);
      const bInRot = rotationIds.includes(b.id);

      // Rotation spells come first
      if (aInRot !== bInRot) return aInRot ? -1 : 1;

      // Then list spells as defined by the ordering
      let ai = vocSpellOrdering.indexOf(a.scope);
      let bi = vocSpellOrdering.indexOf(b.scope);

      // Force spells to the bottom if they aren't included in the ordering
      if (ai == -1) ai = vocSpellOrdering.length;
      if (bi == -1) bi = vocSpellOrdering.length;

      return ai - bi;
    }),
  );
</script>

<div>
  <table class="summary">
    <tbody>
      <tr class:highlight={showHighlighting && isDptHigher}>
        <td class="summary-label">
          <Tooltip
            label={"Effective damage per turn"}
            tip={"The average damage you would deal per turn, using the defined rotation, taking into account resistances, mitigation, crits and fatals. Includes all charms."}
            right={true} />
        </td>
        <td class="summary-value">{effectiveDpt.toFixed(1)}</td>
      </tr>
      <tr class:highlight={showHighlighting && isDphHigher}>
        <td class="summary-label">
          <Tooltip
            label={"Effective damage per hit"}
            tip={"The average damage you would deal per hit, using the defined rotation, taking into account resistances, mitigation, crits and fatals. Includes crit charms but not elemental charms."}
            right={true} />
        </td>
        <td class="summary-value">{effectiveDph.toFixed(1)}</td>
      </tr>
      <tr class:highlight={showHighlighting && isDamageFromCharmsHigher}>
        <td class="summary-label">
          <Tooltip label={"Damage from charms"} tip={"Average damage from charms per turn."} right={true} />
        </td>
        <td class="summary-value">{damageFromCharms.toFixed(1)}</td>
      </tr>
    </tbody>
  </table>

  <div>
    <table class="data-table">
      <thead>
        <tr>
          <th class="desc" rowspan="2">Spell</th>
          <th class="desc">
            <Tooltip
              label={"Effective"}
              tip={"The average damage you would deal, taking into account resistances, armor, mitigation, crits and fatals. Includes crit charms."}
              right={true} />
          </th>
          <th class="desc" colspan="3">
            <Tooltip
              label={"Raw"}
              tip={"The damage you would deal to a completely defenseless target, ignoring crits and fatals."}
              right={true} />
          </th>
        </tr>
        <tr>
          <th class="num">Avg</th>
          <th class="num">Min</th>
          <th class="num">Avg</th>
          <th class="num">Max</th>
        </tr>
      </thead>
      <tbody>
        {#each resultsOrdered as r}
          <tr class:highlight={showHighlighting && isHigher(r.id)}>
            <td class="spell">
              <div class="spell-name">
                {#if r.scope === "death-echo"}
                  <Tooltip label={r.name} tip="Damage includes both hits" right={true} />
                {:else}
                  {r.name}
                {/if}
              </div>
            </td>
            <td class="num" data-label="Effective Avg">{r.effective.avg.toFixed(1)}</td>
            <td class="num range" data-label="Min">
              {#if r.raw?.min === undefined}
                <Tooltip label="?" tip="The min for this <br/> spell is unknown" right={true} />
              {:else}
                {r.raw.min}
              {/if}
            </td>
            <td class="num" data-label="Avg">{r.raw!.avg}</td>
            <td class="num range" data-label="Min">
              {#if r.raw?.max === undefined}
                <Tooltip label="?" tip="The max for this <br/> spell is unknown" right={true} />
              {:else}
                {r.raw.max}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .summary {
    width: 100%;
    max-width: 600px;
    border-collapse: collapse;
    border: 1px solid var(--border-color);
    font-variant-numeric: tabular-nums;
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .summary td {
    padding: 0.4rem 0.4rem;
    border-bottom: 1px solid var(--border-color);
  }

  .summary tr:last-child td {
    border-bottom: none;
  }

  .summary-label {
    width: 100%;
  }

  .summary-value {
    text-align: right;
    font-weight: 600;
  }

  table.data-table {
    max-width: 600px;
    overflow: visible;
  }

  thead tr:nth-child(2) th:nth-child(2),
  thead tr:nth-child(2) th:nth-child(3) {
    border-right: none;
  }

  thead tr:nth-child(2) th:nth-child(3),
  thead tr:nth-child(2) th:nth-child(4) {
    border-left: none;
  }

  .desc {
    text-align: center;
  }

  .range {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .spell {
    width: 100%;
  }

  .highlight td {
    background: var(--highlight-bg);
  }

  .spell-name {
    font-weight: 600;
  }

  @media (max-width: 749px) {
    .data-table td.spell {
      grid-template-columns: 1fr;
    }
  }
</style>
