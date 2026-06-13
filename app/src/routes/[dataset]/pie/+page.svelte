<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  import Pie from "$lib/Pie.svelte";

  let { data } = $props();

  const title = data?.dataset?.label || data?.dataset?.slug || "Dataset";

  const defaultTheme = {
    backgroundColor: "#111",
    circleColor: "#fff8bc",
    textColor: "#fff8bc",
    highlightColor: "#7B68EE",
    pieHighlightColor: "#4040cc",
  };

  const theme = data?.dataset?.theme ?? defaultTheme;
</script>

<section class="dataset">
  <!-- <NetworkGraph
    {data}
    backgroundColor={theme.backgroundColor}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
    datasetSlug={data?.dataset?.slug}
  /> -->

  <Pie
    {data}
    dotSize={5}
    extrudeOffsetX={theme.pieExtrudeOffsetX ?? 0}
    extrudeOffsetY={theme.pieExtrudeOffsetY ?? 80}
    backgroundColor={theme.backgroundColor}
    pieBackground={theme.pieBackground}
    pieFill={theme.pieFill}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
    pieHighlightColor={theme.pieHighlightColor ?? theme.highlightColor}
    datasetSlug={data?.dataset?.slug}
  />
</section>
