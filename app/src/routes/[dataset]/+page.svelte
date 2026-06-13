<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  let { data } = $props();

  const title = data?.dataset?.label || data?.dataset?.slug || "Dataset";

  const defaultTheme = {
    backgroundColor: "#111",
    circleColor: "#fff8bc",
    textColor: "#fff8bc",
    highlightColor: "#7B68EE",
    pieBackground: "gainsboro",
  };

  const theme = data?.dataset?.theme ?? defaultTheme;
</script>

<section class="dataset">
  <NetworkGraph
    {data}
    backgroundColor={theme.backgroundColor}
    pieFill={theme.pieFill}
    pieBackground={theme.pieBackground}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
    extrudeOffsetX={theme.graphExtrudeOffsetX ?? 0}
    extrudeOffsetY={theme.graphExtrudeOffsetY ?? 950}
    datasetSlug={data?.dataset?.slug}
  />
</section>
