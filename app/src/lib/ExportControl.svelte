

<script>
  import { createEventDispatcher } from "svelte";

  let { exportImg = false, label = "Export PNG" } = $props();

  const dispatch = createEventDispatcher();

  const handleClick = () => {
    dispatch("export");
  };
</script>

<button
  class="px-3 py-2 rounded border border-white/20 bg-black/60 text-xs hover:bg-[rgba(255,255,255,0.08)] transition disabled:opacity-60"
  on:click={handleClick}
>
  export image
</button>
