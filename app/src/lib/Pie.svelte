<script>
  import { onMount } from "svelte";
  import P5 from "p5-svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import Tooltip from "$lib/Tooltip.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import ExportControl from "$lib/ExportControl.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import { captureCanvasAsPng } from "$lib/captureCanvas.js";
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
      // console.log('Topics loaded successfully:', data);
      topicsData = data;
      TOPIC_LABELS = topicsData.topics.map(t => t.label);
      // console.log('TOPIC_LABELS:', TOPIC_LABELS);
      canonicalTopic = createCanonicalTopic(TOPIC_LABELS, "other topics");
      // console.log('canonicalTopic created:', canonicalTopic);
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
    // console.log('graphNodes updated:', nodes.length, 'nodes');
    return nodes;
  });
  const graphLinks = normalizeGraphLinks(links);
  const linkCountByPost = buildLinkCountByPost(graphLinks);

  const topEmojis = $derived.by(() => {
    return graphNodes.length ? computeTopEmojis(graphNodes, 30) : [];
  });

  const subscriberText = (value) => {
    if (!value) return null;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m subs`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k subs`;
    return `${value} subs`;
  };

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

  const exportPng = async () => {
    if (!p5Instance?.canvas) return;
    try {
      p5Instance.redraw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const downloadName = data?.dataset?.slug ?? "pie";
      await captureCanvasAsPng(p5Instance.canvas, downloadName);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      requestRedraw();
    }
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
      // console.log('Sketch not ready:', { canonicalTopic: !!canonicalTopic, labels: TOPIC_LABELS.length });
      return null;
    }
    // console.log('Creating sketch with graphNodes:', graphNodes.length, 'graphLinks:', graphLinks.length);
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
    // console.log('Sketch created:', s);
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
  <div
    class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none"
    hidden={trailerBlocking}
  >
    <div
      class="pointer-events-auto max-w-5xl mx-auto flex flex-col gap-2"
      on:pointerdown|stopPropagation
      on:pointermove|stopPropagation
      on:pointerup|stopPropagation
      on:wheel|stopPropagation
      on:click|stopPropagation
    >
      <NetworkControls
        counts={{
          posts: posts.length,
          groups: groups.length,
          links: links.length,
        }}
        {groups}
        {selectedGroupId}
        hoveredGroupId={listHoveredGroupId}
        {selectedGroup}
        {sizeMode}
        {showLinks}
        {topEmojis}
        {selectedEmoji}
        {subscriberText}
        {textColor}
        backgroundColor={fill}
        {highlightColor}
        on:sizeMode={(e) => { sizeMode = e.detail; }}
        on:showLinks={(e) => { showLinks = e.detail; }}
        on:selectEmoji={(e) => { selectedEmoji = e.detail; }}
        on:clearSelection={() => { selectedGroupId = null; }}
        on:selectGroup={(e) => { selectedGroupId = selectedGroupId === e.detail ? null : e.detail; }}
        on:hoverGroup={(e) => { listHoveredGroupId = e.detail; }}
        on:clearHoverGroup={() => { listHoveredGroupId = null; }}
      />
    </div>
  </div>

  
  <div
    class="absolute top-4 right-4 z-20 pointer-events-auto"
    hidden={trailerBlocking}
  >
    <ExportControl label="Export PNG" on:export={exportPng} />
  </div>

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
