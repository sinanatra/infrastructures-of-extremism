<script>
  import P5 from "p5-svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import Tooltip from "$lib/Tooltip.svelte";
  import {
    buildLinkSegments,
    computeTopEmojis,
    createTooltipForPost,
  } from "$lib/networkGraph/data.js";
  import { createNetworkGraphSketch } from "$lib/networkGraph/sketch.js";

  let {
    data,
    backgroundColor = "#eeeeee",
    fill = "#ffffff",
    circleColor = "#222222",
    textColor = "#111111",
    highlightColor: highlightColorProp = "yellow",
    extrudeOffsetX = 0,
    extrudeOffsetY = 950,
    datasetSlug = null,
  } = $props();

  const { posts, links, groups: scraperGroups = [] } = data;
  const scraperOrder = new Map(scraperGroups.map((g, i) => [g.id, i]));

  const prepared = prepareNetwork(data, { circleColor });
  const {
    width,
    height,
    cx,
    cy,
    slicePaths,
    innerTicks,
    outerTick,
    outerRingRadius,
    polygonSides,
    nodes,
    linkCountByPost,
    sliceForGroup,
  } = prepared;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const linkSegments = buildLinkSegments(links, nodeById);

  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const formatTick = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const tooltipForPost = createTooltipForPost({ linkCountByPost, formatDate });

  let highlightColorFallback = $state(null);
  $effect.pre(() => {
    if (highlightColorProp) return;
    const cssColor = getComputedStyle(document.documentElement).getPropertyValue(
      "--highlite-color"
    );
    const fallback = (cssColor || "").trim();
    highlightColorFallback = fallback || "yellow";
  });

  const highlightColor = $derived(
    highlightColorProp ?? highlightColorFallback ?? "yellow"
  );

  const topEmojis = $derived.by(() => computeTopEmojis(nodes, 30));

  const seedLabel = (() => {
    const match = slicePaths.find(
      (s) => s.id && datasetSlug && s.id.toLowerCase() === datasetSlug.toLowerCase()
    );
    return (match ?? slicePaths[0])?.group?.label ?? (match ?? slicePaths[0])?.id ?? null;
  })();

  let trailerBlocking = $state(true);

  let sizeMode = $state("links");
  let showLinks = $state(false);
  let selectedEmoji = $state(null);
  let selectedGroupId = $state(null);
  let listHoveredGroupId = $state(null);

  const selectedGroup = $derived(
    selectedGroupId === null
      ? null
      : (sliceForGroup.get(selectedGroupId)?.group ?? null)
  );

  const effectiveFilterGroupId = $derived(listHoveredGroupId ?? selectedGroupId);

  const visibleNodes = $derived.by(() => {
    let base = nodes;
    if (effectiveFilterGroupId !== null) base = base.filter((n) => n.groupId === effectiveFilterGroupId);
    if (selectedEmoji !== null) base = base.filter((n) => n.topEmoji === selectedEmoji);
    return base;
  });

  const visibleNodeIds = $derived.by(() => new Set(visibleNodes.map((n) => n.id)));

  const visibleLinks = $derived.by(() =>
    showLinks
      ? linkSegments.filter(
          (link) =>
            visibleNodeIds.has(link.source.id) &&
            visibleNodeIds.has(link.target.id)
        )
      : []
  );

  let hoveredNode = $state(null);
  let hoveredText = $state("");

  const hoveredGroupId = $derived(hoveredNode?.groupId ?? listHoveredGroupId ?? null);

  const setHoverState = (node, text) => {
    hoveredNode = node;
    hoveredText = text;
  };
  const clearHover = () => setHoverState(null, "");

  $effect(() => {
    if (hoveredNode && !visibleNodeIds.has(hoveredNode.id)) clearHover();
  });

  const subscriberText = (value) => {
    if (!value) return null;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m subs`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k subs`;
    return `${value} subs`;
  };

  const toggleGroup = (groupId) => {
    selectedGroupId = selectedGroupId === groupId ? null : groupId;
  };

  let canvasParent = null;
  let pInstance = $state(null);
  let controlsEl = null;
  let redrawPending = false;

  const requestRedraw = () => {
    if (!pInstance || redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      if (pInstance) pInstance.redraw();
    });
  };

  $effect(() => {
    if (!pInstance) return;
    visibleNodes;
    visibleLinks;
    selectedGroupId;
    selectedEmoji;
    sizeMode;
    showLinks;
    highlightColor;
    textColor;
    backgroundColor;
    fill;
    circleColor;
    hoveredNode;
    hoveredGroupId;
    requestRedraw();
  });

  const handleP5Instance = (event) => {
    pInstance = event.detail?.instance ?? null;
    canvasParent = event.detail?.container ?? null;
    requestRedraw();
  };

  const getState = () => ({
    sizeMode,
    showLinks,
    selectedGroupId,
    hoveredGroupId,
    hoveredNode,
    hoveredText,
    visibleNodes,
    visibleLinks,
    visibleNodeIds,
    highlightColor,
    textColor,
    backgroundColor,
    pieBackground: fill,
    circleColor,
    hexaFill: fill,
    trailerBlocking,
  });

  const sketch = createNetworkGraphSketch({
    prepared: {
      width,
      height,
      cx,
      cy,
      slicePaths,
      innerTicks,
      outerTick,
      outerRingRadius,
      polygonSides,
    },
    nodes,
    linkSegments,
    extrudeOffsetX,
    extrudeOffsetY,
    requestRedraw,
    getState,
    setHoverState,
    toggleGroup,
    tooltipForPost,
    formatTick,
    getCanvasParent: () => canvasParent,
    getControlsEl: () => controlsEl,
  });
