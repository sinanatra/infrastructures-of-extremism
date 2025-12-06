<script>
  // import NetworkGraph from "$lib/NetworkGraphSvg.svelte";
  import NetworkGraph from "$lib/NetworkGraphP5.svelte";

  export let data;
  export let backgroundColor = "#000000";
  export let circleColor = "#ffffff";
  export let textColor = "#ffffff";
  export let highlightColor = "yellow";
</script>

<NetworkGraph
  {data}
  {backgroundColor}
  {circleColor}
  {textColor}
  {highlightColor}
/>
