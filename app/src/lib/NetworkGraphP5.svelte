<script>
  import P5 from "p5-svelte";
  import { onMount } from "svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import TooltipPopup from "$lib/TooltipPopup.svelte";

  export let data;
  const { posts, links } = data;

  const prepared = prepareNetwork(data);
  const {
    width,
    height,
    cx,
    cy,
    slicePaths,
    ringTicks,
    innerTicks,
    outerTick,
    outerRingRadius,
    nodes,
    linkCountByPost,
    sliceForGroup,
  } = prepared;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  let highlightColor = "yellow";

  onMount(() => {
    const cssColor = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--highlite-color");
    highlightColor = (cssColor || highlightColor).trim() || highlightColor;
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let redrawPending = false;

  let sizeMode = "links";
  let showLinks = false;
  let selectedEmoji = null;
  let selectedGroupId = null;
  $: selectedGroup =
    selectedGroupId === null
      ? null
      : (sliceForGroup.get(selectedGroupId)?.group ?? null);

  const tooltipForPost = (post) => {
    const groupLabel = post.chatLabel ?? post.chat;
    const lines = [
      post.label || post.id,
      `Group: ${groupLabel}`,
      `Date: ${formatDate.format(post.dateMs)}`,
    ];
    const linkCount = linkCountByPost.get(post.id) ?? 0;
    if (post.reactions)
      lines.push(`Reactions: ${post.reactions.toLocaleString()}`);
    if (linkCount) lines.push(`Links: ${linkCount}`);
    if (post.views) lines.push(`Views: ${post.views.toLocaleString()}`);
    if (post.url) lines.push(post.url);
    return lines.join("\n");
  };

  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const formatTick = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const linkSegments = links
    .map((l) => {
      const source = nodeById.get(l.source);
      const target = nodeById.get(l.target);
      if (!source || !target) return null;
      return {
        source,
        target,
        crossGroup: source.groupId !== target.groupId,
      };
    })
    .filter(Boolean);

  const hoverCellSize = 220;
  const hoverGrid = new Map();
  const cellKey = (x, y) =>
    `${Math.floor(x / hoverCellSize)},${Math.floor(y / hoverCellSize)}`;
  for (const node of nodes) {
    const key = cellKey(node.x, node.y);
    const bucket = hoverGrid.get(key) ?? [];
    bucket.push(node);
    hoverGrid.set(key, bucket);
  }

  $: topEmojis = (() => {
    const counts = new Map();
    for (const node of nodes) {
      if (!node.topEmoji || node.topEmojiCount <= 0) continue;
      counts.set(
        node.topEmoji,
        (counts.get(node.topEmoji) ?? 0) + node.topEmojiCount
      );
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([emoji, count]) => ({ emoji, count }));
  })();

  $: visibleNodes = nodes.filter(
    (n) =>
      (selectedGroupId === null || n.groupId === selectedGroupId) &&
      (selectedEmoji === null || n.topEmoji === selectedEmoji)
  );

  $: visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  $: visibleLinks = showLinks
    ? linkSegments.filter(
        (link) =>
          visibleNodeIds.has(link.source.id) &&
          visibleNodeIds.has(link.target.id)
      )
    : [];

  $: if (hoveredNode && !visibleNodeIds.has(hoveredNode.id)) {
    clearHover();
  }

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
  let pInstance = null;
  let canvasSize = { w: 0, h: 0 };
  let controlsEl = null;
  const minScale = 0.1;
  const maxScale = 0.9;
  let view = {
    scale: 0.6,
    panX: 0,
    panY: 0,
  };

  const worldToScreen = (x, y) => ({
    x: (x - cx) * view.scale + canvasSize.w / 2 + view.panX,
    y: (y - cy) * view.scale + canvasSize.h / 2 + view.panY,
  });

  const screenToWorld = (x, y) => ({
    x: (x - canvasSize.w / 2 - view.panX) / view.scale + cx,
    y: (y - canvasSize.h / 2 - view.panY) / view.scale + cy,
  });

  let hoveredNode = null;
  let hoveredScreenPos = null;
  let hoveredText = "";
  const hitSliceLabel = (sx, sy, tolerance = 32) => {
    return slicePaths.some((slice) => {
      const pos = worldToScreen(slice.labelPos.x, slice.labelPos.y);
      return Math.hypot(pos.x - sx, pos.y - sy) <= tolerance;
    });
  };
  let cursorMode = "grab";

  const setCursor = (mode, canvasOverride = null) => {
    const canvas = canvasOverride ?? pInstance?.canvas;
    if (!canvas) return;
    if (mode === cursorMode) return;
    cursorMode = mode;
    canvas.style.cursor = mode;
  };

  const clearHover = () => {
    hoveredNode = null;
    hoveredScreenPos = null;
    hoveredText = "";
  };

  const updateHover = (sx, sy) => {
    const world = screenToWorld(sx, sy);
    let best = null;
    let bestDist = Infinity;
    const hitTol = 14 / view.scale;
    const cxCell = Math.floor(world.x / hoverCellSize);
    const cyCell = Math.floor(world.y / hoverCellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = hoverGrid.get(`${cxCell + dx},${cyCell + dy}`);
        if (!bucket) continue;
        for (const node of bucket) {
          if (!visibleNodeIds.has(node.id)) continue;
          const rad =
            sizeMode === "links" ? node.radiusLinks : node.radiusReactions;
          const dxn = node.x - world.x;
          const dyn = node.y - world.y;
          const dist = Math.hypot(dxn, dyn);
          const maxHit = rad + hitTol;
          if (dist <= maxHit && dist < bestDist) {
            best = node;
            bestDist = dist;
          }
        }
      }
    }
    if (best) {
      hoveredNode = best;
      hoveredScreenPos = worldToScreen(best.x, best.y);
      hoveredText = tooltipForPost(best.post);
    } else {
      clearHover();
    }
  };

  const requestRedraw = () => {
    if (!pInstance || redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      if (pInstance) pInstance.redraw();
    });
  };

  // Redraw whenever the state changes (filters, hover, zoom, etc.)
  $: if (pInstance) {
    visibleNodes;
    visibleLinks;
    selectedGroupId;
    selectedEmoji;
    sizeMode;
    showLinks;
    highlightColor;
    hoveredNode;
    view.scale;
    view.panX;
    view.panY;
    requestRedraw();
  }

  const setupCanvasSize = (p) => {
    const w = canvasParent?.clientWidth || window.innerWidth || width;
    const h = canvasParent?.clientHeight || window.innerHeight || height;
    canvasSize = { w, h };
    p.resizeCanvas(w, h, true);
  };

  const zoomAt = (deltaY, sx, sy) => {
    const zoomStep = 1.15;
    const direction = deltaY > 0 ? 1 / zoomStep : zoomStep;
    const nextScale = clamp(view.scale * direction, minScale, maxScale);
    const worldBefore = screenToWorld(sx, sy);
    view.scale = nextScale;
    const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
    view.panX += sx - screenAfter.x;
    view.panY += sy - screenAfter.y;
    requestRedraw();
  };

  let isPanning = false;
  let panStart = null;
  let panPointerId = null;
  let dragDistance = 0;

  const handleClick = (sx, sy) => {
    updateHover(sx, sy);
    if (hoveredNode?.post?.url) {
      window.open(hoveredNode.post.url, "_blank", "noreferrer");
      return;
    }

    // Toggle group selection if label was clicked
    const hit = slicePaths.find((slice) => {
      const pos = worldToScreen(slice.labelPos.x, slice.labelPos.y);
      const dx = pos.x - sx;
      const dy = pos.y - sy;
      const dist = Math.hypot(dx, dy);
      return dist <= 36;
    });
    if (hit) {
      toggleGroup(hit.id);
    }
  };

  const createSketch = () => {
    return (p) => {
      const textSizeFor = (base) => {
        const s = clamp(view.scale, minScale, maxScale);
        return base * (0.8 + s * 0.8);
      };

      p.setup = () => {
        const w = canvasParent?.clientWidth || window.innerWidth || width;
        const h = canvasParent?.clientHeight || window.innerHeight || height;
        p.createCanvas(w, h, p.P2D);
        // p.pixelDensity(1);
        canvasSize = { w, h };
        p.noLoop();
        p.angleMode(p.RADIANS);
        p.textFont("sans-serif");
        if (p.canvas) {
          p.canvas.style.touchAction = "none";
          setCursor("grab");
        }
      };

      p.windowResized = () => {
        setupCanvasSize(p);
        requestRedraw();
      };

      const overControls = (evt) => {
        if (!controlsEl || !evt) return false;
        if (evt.target && controlsEl.contains(evt.target)) return true;
        const rect = controlsEl.getBoundingClientRect();
        const touch = evt.touches?.[0];
        const x = evt.clientX ?? touch?.clientX ?? 0;
        const y = evt.clientY ?? touch?.clientY ?? 0;
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      };

      const startPan = (x, y) => {
        isPanning = true;
        panStart = {
          x,
          y,
          panX: view.panX,
          panY: view.panY,
        };
        dragDistance = 0;
        setCursor("grabbing");
      };

      const movePan = (x, y) => {
        if (!isPanning || !panStart) return;
        const dx = x - panStart.x;
        const dy = y - panStart.y;
        dragDistance = Math.max(dragDistance, Math.hypot(dx, dy));
        view.panX = panStart.panX + dx;
        view.panY = panStart.panY + dy;
        setCursor("grabbing");
        requestRedraw();
      };

      const endPan = (x, y) => {
        if (!isPanning) return;
        isPanning = false;
        updateHover(x, y);
        if (dragDistance < 6) {
          handleClick(x, y);
          requestRedraw();
        }
        const clickable = Boolean(hoveredNode) || hitSliceLabel(x, y);
        setCursor(clickable ? "pointer" : "grab");
        requestRedraw();
      };

      p.mousePressed = (evt) => {
        if (evt.button !== 0 || overControls(evt)) return;
        startPan(p.mouseX, p.mouseY);
      };

      p.mouseDragged = (evt) => {
        if (!isPanning || overControls(evt)) return;
        movePan(p.mouseX, p.mouseY);
        return false;
      };

      p.mouseReleased = (evt) => {
        if (!isPanning) return;
        endPan(p.mouseX, p.mouseY);
      };

      p.mouseMoved = (evt) => {
        if (isPanning || overControls(evt)) return;
        updateHover(p.mouseX, p.mouseY);
        const clickable = Boolean(hoveredNode) || hitSliceLabel(p.mouseX, p.mouseY);
        setCursor(clickable ? "pointer" : "grab");
        requestRedraw();
      };

      p.mouseWheel = (event) => {
        if (overControls(event)) return false;
        zoomAt(event.deltaY, event.offsetX, event.offsetY);
        return false;
      };

      const drawSlices = () => {
        p.push();
        p.noFill();
        p.stroke(highlightColor);
        p.strokeWeight(0.9 / view.scale);
        for (const slice of slicePaths) {
          if (
            !Number.isFinite(slice.start) ||
            !Number.isFinite(slice.end) ||
            !Number.isFinite(outerRingRadius)
          )
            continue;
          p.arc(
            cx,
            cy,
            outerRingRadius * 2,
            outerRingRadius * 2,
            slice.start,
            slice.end
          );
        }
        p.pop();

        p.push();
        for (const slice of slicePaths) {
          const pos = slice.labelPos;
          p.push();
          p.translate(pos.x, pos.y);
          p.rotate((slice.labelRotation * Math.PI) / 180);
          p.textAlign(slice.labelAnchor === "end" ? p.RIGHT : p.LEFT, p.CENTER);
          const active =
            selectedGroupId === null || selectedGroupId === slice.id;
          p.fill(active ? highlightColor : "rgba(255,255,255,0.35)");
          p.noStroke();
          p.textStyle(p.NORMAL);
          p.textSize(textSizeFor(14));
          p.text(slice.label, 0, 0);
          p.pop();
        }
        p.pop();
      };

      const drawLinks = () => {
        if (!visibleLinks.length) return;
        p.push();
        p.noFill();
        const margin = 120;
        for (const link of visibleLinks) {
          const { source, target, crossGroup } = link;
          const s = worldToScreen(source.x, source.y);
          const t = worldToScreen(target.x, target.y);
          const outLeft = s.x < -margin && t.x < -margin;
          const outRight =
            s.x > canvasSize.w + margin && t.x > canvasSize.w + margin;
          const outTop = s.y < -margin && t.y < -margin;
          const outBottom =
            s.y > canvasSize.h + margin && t.y > canvasSize.h + margin;
          if (outLeft || outRight || outTop || outBottom) continue;

          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          const offsetX = midX - cx;
          const offsetY = midY - cy;
          const ctrlX = midX + offsetX * 0.14;
          const ctrlY = midY + offsetY * 0.14;
          const stroke = p.color(highlightColor);
          stroke.setAlpha(crossGroup ? 160 : 110);
          p.stroke(stroke);
          p.strokeWeight((crossGroup ? 0.9 : 0.7) / view.scale);
          p.bezier(
            source.x,
            source.y,
            ctrlX,
            ctrlY,
            ctrlX,
            ctrlY,
            target.x,
            target.y
          );
        }
        p.pop();
      };

      const drawRings = () => {
        p.push();
        p.noFill();
        const ctx = p.drawingContext;
        if (ctx?.setLineDash) {
          ctx.setLineDash([8 / view.scale, 10 / view.scale]);
        }
        p.stroke(highlightColor);
        p.strokeWeight(0.2 / view.scale);
        p.noFill();

        for (const tick of innerTicks) {
          p.circle(cx, cy, tick.radius * 2);
          p.push();
          p.noStroke();
          p.fill(highlightColor);
          p.textAlign(p.CENTER, p.BOTTOM);
          p.textSize(textSizeFor(12));
          p.text(
            formatTick.format(tick.time),
            cx,
            cy - tick.radius - 8 / view.scale
          );
          p.pop();
        }
        if (outerTick) {
          p.circle(cx, cy, outerRingRadius * 2);
          p.push();
          p.noStroke();
          p.fill(highlightColor);
          p.textAlign(p.CENTER, p.BOTTOM);
          p.textSize(textSizeFor(14));
          p.text(
            formatTick.format(outerTick.time),
            cx,
            cy - outerRingRadius - 10 / view.scale
          );
          p.pop();
        }
        if (ctx?.setLineDash) ctx.setLineDash([]);
        p.pop();
      };

      const drawNodes = () => {
        p.push();
        const margin = 120;
        for (const node of visibleNodes) {
          const screenPos = worldToScreen(node.x, node.y);
          if (
            screenPos.x < -margin ||
            screenPos.x > canvasSize.w + margin ||
            screenPos.y < -margin ||
            screenPos.y > canvasSize.h + margin
          ) {
            continue;
          }
          const r =
            sizeMode === "links" ? node.radiusLinks : node.radiusReactions;
          p.fill(node.color);
          p.noStroke();
          p.circle(node.x, node.y, r * 2);
        }
        p.pop();

        if (hoveredNode) {
          const r =
            sizeMode === "links"
              ? hoveredNode.radiusLinks
              : hoveredNode.radiusReactions;
          p.push();
          p.noFill();
          const halo = p.color(highlightColor);
          halo.setAlpha(220);
          p.stroke(halo);
          p.strokeWeight(1.8 / view.scale);
          p.circle(hoveredNode.x, hoveredNode.y, r * 2 + 6 / view.scale);
          p.pop();
        }
      };

      p.draw = () => {
        p.background(0);
        p.push();
        p.translate(canvasSize.w / 2 + view.panX, canvasSize.h / 2 + view.panY);
        p.scale(view.scale);
        p.translate(-cx, -cy);

        drawSlices();
        drawLinks();
        drawRings();
        drawNodes();

        p.pop();
      };
    };
  };

  const handleP5Instance = (event) => {
    pInstance = event.detail?.instance ?? null;
    canvasParent = event.detail?.container ?? null;
    requestRedraw();
  };

  const sketch = createSketch();
