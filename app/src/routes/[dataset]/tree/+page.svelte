<script>
  import Tree from "$lib/Tree.svelte";
  let { data } = $props();
</script>

<section>
  <Tree {data} />
</section>
