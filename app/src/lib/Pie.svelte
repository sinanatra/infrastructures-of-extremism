<script>
  import { onMount } from "svelte";
  import P5 from "p5-svelte";
  import Tooltip from "$lib/Tooltip.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import {
    buildGraphNodes,
    buildLinkCountByPost,
    computeTopEmojis,
    createCanonicalTopic,
    createTooltipForPost,
    normalizeGraphLinks,
  } from "$lib/pie/data.js";
  import { createPieSketch } from "$lib/pie/sketch.js";

  let {
    data,
    backgroundColor = "#eeeeee",
    fill = "#ffffff",
    circleColor = "#222222",
    textColor = "#111111",
    labelFont = "Courier, monospace",
    highlightColor = "yellow",
    dotSize = 15,
    extrudeOffsetX = 0,
    extrudeOffsetY = 250,
    viewFill = 1.95,
  } = $props();

  const increase = 2;

  let topicsData = $state(null);
  let TOPIC_LABELS = $state([]);
  let canonicalTopic = $state(null);
  let loadingError = $state(null);

  onMount(async () => {
    try {
      const response = await fetch('/topics.json');
      if (!response.ok) {
        loadingError = `Failed to fetch topics: ${response.status}`;
        console.error(loadingError);
        return;
      }
      const data = await response.json();
      topicsData = data;
      TOPIC_LABELS = topicsData.topics.map(t => t.label);
      canonicalTopic = createCanonicalTopic(TOPIC_LABELS, "other topics");
    } catch (err) {
      loadingError = err.message;
      console.error('Error loading topics:', err);
    }
  });

  const OTHER_LABEL = "other topics";

  const { posts, links } = data;
  const prepared = prepareNetwork(data, { circleColor });
  const preparedNodes = prepared.nodes;
  const trailerAvailable = true;
  let trailerBlocking = $state(true);

  const graphNodes = $derived.by(() => {
    if (!canonicalTopic) return [];
    const nodes = buildGraphNodes(preparedNodes, { circleColor, canonicalTopic });
    return nodes;
  });
  const graphLinks = normalizeGraphLinks(links);
  const linkCountByPost = buildLinkCountByPost(graphLinks);

  const topEmojis = $derived.by(() => {
    return graphNodes.length ? computeTopEmojis(graphNodes, 30) : [];
  });

  let sizeMode = $state("links");
  let showLinks = $state(false);
  let selectedEmoji = $state(null);
  let selectedGroupId = $state(null);
  let listHoveredGroupId = $state(null);

  const groups = prepared.slicePaths ?? [];

  const sliceForGroup = $derived(
    new Map((prepared?.slicePaths ?? []).map((s) => [s.id ?? s.group?.id, s]))
  );

  const selectedGroup = $derived(
    selectedGroupId ? (sliceForGroup.get(selectedGroupId) ?? null) : null
  );

  const effectiveFilterGroupId = $derived(listHoveredGroupId ?? selectedGroupId);

  const visibleNodeIds = $derived.by(() => {
    let nodes = graphNodes;
    if (effectiveFilterGroupId !== null)
      nodes = nodes.filter((n) => (n.post?.chat ?? n.groupId) === effectiveFilterGroupId);
    if (selectedEmoji !== null)
      nodes = nodes.filter((n) => n.topEmoji === selectedEmoji);
    return new Set(nodes.map((n) => n.id));
  });

  let hoveredNode = $state(null);
  let hoveredText = $state("");

  const tooltipForPost = createTooltipForPost({ linkCountByPost });

  let p5Instance = $state(null);
  let redrawPending = false;

  const requestRedraw = () => {
    if (!p5Instance || redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      if (p5Instance) p5Instance.redraw();
    });
  };

  $effect(() => {
    sizeMode;
    showLinks;
    selectedEmoji;
    selectedGroupId;
    fill;
    labelFont;
    extrudeOffsetX;
    extrudeOffsetY;
    dotSize;
    requestRedraw();
  });

  const getState = () => ({
    sizeMode,
    showLinks,
    selectedEmoji,
    visibleNodeIds,
    dotSize,
    labelFont,
    highlightColor,
    pieHighlightColor: highlightColor,
    circleColor,
    pieFill: fill,
    pieBackground: fill,
    extrudeOffsetX,
    extrudeOffsetY,
    viewFill,
    trailerBlocking,
  });

  const setHoverState = (node, text) => {
    hoveredNode = node;
    hoveredText = text;
  };

  const sketch = $derived.by(() => {
    if (!canonicalTopic || TOPIC_LABELS.length === 0) {
      return null;
    }
    const s = createPieSketch({
      graphNodes,
      graphLinks,
      topicLabels: TOPIC_LABELS,
      otherLabel: OTHER_LABEL,
      increase,
      getState,
      tooltipForPost,
      setHoverState,
    });
    return s;
  });

  const handleInstance = (event) => {
    p5Instance = event.detail?.instance ?? null;
    requestRedraw();
  };
</script>

<section
  class="relative h-screen overflow-hidden"
  style={`background:${fill}; color:${textColor}; --graph-bg:${fill}; --graph-text:${textColor}`}
>
  {#if loadingError}
    <div class="flex items-center justify-center h-full">
      <div class="text-red-500 text-center">
        <p>Error loading visualization:</p>
        <p>{loadingError}</p>
      </div>
    </div>
  {:else if sketch}
    {#key sketch}
      <P5
        class="h-full w-full"
        {sketch}
        aria-label="Radial pie network canvas"
        role="img"
        on:instance={handleInstance}
      />
    {/key}
  {:else}
    <div class="flex items-center justify-center h-full">
      <p class="text-gray-500">Loading topics...</p>
    </div>
  {/if}

  {#if hoveredNode}
    <Tooltip text={hoveredText} />
  {/if}

  {#if trailerAvailable}
    <Trailer
      {highlightColor}
      backgroundColor={fill}
      {textColor}
      introSummary="this visualization shows the dominant topics discussed across the channels."
      seedLabel={data?.dataset?.label ?? data?.dataset?.slug}
      on:block={(event) => {
        trailerBlocking = event.detail?.blocking ?? false;
        requestRedraw();
      }}
    />
  {/if}
</section>

<style>
  :global(canvas) {
    display: block;
  }
</style>