</script>

<section class="relative h-screen text-white overflow-hidden bg-black">
  <div class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none">
    <div
      class="pointer-events-auto max-w-5xl mx-auto"
      bind:this={controlsEl}
      on:pointerdown|stopPropagation
      on:pointermove|stopPropagation
      on:pointerup|stopPropagation
      on:wheel|stopPropagation
      on:click|stopPropagation
    >
      <NetworkControls
        counts={{
          posts: posts.length,
          groups: slicePaths.length,
          links: links.length,
        }}
        {selectedGroup}
        {sizeMode}
        {showLinks}
        {topEmojis}
        {selectedEmoji}
        {subscriberText}
        on:sizeMode={(event) => {
          sizeMode = event.detail;
        }}
        on:showLinks={(event) => {
          showLinks = event.detail;
        }}
        on:selectEmoji={(event) => {
          selectedEmoji = event.detail;
          if (
            selectedEmoji &&
            hoveredNode &&
            hoveredNode.topEmoji !== selectedEmoji
          ) {
            clearHover();
          }
        }}
        on:clearSelection={() => (selectedGroupId = null)}
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

  {#if hoveredNode && hoveredScreenPos}
    <TooltipPopup
      x={hoveredScreenPos.x}
      y={hoveredScreenPos.y}
      text={hoveredText}
    />
  {/if}
</section>

<style>
  :global(canvas) {
    display: block;
  }
</style>
