<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  export let data;

  const title = data?.dataset?.label || data?.dataset?.slug || "Dataset";

  const defaultTheme = {
    backgroundColor: "#111",
    circleColor: "#fff8bc",
    textColor: "#fff8bc",
    highlightColor: "#7B68EE",
  };

  const theme = data?.dataset?.theme ?? defaultTheme;
</script>

<section class="dataset">
  <NetworkGraph
    {data}
    backgroundColor={theme.backgroundColor}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
    datasetSlug={data?.dataset?.slug}
  />
</section>
