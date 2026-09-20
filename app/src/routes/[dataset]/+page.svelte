<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  let { data } = $props();

  const defaultTheme = {
    backgroundColor: "#eeeeee",
    fill: "#ffffff",
    circleColor: "#222222",
    textColor: "#111111",
    highlightColor: "#888888",
  };

  const theme = data?.dataset?.theme ?? defaultTheme;
</script>

<section class="dataset">
  <NetworkGraph
    {data}
    backgroundColor={theme.backgroundColor}
    fill={theme.fill}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
    extrudeOffsetX={theme.graphExtrudeOffsetX ?? 0}
    extrudeOffsetY={theme.graphExtrudeOffsetY ?? 950}
    datasetSlug={data?.dataset?.slug}
  />
</section>
