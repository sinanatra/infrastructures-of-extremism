<script>
  import P5 from "p5-svelte";
  import ExportControl from "$lib/ExportControl.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import { captureCanvasAsPng } from "$lib/captureCanvas.js";
  import { prepareTreeData } from "$lib/tree/prepare.js";
  import {
    BASE_RADIUS,
    LAYER_GAP,
    POLYGON_SIDES,
    ANIMATION_FRAMES_PER_RING,
    ANIMATION_FRAMES_PER_GROUP,
    FONT_SIZE_THRESHOLDS,
    DEFAULT_FONT_SIZE,
    CENTER_NODE_FONT_SIZE,
  } from "$lib/tree/constants.js";

  let {
    data,
    backgroundColor = "#000000",
    circleColor = "#ffffff",
    textColor = "#ffffff",
    highlightColor = "yellow",
  } = $props();

  const {
    theme,
    brokenNodeColor,
    brokenEdgeColor,
    nodes,
    nodeIndex,
    linkSegments,
    revealGroups,
    balancedVisualRings,
    ringNodeCountByIndex,
    seed,
    trailerGroups,
    trailerSeedLabel,
    densityScaleForRing,
  } = prepareTreeData(data, { backgroundColor, circleColor, textColor, highlightColor });

  const trailerAvailable = trailerGroups.length > 0;
  let trailerState = $state(trailerAvailable ? "idle" : "done");
  let trailerBlocking = $state(trailerAvailable);

  // Animation state (mutated inside the p5 draw loop)
  let animationFrame = 0;
  let groupsVisible = 0;
  const nodesVisible = new Set();

  // Canvas / interaction state
  let pInstance = null;
  let canvasParent = null;
  let canvasSize = { w: 0, h: 0 };
  let view = { scale: 0.8, panX: 0, panY: 0 };
  let hoveredId = null;
  const hoveredNode = $derived(nodes.find((n) => n.id === hoveredId) ?? null);
  let cursorMode = "grab";
  let redrawPending = false;
  let isPanning = false;
  let panStart = null;
  let dragDistance = 0;

  // ── Utilities ────────────────────────────────────────────────────────────

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const worldToScreen = (x, y) => {
    const cx = canvasSize.w / 2 + view.panX;
    const cy = canvasSize.h / 2 + view.panY;
    return { x: x * view.scale + cx, y: y * view.scale + cy };
  };

  const screenToWorld = (x, y) => {
    const cx = canvasSize.w / 2 + view.panX;
    const cy = canvasSize.h / 2 + view.panY;
    return { x: (x - cx) / view.scale, y: (y - cy) / view.scale };
  };

  const setCursor = (mode) => {
    if (!pInstance?.canvas || cursorMode === mode) return;
    cursorMode = mode;
    pInstance.canvas.style.cursor = mode;
  };

  const nodeRadiusFor = (subs, node = null) => {
    if (!subs || subs <= 0) {
      if (!node || node.layerIndex === 0) return 10;
      return 8 * densityScaleForRing(node.visualRing ?? node.layerIndex);
    }
    const v = Math.log10(subs + 10);
    let r = clamp(1 + v * 2, 4, 10);
    if (node && node.layerIndex > 0) r *= densityScaleForRing(node.visualRing ?? node.layerIndex);
    return clamp(r, 3.5, 10);
  };

  const fontSizeFor = (node) => {
    if (!node || node.layerIndex === 0) return CENTER_NODE_FONT_SIZE;
    const ring = node.visualRing ?? node.layerIndex;
    const count = ringNodeCountByIndex[Math.max(0, ring - 1)] ?? 1;
    for (const { minCount, size } of FONT_SIZE_THRESHOLDS) {
      if (count > minCount) return size;
    }
    return DEFAULT_FONT_SIZE;
  };

  const requestRedraw = () => {
    if (!pInstance || redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      pInstance?.redraw();
    });
  };

  const setupCanvasSize = (p) => {
    const w = canvasParent?.clientWidth || window.innerWidth || 1200;
    const h = canvasParent?.clientHeight || window.innerHeight || 800;
    canvasSize = { w, h };
    p.resizeCanvas(w, h, true);
  };

  const updateHover = (sx, sy) => {
    const world = screenToWorld(sx, sy);
    let best = null;
    let bestDist = Infinity;
    const tol = 18 / view.scale;
    for (const node of nodes) {
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= nodeRadiusFor(node.subscribers, node) + tol && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    const nextId = best?.id ?? null;
    if (nextId !== hoveredId) {
      hoveredId = nextId;
      setCursor(hoveredId ? "pointer" : "grab");
      requestRedraw();
    }
  };

  const handleClick = (sx, sy) => {
    if (trailerBlocking) return;
    updateHover(sx, sy);
    if (hoveredId) window.open(`https://t.me/${hoveredId}`, "_blank", "noreferrer");
  };

  const zoomAt = (deltaY, sx, sy) => {
    const dir = deltaY > 0 ? 1 / 1.1 : 1.1;
    const nextScale = clamp(view.scale * dir, 0.25, 2.5);
    const before = screenToWorld(sx, sy);
    view.scale = nextScale;
    const after = worldToScreen(before.x, before.y);
    view.panX += sx - after.x;
    view.panY += sy - after.y;
    requestRedraw();
  };

  const exportPng = async () => {
    if (!pInstance?.canvas) return;
    try {
      pInstance.redraw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await captureCanvasAsPng(pInstance.canvas, data?.dataset?.slug ?? "tree");
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      requestRedraw();
    }
  };

  // ── p5 sketch ────────────────────────────────────────────────────────────

  const createSketch = () => (p) => {
    p.setup = () => {
      const w = canvasParent?.clientWidth || window.innerWidth || 1200;
      const h = canvasParent?.clientHeight || window.innerHeight || 800;
      p.createCanvas(w, h, p.P2D);
      canvasSize = { w, h };
      if (p.canvas) { p.canvas.style.touchAction = "none"; setCursor("grab"); }
    };

    p.windowResized = () => { setupCanvasSize(p); requestRedraw(); };

    p.mouseMoved = () => {
      if (trailerBlocking || isPanning) return;
      updateHover(p.mouseX, p.mouseY);
    };

    p.mousePressed = (evt) => {
      if (trailerBlocking || evt.button !== 0) return;
      isPanning = true;
      panStart = { x: p.mouseX, y: p.mouseY, panX: view.panX, panY: view.panY };
      dragDistance = 0;
      setCursor("grabbing");
    };

    p.mouseDragged = () => {
      if (trailerBlocking || !isPanning || !panStart) return;
      const dx = p.mouseX - panStart.x;
      const dy = p.mouseY - panStart.y;
      dragDistance = Math.max(dragDistance, Math.hypot(dx, dy));
      view.panX = panStart.panX + dx;
      view.panY = panStart.panY + dy;
      requestRedraw();
    };

    p.mouseReleased = () => {
      if (trailerBlocking || !isPanning) return;
      isPanning = false;
      setCursor(hoveredId ? "pointer" : "grab");
      if (dragDistance < 6) handleClick(p.mouseX, p.mouseY);
      else updateHover(p.mouseX, p.mouseY);
    };

    p.mouseWheel = (event) => {
      if (trailerBlocking) return false;
      zoomAt(event.deltaY, event.offsetX, event.offsetY);
      return false;
    };

    p.touchStarted = (evt) => {
      if (trailerBlocking) return false;
      const [touch] = evt.touches ?? [];
      if (touch) {
        const rect = p.canvas?.getBoundingClientRect();
        const x = rect ? touch.clientX - rect.left : touch.clientX;
        const y = rect ? touch.clientY - rect.top : touch.clientY;
        isPanning = true;
        panStart = { x, y, panX: view.panX, panY: view.panY };
        dragDistance = 0;
        setCursor("grabbing");
      }
      return false;
    };

    p.touchMoved = (evt) => {
      if (trailerBlocking || !isPanning || !panStart) return false;
      const [touch] = evt.touches ?? [];
      if (!touch) return false;
      const rect = p.canvas?.getBoundingClientRect();
      const x = rect ? touch.clientX - rect.left : touch.clientX;
      const y = rect ? touch.clientY - rect.top : touch.clientY;
      dragDistance = Math.max(dragDistance, Math.hypot(x - panStart.x, y - panStart.y));
      view.panX = panStart.panX + (x - panStart.x);
      view.panY = panStart.panY + (y - panStart.y);
      requestRedraw();
      return false;
    };

    p.touchEnded = (evt) => {
      if (trailerBlocking || !isPanning) return false;
      isPanning = false;
      setCursor(hoveredId ? "pointer" : "grab");
      if (!(evt.touches ?? []).length && dragDistance < 6) {
        const last = evt.changedTouches?.[0];
        if (last) {
          const rect = p.canvas?.getBoundingClientRect();
          handleClick(
            rect ? last.clientX - rect.left : last.clientX,
            rect ? last.clientY - rect.top : last.clientY,
          );
        }
      }
      return false;
    };

    p.draw = () => {
      p.background(theme.backgroundColor);
      p.push();
      p.translate(canvasSize.w / 2 + view.panX, canvasSize.h / 2 + view.panY);
      p.scale(view.scale);

      const centerNodeIdx = seed && nodeIndex.has(seed) ? nodeIndex.get(seed) : 0;
      const centerNode = nodes[centerNodeIdx] ?? null;

      // Animation progress
      animationFrame += 1;
      const ringCount = balancedVisualRings.length || 1;
      const tRaw = animationFrame / (ANIMATION_FRAMES_PER_RING * ringCount);
      const t = clamp(tRaw, 0, 1);
      const maxRingFloat = 1 + t * (ringCount - 1);
      const alphaFactor = (ri) => clamp(1 - Math.max(0, ri - maxRingFloat), 0.15, 1);

      // Reveal nodes group by group
      const targetGroups = Math.min(
        revealGroups.length,
        Math.floor(animationFrame / ANIMATION_FRAMES_PER_GROUP) + 1,
      );
      if (targetGroups > groupsVisible) {
        for (let gi = groupsVisible; gi < targetGroups; gi += 1) {
          for (const id of revealGroups[gi] ?? []) nodesVisible.add(id);
        }
        groupsVisible = targetGroups;
      }
      const nodeVisible = (node) => Boolean(node && nodesVisible.has(node.id));

      // Center polygon
      const centerRadius = BASE_RADIUS - LAYER_GAP * 0.45;
      if (centerRadius > 0 && centerNode) {
        const c = p.color(theme.highlightColor);
        c.setAlpha(90);
        p.noFill();
        p.stroke(c);
        p.beginShape();
        for (let k = 0; k < POLYGON_SIDES; k++) {
          const a = -Math.PI / 2 + (Math.PI * 2 * k) / POLYGON_SIDES;
          p.vertex(Math.cos(a) * centerRadius, Math.sin(a) * centerRadius);
        }
        p.endShape(p.CLOSE);
      }

      // Ring polygons
      balancedVisualRings.forEach((_, rIndex) => {
        const ri = rIndex + 1;
        if (ri > maxRingFloat + 0.001) return;
        const radius = BASE_RADIUS + rIndex * LAYER_GAP;
        const c = p.color(theme.highlightColor);
        c.setAlpha(60 * alphaFactor(ri));
        p.noFill();
        p.stroke(c);
        p.beginShape();
        for (let k = 0; k < POLYGON_SIDES; k++) {
          const a = -Math.PI / 2 + (Math.PI * 2 * k) / POLYGON_SIDES;
          p.vertex(Math.cos(a) * radius, Math.sin(a) * radius);
        }
        p.endShape(p.CLOSE);
      });

      // Edges
      p.noFill();
      for (const link of linkSegments) {
        if (!nodeVisible(link.source) || !nodeVisible(link.target)) continue;
        if (hoveredId && link.source.id !== hoveredId && link.target.id !== hoveredId) continue;
        const isBroken = link.kind === "broken";
        const c = p.color(isBroken ? brokenEdgeColor : theme.highlightColor);
        c.setAlpha(isBroken ? clamp(110 + Math.log1p(link.count) * 35, 110, 255) : 150);
        p.stroke(c);
        p.strokeWeight(isBroken ? 1.4 : 1);
        if (isBroken) p.drawingContext.setLineDash([9, 7]);
        p.line(link.source.x, link.source.y, link.target.x, link.target.y);
        if (isBroken) p.drawingContext.setLineDash([]);
      }

      // Node circles
      for (const node of nodes) {
        if (!nodeVisible(node)) continue;
        const r = nodeRadiusFor(node.subscribers, node);
        const ri = node.layerIndex === 0 ? 0 : (node.visualRing ?? node.layerIndex);
        const aFactor = node.layerIndex === 0 ? 1 : alphaFactor(ri);
        const baseColor = p.color(
          node.layerIndex === 0 ? theme.highlightColor
            : node.isBroken ? brokenNodeColor
            : theme.circleColor,
        );
        baseColor.setAlpha(255 * aFactor);
        p.fill(baseColor);
        p.stroke(node.isBroken ? brokenEdgeColor : theme.backgroundColor);
        p.circle(node.x, node.y, r * 2);
      }

      // Node labels
      for (const node of nodes) {
        if (!nodeVisible(node)) continue;
        const r = nodeRadiusFor(node.subscribers, node);
        p.fill(p.color(theme.textColor));
        p.textSize(fontSizeFor(node));
        const labelDist = node.layerIndex === 0 ? 22 : r + 10;
        const isLeftSide = node.angle > Math.PI / 2 && node.angle < (3 * Math.PI) / 2;
        p.strokeWeight(2);
        p.stroke(theme.backgroundColor);
        p.push();
        p.translate(node.x, node.y);
        p.rotate(isLeftSide ? node.angle + Math.PI : node.angle);
        p.textAlign(isLeftSide ? p.RIGHT : p.LEFT, p.CENTER);
        p.text(node.label, isLeftSide ? -labelDist : labelDist, 0);
        p.pop();
      }

      // Center node highlight ring
      if (centerNode && nodeVisible(centerNode)) {
        const r = nodeRadiusFor(centerNode.subscribers, centerNode);
        p.strokeWeight(2);
        p.circle(centerNode.x, centerNode.y, r * 2 + 10);
      }

      p.pop();
    };
  };

  const sketch = createSketch();

  const handleInstance = (event) => {
    pInstance = event.detail?.instance ?? null;
    canvasParent = event.detail?.container ?? null;
    if (pInstance) { setupCanvasSize(pInstance); requestRedraw(); }
  };
</script>

<section
  class="relative h-screen overflow-hidden"
  style={`background:${theme.backgroundColor}; color:${theme.textColor};`}
>
  <div
    class="absolute top-4 right-4 z-20 pointer-events-auto"
    hidden={trailerState !== "done"}
  >
    <ExportControl label="Export PNG" on:export={exportPng} />
  </div>

  {#if trailerState === "done" && hoveredNode}
    <aside
      class="absolute bottom-4 left-4 z-20 pointer-events-none max-w-xs rounded border px-3 py-2 text-xs backdrop-blur-sm"
      style={`border-color:${theme.highlightColor}; background:${theme.backgroundColor}CC; color:${theme.textColor};`}
    >
      <div class="font-semibold">{hoveredNode.label}</div>
      <div>@{hoveredNode.id}</div>
      <div>Depth: {hoveredNode.layerIndex}</div>
      {#if hoveredNode.subscribers}
        <div>Subscribers: {hoveredNode.subscribers}</div>
      {/if}
      {#if hoveredNode.isBroken}
        <div style={`color:${brokenNodeColor};`}>
          Broken target ({hoveredNode.brokenStatus || "resolve failed"})
        </div>
        {#if hoveredNode.brokenMentions}
          <div>Mentions: {hoveredNode.brokenMentions}</div>
        {/if}
      {/if}
    </aside>
  {/if}

  <P5
    className="w-full h-full"
    {sketch}
    aria-label="Radial network canvas"
    role="img"
    on:instance={handleInstance}
  />

  {#if trailerAvailable}
    <Trailer
      seedLabel={trailerSeedLabel}
      highlightColor={theme.highlightColor}
      backgroundColor={theme.backgroundColor}
      textColor={theme.textColor}
      introSummary="the network shows links, mentions, forwards, and broken targets."
      on:block={(event) => {
        trailerBlocking = event.detail?.blocking ?? false;
      }}
    />
  {/if}
</section>

<style>
  :global(canvas) {
    display: block;
    background: white
  }
</style>
