import { createCamera } from "$lib/pie/camera.js";
import {
  buildTypeOrder,
  computeGroupMetricMaxes,
  computePieLayout,
} from "$lib/pie/layout.js";
import {
  drawBaseGeometry,
  drawHoverOverlay,
  shortenText,
} from "$lib/pie/render.js";

export const createPieSketch = ({
  graphNodes,
  graphLinks,
  topicLabels,
  otherLabel,
  increase = 2,
  getState,
  tooltipForPost,
  setHoverState,
}) => {
  return (p) => {
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
    let lastPinchDistance = 0;

    let hoverNode = null;
    let pressedNodeUrl = null;

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
      panEnabled = true;
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
      const { extrudeOffsetX, extrudeOffsetY } = getState();
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
      types = buildTypeOrder(nodes, topicLabels, otherLabel);
      ({ groupMaxLinks, groupMaxReactions } = computeGroupMetricMaxes(
        nodes,
        types
      ));

      nodesById = {};
      for (const n of nodes) nodesById[n.id] = n;
    };

    const fitZoomToView = () => {
      if (!outerRadius || !Number.isFinite(outerRadius)) return;

      const { dotSize, extrudeOffsetX, extrudeOffsetY, viewFill } = getState();

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
      const { dotSize } = getState();
      const nodeMargin = dotSize;

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
      const { dotSize, visibleNodeIds } = getState();
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
      const { sizeMode } = getState();
      if (sizeMode === "reactions") return n.radiusReactions || 0;
      return n.radiusLinks || 0;
    };

    const nodeInnerSize = (n) => {
      const { sizeMode, dotSize } = getState();
      const metric = nodeMetric(n);
      const groupId = n.type;
      const maxMetric =
        sizeMode === "reactions"
          ? groupMaxReactions[groupId] || 1
          : groupMaxLinks[groupId] || 1;
      const clamped = Math.max(0, Math.min(metric, maxMetric));
      return p.map(clamped, 0, maxMetric, dotSize * 0.2, dotSize);
    };

    const getStaticKey = () => {
      const {
        pieFill,
        pieBackground,
        circleColor,
        pieHighlightColor,
        labelFont,
        dotSize,
        extrudeOffsetX,
        extrudeOffsetY,
      } = getState();

      return [
        p.width,
        p.height,
        outerRadius,
        pieFill,
        pieBackground,
        circleColor,
        pieHighlightColor,
        labelFont,
        dotSize,
        extrudeOffsetX,
        extrudeOffsetY,
        types.join("|"),
      ].join("::");
    };

    const getNodesKey = () => {
      const { dotSize, sizeMode, selectedEmoji, visibleNodeIds } = getState();

      return [
        p.width,
        p.height,
        outerRadius,
        dotSize,
        sizeMode,
        selectedEmoji ?? "all",
        visibleNodeIds.size,
      ].join("::");
    };

    const getLinksKey = () => {
      const { showLinks, selectedEmoji } = getState();

      return [
        p.width,
        p.height,
        outerRadius,
        showLinks ? "on" : "off",
        selectedEmoji ?? "all",
      ].join("::");
    };

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
      const {
        pieFill,
        circleColor,
        pieHighlightColor,
        labelFont,
        dotSize,
        extrudeOffsetX,
        extrudeOffsetY,
      } = getState();

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
        { pieFill, circleColor, pieHighlightColor, labelFont, dotSize },
        { extrudeOffsetX, extrudeOffsetY }
      );
      staticKey = getStaticKey();
    };

    const rebuildNodesLayer = () => {
      if (!renderer) return;
      const { dotSize, circleColor, visibleNodeIds } = getState();

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
      const { showLinks, pieHighlightColor, visibleNodeIds } = getState();

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

      linksLayer.stroke(pieHighlightColor);
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
      const { trailerBlocking } = getState();
      if (trailerBlocking) return false;
      camera.zoomAt(event.deltaY, p.mouseX, p.mouseY, {
        step: 0.0004,
        minZoom: 0.001,
        maxZoom: 5,
      });
      scheduleRedraw();
      return false;
    };

    p.mousePressed = () => {
      const { trailerBlocking } = getState();
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
      const { trailerBlocking } = getState();
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
      const { trailerBlocking } = getState();
      if (trailerBlocking) return;
      endDrag();
    };

    p.mouseMoved = () => {
      const { trailerBlocking } = getState();
      if (trailerBlocking) return;
      if (isDragging && !p.mouseIsPressed) endDrag();
      const next = getNodeUnderPoint(p.mouseX, p.mouseY);
      const changed =
        (!hoverNode && next) ||
        (hoverNode && !next) ||
        (hoverNode && next && hoverNode.id !== next.id);

      hoverNode = next;
      if (setHoverState) {
        setHoverState(
          hoverNode ? { id: hoverNode.id, post: hoverNode.post } : null,
          hoverNode ? tooltipForPost(hoverNode) : ""
        );
      }

      if (changed) {
        if (p.canvas) p.canvas.style.cursor = hoverNode ? "pointer" : "default";
        scheduleRedraw();
      }
    };

    p.mouseClicked = () => {
      const { trailerBlocking } = getState();
      if (trailerBlocking) return;
      const url = hasDragged ? null : pressedNodeUrl;
      pressedNodeUrl = null;
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    };

    p.touchStarted = () => {
      const { trailerBlocking } = getState();
      if (trailerBlocking) return;
      const touch = p.touches?.[0];
      if (!touch) return;

      if (p.touches.length >= 2) {
        const t0 = p.touches[0];
        const t1 = p.touches[1];
        lastPinchDistance = p.dist(
          t0.clientX,
          t0.clientY,
          t1.clientX,
          t1.clientY
        );
        return false;
      }

      const pressed = getNodeUnderPoint(touch.clientX, touch.clientY);
      pressedNodeUrl = pressed?.post?.url?.trim?.() ?? null;
      hasDragged = false;
      isDragging = true;
      dragStartScreenX = touch.clientX;
      dragStartScreenY = touch.clientY;
      dragStartX = touch.clientX - camera.panX;
      dragStartY = touch.clientY - camera.panY;
      return false;
    };

    p.touchMoved = () => {
      const { trailerBlocking } = getState();
      if (trailerBlocking) return;

      if (p.touches.length >= 2) {
        const t0 = p.touches[0];
        const t1 = p.touches[1];
        const currentDistance = p.dist(
          t0.clientX,
          t0.clientY,
          t1.clientX,
          t1.clientY
        );

        if (lastPinchDistance > 0) {
          const deltaDistance = lastPinchDistance - currentDistance;
          const centerX = (t0.clientX + t1.clientX) / 2;
          const centerY = (t0.clientY + t1.clientY) / 2;
          camera.zoomAt(deltaDistance * 0.5, centerX, centerY, {
            step: 0.001,
            minZoom: 0.001,
            maxZoom: 5,
          });
          scheduleRedraw();
        }

        lastPinchDistance = currentDistance;
        return false;
      }

      const touch = p.touches?.[0];
      if (!touch || !isDragging) return;
      camera.panX = touch.clientX - dragStartX;
      camera.panY = touch.clientY - dragStartY;
      if (
        p.dist(
          touch.clientX,
          touch.clientY,
          dragStartScreenX,
          dragStartScreenY
        ) > 5
      )
        hasDragged = true;
      scheduleRedraw();
      return false;
    };

    const syncLayersForState = () => {
      ensureStaticFresh();
      ensureNodesFresh();
      ensureLinksFresh();
    };

    p.draw = () => {
      const {
        pieBackground,
        showLinks,
        dotSize,
        pieHighlightColor,
        labelFont,
        visibleNodeIds,
      } = getState();

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
        pieHighlightColor,
        labelFont,
        labelText: shortenText(hoverNode?.id),
      });
      p.pop();
    };
  };
};
