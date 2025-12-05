<script>
  import NetworkGraphSvg from "$lib/NetworkGraphSvg.svelte";
  import NetworkGraphP5 from "$lib/NetworkGraphP5.svelte";

  export let data;
</script>

<NetworkGraphP5 {data} />
