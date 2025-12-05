<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  export let data;

  const title = data?.dataset?.label || data?.dataset?.slug || "Dataset";

  const themeBySlug = {
    jungenationalisten: {
      backgroundColor: "#111",
      circleColor: "#FFBF00",
      textColor: "#FFBF00",
      highlightColor: "#7B68EE",
    },
  };

  const defaultTheme = {
    backgroundColor: "black",
    circleColor: "white",
    textColor: "white",
    highlightColor: "yellow",
  };

  const theme = themeBySlug[data?.dataset?.slug] ?? defaultTheme;
</script>

<section class="dataset">
  <NetworkGraph
    {data}
    backgroundColor={theme.backgroundColor}
    circleColor={theme.circleColor}
    textColor={theme.textColor}
    highlightColor={theme.highlightColor}
  />
</section>
