<script>
  import P5 from "p5-svelte";
  import CCapture from "ccapture.js";
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

  // Timestamp of each group's most recent post — used during recording to
  // reveal a group's label only once its last post has played.
  const groupLastPostMs = new Map();
  for (const node of nodes) {
    const t = node.post?.dateMs;
    if (!Number.isFinite(t)) continue;
    const current = groupLastPostMs.get(node.groupId);
    if (current === undefined || t > current) groupLastPostMs.set(node.groupId, t);
  }

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

  // During recording this is set to the timestamp of the post currently
  // playing; only posts at or before it are drawn, so the graph fills in
  // node-by-node along the timeline instead of showing everything at once.
  // Plain (non-reactive) var: it's mutated from the imperative capture loop
  // and read synchronously by getState() on each manual redraw.
  let recordRevealMs = null;

  // During the emoji-tour recording this is set to the emoji currently being
  // featured, drawn large over the center of the canvas. Same plain-var
  // pattern as recordRevealMs.
  let centerEmoji = null;

  const getState = () => {
    let nodesForDraw = visibleNodes;
    let linksForDraw = visibleLinks;
    let nodeIdsForDraw = visibleNodeIds;
    let revealedGroupIds = null;
    if (recordRevealMs !== null) {
      nodesForDraw = visibleNodes.filter(
        (n) => (n.post?.dateMs ?? Infinity) <= recordRevealMs
      );
      const revealedIds = new Set(nodesForDraw.map((n) => n.id));
      nodeIdsForDraw = revealedIds;
      linksForDraw = showLinks
        ? visibleLinks.filter(
            (link) => revealedIds.has(link.source.id) && revealedIds.has(link.target.id)
          )
        : [];
      revealedGroupIds = new Set();
      for (const [groupId, lastMs] of groupLastPostMs) {
        if (lastMs <= recordRevealMs) revealedGroupIds.add(groupId);
      }
    }
    return {
      sizeMode,
      showLinks,
      selectedGroupId,
      hoveredGroupId,
      hoveredNode,
      hoveredText,
      visibleNodes: nodesForDraw,
      visibleLinks: linksForDraw,
      visibleNodeIds: nodeIdsForDraw,
      revealedGroupIds,
      centerEmoji,
      highlightColor,
      textColor,
      backgroundColor,
      pieBackground: fill,
      circleColor,
      hexaFill: fill,
      trailerBlocking,
      // Mouse interaction (hover/pan/click) must stay frozen during either
      // recording mode — real mouse movement would fight the programmatic
      // hover/reveal/emoji state the capture loop is driving.
      interactionBlocked: trailerBlocking || recording || recordingEmoji,
    };
  };

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

  // --- 4K video recording -------------------------------------------------
  // One single timeline: posts reveal on-canvas one at a time, in order.
  // Whenever the post currently being revealed is one of the most-forwarded
  // ones (reusing the same link-count calculation that already sizes the
  // nodes), its tooltip is shown — and stays showing, unchanged, through
  // every subsequent non-featured post, until the next most-forwarded post
  // is revealed.
  const RECORD_WIDTH = 3840;
  const RECORD_HEIGHT = 2160;
  const RECORD_FRAMERATE = 60;
  const RECORD_SECONDS_PER_POST = 0.3;
  const RECORD_TOP_FORWARDS_COUNT = 150;
  const RECORD_MIN_SECONDS = 8;
  const RECORD_MAX_SECONDS = 90;

  let recording = $state(false);
  let recordProgress = $state(0);

  const stopRecording = () => {
    recording = false;
    recordProgress = 0;
    recordRevealMs = null;
    clearHover();
    sketch.restoreDisplaySize?.();
    sketch.restoreView?.();
    requestRedraw();
  };

  const startRecording = async () => {
    if (recording || recordingEmoji || !pInstance) return;
    const byTime = [...nodes]
      .filter((n) => Number.isFinite(n.post?.dateMs))
      .sort((a, b) => a.post.dateMs - b.post.dateMs);
    if (!byTime.length) return;

    const topForwardIds = new Set(
      [...byTime]
        .sort(
          (a, b) =>
            (linkCountByPost.get(b.post.id) ?? 0) - (linkCountByPost.get(a.post.id) ?? 0)
        )
        .slice(0, Math.min(RECORD_TOP_FORWARDS_COUNT, byTime.length))
        .map((n) => n.id)
    );

    recording = true;
    recordProgress = 0;

    sketch.setCaptureSize?.(RECORD_WIDTH, RECORD_HEIGHT);
    sketch.fitToCanvas?.();
    const canvasEl = sketch.getCanvas?.();

    const totalSeconds = Math.min(
      RECORD_MAX_SECONDS,
      Math.max(RECORD_MIN_SECONDS, byTime.length * RECORD_SECONDS_PER_POST)
    );
    const totalFrames = Math.ceil(totalSeconds * RECORD_FRAMERATE);

    const capturer = new CCapture({
      format: "mp4",
      framerate: RECORD_FRAMERATE,
      name: `network-graph-${datasetSlug ?? "export"}`,
      frameLimit: totalFrames,
    });

    capturer.on("frame", (frameCount) => {
      recordProgress = Math.min(1, frameCount / totalFrames);
    });
    capturer.on("save", () => {
      stopRecording();
    });
    capturer.on("error", (err) => {
      console.error("Recording failed:", err);
      stopRecording();
    });

    await capturer.start();

    let frameIndex = 0;
    let lastRevealIndex = -1;

    const tick = () => {
      if (!capturer.capturing) return;
      requestAnimationFrame(tick);

      const progress = Math.min(1, frameIndex / totalFrames);
      const revealIndex = Math.min(
        byTime.length - 1,
        Math.floor(progress * byTime.length)
      );

      if (revealIndex !== lastRevealIndex) {
        // Walk every post newly revealed since the last frame (there can be
        // more than one when a dataset is too large to give each post its
        // own frame) so none of them are skipped when checking whether it's
        // one of the top-forwarded posts.
        for (let i = lastRevealIndex + 1; i <= revealIndex; i += 1) {
          const node = byTime[i];
          if (topForwardIds.has(node.id)) {
            setHoverState(node, tooltipForPost(node.post));
          }
        }
        lastRevealIndex = revealIndex;
        recordRevealMs = byTime[revealIndex].post.dateMs;
      }
      frameIndex += 1;

      sketch.redrawNow?.();
      capturer.capture(canvasEl);
    };
    tick();
  };

  // --- Emoji-tour recording ------------------------------------------------
  // A second, simpler record mode: show the whole graph (no timeline reveal,
  // no group filter), and step through the top emojis one at a time, filtering
  // the graph down to posts whose top reaction is that emoji while showing it
  // large over the center of the canvas.
  const RECORD_SECONDS_PER_EMOJI = 0.6;

  let recordingEmoji = $state(false);
  let recordEmojiProgress = $state(0);

  const stopEmojiRecording = (previousGroupId) => {
    recordingEmoji = false;
    recordEmojiProgress = 0;
    centerEmoji = null;
    selectedEmoji = null;
    selectedGroupId = previousGroupId;
    sketch.restoreDisplaySize?.();
    sketch.restoreView?.();
    requestRedraw();
  };

  const startEmojiRecording = async () => {
    if (recordingEmoji || recording || !pInstance) return;
    const emojis = topEmojis.map((e) => e.emoji);
    if (!emojis.length) return;

    const previousGroupId = selectedGroupId;
    selectedGroupId = null;

    recordingEmoji = true;
    recordEmojiProgress = 0;

    sketch.setCaptureSize?.(RECORD_WIDTH, RECORD_HEIGHT);
    sketch.fitToCanvas?.();
    const canvasEl = sketch.getCanvas?.();

    const totalFrames = Math.ceil(
      emojis.length * RECORD_SECONDS_PER_EMOJI * RECORD_FRAMERATE
    );

    const capturer = new CCapture({
      format: "mp4",
      framerate: RECORD_FRAMERATE,
      name: `network-graph-emojis-${datasetSlug ?? "export"}`,
      frameLimit: totalFrames,
    });

    capturer.on("frame", (frameCount) => {
      recordEmojiProgress = Math.min(1, frameCount / totalFrames);
    });
    capturer.on("save", () => {
      stopEmojiRecording(previousGroupId);
    });
    capturer.on("error", (err) => {
      console.error("Emoji recording failed:", err);
      stopEmojiRecording(previousGroupId);
    });

    await capturer.start();

    let frameIndex = 0;
    let lastEmojiIndex = -1;

    const tick = () => {
      if (!capturer.capturing) return;
      requestAnimationFrame(tick);

      const progress = Math.min(1, frameIndex / totalFrames);
      const emojiIndex = Math.min(
        emojis.length - 1,
        Math.floor(progress * emojis.length)
      );
      if (emojiIndex !== lastEmojiIndex) {
        lastEmojiIndex = emojiIndex;
        selectedEmoji = emojis[emojiIndex];
        centerEmoji = emojis[emojiIndex];
      }
      frameIndex += 1;

      sketch.redrawNow?.();
      capturer.capture(canvasEl);
    };
    tick();
  };
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
        {recording}
        {recordProgress}
        {recordingEmoji}
        {recordEmojiProgress}
        on:record={startRecording}
        on:recordEmoji={startEmojiRecording}
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

