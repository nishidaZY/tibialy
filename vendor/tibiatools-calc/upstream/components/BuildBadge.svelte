<script lang="ts">
  import type { Snippet } from "svelte";

  let { build, children }: { build: "a" | "b"; children: Snippet } = $props();
</script>

<span class="build-badge" class:build-a={build === "a"} class:build-b={build === "b"}>
  {@render children()}
</span>

<style>
  .build-badge {
    display: inline-block;
    text-align: center;
    font-weight: 600;
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .build-a {
    background: var(--build-a-bg);
    color: var(--build-a-text);
  }

  .build-b {
    background: var(--build-b-bg);
    color: var(--build-b-text);
  }
</style>
