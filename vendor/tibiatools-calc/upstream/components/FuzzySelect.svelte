<script lang="ts">
  import { byLengthAsc, Fzf } from "fzf";

  let {
    selectType,
    build,
    all = [],
    selectedIds = [],
    getId = (x: any) => x?.id,
    getLabel = (x: any) => x?.name ?? "",
    onAdd,
  }: {
    selectType: string;
    build?: "a" | "b";
    all?: any[];
    selectedIds?: (string | number)[];
    getId?: (x: any) => string | number;
    getLabel?: (x: any) => string;
    onAdd: (id: any) => void;
  } = $props();

  let q = $state("");
  let open = $state(false);
  let activeIndex = $state(0);
  let dropdownEl = $state<HTMLUListElement>();

  async function scrollToActive() {
    const child = dropdownEl?.children[activeIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: "nearest" });
  }

  let available = $derived(all.filter((x) => !selectedIds.includes(getId(x))));
  let fzf = $derived(
    new Fzf(
      available as any,
      { selector: (x: any) => getLabel(x), casing: "case-insensitive", tiebreakers: [byLengthAsc] } as any,
    ),
  );
  let results = $derived(q ? fzf.find(q).map((r: any) => r.item) : available);

  function select(item: any) {
    onAdd(getId(item));
    q = "";
    open = false;
    activeIndex = 0;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open && (e.key.length === 1 || e.key === "ArrowDown")) open = true;
    if (!open) return;

    if (e.key === "ArrowDown") {
      activeIndex = results.length ? (activeIndex + 1) % results.length : 0;
      scrollToActive();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      activeIndex = results.length ? (activeIndex - 1 + results.length) % results.length : 0;
      scrollToActive();
      e.preventDefault();
    } else if (e.key === "Enter") {
      const item = results[activeIndex];
      if (item) select(item);
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  function handleFocus() {
    open = true;
  }

  function handleBlur() {
    open = false;
  }
</script>

<div class="fuzzy-select">
  <div class="combo">
    <input
      class="fuzzy-search"
      class:input-a={build === "a"}
      class:input-b={build === "b"}
      placeholder="Search {selectType}"
      bind:value={q}
      onfocus={handleFocus}
      onblur={handleBlur}
      onmousedown={handleFocus}
      onkeydown={handleKeydown} />
    <svg class="chev" viewBox="0 0 20 20">
      <path d="M5 7l5 6 5-6" />
    </svg>
  </div>
  {#if open}
    <ul class="dropdown" bind:this={dropdownEl}>
      {#if results.length === 0}
        <li class="empty">No matches</li>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        {#each results as p, i}
          <li
            class:selected={i === activeIndex}
            onmousedown={(e) => {
              e.preventDefault();
              select(p);
            }}>
            {getLabel(p)}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>

<style>
  .fuzzy-select {
    position: relative;
  }

  .combo {
    position: relative;
  }

  .fuzzy-search {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0rem 0.5rem 0.625rem;
    border: 1px solid var(--input-border);
    border-radius: 0.5rem;
    outline: none;
    background: var(--input-bg);
    color: var(--text-color);
  }
  .fuzzy-search:focus {
    border-color: var(--focus-border);
    box-shadow: var(--focus-ring);
  }
  .fuzzy-search.input-a:focus {
    border-color: var(--build-a-focus-border);
    box-shadow: var(--build-a-focus-ring);
  }
  .fuzzy-search.input-b:focus {
    border-color: var(--build-b-focus-border);
    box-shadow: var(--build-b-focus-ring);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    width: max-content;

    margin-top: 0.25rem;
    padding: 0;
    scrollbar-gutter: stable;
    list-style: none;

    background: var(--dropdown-bg);
    border: 1px solid var(--border-color);
    color: var(--dropdown-text);
    border-radius: 0.5rem;

    max-height: 16rem;
    overflow-y: auto;
    z-index: 10;
  }
  .dropdown li {
    white-space: nowrap;
    padding-right: 0.25rem;
  }
  .dropdown li:hover,
  .dropdown li.selected {
    background: var(--dropdown-hover);
  }
  .dropdown li.empty {
    color: var(--text-muted);
  }
  .chev {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    width: 1rem;
    height: 1rem;
    transform: translateY(-50%);
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    opacity: 0.6;
    pointer-events: none;
  }
</style>
