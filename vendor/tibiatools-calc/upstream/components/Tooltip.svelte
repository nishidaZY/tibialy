<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    tip,
    right = false,
    wrap = false,
    children,
  }: {
    label?: string;
    tip: string;
    right?: boolean;
    wrap?: boolean;
    children?: Snippet;
  } = $props();
</script>

<span class="field-tip" class:wrapping={wrap}>
  {#if wrap}
    <span class="tip-wrap">{@render children?.()}</span>
  {:else}
    <button type="button" class="tip-trigger">
      {#if children}{@render children()}{:else}{label}{/if}
    </button>
  {/if}
  <span role="tooltip" class="tip-content" class:tip-right={right}>{@html tip}</span>
</span>

<style>
  .field-tip {
    position: relative;
    display: inline-block;
  }

  /* When wrapping interactive content (e.g. a select), let it fill the cell */
  .field-tip.wrapping,
  .tip-wrap {
    display: block;
  }

  .tip-content {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    width: max-content;
    max-width: 250px;
    padding: 5px 8px;
    font-size: 0.8rem;
    text-align: start;
    color: var(--tooltip-text);
    background: var(--tooltip-bg);
    border: 1px solid var(--tooltip-border);
    z-index: 1000;
    opacity: 0;
    visibility: hidden;
  }

  .tip-right {
    left: auto;
    right: 0;
  }

  .tip-trigger {
    background: none;
    border: 0;
    font: inherit;
    padding: 0;
    color: inherit;
    cursor: help;
    text-align: start;
    text-decoration: underline dotted;
  }

  .field-tip:hover .tip-content,
  .field-tip:not(.wrapping):focus-within .tip-content {
    opacity: 1;
    visibility: visible;
  }
</style>
