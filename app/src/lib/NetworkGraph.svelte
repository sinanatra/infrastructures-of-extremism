<svelte:options runes={true} />
<script>
  // import NetworkGraph from "$lib/NetworkGraphSvg.svelte";
  import NetworkGraph from "$lib/NetworkGraphP5.svelte";

  let {
    data,
    backgroundColor = "#000000",
    circleColor = "#ffffff",
    textColor = "#ffffff",
    highlightColor = "yellow",
    datasetSlug = null,
  } = $props();
</script>

<NetworkGraph
  {data}
  {backgroundColor}
  {circleColor}
  {textColor}
  {highlightColor}
  {datasetSlug}
/>