</script>

<section
  class="relative h-screen overflow-hidden"
  style={`--highlite-color:${highlightColor}; --graph-bg:${backgroundColor}; --graph-circle:${circleColor}; --graph-text:${textColor}; background:${backgroundColor}; color:${textColor};`}
>
  <Trailer
    {seedLabel}
    {highlightColor}
    {backgroundColor}
    {textColor}
    introSummary="this visualization shows the network of related channels: the ones they talk about and the ones resharing their posts."
    on:block={(e) => { trailerBlocking = e.detail?.blocking ?? false; requestRedraw(); }}
  />

  <div
    class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none"
    hidden={trailerBlocking}
  >
    <div
      class="pointer-events-auto max-w-5xl mx-auto"
      bind:this={controlsEl}
      onpointerdown={(e) => e.stopPropagation()}
      onpointermove={(e) => e.stopPropagation()}
      onpointerup={(e) => e.stopPropagation()}
      onwheel={(e) => e.stopPropagation()}
      onclick={(e) => e.stopPropagation()}
    >
      <NetworkControls
        counts={{
          posts: posts.length,
          groups: slicePaths.length,
          links: links.length,
        }}
        groups={[...slicePaths].sort((a, b) => (scraperOrder.get(a.id) ?? 9999) - (scraperOrder.get(b.id) ?? 9999))}
        {selectedGroupId}
        {hoveredGroupId}
        {selectedGroup}
        {sizeMode}
        {showLinks}
        {topEmojis}
        {selectedEmoji}
        {subscriberText}
        {textColor}
        {backgroundColor}
        {highlightColor}
        on:sizeMode={(event) => { sizeMode = event.detail; }}
        on:showLinks={(event) => { showLinks = event.detail; }}
        on:selectEmoji={(event) => {
          selectedEmoji = event.detail;
          if (selectedEmoji && hoveredNode && hoveredNode.topEmoji !== selectedEmoji) clearHover();
        }}
        on:clearSelection={() => (selectedGroupId = null)}
        on:selectGroup={(event) => toggleGroup(event.detail)}
        on:hoverGroup={(event) => { listHoveredGroupId = event.detail; }}
        on:clearHoverGroup={() => { listHoveredGroupId = null; }}
      />
    </div>
  </div>

  <P5
    className="h-full w-full"
    {sketch}
    aria-label="Radial network canvas"
    role="img"
    on:instance={handleP5Instance}
  />

  {#if hoveredNode}
    <Tooltip text={hoveredText} />
  {/if}
</section>

<style>
  :global(canvas) {
    display: block;
  }
</style>

