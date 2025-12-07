<script>
  import P5 from "p5-svelte";
  import { onMount } from "svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import Tooltip from "$lib/Tooltip.svelte";
  import Trailer from "$lib/Trailer.svelte";

  let {
    data,
    backgroundColor = "#000000",
    circleColor = "#ffffff",
    textColor = "#ffffff",
    highlightColor: highlightColorProp = "yellow",
    datasetSlug = null,
  } = $props();

  const { posts, links } = data;

  const prepared = prepareNetwork(data, { circleColor });
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

  let highlightColorFallback = $state(null);
  onMount(() => {
    if (highlightColorProp) return;
    const cssColor = getComputedStyle(
      document.documentElement
    ).getPropertyValue("--highlite-color");
    const fallback = (cssColor || "").trim();
    highlightColorFallback = fallback || "yellow";
  });

  const highlightColor = $derived(
    highlightColorProp ?? highlightColorFallback ?? "yellow"
  );

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let redrawPending = false;

  let sizeMode = $state("links");
  let showLinks = $state(false);
  let selectedEmoji = $state(null);
  let selectedGroupId = $state(null);
  const selectedGroup = $derived(
    selectedGroupId === null
      ? null
      : sliceForGroup.get(selectedGroupId)?.group ?? null
  );

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

  const topEmojis = $derived.by(() => {
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
  });

  const trailerGroups = (() => {
    const labelById = new Map(
      slicePaths.map((s) => [s.id, s.group?.label || s.group?.id || s.id])
    );
    const startId = (() => {
      if (!datasetSlug) return slicePaths[0]?.id ?? null;
      const match = slicePaths.find(
        (s) => s.id && s.id.toLowerCase() === datasetSlug.toLowerCase()
      );
      return match?.id ?? slicePaths[0]?.id ?? null;
    })();

    const edgeMap = new Map();
    for (const link of linkSegments) {
      const a = link.source.groupId;
      const b = link.target.groupId;
      if (!a || !b || a === b) continue;
      const key = a < b ? `${a}::${b}` : `${b}::${a}`;
      const t = Math.min(link.source.post.dateMs, link.target.post.dateMs);
      const prev = edgeMap.get(key);
      if (!prev || t < prev.time) {
        edgeMap.set(key, { a, b, time: t });
      }
    }
    const edges = [...edgeMap.values()].sort((x, y) => x.time - y.time);

    const visited = new Set();
    const order = [];
    if (startId) {
      visited.add(startId);
      order.push(startId);
    }
    for (const e of edges) {
      const { a, b } = e;
      if (visited.has(a) && !visited.has(b)) {
        visited.add(b);
        order.push(b);
      } else if (visited.has(b) && !visited.has(a)) {
        visited.add(a);
        order.push(a);
      }
    }
    for (const s of slicePaths) {
      if (!visited.has(s.id)) {
        visited.add(s.id);
        order.push(s.id);
      }
    }

    return order.map((id) => ({
      id,
      label: labelById.get(id) ?? id ?? "group",
    }));
  })();
  const trailerAvailable = trailerGroups.length > 0;
  const groupLabelById = new Map(
    slicePaths.map((s) => [s.id, s.group?.label || s.group?.id || s.id])
  );
  let trailerVisibleGroups = $state(null);
  let trailerState = $state(trailerAvailable ? "idle" : "done");
  let trailerBlocking = $state(trailerAvailable);

  const visibleNodes = $derived.by(() => {
    const base =
      trailerVisibleGroups === null
        ? nodes
        : nodes.filter((n) => trailerVisibleGroups.has(n.groupId));
    if (selectedEmoji === null) return base;
    return base.filter((n) => n.topEmoji === selectedEmoji);
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

  $effect(() => {
    if (hoveredNode && !visibleNodeIds.has(hoveredNode.id)) {
      clearHover();
    }
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
  let canvasSize = { w: 0, h: 0 };
  let controlsEl = null;
  const minScale = 0.1;
  const maxScale = 0.9;
  let view = $state({
    scale: 0.35,
    panX: 0,
    panY: 0,
  });
  const textSizeFor = (base) => {
    const s = clamp(view.scale, minScale, maxScale);

    const scaled = base * (1.3 - s * 0.6);
    return clamp(scaled, base * 0.7, base * 1.3);
  };
  const labelMetricsCache = new Map();
  let lastLabelScale = view.scale;
  $effect(() => {
    if (view.scale !== lastLabelScale) {
      labelMetricsCache.clear();
      lastLabelScale = view.scale;
    }
  });

  const worldToScreen = (x, y) => ({
    x: (x - cx) * view.scale + canvasSize.w / 2 + view.panX,
    y: (y - cy) * view.scale + canvasSize.h / 2 + view.panY,
  });

  const screenToWorld = (x, y) => ({
    x: (x - canvasSize.w / 2 - view.panX) / view.scale + cx,
    y: (y - canvasSize.h / 2 - view.panY) / view.scale + cy,
  });

  const rotatePoint = (point, origin, angle) => {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    return {
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos,
    };
  };

  const sliceLabelMetrics = (slice) => {
    if (!pInstance) return null;
    const size = textSizeFor(14);
    const cacheKey = `${slice.id}-${size.toFixed(3)}`;
    const cached = labelMetricsCache.get(cacheKey);
    if (cached) return cached;
    pInstance.push();
    pInstance.textFont("sans-serif");
    pInstance.textSize(size);
    const width = pInstance.textWidth(slice.label);
    const ascent = pInstance.textAscent();
    const descent = pInstance.textDescent();
    pInstance.pop();
    const height = ascent + descent;
    const metrics = { width, height, ascent, descent };
    labelMetricsCache.set(cacheKey, metrics);
    return metrics;
  };
  const labelCorners = (pos, metrics, rotation, anchor) => {
    const halfH = metrics.height / 2;
    const startX = anchor === "end" ? -metrics.width : 0;
    const endX = startX + metrics.width;
    const corners = [
      { x: startX, y: -metrics.ascent },
      { x: endX, y: -metrics.ascent },
      { x: endX, y: metrics.descent },
      { x: startX, y: metrics.descent },
    ];
    return corners.map((c) =>
      rotatePoint({ x: pos.x + c.x, y: pos.y + c.y }, pos, rotation)
    );
  };
  const boxFromCorners = (corners) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      const screen = worldToScreen(corner.x, corner.y);
      minX = Math.min(minX, screen.x);
      maxX = Math.max(maxX, screen.x);
      minY = Math.min(minY, screen.y);
      maxY = Math.max(maxY, screen.y);
    }
    return { minX, minY, maxX, maxY };
  };
  const inflateBox = (box, pad) => ({
    minX: box.minX - pad,
    maxX: box.maxX + pad,
    minY: box.minY - pad,
    maxY: box.maxY + pad,
  });
  const convexHull = (pts) => {
    if (pts.length <= 1) return pts;
    const sorted = [...pts].sort((a, b) =>
      a.x === b.x ? a.y - b.y : a.x - b.x
    );
    const cross = (o, a, b) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of sorted) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
      ) {
        lower.pop();
      }
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
      ) {
        upper.pop();
      }
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  };

  const hitSliceLabel = (sx, sy, paddingScreen = 10) => {
    if (!pInstance) return null;
    const padding = paddingScreen;
    for (const slice of slicePaths) {
      const metrics = sliceLabelMetrics(slice);
      if (!metrics) continue;
      const pos = slice.labelPos;
      const rotation = (slice.labelRotation * Math.PI) / 180;
      const rotated = rotatePoint(screenToWorld(sx, sy), pos, -rotation);
      const localX = rotated.x - pos.x;
      const localY = rotated.y - pos.y;
      const startX = slice.labelAnchor === "end" ? -metrics.width : 0;
      const endX = startX + metrics.width;
      const withinX = localX >= startX - padding && localX <= endX + padding;
      const withinY =
        localY >= -metrics.ascent - padding &&
        localY <= metrics.descent + padding;
      if (withinX && withinY) return slice;
    }
    return null;
  };
  let cursorMode = "grab";

  const setCursor = (mode, canvasOverride = null) => {
    const canvas = canvasOverride ?? pInstance?.canvas;
    if (!canvas) return false;
    if (mode === cursorMode) return false;
    cursorMode = mode;
    canvas.style.cursor = mode;
    return true;
  };

  const clearHover = () => {
    hoveredNode = null;
    hoveredText = "";
  };

  const updateHover = (sx, sy) => {
    const prevId = hoveredNode?.id ?? null;
    const prevText = hoveredText;
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
      hoveredText = tooltipForPost(best.post);
    } else {
      clearHover();
    }
    return prevId !== (hoveredNode?.id ?? null) || prevText !== hoveredText;
  };

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
    circleColor;
    hoveredNode;
    view.scale;
    view.panX;
    view.panY;
    requestRedraw();
  });

  const setupCanvasSize = (p) => {
    const w = canvasParent?.clientWidth || window.innerWidth || width;
    const h = canvasParent?.clientHeight || window.innerHeight || height;
    canvasSize = { w, h };
    p.resizeCanvas(w, h, true);
  };

  const zoomAt = (deltaY, sx, sy) => {
    const zoomStep = 1.1;
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
  let pressStarted = false;

  const handleClick = (sx, sy) => {
    updateHover(sx, sy);
    if (hoveredNode?.post?.url) {
      window.open(hoveredNode.post.url, "_blank", "noreferrer");
      return;
    }

    const hit = hitSliceLabel(sx, sy);
    if (hit) {
      toggleGroup(hit.id);
      requestRedraw();
    }
  };

  const createSketch = () => {
    return (p) => {
      p.setup = () => {
        const w = canvasParent?.clientWidth || window.innerWidth || width;
        const h = canvasParent?.clientHeight || window.innerHeight || height;
        p.createCanvas(w, h, p.P2D);
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
        return (
          x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
        );
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
        const hoverChanged = updateHover(x, y);
        if (dragDistance < 6) {
          handleClick(x, y);
        }
        const clickable = Boolean(hoveredNode) || Boolean(hitSliceLabel(x, y));
        const cursorChanged = setCursor(clickable ? "pointer" : "grab");
        if (hoverChanged || cursorChanged || dragDistance < 6) {
          requestRedraw();
        }
      };

      const touchPoint = (touch) => {
        const rect = p.canvas?.getBoundingClientRect();
        if (!rect) return { x: touch.clientX, y: touch.clientY };
        return {
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        };
      };

      let pinchActive = false;
      let pinchStartDistance = 0;
      let lastTouch = null;

      p.mousePressed = (evt) => {
        if (trailerBlocking) return;
        if (evt.button !== 0 || overControls(evt)) return;
        pressStarted = true;
        startPan(p.mouseX, p.mouseY);
      };

      p.mouseDragged = (evt) => {
        if (trailerBlocking) return;
        if (!isPanning || overControls(evt)) return;
        movePan(p.mouseX, p.mouseY);
        return false;
      };

      p.mouseReleased = (evt) => {
        if (trailerBlocking) return;
        if (!pressStarted) return;
        pressStarted = false;
        if (!isPanning) return;
        endPan(p.mouseX, p.mouseY);
      };

      p.mouseMoved = (evt) => {
        if (trailerBlocking) return;
        if (isPanning || overControls(evt)) return;
        const hoverChanged = updateHover(p.mouseX, p.mouseY);
        const clickable =
          Boolean(hoveredNode) || Boolean(hitSliceLabel(p.mouseX, p.mouseY));
        const cursorChanged = setCursor(clickable ? "pointer" : "grab");
        if (hoverChanged || cursorChanged) {
          requestRedraw();
        }
      };

      p.mouseWheel = (event) => {
        if (trailerBlocking) return false;
        if (overControls(event)) return false;
        zoomAt(event.deltaY, event.offsetX, event.offsetY);
        return false;
      };

      p.touchStarted = (evt) => {
        if (trailerBlocking) return;
        if (overControls(evt)) return false;
        const touches = evt.touches ?? [];
        if (touches.length >= 2) {
          const a = touchPoint(touches[0]);
          const b = touchPoint(touches[1]);
          pinchStartDistance = Math.hypot(b.x - a.x, b.y - a.y);
          pinchActive = true;
          pressStarted = false;
          isPanning = false;
        } else if (touches.length === 1) {
          const pt = touchPoint(touches[0]);
          lastTouch = pt;
          pressStarted = true;
          startPan(pt.x, pt.y);
        }
        return false;
      };

      p.touchMoved = (evt) => {
        if (trailerBlocking) return false;
        if (overControls(evt)) return false;
        const touches = evt.touches ?? [];
        if (pinchActive && touches.length >= 2) {
          const a = touchPoint(touches[0]);
          const b = touchPoint(touches[1]);
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          if (dist > 0 && pinchStartDistance > 0) {
            const factor = dist / pinchStartDistance;
            const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const worldBefore = screenToWorld(center.x, center.y);
            view.scale = clamp(view.scale * factor, minScale, maxScale);
            const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
            view.panX += center.x - screenAfter.x;
            view.panY += center.y - screenAfter.y;
            requestRedraw();
          }
          return false;
        }
        if (touches.length === 1) {
          const pt = touchPoint(touches[0]);
          lastTouch = pt;
          if (!isPanning && pressStarted) startPan(pt.x, pt.y);
          movePan(pt.x, pt.y);
        }
        return false;
      };

      p.touchEnded = (evt) => {
        if (trailerBlocking) return;
        const touches = evt.touches ?? [];
        if (pinchActive && touches.length < 2) {
          pinchActive = false;
          pinchStartDistance = 0;
        }
        if (touches.length === 1) {
          lastTouch = touchPoint(touches[0]);
        }
        if (pressStarted) {
          pressStarted = false;
          if (isPanning && lastTouch) {
            endPan(lastTouch.x, lastTouch.y);
          } else if (!isPanning && lastTouch) {
            handleClick(lastTouch.x, lastTouch.y);
          }
        }
        isPanning = false;
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
          if (trailerVisibleGroups && !trailerVisibleGroups.has(slice.id)) {
            continue;
          }
          const pos = slice.labelPos;
          p.push();
          p.translate(pos.x, pos.y);
          p.rotate((slice.labelRotation * Math.PI) / 180);
          p.textAlign(
            slice.labelAnchor === "end" ? p.RIGHT : p.LEFT,
            p.BASELINE
          );
          const active =
            selectedGroupId === null || selectedGroupId === slice.id;
          const inactiveLabel = p.color(textColor);

          p.fill(active ? highlightColor : inactiveLabel);
          p.noStroke();
          p.textStyle(p.NORMAL);
          p.textSize(textSizeFor(24));
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
          const active =
            selectedGroupId === null ||
            (selectedGroupId === source.groupId &&
              selectedGroupId === target.groupId);
          if (!active) stroke.setAlpha(30);
          p.stroke(stroke);
          p.strokeWeight((crossGroup ? 0.9 : 0.7) / view.scale);
          p.line(source.x, source.y, target.x, target.y);
        }
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
          const inGroup =
            selectedGroupId === null || node.groupId === selectedGroupId;
          const active = inGroup;
          const r =
            sizeMode === "links" ? node.radiusLinks : node.radiusReactions;
          const baseColor = p.color(node.color);
          if (!active) {
            baseColor.setAlpha(30);
          }
          p.fill(baseColor);
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

          p.stroke(halo);
          p.strokeWeight(1.8 / view.scale);
          p.circle(hoveredNode.x, hoveredNode.y, r * 2 + 6 / view.scale);
          p.pop();
        }
      };

      const drawRings = () => {
        p.push();
        p.noFill();
        const ctx = p.drawingContext;
        if (ctx?.setLineDash) {
          ctx.setLineDash([8 / view.scale, 10 / view.scale]);
        }
        p.stroke(highlightColor);
        p.strokeWeight(0.9 / view.scale);
        p.noFill();

        for (const tick of innerTicks) {
          p.circle(cx, cy, tick.radius * 2);
          p.push();
          p.noStroke();
          p.fill(highlightColor);
          p.textAlign(p.CENTER, p.BOTTOM);
          p.textSize(textSizeFor(36));
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

      p.draw = () => {
        p.background(backgroundColor);
        p.push();
        p.translate(
          canvasSize.w / 2 + view.panX,
          canvasSize.h / 2 + view.panY
        );
        p.scale(view.scale);
        p.translate(-cx, -cy);

        drawSlices();
        drawLinks();
        drawNodes();
        drawRings();

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

<section
  class="relative h-screen overflow-hidden"
  style={`--highlite-color:${highlightColor}; --graph-bg:${backgroundColor}; --graph-circle:${circleColor}; --graph-text:${textColor}; background:${backgroundColor}; color:${textColor};`}
>
  <div
    class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none"
    hidden={trailerState !== "done"}
  >
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
        {textColor}
        {backgroundColor}
        {highlightColor}
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

  {#if trailerAvailable}
    <Trailer
      groups={trailerGroups}
      {highlightColor}
      {backgroundColor}
      {textColor}
      on:update={(event) => {
        trailerVisibleGroups = event.detail?.visible ?? null;
        trailerState = event.detail?.state ?? trailerState;
        trailerBlocking = event.detail?.state === "idle";
        requestRedraw();
      }}
      on:block={(event) => {
        trailerBlocking = event.detail?.blocking ?? false;
      }}
    />
  {/if}

  {#if hoveredNode}
    <Tooltip text={hoveredText} />
  {/if}
</section>

<style>
  :global(canvas) {
    display: block;
  }
</style>
