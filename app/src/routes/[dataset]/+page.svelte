<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  export let data;

  const title = data?.dataset?.label || data?.dataset?.slug || "Dataset";
</script>

<section class="dataset">
  <NetworkGraph
    {data}
    backgroundColor="black"
    circleColor="#FFBF00"
    textColor="#FFBF00"
    highlightColor="#7B68EE"
  />
</section>
