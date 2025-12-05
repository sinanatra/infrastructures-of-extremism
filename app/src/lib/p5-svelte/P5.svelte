<script>
  import { createEventDispatcher, onDestroy, onMount } from "svelte";

  export let sketch;
  export let className = "";
  export let style = "";

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

<div bind:this={container} class={className} {style} {...$$restProps}></div>
