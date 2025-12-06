<script>
  export let x = 0;
  export let y = 0;
  export let text = "";
</script>

<div
  class="tooltip pointer-events-auto fixed z-20 max-w-xs text-xs p-2"
  style="right: 16px; bottom: 16px; background: var(--graph-bg, black); color: var(--graph-text, var(--graph-circle, white)); border: 0.75px solid var(--highlite-color, yellow);"
  on:click|stopPropagation
  on:pointerdown|stopPropagation
>
  {#if text}
    {#each text.split("\n") as line, i}
      {#if i === 0}
        <div class="font-semibold">{line}</div>
        <div class="divider my-1"></div>
      {:else}
        <div class="muted">{line}</div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .tooltip {
    border-radius: 6px;
  }

  .divider {
    border-bottom: 1px solid currentColor;
    opacity: 0.25;
  }

  .muted {
    opacity: 0.8;
  }
</style>
