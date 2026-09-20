const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const createNetworkGraphSketch = ({
  prepared,
  nodes,
  linkSegments,
  extrudeOffsetX = 0,
  extrudeOffsetY = 950,
  requestRedraw,
  getState,
  setHoverState,
  tooltipForPost,
  formatTick,
  getCanvasParent,
  getControlsEl,
}) => {
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
  } = prepared;

  const nodeById = new Map((nodes ?? []).map((n) => [n.id, n]));

  const hoverCellSize = 220;
  const hoverGrid = new Map();
  const cellKey = (x, y) =>
    `${Math.floor(x / hoverCellSize)},${Math.floor(y / hoverCellSize)}`;
  for (const node of nodes ?? []) {
    const key = cellKey(node.x, node.y);
    const bucket = hoverGrid.get(key) ?? [];
    bucket.push(node);
    hoverGrid.set(key, bucket);
  }

  const minScale = 0.1;
  const maxScale = 0.9;
  const view = {
    scale: 0.35,
    panX: 0,
    panY: 0,
  };

  let canvasSize = { w: 0, h: 0 };
  let cursorMode = "grab";

  let pRef = null;
  const labelMetricsCache = new Map();
  let lastLabelScale = view.scale;

  const textSizeFor = (base) => {
    const s = clamp(view.scale, minScale, maxScale);
    const scaled = base * (1.3 - s * 0.6);
    return clamp(scaled, base * 0.7, base * 1.3);
  };

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
    if (!pRef) return null;
    const size = textSizeFor(24);
    const cacheKey = `${slice.id}-${size.toFixed(3)}`;
    const cached = labelMetricsCache.get(cacheKey);
    if (cached) return cached;
    pRef.push();
    pRef.textFont("sans-serif");
    pRef.textSize(size);
    const width = pRef.textWidth(slice.label);
    const ascent = pRef.textAscent();
    const descent = pRef.textDescent();
    pRef.pop();
    const metrics = { width, height: ascent + descent, ascent, descent };
    labelMetricsCache.set(cacheKey, metrics);
    return metrics;
  };

  const labelCorners = (pos, metrics, rotation, anchor) => {
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

  const hitSliceLabel = (sx, sy, paddingScreen = 10) => {
    if (!pRef) return null;
    for (const slice of slicePaths ?? []) {
      const metrics = sliceLabelMetrics(slice);
      if (!metrics) continue;
      const pos = slice.labelPos;
      const rotation = (slice.labelRotation * Math.PI) / 180;
      const cornersWorld = labelCorners(
        pos,
        metrics,
        rotation,
        slice.labelAnchor
      );
      let box = boxFromCorners(cornersWorld);
      box = inflateBox(box, paddingScreen);
      if (sx >= box.minX && sx <= box.maxX && sy >= box.minY && sy <= box.maxY)
        return slice;
    }
    return null;
  };

  const setCursor = (mode, canvasOverride = null) => {
    const canvas = canvasOverride ?? pRef?.canvas;
    if (!canvas) return false;
    if (mode === cursorMode) return false;
    cursorMode = mode;
    canvas.style.cursor = mode;
    return true;
  };

  const clearHover = () => {
    setHoverState(null, "");
  };

  const computeVisible = () => {
    const { visibleNodes, visibleLinks, visibleNodeIds } = getState();
    return { visibleNodes, visibleLinks, visibleNodeIds };
  };

  const updateHover = (sx, sy) => {
    const { hoveredNode, hoveredText, sizeMode, visibleNodeIds } = getState();
    const prevId = hoveredNode?.id ?? null;
    const prevText = hoveredText ?? "";

    const world = screenToWorld(sx, sy);
    let best = null;
    let bestDist = Infinity;
    const hitTol = 14 / view.scale;
    const cxCell = Math.floor(world.x / hoverCellSize);
    const cyCell = Math.floor(world.y / hoverCellSize);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = hoverGrid.get(`${cxCell + dx},${cyCell + dy}`);
        if (!bucket) continue;
        for (const node of bucket) {
          if (!visibleNodeIds.has(node.id)) continue;
          const rad =
            sizeMode === "links" ? node.radiusLinks : node.radiusReactions;
          const dist = Math.hypot(node.x - world.x, node.y - world.y);
          const maxHit = rad + hitTol;
          if (dist <= maxHit && dist < bestDist) {
            best = node;
            bestDist = dist;
          }
        }
      }
    }

    if (best) {
      setHoverState(best, tooltipForPost(best.post));
    } else {
      clearHover();
    }

    const next = getState();
    return (
      prevId !== (next.hoveredNode?.id ?? null) || prevText !== next.hoveredText
    );
  };

  const computeCanvasSize = () => {
    const parent = getCanvasParent?.();
    const w = parent?.clientWidth || window.innerWidth || width;
    const h = parent?.clientHeight || window.innerHeight || height;
    canvasSize = { w, h };
    return canvasSize;
  };

  const zoomAt = (deltaY, sx, sy) => {
    const zoomStep = 1.05;
    const direction = deltaY > 0 ? 1 / zoomStep : zoomStep;
    const nextScale = clamp(view.scale * direction, minScale, maxScale);
    const worldBefore = screenToWorld(sx, sy);
    view.scale = nextScale;
    if (view.scale !== lastLabelScale) {
      labelMetricsCache.clear();
      lastLabelScale = view.scale;
    }
    const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
    view.panX += sx - screenAfter.x;
    view.panY += sy - screenAfter.y;
    requestRedraw();
  };

  let isPanning = false;
  let panStart = null;
  let dragDistance = 0;
  let pressStarted = false;

  const overControls = (evt) => {
    const controlsEl = getControlsEl?.();
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
    panStart = { x, y, panX: view.panX, panY: view.panY };
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
    if (dragDistance < 6) handleClick(x, y);
    const clickable = Boolean(getState().hoveredNode);
    const cursorChanged = setCursor(clickable ? "pointer" : "grab");
    if (hoverChanged || cursorChanged || dragDistance < 6) requestRedraw();
  };

  const touchPoint = (touch) => {
    const rect = pRef?.canvas?.getBoundingClientRect();
    if (!rect) return { x: touch.clientX, y: touch.clientY };
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  let pinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartScale = 0;
  let pinchStartPan = null;
  let lastTouch = null;

  const handleClick = (sx, sy) => {
    updateHover(sx, sy);
    const { hoveredNode } = getState();
    if (hoveredNode?.post?.url) {
      window.open(hoveredNode.post.url, "_blank", "noreferrer");
    }
  };

  const getArcPoints = (
    centerX,
    centerY,
    radius,
    startAngle,
    endAngle,
    steps = 40
  ) => {
    const points = [];
    const angSpan = endAngle - startAngle;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = startAngle + angSpan * t;
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }
    return points;
  };

  const baseStart = -Math.PI / 2;

  const drawPolygonVertices = (radius) => {
    if (!polygonSides || polygonSides < 3) return [];
    const positions = [];
    for (let k = 0; k < polygonSides; k += 1) {
      const a = baseStart + (Math.PI * 2 * k) / polygonSides;
      positions.push({
        x: cx + radius * Math.cos(a),
        y: cy + radius * Math.sin(a),
      });
    }
    return positions;
  };

  const isBottomPoint = (pt) => pt && pt.y >= cy;

  const bottomSegments = (topPoints, bottomPoints) => {
    const segments = [];
    let current = [];
    for (let i = 0; i < topPoints.length; i += 1) {
      if (isBottomPoint(topPoints[i])) {
        current.push({ top: topPoints[i], bottom: bottomPoints[i] });
      } else if (current.length) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length) segments.push(current);
    if (
      segments.length > 1 &&
      segments[0].length &&
      segments[segments.length - 1].length
    ) {
      const first = segments.shift();
      const last = segments.pop();
      segments.unshift([...last, ...first]);
    }
    return segments;
  };

  const preTopPoly = drawPolygonVertices(outerRingRadius);
  const preBottomPoly = preTopPoly.map((pt) => ({
    x: pt.x + extrudeOffsetX,
    y: pt.y + extrudeOffsetY,
  }));
  const prePolySegments = bottomSegments(preTopPoly, preBottomPoly);

  const preSliceArcs = (slicePaths ?? []).map((slice) => {
    if (!Number.isFinite(slice.start) || !Number.isFinite(slice.end)) return null;
    const topArc = getArcPoints(cx, cy, outerRingRadius, slice.start, slice.end, 40);
    const bottomArc = topArc.map((pt) => ({
      x: pt.x + extrudeOffsetX,
      y: pt.y + extrudeOffsetY,
    }));
    return { topArc, bottomArc, segments: bottomSegments(topArc, bottomArc) };
  });

  const colorCache = new Map();
  const cachedColor = (str) => {
    if (!colorCache.has(str)) colorCache.set(str, pRef.color(str));
    return colorCache.get(str);
  };

  const drawExtrudedPolygonFill = (p, pieBackground) => {
    if (!preTopPoly.length) return;
    const fill = cachedColor(pieBackground);
    p.fill(fill);
    p.noStroke();
    p.beginShape();
    preTopPoly.forEach((pt) => p.vertex(pt.x, pt.y));
    p.endShape(p.CLOSE);

    p.beginShape();
    for (let i = preBottomPoly.length - 1; i >= 0; i -= 1)
      p.vertex(preBottomPoly[i].x, preBottomPoly[i].y);
    p.endShape(p.CLOSE);

    for (const segment of prePolySegments) {
      for (let i = 0; i < segment.length - 1; i++) {
        const curr = segment[i];
        const next = segment[i + 1];
        p.beginShape();
        p.vertex(curr.top.x, curr.top.y);
        p.vertex(next.top.x, next.top.y);
        p.vertex(next.bottom.x, next.bottom.y);
        p.vertex(curr.bottom.x, curr.bottom.y);
        p.endShape(p.CLOSE);
      }
    }
  };

  const drawExtrudedPolygonOutline = (p, highlightColor) => {
    if (!preTopPoly.length) return;
    p.noFill();
    p.stroke(cachedColor(highlightColor));
    p.strokeWeight(0.8 / view.scale);

    p.beginShape();
    preTopPoly.forEach((pt) => p.vertex(pt.x, pt.y));
    p.endShape(p.CLOSE);

    for (const segment of prePolySegments) {
      for (const { top, bottom } of segment)
        p.line(top.x, top.y, bottom.x, bottom.y);
    }

    const bottomStart = Math.round(polygonSides / 4);
    const bottomCount = Math.round(polygonSides / 2);
    for (let i = 0; i < bottomCount; i++) {
      const current = preBottomPoly[(bottomStart + i) % polygonSides];
      const next = preBottomPoly[(bottomStart + i + 1) % polygonSides];
      p.line(current.x, current.y, next.x, next.y);
    }
  };

  const drawExtrudedSides = (p, pieBackground, highlightColor, trailerVisibleGroups) => {
    if (!Number.isFinite(outerRingRadius)) return;
    p.push();
    const fillColor = cachedColor(pieBackground);
    p.strokeWeight(0.8 / view.scale);
    for (let si = 0; si < (slicePaths ?? []).length; si++) {
      const slice = slicePaths[si];
      const arc = preSliceArcs[si];
      if (
        !arc ||
        (trailerVisibleGroups && !trailerVisibleGroups.has(slice.id))
      ) {
        continue;
      }
      const { topArc, bottomArc, segments } = arc;

      p.noStroke();
      p.fill(fillColor);
      p.beginShape();
      topArc.forEach((pt) => p.vertex(pt.x, pt.y));
      p.endShape(p.CLOSE);

      p.beginShape();
      topArc.forEach((pt) => p.vertex(pt.x, pt.y));
      for (let i = bottomArc.length - 1; i >= 0; i -= 1)
        p.vertex(bottomArc[i].x, bottomArc[i].y);
      p.endShape(p.CLOSE);

      p.noFill();
      p.stroke(cachedColor(highlightColor));
      for (const segment of segments) {
        for (const { top, bottom } of segment)
          p.line(top.x, top.y, bottom.x, bottom.y);
        if (segment.length >= 2) {
          p.beginShape();
          segment.forEach(({ bottom }) => p.vertex(bottom.x, bottom.y));
          p.endShape();
        }
      }

      p.beginShape();
      bottomArc.forEach((pt) => p.vertex(pt.x, pt.y));
      p.endShape();
    }
    p.pop();
  };

  const drawSlices = (p, state) => {
    const { pieBackground, highlightColor, trailerVisibleGroups } = state;
    drawExtrudedSides(p, pieBackground, highlightColor, trailerVisibleGroups);
  };

  const drawLabels = (p, state) => {
    const { highlightColor, selectedGroupId, hoveredGroupId } = state;

    p.push();
    p.textFont("sans-serif");
    p.textSize(textSizeFor(36));
    for (const slice of slicePaths ?? []) {
      p.push();
      p.translate(slice.labelPos.x, slice.labelPos.y);
      p.rotate((slice.labelRotation * Math.PI) / 180);
      p.textAlign(slice.labelAnchor === "end" ? p.RIGHT : p.LEFT, p.CENTER);
      p.stroke(255);
      p.strokeWeight(3 / view.scale);
      p.fill(cachedColor(highlightColor));
      p.text(slice.label, 0, 0);
      p.pop();
    }
    p.pop();

    const focusId = hoveredGroupId ?? selectedGroupId;
    if (focusId) {
      const slice = (slicePaths ?? []).find((s) => s.id === focusId);
      if (slice && Number.isFinite(slice.start) && Number.isFinite(slice.end)) {
        p.push();
        p.noFill();
        p.stroke(cachedColor(highlightColor));
        p.strokeWeight(2.5 / view.scale);
        p.arc(cx, cy, outerRingRadius * 2, outerRingRadius * 2, slice.start, slice.end);
        p.pop();
      }
    }
  };

  const drawLinks = (p, state) => {
    const { visibleLinks, highlightColor } = state;
    if (!visibleLinks.length) return;
    p.push();
    p.noFill();
    p.stroke(cachedColor(highlightColor));
    const margin = 120;
    const hw = canvasSize.w / 2;
    const hh = canvasSize.h / 2;
    const crossWeight = 0.9 / view.scale;
    const intraWeight = 0.7 / view.scale;
    for (const link of visibleLinks) {
      const { source, target, crossGroup } = link;
      const ssx = (source.x - cx) * view.scale + hw + view.panX;
      const ssy = (source.y - cy) * view.scale + hh + view.panY;
      const ttx = (target.x - cx) * view.scale + hw + view.panX;
      const tty = (target.y - cy) * view.scale + hh + view.panY;
      if (
        (ssx < -margin && ttx < -margin) ||
        (ssx > canvasSize.w + margin && ttx > canvasSize.w + margin) ||
        (ssy < -margin && tty < -margin) ||
        (ssy > canvasSize.h + margin && tty > canvasSize.h + margin)
      ) continue;
      p.strokeWeight(crossGroup ? crossWeight : intraWeight);
      p.line(source.x, source.y, target.x, target.y);
    }
    p.pop();
  };

  const drawNodes = (p, state) => {
    const { visibleNodes, sizeMode, backgroundColor, hoveredNode, highlightColor } = state;

    p.push();
    const margin = 120;
    const hw = canvasSize.w / 2;
    const hh = canvasSize.h / 2;
    const useLinks = sizeMode === "links";
    p.stroke(cachedColor(backgroundColor));
    let lastColor = null;
    for (const node of visibleNodes) {
      const sx = (node.x - cx) * view.scale + hw + view.panX;
      const sy = (node.y - cy) * view.scale + hh + view.panY;
      if (sx < -margin || sx > canvasSize.w + margin || sy < -margin || sy > canvasSize.h + margin) {
        continue;
      }
      const r = useLinks ? node.radiusLinks : node.radiusReactions;
      if (node.color !== lastColor) {
        p.fill(cachedColor(node.color));
        lastColor = node.color;
      }
      p.circle(node.x, node.y, r * 2);
    }
    p.pop();

    if (hoveredNode) {
      const r = useLinks ? hoveredNode.radiusLinks : hoveredNode.radiusReactions;
      p.push();
      p.noFill();
      p.stroke(cachedColor(highlightColor));
      p.strokeWeight(1.8 / view.scale);
      p.circle(hoveredNode.x, hoveredNode.y, r * 2 + 6 / view.scale);
      p.pop();
    }
  };

  const drawRings = (p, state) => {
    const { highlightColor, backgroundColor, pieBackground } = state;
    const ctx = p.drawingContext;

    p.push();
    p.noFill();
    if (ctx?.setLineDash) ctx.setLineDash([]);
    p.stroke(highlightColor);
    p.strokeWeight(0.4 / view.scale);

    for (const tick of innerTicks ?? []) {
      if (polygonSides && polygonSides >= 3) {
        p.beginShape();
        for (let k = 0; k < polygonSides; k += 1) {
          const a = baseStart + (Math.PI * 2 * k) / polygonSides;
          p.vertex(
            cx + tick.radius * Math.cos(a),
            cy + tick.radius * Math.sin(a)
          );
        }
        p.endShape(p.CLOSE);
      } else {
        p.circle(cx, cy, tick.radius * 2);
      }
    }
    p.pop();

    for (const tick of innerTicks ?? []) {
      p.push();
      p.stroke(255);
      p.strokeWeight(3 / view.scale);
      p.fill(highlightColor);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.textSize(textSizeFor(52));
      p.text(
        formatTick.format(tick.time),
        cx,
        cy - tick.radius - 10 / view.scale
      );
      p.pop();
    }

    if (outerTick) {
      p.push();
      p.stroke(255);
      p.strokeWeight(3 / view.scale);
      p.fill(highlightColor);
      p.textAlign(p.CENTER, p.BOTTOM);
      p.textSize(textSizeFor(22));
      p.text(
        formatTick.format(outerTick.time),
        cx,
        cy - outerRingRadius - 12 / view.scale
      );
      p.pop();
    }
    if (ctx?.setLineDash) ctx.setLineDash([]);
  };

  return (p) => {
    p.setup = () => {
      pRef = p;
      const size = computeCanvasSize();
      p.createCanvas(size.w, size.h, p.P2D);
      p.noLoop();
      p.angleMode(p.RADIANS);
      p.textFont("sans-serif");
      if (p.canvas) {
        p.canvas.style.touchAction = "none";
        setCursor("grab", p.canvas);
      }
    };

    p.windowResized = () => {
      const size = computeCanvasSize();
      p.resizeCanvas(size.w, size.h, true);
      requestRedraw();
    };

    p.mousePressed = (evt) => {
      if (getState().trailerBlocking) return;
      if (evt.button !== 0 || overControls(evt)) return;
      pressStarted = true;
      startPan(p.mouseX, p.mouseY);
    };

    p.mouseDragged = (evt) => {
      if (getState().trailerBlocking) return;
      if (!isPanning || overControls(evt)) return;
      movePan(p.mouseX, p.mouseY);
      return false;
    };

    p.mouseReleased = () => {
      if (getState().trailerBlocking) return;
      if (!pressStarted) return;
      pressStarted = false;
      if (!isPanning) return;
      endPan(p.mouseX, p.mouseY);
    };

    p.mouseMoved = (evt) => {
      if (getState().trailerBlocking) return;
      if (isPanning || overControls(evt)) return;
      const hoverChanged = updateHover(p.mouseX, p.mouseY);
      const clickable = Boolean(getState().hoveredNode);
      const cursorChanged = setCursor(clickable ? "pointer" : "grab");
      if (hoverChanged || cursorChanged) requestRedraw();
    };

    p.mouseWheel = (event) => {
      if (getState().trailerBlocking) return false;
      if (overControls(event)) return false;
      zoomAt(event.deltaY, event.offsetX, event.offsetY);
      return false;
    };

    p.touchStarted = (evt) => {
      if (getState().trailerBlocking) return;
      if (overControls(evt)) return false;
      const touches = evt.touches ?? [];
      if (touches.length >= 2) {
        const a = touchPoint(touches[0]);
        const b = touchPoint(touches[1]);
        pinchStartDistance = Math.hypot(b.x - a.x, b.y - a.y);
        pinchStartScale = view.scale;
        pinchStartPan = { panX: view.panX, panY: view.panY };
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
      if (getState().trailerBlocking) return false;
      if (overControls(evt)) return false;
      const touches = evt.touches ?? [];
      if (pinchActive && touches.length >= 2) {
        const a = touchPoint(touches[0]);
        const b = touchPoint(touches[1]);
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist > 0 && pinchStartDistance > 0) {
          const ratio = dist / pinchStartDistance;
          const nextScale = clamp(pinchStartScale * ratio, minScale, maxScale);
          const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const worldBefore = screenToWorld(center.x, center.y);
          view.scale = nextScale;
          if (view.scale !== lastLabelScale) {
            labelMetricsCache.clear();
            lastLabelScale = view.scale;
          }
          const screenAfter = worldToScreen(worldBefore.x, worldBefore.y);
          view.panX = (pinchStartPan?.panX ?? 0) + (center.x - screenAfter.x);
          view.panY = (pinchStartPan?.panY ?? 0) + (center.y - screenAfter.y);
          requestRedraw();
        }
        return false;
      }
      if (touches.length === 1 && isPanning) {
        const pt = touchPoint(touches[0]);
        lastTouch = pt;
        movePan(pt.x, pt.y);
      }
      return false;
    };

    p.touchEnded = (evt) => {
      if (getState().trailerBlocking) return false;
      const touches = evt.touches ?? [];
      if (pinchActive && touches.length < 2) {
        pinchActive = false;
      }
      if (pressStarted && touches.length === 0) {
        pressStarted = false;
        if (isPanning) {
          const x = lastTouch?.x ?? p.mouseX;
          const y = lastTouch?.y ?? p.mouseY;
          endPan(x, y);
        }
      }
      return false;
    };

    p.draw = () => {
      const state = getState();
      const { backgroundColor, pieBackground, highlightColor } = state;
      p.background(backgroundColor);

      p.push();
      p.translate(canvasSize.w / 2 + view.panX, canvasSize.h / 2 + view.panY);
      p.scale(view.scale);
      p.translate(-cx, -cy);

      if (outerTick) {
        drawExtrudedPolygonFill(p, pieBackground);
      }

      drawSlices(p, state);
      drawLinks(p, state);
      drawNodes(p, state);
      drawRings(p, state);
      drawLabels(p, state);

      if (outerTick) {
        drawExtrudedPolygonOutline(p, highlightColor);
      }

      p.pop();
    };
  };
};
