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
  toggleGroup,
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
    const zoomStep = 1.1;
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
    const clickable =
      Boolean(getState().hoveredNode) || Boolean(hitSliceLabel(x, y));
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
      return;
    }

    const hit = hitSliceLabel(sx, sy);
    if (hit) {
      toggleGroup(hit.id);
      requestRedraw();
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

  const drawExtrudedPolygonFill = (p, radius, pieBackground) => {
    if (!Number.isFinite(radius)) return;
    const topPoly = drawPolygonVertices(radius);
    if (!topPoly.length) return;
    const bottomPoly = topPoly.map((pt) => ({
      x: pt.x + extrudeOffsetX,
      y: pt.y + extrudeOffsetY,
    }));
    const segments = bottomSegments(topPoly, bottomPoly);
    
    const topFill = p.color(pieBackground);
    p.fill(topFill);
    p.noStroke();
    p.beginShape();
    topPoly.forEach((pt) => p.vertex(pt.x, pt.y));
    p.endShape(p.CLOSE);
    
    const shadow = p.color(pieBackground);
    p.fill(shadow);
    p.noStroke();
    p.beginShape();
    for (let i = bottomPoly.length - 1; i >= 0; i -= 1)
      p.vertex(bottomPoly[i].x, bottomPoly[i].y);
    p.endShape(p.CLOSE);
    
    p.fill(shadow);
    p.noStroke();
    for (const segment of segments) {
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

  const drawExtrudedPolygonOutline = (p, radius, pieBackground, highlightColor) => {
    if (!Number.isFinite(radius)) return;
    const topPoly = drawPolygonVertices(radius);
    if (!topPoly.length) return;
    const bottomPoly = topPoly.map((pt) => ({
      x: pt.x + extrudeOffsetX,
      y: pt.y + extrudeOffsetY,
    }));
    const segments = bottomSegments(topPoly, bottomPoly);
    
    p.noFill();
    p.stroke(highlightColor);
    p.strokeWeight(0.8 / view.scale);
    
    p.beginShape();
    topPoly.forEach((pt) => p.vertex(pt.x, pt.y));
    p.endShape(p.CLOSE);
    
    p.strokeWeight(0.8 / view.scale);
    for (const segment of segments) {
      for (const { top, bottom } of segment)
        p.line(top.x, top.y, bottom.x, bottom.y);
    }
    
    for (let i = 0; i < 6; i++) {
      const current = bottomPoly[(3 + i) % 12];
      const next = bottomPoly[(3 + i + 1) % 12];
      p.line(current.x, current.y, next.x, next.y);
    }
  };

  const drawExtrudedSides = (
    p,
    pieBackground,
    highlightColor,
    trailerVisibleGroups
  ) => {
    if (!Number.isFinite(outerRingRadius)) return;
    p.push();
    p.stroke(highlightColor);
    p.strokeWeight(0.8 / view.scale);
    for (const slice of slicePaths ?? []) {
      if (
        !Number.isFinite(slice.start) ||
        !Number.isFinite(slice.end) ||
        (trailerVisibleGroups && !trailerVisibleGroups.has(slice.id))
      ) {
        continue;
      }
      const topArc = getArcPoints(
        cx,
        cy,
        outerRingRadius,
        slice.start,
        slice.end,
        40
      );
      if (!topArc.length) continue;
      const bottomArc = topArc.map((pt) => ({
        x: pt.x + extrudeOffsetX,
        y: pt.y + extrudeOffsetY,
      }));
      const segments = bottomSegments(topArc, bottomArc);

      const topFill = p.color(pieBackground);
      p.noStroke();
      p.fill(topFill);
      p.beginShape();
      topArc.forEach((pt) => p.vertex(pt.x, pt.y));
      p.endShape(p.CLOSE);

      const shadow = p.color(pieBackground);
      p.fill(shadow);
      p.beginShape();
      topArc.forEach((pt) => p.vertex(pt.x, pt.y));
      for (let i = bottomArc.length - 1; i >= 0; i -= 1)
        p.vertex(bottomArc[i].x, bottomArc[i].y);
      p.endShape(p.CLOSE);

      p.noFill();
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

  const drawSlices = (p) => {
    const {
      backgroundColor,
      pieBackground,
      highlightColor,
      textColor,
      selectedGroupId,
      trailerVisibleGroups,
    } = getState();

    drawExtrudedSides(p, pieBackground, highlightColor, trailerVisibleGroups);
    // p.push();
    // p.noStroke();
    // p.noFill();
    // // p.fill(backgroundColor);
    // // p.fill("red");
    // // p.ellipse(cx, cy, outerRingRadius * 2, outerRingRadius * 2);
    // p.pop();
    // p.push();
    // p.noFill();
    // p.stroke("highlightColor");
    // p.strokeWeight(0.9 / view.scale);
    // for (const slice of slicePaths ?? []) {
    //   if (
    //     !Number.isFinite(slice.start) ||
    //     !Number.isFinite(slice.end) ||
    //     !Number.isFinite(outerRingRadius)
    //   )
    //     continue;
    //   p.arc(
    //     cx,
    //     cy,
    //     outerRingRadius * 2,
    //     outerRingRadius * 2,
    //     slice.start,
    //     slice.end
    //   );
    // }
    // p.pop();

    p.push();
    for (const slice of slicePaths ?? []) {
      if (trailerVisibleGroups && !trailerVisibleGroups.has(slice.id)) continue;
      const pos = slice.labelPos;
      p.push();
      p.translate(pos.x, pos.y);
      p.rotate((slice.labelRotation * Math.PI) / 180);
      p.textAlign(slice.labelAnchor === "end" ? p.RIGHT : p.LEFT, p.BASELINE);
      const active = selectedGroupId === null || selectedGroupId === slice.id;
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

  const drawLinks = (p) => {
    const { visibleLinks, highlightColor, selectedGroupId } = getState();
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

      const stroke = p.color(highlightColor);
      const active =
        selectedGroupId === null ||
        (selectedGroupId === source.groupId &&
          selectedGroupId === target.groupId);
      p.stroke(stroke);
      p.strokeWeight((crossGroup ? 0.9 : 0.7) / view.scale);
      p.line(source.x, source.y, target.x, target.y);
    }
    p.pop();
  };

  const drawNodes = (p) => {
    const {
      visibleNodes,
      sizeMode,
      selectedGroupId,
      backgroundColor,
      hoveredNode,
      highlightColor,
    } = getState();

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
      const r = sizeMode === "links" ? node.radiusLinks : node.radiusReactions;
      const baseColor = p.color(node.color);
      p.fill(baseColor);
      p.stroke(backgroundColor);
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

  const drawRings = (p) => {
    const { highlightColor, backgroundColor, pieBackground } = getState();
    const ctx = p.drawingContext;

    p.push();
    p.noFill();
    if (ctx?.setLineDash) ctx.setLineDash([8 / view.scale, 10 / view.scale]);
    p.stroke(highlightColor);
    p.strokeWeight(0.9 / view.scale);

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
      const clickable =
        Boolean(getState().hoveredNode) ||
        Boolean(hitSliceLabel(p.mouseX, p.mouseY));
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
      const { backgroundColor, pieBackground, highlightColor } = getState();
      p.background(backgroundColor);
      
      p.push();
      p.translate(canvasSize.w / 2 + view.panX, canvasSize.h / 2 + view.panY);
      p.scale(view.scale);
      p.translate(-cx, -cy);
      
      
      if (outerTick) {
        drawExtrudedPolygonFill(p, outerRingRadius, pieBackground);
      }
      
      
      drawSlices(p);
      drawLinks(p);
      drawNodes(p);
      drawRings(p);
      
      
      if (outerTick) {
        drawExtrudedPolygonOutline(p, outerRingRadius, pieBackground, highlightColor);
      }
      
      p.pop();
    };
  };
};
