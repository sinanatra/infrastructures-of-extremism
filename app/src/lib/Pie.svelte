<script>
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
    buildTrailerGroups,
    computeTopEmojis,
    createCanonicalTopic,
    createTooltipForPost,
    normalizeGraphLinks,
  } from "$lib/pie/data.js";
  import { createPieSketch } from "$lib/pie/sketch.js";

  let {
    data,
    backgroundColor = "gainsboro",
    circleColor = "#ffffff",
    textColor = "#ffffff",
    labelFont = "monospace",
    highlightColor = "yellow",
    dotSize = 15,
    extrudeOffsetX = 0,
    extrudeOffsetY = 250,
    pieFill = "#ffffff",
    pieBackground = "gainsboro",
    viewFill = 1.95,
  } = $props();

  const increase = 2;

  const TOPIC_LABELS = [
    "national symbols",
    "out-groups & boundaries",
    "elites & power",
    "street actions",
    "ideological texts",
    "electoral politics",
    "media & information",
    "security & violence",
    "territory & space",
  ];

  const OTHER_LABEL = "other topics";
  const canonicalTopic = createCanonicalTopic(TOPIC_LABELS, OTHER_LABEL);

  const { posts, links } = data;
  const prepared = prepareNetwork(data, { circleColor });
  const preparedNodes = prepared.nodes;
  const trailerGroups = buildTrailerGroups(prepared);
  const trailerAvailable = trailerGroups.length > 0;
  let trailerState = $state(trailerAvailable ? "idle" : "done");
  let trailerBlocking = $state(trailerAvailable);

  const graphNodes = buildGraphNodes(preparedNodes, { circleColor, canonicalTopic });
  const graphLinks = normalizeGraphLinks(links);
  const linkCountByPost = buildLinkCountByPost(graphLinks);

  const topEmojis = $derived.by(() => {
    return computeTopEmojis(graphNodes, 30);
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
  const selectedGroup = $derived(null);

  const visibleNodeIds = $derived.by(() => {
    if (!selectedEmoji) return new Set(graphNodes.map((n) => n.id));
    return new Set(
      graphNodes.filter((n) => n.topEmoji === selectedEmoji).map((n) => n.id)
    );
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
    pieFill;
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
    circleColor,
    pieFill,
    pieBackground,
    extrudeOffsetX,
    extrudeOffsetY,
    viewFill,
    trailerBlocking,
  });

  const setHoverState = (node, text) => {
    hoveredNode = node;
    hoveredText = text;
  };

  const sketch = createPieSketch({
    graphNodes,
    graphLinks,
    topicLabels: TOPIC_LABELS,
    otherLabel: OTHER_LABEL,
    increase,
    getState,
    tooltipForPost,
    setHoverState,
  });

  const handleInstance = (event) => {
    p5Instance = event.detail?.instance ?? null;
    requestRedraw();
  };
</script>

<section
  class="relative h-screen overflow-hidden"
  style={`background:${pieBackground}; color:${textColor}; --graph-bg:${pieBackground}; --graph-text:${textColor}`}
>
  <div
    class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none"
    hidden={trailerState !== "done"}
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
          groups: new Set(graphNodes.map((n) => n.type)).size,
          links: links.length,
        }}
        {selectedGroup}
        {sizeMode}
        {showLinks}
        {topEmojis}
        {selectedEmoji}
        {subscriberText}
        {textColor}
        backgroundColor={pieBackground}
        {highlightColor}
        on:sizeMode={(event) => {
          sizeMode = event.detail;
        }}
        on:showLinks={(event) => {
          showLinks = event.detail;
        }}
        on:selectEmoji={(event) => {
          selectedEmoji = event.detail;
        }}
        on:clearSelection={() => {
          selectedGroupId = null;
        }}
      />
    </div>
  </div>

  <div
    class="absolute top-4 right-4 z-20 pointer-events-auto"
    hidden={trailerState !== "done"}
  >
    <ExportControl label="Export PNG" on:export={exportPng} />
  </div>

  <P5
    class="h-full w-full"
    {sketch}
    aria-label="Radial pie network canvas"
    role="img"
    on:instance={handleInstance}
  />

  {#if hoveredNode}
    <Tooltip text={hoveredText} />
  {/if}

  {#if trailerAvailable}
    <Trailer
      groups={trailerGroups}
      {highlightColor}
      backgroundColor={pieBackground}
      {textColor}
      introMode={true}
      introHeading=""
      introSummary="this visualization shows the dominant topics discussed across the channels."
      introBody=""
      enterLabel="Enter"
      seedLabel={data?.dataset?.label ?? data?.dataset?.slug}
      on:update={(event) => {
        trailerState = event.detail?.state ?? trailerState;
        trailerBlocking = event.detail?.state === "idle";
        requestRedraw();
      }}
      on:block={(event) => {
        trailerBlocking = event.detail?.blocking ?? false;
      }}
    />
  {/if}
</section>

<style>
  :global(canvas) {
    display: block;
  }
</style>
