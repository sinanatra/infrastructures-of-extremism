<script>
  // import NetworkGraph from "$lib/NetworkGraphSvg.svelte";
  import NetworkGraph from "$lib/NetworkGraphP5.svelte";

  let {
    data,
    backgroundColor = "#000000",
    circleColor = "#ffffff",
    pieFill = "#ffffff",
    hexaFill = "gainsboro",
    textColor = "#ffffff",
    highlightColor = "yellow",
    extrudeOffsetX = 0,
    extrudeOffsetY = 950,
    datasetSlug = null,
  } = $props();
</script>

<NetworkGraph
  {data}
  {backgroundColor}
  {pieFill}
  {hexaFill}
  {circleColor}
  {textColor}
  {highlightColor}
  {extrudeOffsetX}
  {extrudeOffsetY}
  {datasetSlug}
/>
