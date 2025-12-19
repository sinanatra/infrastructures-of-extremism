<script>
  import P5 from "p5-svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import Tooltip from "$lib/Tooltip.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import ExportControl from "$lib/ExportControl.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import { captureCanvasAsPng } from "$lib/captureCanvas.js";
  import { createCamera } from "$lib/pie/camera.js";
  import {
    buildTypeOrder,
    computeGroupMetricMaxes,
    computePieLayout,
  } from "$lib/pie/layout.js";
  import { drawBaseGeometry, drawHoverOverlay, shortenText } from "$lib/pie/render.js";

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
  const topicMap = new Map(
    TOPIC_LABELS.map((label) => [label.toLowerCase(), label])
  );

  const { posts, links } = data;
  const prepared = prepareNetwork(data, { circleColor });
  const preparedNodes = prepared.nodes;
  const trailerGroups = (prepared.slicePaths ?? []).map((slice) => ({
    id: slice.id ?? slice.group?.id ?? slice.label ?? "group",
    label: slice.label ?? slice.group?.label ?? slice.id ?? "group",
  }));
  const trailerAvailable = trailerGroups.length > 0;
  let trailerState = $state(trailerAvailable ? "idle" : "done");
  let trailerBlocking = $state(trailerAvailable);

  const canonicalTopic = (raw) => {
    const candidate = ((Array.isArray(raw) ? raw[0] : raw) ?? "")
      .toString()
      .trim()
      .toLowerCase();
    return topicMap.get(candidate) ?? OTHER_LABEL;
  };

  const graphNodes = preparedNodes.map((n) => {
    const rawTopic =
      (Array.isArray(n.post?.topics) ? n.post.topics : null) ??
      (n.groupId ? [n.groupId] : null);
    const topicLabel = canonicalTopic(rawTopic);
    return {
      id: n.id,
      type: topicLabel,
      radiusLinks: n.radiusLinks ?? 0,
      radiusReactions: n.radiusReactions ?? 0,
      timestamp: n.post?.dateMs ?? 0,
      topEmoji: n.topEmoji ?? null,
      color: n.color ?? circleColor,
      post: n.post ?? null,
      degreeCentrality: n.degreeCentrality ?? n.degree_centrality ?? 0,
    };
  });

  const graphLinks = (links ?? []).map((l) => ({
    source: typeof l.source === "object" ? l.source.id : l.source,
    target: typeof l.target === "object" ? l.target.id : l.target,
  }));

  const linkCountByPost = new Map();
  for (const l of graphLinks) {
    linkCountByPost.set(l.source, (linkCountByPost.get(l.source) ?? 0) + 1);
    linkCountByPost.set(l.target, (linkCountByPost.get(l.target) ?? 0) + 1);
  }

  const topEmojis = $derived.by(() => {
    const counts = new Map();
    for (const node of graphNodes) {
      if (!node.topEmoji) continue;
      counts.set(node.topEmoji, (counts.get(node.topEmoji) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([emoji, count]) => ({ emoji, count }));
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

  const tooltipForPost = (node) => {
    const post = node?.post;
    if (!post) return node?.id ?? "";
    const groupLabel = post.chatLabel ?? post.chat ?? node.type ?? "";
    const lines = [];
    lines.push(post.label || post.id || node.id);
    if (groupLabel) lines.push(`Group: ${groupLabel}`);
    if (post.dateMs) {
      const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
      lines.push(`Date: ${fmt.format(post.dateMs)}`);
    }
    const linkCount = linkCountByPost.get(node.id) ?? 0;
    if (post.reactions)
      lines.push(`Reactions: ${post.reactions.toLocaleString()}`);
    if (linkCount) lines.push(`Links: ${linkCount}`);
    if (post.views) lines.push(`Views: ${post.views.toLocaleString()}`);
    if (post.url) lines.push(post.url);
    return lines.join("\n");
  };

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

  const sketch = (p) => {
    let nodes = [];
    let linksLocal = [];
    let types = [];
    let wedgeData = {};
    let outerRadius = 0;
    const innerRadius = 0;

    const camera = createCamera({
      getViewportSize: () => ({ width: p.width, height: p.height }),
      getWorldSize: () => ({
        width: p.width * increase,
        height: p.height * increase,
      }),
      initialZoom: 1.8,
    });
    let panEnabled = true;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartScreenX = 0;
    let dragStartScreenY = 0;
    let hasDragged = false;

    let hoverNode = null;
    let pressedNodeUrl = null;

    const nodeMargin = dotSize;
    let nodesById = {};
    let groupMaxLinks = {};
    let groupMaxReactions = {};

    const hoverCellSize = 220;
    let hoverGrid = new Map();
    let localRedrawPending = false;

    let renderer = null;

    const endDrag = () => {
      isDragging = false;
    };

    const cancelDrag = () => {
      isDragging = false;
      pressedNodeUrl = null;
    };

    const teardownFns = [];
    const onWindow = (type, handler, options) => {
      window.addEventListener(type, handler, options);
      teardownFns.push(() =>
        window.removeEventListener(type, handler, options)
      );
    };

    let staticLayer = null;
    let nodesLayer = null;
    let linksLayer = null;

    let staticKey = null;
    let nodesKey = null;
    let linksKey = null;
    let linksByNode = new Map();
    let layoutCenter = { cx: 0, cy: 0 };

    const updatePanEnabled = () => {
      const w = p.windowWidth ?? p.width ?? 0;
      panEnabled = w >= 760;
      if (!panEnabled) camera.resetPan();
    };

    const scheduleRedraw = () => {
      if (localRedrawPending) return;
      localRedrawPending = true;
      requestAnimationFrame(() => {
        localRedrawPending = false;
        p.redraw();
      });
    };

    const getLayoutCenter = () => {
      const world = camera.getWorldCenter();
      return {
        cx: world.x - extrudeOffsetX / 2,
        cy: world.y - extrudeOffsetY / 2,
      };
    };

    const rebuildHoverGrid = () => {
      hoverGrid = new Map();
      const key = (x, y) =>
        `${Math.floor(x / hoverCellSize)},${Math.floor(y / hoverCellSize)}`;
      for (const n of nodes) {
        const k = key(n.x, n.y);
        const bucket = hoverGrid.get(k) ?? [];
        bucket.push(n);
        hoverGrid.set(k, bucket);
      }
    };

    const rebuildLinkIndex = () => {
      linksByNode = new Map();
      const add = (id, peer) => {
        if (!id || !peer) return;
        const set = linksByNode.get(id) ?? new Set();
        set.add(peer);
        linksByNode.set(id, set);
      };

      for (const link of linksLocal) {
        add(link.source, link.target);
        add(link.target, link.source);
      }
    };

    const parseGraphData = () => {
      nodes = graphNodes.map((n) => ({ ...n }));
      linksLocal = graphLinks.map((l) => ({ ...l }));
      rebuildLinkIndex();
      types = buildTypeOrder(nodes, TOPIC_LABELS, OTHER_LABEL);
      ({ groupMaxLinks, groupMaxReactions } = computeGroupMetricMaxes(
        nodes,
        types
      ));

      nodesById = {};
      for (const n of nodes) nodesById[n.id] = n;
    };

    const fitZoomToView = () => {
      if (!outerRadius || !Number.isFinite(outerRadius)) return;

      const labelMargin = Math.max(dotSize * 4, 24);
      const r = outerRadius + labelMargin;
      const contentWidth = r * 2 + Math.abs(extrudeOffsetX);
      const contentHeight = r * 2 + Math.abs(extrudeOffsetY);

      const viewportPadding = Math.max(dotSize * 2, 18);
      const safeWidth = Math.max(1, p.width - viewportPadding * 2);
      const safeHeight = Math.max(1, p.height - viewportPadding * 2);

      const fitZoom = Math.min(
        safeWidth / Math.max(contentWidth, 1),
        safeHeight / Math.max(contentHeight, 1)
      );

      const fill = Math.max(0.01, viewFill ?? 1);
      camera.zoom = p.constrain(fitZoom * fill, 0.001, 5);
      camera.resetPan();
    };

    const computeLayout = () => {
      layoutCenter = getLayoutCenter();
      ({ outerRadius, wedgeData } = computePieLayout({
        nodes,
        types,
        cx: layoutCenter.cx,
        cy: layoutCenter.cy,
        dotSize,
        nodeMargin,
        innerRadius,
      }));
      rebuildHoverGrid();
      invalidateLayers();
      rebuildStaticLayer();
      rebuildNodesLayer();
      rebuildLinksLayer();
      fitZoomToView();
    };

    const screenToWorld = (sx, sy) => {
      return camera.screenToWorld(sx, sy);
    };

    const getNodeUnderPoint = (sx, sy) => {
      const m = screenToWorld(sx, sy);
      const cxCell = Math.floor(m.x / hoverCellSize);
      const cyCell = Math.floor(m.y / hoverCellSize);

      let best = null;
      let bestDist = Infinity;
      const hitRadius = dotSize;

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const bucket = hoverGrid.get(`${cxCell + dx},${cyCell + dy}`);
          if (!bucket) continue;
          for (const n of bucket) {
            if (!visibleNodeIds.has(n.id)) continue;
            const d = p.dist(m.x, m.y, n.x, n.y);
            if (d < hitRadius && d < bestDist) {
              best = n;
              bestDist = d;
            }
          }
        }
      }
      return best;
    };

    const nodeMetric = (n) => {
      if (sizeMode === "reactions") return n.radiusReactions || 0;
      return n.radiusLinks || 0;
    };

    const nodeInnerSize = (n) => {
      const metric = nodeMetric(n);
      const groupId = n.type;
      const maxMetric =
        sizeMode === "reactions"
          ? groupMaxReactions[groupId] || 1
          : groupMaxLinks[groupId] || 1;
      const clamped = Math.max(0, Math.min(metric, maxMetric));
      return p.map(clamped, 0, maxMetric, dotSize * 0.2, dotSize);
    };

    // drawBaseGeometry / drawArcText moved to $lib/pie/render.js

    const getStaticKey = () =>
      [
        p.width,
        p.height,
        outerRadius,
        pieFill,
        pieBackground,
        circleColor,
        highlightColor,
        labelFont,
        dotSize,
        extrudeOffsetX,
        extrudeOffsetY,
        types.join("|"),
      ].join("::");

    const getNodesKey = () =>
      [
        p.width,
        p.height,
        outerRadius,
        dotSize,
        sizeMode,
        selectedEmoji ?? "all",
        visibleNodeIds.size,
      ].join("::");

    const getLinksKey = () =>
      [
        p.width,
        p.height,
        outerRadius,
        showLinks ? "on" : "off",
        selectedEmoji ?? "all",
      ].join("::");

    const invalidateLayers = () => {
      staticLayer = null;
      nodesLayer = null;
      linksLayer = null;
      staticKey = null;
      nodesKey = null;
      linksKey = null;
    };

    const ensureStaticFresh = () => {
      const k = getStaticKey();
      if (staticLayer && staticKey === k) return;
      rebuildStaticLayer();
    };

    const ensureNodesFresh = () => {
      const k = getNodesKey();
      if (nodesLayer && nodesKey === k) return;
      rebuildNodesLayer();
    };

    const ensureLinksFresh = () => {
      const k = getLinksKey();
      if (linksLayer && linksKey === k) return;
      rebuildLinksLayer();
    };

    const setLayerQuality = (g) => {
      if (!g) return;
      if (typeof g.pixelDensity === "function") g.pixelDensity(5);
      if (typeof g.smooth === "function") g.smooth();
    };

    const rebuildStaticLayer = () => {
      if (!renderer) return;
      staticLayer = renderer.createGraphics(
        p.width * increase,
        p.height * increase
      );
      setLayerQuality(staticLayer);
      staticLayer.clear();
      drawBaseGeometry(
        staticLayer,
        {
          cx: layoutCenter.cx,
          cy: layoutCenter.cy,
          outerRadius,
          wedgeData,
        },
        { pieFill, circleColor, highlightColor, labelFont, dotSize },
        { extrudeOffsetX, extrudeOffsetY }
      );
      staticKey = getStaticKey();
    };

    const rebuildNodesLayer = () => {
      if (!renderer) return;
      nodesLayer = renderer.createGraphics(
        p.width * increase,
        p.height * increase
      );
      setLayerQuality(nodesLayer);
      nodesLayer.clear();

      for (const n of nodes) {
        if (visibleNodeIds.has(n.id)) {
          const innerSize = nodeInnerSize(n);
          const c = nodesLayer.color(n.color);
          c.setAlpha(160);
          nodesLayer.noStroke();
          nodesLayer.fill(c);
          nodesLayer.ellipse(n.x, n.y, innerSize, innerSize);
        }

        nodesLayer.noFill();
        nodesLayer.stroke(0);
        nodesLayer.strokeWeight(0.1);
        nodesLayer.ellipse(n.x, n.y, dotSize, dotSize);
      }

      nodesKey = getNodesKey();
    };

    const rebuildLinksLayer = () => {
      if (!renderer) return;
      linksLayer = renderer.createGraphics(
        p.width * increase,
        p.height * increase
      );
      setLayerQuality(linksLayer);
      linksLayer.clear();

      if (!showLinks) {
        linksKey = getLinksKey();
        return;
      }

      linksLayer.stroke(highlightColor);
      linksLayer.strokeWeight(0.5);
      linksLayer.noFill();

      for (const l of linksLocal) {
        const a = nodesById[l.source];
        const b = nodesById[l.target];
        if (!a || !b) continue;
        if (!visibleNodeIds.has(a.id) || !visibleNodeIds.has(b.id)) continue;
        linksLayer.line(a.x, a.y, b.x, b.y);
      }

      linksKey = getLinksKey();
    };

    p.setup = () => {
      renderer = p;
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.textAlign(p.CENTER, p.CENTER);
      p.noLoop();
      updatePanEnabled();
      parseGraphData();
      computeLayout();

      onWindow("mouseup", endDrag, { passive: true });
      onWindow("blur", cancelDrag, { passive: true });
      onWindow("touchend", endDrag, { passive: true });
      onWindow("touchcancel", cancelDrag, { passive: true });

      const originalRemove = p.remove?.bind(p);
      p.remove = (...args) => {
        cancelDrag();
        while (teardownFns.length) teardownFns.pop()();
        return originalRemove?.(...args);
      };
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      updatePanEnabled();
      computeLayout();
      scheduleRedraw();
    };

    p.mouseWheel = (event) => {
      if (trailerBlocking) return false;
      camera.zoomAt(event.deltaY, p.mouseX, p.mouseY, {
        step: 0.001,
        minZoom: 0.001,
        maxZoom: 5,
      });
      scheduleRedraw();
      return false;
    };

    p.mousePressed = () => {
      if (trailerBlocking) return;
      const pressed = getNodeUnderPoint(p.mouseX, p.mouseY);
      pressedNodeUrl = pressed?.post?.url?.trim?.() ?? null;
      hasDragged = false;
      if (!panEnabled) return;
      isDragging = true;
      dragStartScreenX = p.mouseX;
      dragStartScreenY = p.mouseY;
      dragStartX = p.mouseX - camera.panX;
      dragStartY = p.mouseY - camera.panY;
    };

    p.mouseDragged = () => {
      if (trailerBlocking) return;
      if (!panEnabled) return;

      if (isDragging && !p.mouseIsPressed) {
        endDrag();
        return;
      }
      if (!isDragging) return;
      camera.panX = p.mouseX - dragStartX;
      camera.panY = p.mouseY - dragStartY;
      if (p.dist(p.mouseX, p.mouseY, dragStartScreenX, dragStartScreenY) > 5)
        hasDragged = true;
      scheduleRedraw();
    };

    p.mouseReleased = () => {
      if (trailerBlocking) return;
      endDrag();
    };

    p.mouseMoved = () => {
      if (trailerBlocking) return;
      if (isDragging && !p.mouseIsPressed) endDrag();
      const next = getNodeUnderPoint(p.mouseX, p.mouseY);
      const changed =
        (!hoverNode && next) ||
        (hoverNode && !next) ||
        (hoverNode && next && hoverNode.id !== next.id);

      hoverNode = next;
      hoveredNode = hoverNode
        ? { id: hoverNode.id, post: hoverNode.post }
        : null;
      hoveredText = hoverNode ? tooltipForPost(hoverNode) : "";

      if (changed) {
        if (p.canvas) p.canvas.style.cursor = hoverNode ? "pointer" : "default";
        scheduleRedraw();
      }
    };

    p.mouseClicked = () => {
      if (trailerBlocking) return;
      const url = hasDragged ? null : pressedNodeUrl;
      pressedNodeUrl = null;
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    };

    const syncLayersForState = () => {
      ensureStaticFresh();
      ensureNodesFresh();
      ensureLinksFresh();
    };

    p.draw = () => {
      p.background(pieBackground);
      p.textSize(8);
      p.strokeJoin(p.ROUND);

      syncLayersForState();

      p.push();
      camera.applyTransform(p);

      if (staticLayer) p.image(staticLayer, 0, 0);
      if (nodesLayer) p.image(nodesLayer, 0, 0);
      if (linksLayer && showLinks) p.image(linksLayer, 0, 0);

      drawHoverOverlay({
        p,
        hoverNode,
        linksByNode,
        nodesById,
        visibleNodeIds,
        nodeInnerSize,
        dotSize,
        highlightColor,
        labelFont,
        labelText: shortenText(hoverNode?.id),
      });
      p.pop();
    };
  };

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
