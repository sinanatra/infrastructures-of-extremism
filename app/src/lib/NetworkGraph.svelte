<script>
  import NetworkGraph from "$lib/NetworkGraphP5.svelte";

  let {
    data,
    backgroundColor = "#eeeeee",
    fill = "#ffffff",
    circleColor = "#222222",
    textColor = "#111111",
    highlightColor = "yellow",
    extrudeOffsetX = 0,
    extrudeOffsetY = 950,
    datasetSlug = null,
  } = $props();
</script>

<NetworkGraph
  {data}
  {backgroundColor}
  {fill}
  {circleColor}
  {textColor}
  {highlightColor}
  {extrudeOffsetX}
  {extrudeOffsetY}
  {datasetSlug}
/>
