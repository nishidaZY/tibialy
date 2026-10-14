<script lang="ts">
  let { onclick }: { onclick?: (e: MouseEvent) => void } = $props();
</script>

<button type="button" class="remove-btn" aria-label="Remove" {onclick}>×</button>

<style>
  .remove-btn {
    width: var(--remove-btn-width, auto);
    box-sizing: border-box;
    padding: 0.1rem 0.4rem;
    font-size: 1rem;
    line-height: 1;
    background: var(--table-body-bg);
    border: 1px solid var(--input-border);
    border-radius: 0.25rem;
    color: inherit;
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
  }

  .remove-btn:hover {
    background: var(--remove-hover-bg);
    border-color: var(--remove-hover-border);
  }
</style>
