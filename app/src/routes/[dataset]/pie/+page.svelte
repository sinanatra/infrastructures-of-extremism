<script>
  import Pie from "$lib/Pie.svelte";

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
  <Pie
    {data}
    dotSize={5}
    extrudeOffsetX={theme.pieExtrudeOffsetX ?? 0}
    extrudeOffsetY={theme.pieExtrudeOffsetY ?? 80}
    backgroundColor={theme.backgroundColor}
    fill={theme.fill}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
    datasetSlug={data?.dataset?.slug}
  />
</section>
