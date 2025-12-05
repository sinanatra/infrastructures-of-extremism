<script>
  // import NetworkGraphSvg from "$lib/NetworkGraphSvg.svelte";
  import NetworkGraphP5 from "$lib/NetworkGraphP5.svelte";

  export let data;
  export let backgroundColor = "#000000";
  export let circleColor = "#ffffff";
  export let textColor = "#ffffff";
  export let highlightColor = "yellow";
</script>

<NetworkGraphP5
  {data}
  {backgroundColor}
  {circleColor}
  {textColor}
  {highlightColor}
/>
