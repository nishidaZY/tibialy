<script lang="ts">
  let {
    showSecondBuild,
    collapsed,
    copyAtoB,
    copyBtoA,
    onCopyA,
    onCopyB,
    pasteTarget = $bindable(null),
  }: {
    showSecondBuild: boolean;
    collapsed: boolean;
    copyAtoB: () => void;
    copyBtoA: () => void;
    onCopyA: () => string;
    onCopyB: () => string;
    pasteTarget: "a" | "b" | null;
  } = $props();

  let copiedA = $state(false);
  let copiedB = $state(false);

  async function handleCopyA() {
    try {
      await navigator.clipboard.writeText(onCopyA());
      copiedA = true;
      setTimeout(() => (copiedA = false), 1500);
    } catch {}
  }

  async function handleCopyB() {
    try {
      await navigator.clipboard.writeText(onCopyB());
      copiedB = true;
      setTimeout(() => (copiedB = false), 1500);
    } catch {}
  }
</script>

<td>
  {#if !collapsed}
    <div class="section-buttons">
      {#if showSecondBuild}
        <button class="copy-btn" onclick={copyBtoA}>Copy from B</button>
      {/if}
      <button class="copy-btn icon-btn" onclick={handleCopyA} title={copiedA ? "Copied!" : "Copy to clipboard"}>
        <img src={copiedA ? "/check.svg" : "/copy.svg"} alt="" width="14" height="14" />
      </button>
      <button
        class="copy-btn icon-btn"
        class:active={pasteTarget === "a"}
        onclick={() => (pasteTarget = pasteTarget === "a" ? null : "a")}
        title="Paste from clipboard">
        <img src="/paste.svg" alt="" width="14" height="14" />
      </button>
    </div>
  {/if}
</td>
{#if showSecondBuild}
  <td>
    {#if !collapsed}
      <div class="section-buttons">
        <button class="copy-btn" onclick={copyAtoB}>Copy from A</button>
        <button class="copy-btn icon-btn" onclick={handleCopyB} title={copiedB ? "Copied!" : "Copy to clipboard"}>
          <img src={copiedB ? "/check.svg" : "/copy.svg"} alt="" width="14" height="14" />
        </button>
        <button
          class="copy-btn icon-btn"
          class:active={pasteTarget === "b"}
          onclick={() => (pasteTarget = pasteTarget === "b" ? null : "b")}
          title="Paste from clipboard">
          <img src="/paste.svg" alt="" width="14" height="14" />
        </button>
      </div>
    {/if}
  </td>
{/if}

<style>
  .section-buttons {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .icon-btn {
    margin-left: auto;
    padding: 0.15rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn + .icon-btn {
    margin-left: 0;
  }

  .icon-btn img {
    filter: var(--icon-filter-muted);
  }

  .icon-btn:hover img,
  .icon-btn.active img {
    filter: var(--icon-filter);
  }
</style>
