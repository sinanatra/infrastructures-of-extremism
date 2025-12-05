<script>
  import NetworkGraph from "$lib/NetworkGraph.svelte";
  export let data;

  const title = data?.dataset?.label || data?.dataset?.slug || "Dataset";
</script>

<section class="dataset">
  <NetworkGraph {data} />
</section>
