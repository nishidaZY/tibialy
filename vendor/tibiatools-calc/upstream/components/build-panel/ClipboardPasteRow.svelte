<script lang="ts">
  import { unpackSection, type SectionTag } from "@lib/damage-calc/section-clipboard";

  let {
    sectionTag,
    pasteTarget,
    showSecondBuild,
    onPaste,
  }: {
    sectionTag: SectionTag;
    pasteTarget: "a" | "b";
    showSecondBuild: boolean;
    onPaste: (data: unknown) => void;
  } = $props();

  let inputEl: HTMLInputElement | undefined = $state();

  function handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value.trim();
    if (!value) return;
    const data = unpackSection(value, sectionTag);
    if (data !== null) onPaste(data);
  }

  $effect(() => {
    inputEl?.focus();
  });
</script>

<tr class="data-row">
  <td></td>
  {#if pasteTarget === "a"}
    <td>
      <input
        bind:this={inputEl}
        type="text"
        class="paste-input input-a"
        placeholder="Paste here…"
        oninput={handleInput} />
    </td>
    {#if showSecondBuild}<td></td>{/if}
  {:else}
    <td></td>
    <td>
      <input
        bind:this={inputEl}
        type="text"
        class="paste-input input-b"
        placeholder="Paste here…"
        oninput={handleInput} />
    </td>
  {/if}
</tr>

<style>
  .paste-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0.4rem;
    font: inherit;
    font-size: 0.8rem;
    border: 1px dashed var(--input-border);
    border-radius: 0.25rem;
    background: var(--input-bg);
    color: inherit;
  }

  .paste-input.input-a {
    border-color: var(--build-a-border);
  }

  .paste-input.input-b {
    border-color: var(--build-b-border);
  }

  .paste-input:focus {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
