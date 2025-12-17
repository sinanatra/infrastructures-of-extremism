<script>
  import P5 from "p5-svelte";
  import ExportControl from "$lib/ExportControl.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import { captureCanvasAsPng } from "$lib/captureCanvas.js";

  let {
    data,
    backgroundColor = "#000000",
    circleColor = "#ffffff",
    textColor = "#ffffff",
    highlightColor = "yellow",
  } = $props();

  const normalize = (v) =>
    (v ?? "")
      .toString()
      .trim()
      .replace(/^https?:\/\/t\.me\//i, "")
      .replace(/^@/, "")
      .replace(/\s+/g, "")
      .toLowerCase();

  const strip = (v) => normalize(v).split(":")[0];

  const cleanLabel = (g) => {
    const base = g?.label ?? g?.username ?? g?.id ?? "";
    return base.toString().trim().replace(/^@/, "");
  };

  const theme = (() => {
    const base = data?.dataset?.theme ?? {};
    return {
      backgroundColor: base.backgroundColor ?? backgroundColor,
      circleColor: base.circleColor ?? circleColor,
      textColor: base.textColor ?? textColor,
      highlightColor: base.highlightColor ?? highlightColor,
    };
  })();

  const groupInfo = new Map(
    (data.groups ?? []).map((g) => {
      const id = strip(g.id);
      return [
        id,
        {
          label: cleanLabel(g) || id,
          subscribers: g.subscribers ?? 0,
        },
      ];
    })
  );

  const trailerGroups = (() => {
    const raw = data.groups ?? [];
    const seen = new Set();
    const result = [];
    for (const group of raw) {
      const id = strip(
        group.id ?? group.username ?? group.slug ?? group.label ?? ""
      );
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        label: cleanLabel(group) || id,
      });
    }
    if (!result.length) {
      const fallbackId = strip(data?.dataset?.slug ?? "");
      if (fallbackId) {
        result.push({
          id: fallbackId,
          label: data?.dataset?.label ?? data?.dataset?.slug ?? fallbackId,
        });
      }
    }
    return result;
  })();
  const trailerAvailable = trailerGroups.length > 0;
  let trailerState = $state(trailerAvailable ? "idle" : "done");
  let trailerBlocking = $state(trailerAvailable);

  const rawLinks =
    (data.groupLinks && data.groupLinks.length
      ? data.groupLinks
      : data.links) ?? [];

  const edges = rawLinks
    .map((l) => ({
      source: strip(l.source),
      target: strip(l.target),
    }))
    .filter((l) => l.source && l.target && l.source !== l.target);

  // console.log(data.links);
  // console.log(edges.find((d) => d.target.includes("ita")));

  const datasetRoot = strip(data?.dataset?.slug ?? "");
  const groupRoot =
    (data.groups?.length ? strip(data.groups[0].id) : null) || null;

  const allNodes = new Set();
  edges.forEach((e) => {
    allNodes.add(e.source);
    allNodes.add(e.target);
  });

  const firstEdgeSource = edges.length ? edges[0].source : null;
  let seed =
    firstEdgeSource ||
    groupRoot ||
    datasetRoot ||
    (edges.length ? edges[0].target : null);

  const children = new Map();
  for (const { source, target } of edges) {
    if (!children.has(source)) children.set(source, []);
    const arr = children.get(source);
    if (!arr.includes(target)) arr.push(target);
  }

  const buildPrimaryLayers = (rootId, depthLimit) => {
    const layers = [];
    const discovered = new Set();
    if (!rootId) return { layers, discovered };
    layers.push([rootId]);
    discovered.add(rootId);
    let currentLayer = [rootId];
    for (let depth = 0; depth < depthLimit; depth++) {
      const nextLayer = [];
      for (const node of currentLayer) {
        const targets = children.get(node) ?? [];
        for (const target of targets) {
          if (discovered.has(target)) continue;
          discovered.add(target);
          nextLayer.push(target);
        }
      }
      if (!nextLayer.length) break;
      layers.push(nextLayer);
      currentLayer = nextLayer;
    }
    return { layers, discovered };
  };

  const maxDepth = 2;
  const { layers: primaryLayers, discovered: primaryDiscovered } =
    buildPrimaryLayers(seed, maxDepth);
  const layers = [...primaryLayers];
  const discovered = new Set(primaryDiscovered);

  const enqueueRoot = (root) => {
    if (!root || discovered.has(root)) return;
    discovered.add(root);
    layers.push([root]);
    let queue = [root];
    while (queue.length) {
      const next = [];
      for (const src of queue) {
        const targets = children.get(src) ?? [];
        for (const tgt of targets) {
          if (!discovered.has(tgt)) {
            discovered.add(tgt);
            next.push(tgt);
          }
        }
      }
      if (next.length) {
        layers.push(next);
        queue = next;
      } else {
        queue = [];
      }
    }
  };

  for (const id of allNodes) {
    if (!discovered.has(id)) enqueueRoot(id);
  }

  const nodes = [];
  const nodeIndex = new Map();
  layers.forEach((layer, layerIndex) => {
    layer.forEach((id, indexInLayer) => {
      const info = groupInfo.get(id) ?? { label: id, subscribers: 0 };
      const node = {
        id,
        label: info.label,
        subscribers: info.subscribers,
        layerIndex,
        indexInLayer,
        visualRing: null,
        visualIndex: null,
        radius: 0,
        angle: 0,
        x: 0,
        y: 0,
      };
      nodeIndex.set(id, nodes.length);
      nodes.push(node);
    });
  });

  const minPerRing = 3;
  const visualRings = [];
  let pendingLonely = [];

  for (let layerIndex = 1; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    if (!Array.isArray(layer) || !layer.length) continue;

    if (layer.length >= minPerRing) {
      if (pendingLonely.length) {
        visualRings.push([...pendingLonely, ...layer]);
        pendingLonely = [];
      } else {
        visualRings.push([...layer]);
      }
    } else {
      if (visualRings.length) {
        const last = visualRings[visualRings.length - 1];
        last.push(...layer);
      } else {
        pendingLonely.push(...layer);
      }
    }
  }

  if (pendingLonely.length) visualRings.push(pendingLonely);

  visualRings.forEach((ids, ringIndex) => {
    ids.forEach((id, indexInRing) => {
      const idx = nodeIndex.get(id);
      if (idx == null) return;
      const node = nodes[idx];
      node.visualRing = ringIndex + 1;
      node.visualIndex = indexInRing;
    });
  });

  const baseRadius = 240;
  const layerGap = 260;
  const startAngle = -Math.PI / 2;

  nodes.forEach((node) => {
    if (node.layerIndex === 0) {
      node.radius = 0;
      node.angle = 0;
      node.x = 0;
      node.y = 0;
      return;
    }
    const ring = node.visualRing ?? node.layerIndex;
    const ids = visualRings[ring - 1] ?? layers[node.layerIndex] ?? [node.id];
    const count = ids.length || 1;
    const angleStep = (Math.PI * 2) / count;
    const indexOnRing =
      node.visualIndex ??
      Math.max(
        0,
        ids.findIndex((id) => id === node.id)
      );
    node.radius = baseRadius + (ring - 1) * layerGap;
    node.angle = startAngle + indexOnRing * angleStep;
    node.x = Math.cos(node.angle) * node.radius;
    node.y = Math.sin(node.angle) * node.radius;
  });

  const linkSegments = edges
    .map((e) => {
      const si = nodeIndex.get(e.source);
      const ti = nodeIndex.get(e.target);
      if (si == null || ti == null) return null;
      return { source: nodes[si], target: nodes[ti] };
    })
    .filter(Boolean);

  const neighbors = new Map();
  linkSegments.forEach((l) => {
    if (!neighbors.has(l.source.id)) neighbors.set(l.source.id, new Set());
    if (!neighbors.has(l.target.id)) neighbors.set(l.target.id, new Set());
    neighbors.get(l.source.id).add(l.target.id);
    neighbors.get(l.target.id).add(l.source.id);
  });

  const polygonSides = 12;
  const animationFramesPerRing = 40;
  let animationFrame = 0;

  let pInstance = null;
  let canvasParent = null;
  let canvasSize = { w: 0, h: 0 };
  let view = { scale: 0.8, panX: 0, panY: 0 };
  let hoveredId = null;
  let cursorMode = "grab";
  let redrawPending = false;
  let isPanning = false;
  let panStart = null;
  let dragDistance = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const worldToScreen = (x, y) => {
    const cx = canvasSize.w / 2 + view.panX;
    const cy = canvasSize.h / 2 + view.panY;
    return {
      x: x * view.scale + cx,
      y: y * view.scale + cy,
    };
  };

  const screenToWorld = (x, y) => {
    const cx = canvasSize.w / 2 + view.panX;
    const cy = canvasSize.h / 2 + view.panY;
    return {
      x: (x - cx) / view.scale,
      y: (y - cy) / view.scale,
    };
  };

  const setCursor = (mode) => {
    if (!pInstance || !pInstance.canvas) return;
    if (cursorMode === mode) return;
    cursorMode = mode;
    pInstance.canvas.style.cursor = mode;
  };

  const nodeRadiusFor = (subs) => {
    if (!subs || subs <= 0) return 10;
    const v = Math.log10(subs + 10);
    return clamp(1 + v * 2, 4, 10);
  };

  const requestRedraw = () => {
    if (!pInstance || redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      if (pInstance) pInstance.redraw();
    });
  };

  const exportPng = async () => {
    if (!pInstance?.canvas) return;
    try {
      pInstance.redraw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const downloadName = data?.dataset?.slug ?? "tree";
      await captureCanvasAsPng(pInstance.canvas, downloadName);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      requestRedraw();
    }
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
    nodes.forEach((node) => {
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      const r = nodeRadiusFor(node.subscribers) + tol;
      const dist = Math.hypot(dx, dy);
      if (dist <= r && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    });
    const nextId = best ? best.id : null;
    if (nextId !== hoveredId) {
      hoveredId = nextId;
      const clickable = Boolean(hoveredId);
      setCursor(clickable ? "pointer" : "grab");
      requestRedraw();
    }
  };

  const handleClick = (sx, sy) => {
    if (trailerBlocking) return;
    updateHover(sx, sy);
    if (!hoveredId) return;
    const url = `https://t.me/${hoveredId}`;
    window.open(url, "_blank", "noreferrer");
  };

  const zoomAt = (deltaY, sx, sy) => {
    const zoomStep = 1.1;
    const dir = deltaY > 0 ? 1 / zoomStep : zoomStep;
    const nextScale = clamp(view.scale * dir, 0.25, 2.5);
    const before = screenToWorld(sx, sy);
    view.scale = nextScale;
    const after = worldToScreen(before.x, before.y);
    view.panX += sx - after.x;
    view.panY += sy - after.y;
    requestRedraw();
  };

  const createSketch = () => {
    return (p) => {
      p.setup = () => {
        const w = canvasParent?.clientWidth || window.innerWidth || 1200;
        const h = canvasParent?.clientHeight || window.innerHeight || 800;
        p.createCanvas(w, h, p.P2D);
        canvasSize = { w, h };
        if (p.canvas) {
          p.canvas.style.touchAction = "none";
          setCursor("grab");
        }
      };

      p.windowResized = () => {
        setupCanvasSize(p);
        requestRedraw();
      };

      p.mouseMoved = () => {
        if (trailerBlocking) return;
        if (isPanning) return;
        updateHover(p.mouseX, p.mouseY);
      };

      p.mousePressed = (evt) => {
        if (trailerBlocking) return;
        if (evt.button !== 0) return;
        isPanning = true;
        panStart = {
          x: p.mouseX,
          y: p.mouseY,
          panX: view.panX,
          panY: view.panY,
        };
        dragDistance = 0;
        setCursor("grabbing");
      };

      p.mouseDragged = () => {
        if (trailerBlocking) return;
        if (!isPanning || !panStart) return;
        const dx = p.mouseX - panStart.x;
        const dy = p.mouseY - panStart.y;
        dragDistance = Math.max(dragDistance, Math.hypot(dx, dy));
        view.panX = panStart.panX + dx;
        view.panY = panStart.panY + dy;
        requestRedraw();
      };

      p.mouseReleased = () => {
        if (trailerBlocking) return;
        if (!isPanning) return;
        isPanning = false;
        setCursor(hoveredId ? "pointer" : "grab");
        if (dragDistance < 6) {
          handleClick(p.mouseX, p.mouseY);
        } else {
          updateHover(p.mouseX, p.mouseY);
        }
      };

      p.mouseWheel = (event) => {
        if (trailerBlocking) return false;
        zoomAt(event.deltaY, event.offsetX, event.offsetY);
        return false;
      };

      p.touchStarted = (evt) => {
        if (trailerBlocking) return false;
        const touches = evt.touches ?? [];
        if (touches.length === 1) {
          const t = touches[0];
          const rect = p.canvas?.getBoundingClientRect();
          const x = rect ? t.clientX - rect.left : t.clientX;
          const y = rect ? t.clientY - rect.top : t.clientY;
          isPanning = true;
          panStart = { x, y, panX: view.panX, panY: view.panY };
          dragDistance = 0;
          setCursor("grabbing");
        }
        return false;
      };

      p.touchMoved = (evt) => {
        if (trailerBlocking) return false;
        const touches = evt.touches ?? [];
        if (!isPanning || !panStart || !touches.length) return false;
        const t = touches[0];
        const rect = p.canvas?.getBoundingClientRect();
        const x = rect ? t.clientX - rect.left : t.clientX;
        const y = rect ? t.clientY - rect.top : t.clientY;
        const dx = x - panStart.x;
        const dy = y - panStart.y;
        dragDistance = Math.max(dragDistance, Math.hypot(dx, dy));
        view.panX = panStart.panX + dx;
        view.panY = panStart.panY + dy;
        requestRedraw();
        return false;
      };

      p.touchEnded = (evt) => {
        if (trailerBlocking) return false;
        const touches = evt.touches ?? [];
        if (!isPanning) return false;
        isPanning = false;
        setCursor(hoveredId ? "pointer" : "grab");
        if (!touches.length && dragDistance < 6) {
          const last = evt.changedTouches?.[0];
          if (last) {
            const rect = p.canvas?.getBoundingClientRect();
            const x = rect ? last.clientX - rect.left : last.clientX;
            const y = rect ? last.clientY - rect.top : last.clientY;
            handleClick(x, y);
          }
        }
        return false;
      };

      p.draw = () => {
        p.background(theme.backgroundColor);
        p.push();
        p.translate(canvasSize.w / 2 + view.panX, canvasSize.h / 2 + view.panY);
        p.scale(view.scale);

        const centerNodeIndex =
          seed && nodeIndex.has(seed) ? nodeIndex.get(seed) : 0;
        const centerNode = nodes[centerNodeIndex] ?? null;

        const hoveredNeighbors =
          hoveredId && neighbors.get(hoveredId)
            ? neighbors.get(hoveredId)
            : null;

        animationFrame += 1;
        const ringCount = visualRings.length || 1;
        const totalFrames = animationFramesPerRing * ringCount;
        const tRaw = totalFrames > 0 ? animationFrame / totalFrames : 1;
        const t = clamp(tRaw, 0, 1);
        const maxRingFloat = 1 + t * (ringCount - 1);
        const maxRing = Math.max(1, maxRingFloat);
        const alphaFactor = (ringIndex) =>
          clamp(1 - Math.max(0, ringIndex - maxRingFloat), 0.15, 1);

        const centerRadius = baseRadius - layerGap * 0.45;
        if (centerRadius > 0 && centerNode) {
          const c = p.color(theme.highlightColor);
          c.setAlpha(90);
          p.noFill();
          p.stroke(c);
          // p.strokeWeight(0.1);
          p.beginShape();
          for (let k = 0; k < polygonSides; k++) {
            const a = -Math.PI / 2 + (Math.PI * 2 * k) / polygonSides;
            p.vertex(Math.cos(a) * centerRadius, Math.sin(a) * centerRadius);
          }
          p.endShape(p.CLOSE);
        }

        visualRings.forEach((ids, rIndex) => {
          const ringIndex = rIndex + 1;
          const radius = baseRadius + (ringIndex - 1) * layerGap;
          const visible = ringIndex <= maxRing + 0.001;
          if (!visible) return;
          const c = p.color(theme.highlightColor);
          c.setAlpha(60 * alphaFactor(ringIndex));
          p.noFill();
          p.stroke(c);
          // p.strokeWeight(0.9);
          p.beginShape();
          for (let k = 0; k < polygonSides; k++) {
            const a = -Math.PI / 2 + (Math.PI * 2 * k) / polygonSides;
            p.vertex(Math.cos(a) * radius, Math.sin(a) * radius);
          }
          p.endShape(p.CLOSE);
        });

        const nodeVisible = (node) => {
          if (node.layerIndex === 0) return true;
          const ringIndex = node.visualRing ?? node.layerIndex;
          if (ringIndex > maxRing + 0.001) return false;
          if (!hoveredId) return true;
          if (node.id === hoveredId) return true;
          if (hoveredNeighbors && hoveredNeighbors.has(node.id)) return true;
          return false;
        };

        const linkVisible = (link) => {
          const a = link.source;
          const b = link.target;
          if (!nodeVisible(a) || !nodeVisible(b)) return false;
          if (!hoveredId) return true;
          return a.id === hoveredId || b.id === hoveredId;
        };

        p.noFill();
        linkSegments.forEach((link) => {
          if (!linkVisible(link)) return;
          const a = link.source;
          const b = link.target;
          const c = p.color(theme.highlightColor);
          p.stroke(c);
          // p.strokeWeight(0.5);
          p.line(a.x, a.y, b.x, b.y);
        });

        nodes.forEach((node) => {
          if (!nodeVisible(node)) return;
          const r = nodeRadiusFor(node.subscribers);
          const baseColor = p.color(
            node.layerIndex === 0 ? theme.highlightColor : theme.circleColor
          );
          const ringIndex =
            node.layerIndex === 0 ? 0 : (node.visualRing ?? node.layerIndex);
          const aFactor = node.layerIndex === 0 ? 1 : alphaFactor(ringIndex);
          p.fill(baseColor);
          // p.strokeWeight(3);
          p.stroke(backgroundColor);
          p.circle(node.x, node.y, r * 2);
        });

        nodes.forEach((node) => {
          if (!nodeVisible(node)) return;

          const r = nodeRadiusFor(node.subscribers);

          p.fill(p.color(theme.textColor));
          p.textSize(node.layerIndex === 0 ? 16 : 13);

          const labelDist = node.layerIndex === 0 ? 22 : r + 10;

          const isLeftSide =
            node.angle > Math.PI / 2 && node.angle < (3 * Math.PI) / 2;

          const textAngle = isLeftSide ? node.angle + Math.PI : node.angle;
          const xOffset = isLeftSide ? -labelDist : labelDist;

          p.strokeWeight(2);
          p.stroke(backgroundColor);

          p.push();
          p.translate(node.x, node.y);
          p.rotate(textAngle);
          p.textAlign(isLeftSide ? p.RIGHT : p.LEFT, p.CENTER);
          p.text(node.label, xOffset, 0);
          p.pop();
        });

        if (centerNode && nodeVisible(centerNode)) {
          const r = nodeRadiusFor(centerNode.subscribers);
          p.strokeWeight(2);
          p.circle(centerNode.x, centerNode.y, r * 2 + 10);
        }

        p.pop();
      };
    };
  };

  const sketch = createSketch();

  const handleInstance = (event) => {
    pInstance = event.detail?.instance ?? null;
    canvasParent = event.detail?.container ?? null;
    if (pInstance) {
      setupCanvasSize(pInstance);
      requestRedraw();
    }
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
  <P5
    className="w-full h-full"
    {sketch}
    aria-label="Radial network canvas"
    role="img"
    on:instance={handleInstance}
  />
  {#if trailerAvailable}
    <Trailer
      groups={trailerGroups}
      highlightColor={theme.highlightColor}
      backgroundColor={theme.backgroundColor}
      textColor={theme.textColor}
      introMode={true}
      introHeading=""
      introSummary="this visualization reveals how mentions and forwarded posts connect groups."
      introBody=""
      enterLabel="Enter"
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
