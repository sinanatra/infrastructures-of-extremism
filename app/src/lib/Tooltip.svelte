<script>
  export let x = 0;
  export let y = 0;
  export let text = "";
</script>

<div
  class="pointer-events-none fixed z-20 max-w-xs bg-black text-white text-xs p-1"
  style={`left:${x}px; top:${y}px;`}
>
  {#if text}
    {#each text.split("\n") as line, i}
      {#if i === 0}
        <div class="font-semibold text-white">{line}</div>
        <div class="border-b border-white/10 my-1"></div>
      {:else}
        <div class="text-white/80">{line}</div>
      {/if}
    {/each}
  {/if}
</div>
