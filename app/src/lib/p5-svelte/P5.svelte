
<script>
  import { createEventDispatcher, onMount } from "svelte";

  let { sketch, className = "", style = "" } = $props();

  let container;
  let instance = null;
  const dispatch = createEventDispatcher();

  onMount(async () => {
    const mod = await import("p5");
    const P5Ctor = mod?.default ?? mod;
    instance = new P5Ctor(sketch, container);
    dispatch("instance", { instance, container });
    return () => {
      if (instance?.remove) instance.remove();
      dispatch("destroy");
    };
  });
</script>

<div bind:this={container} class={className} style={style}></div>
