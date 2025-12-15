<script>
  import P5 from "p5-svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import Tooltip from "$lib/Tooltip.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";

  let {
    data,
    backgroundColor = "gainsboro",
    circleColor = "#ffffff",
    textColor = "#ffffff",
    highlightColor = "yellow",
    dotSize = 15,
    extrudeOffsetX = 0,
    extrudeOffsetY = 150,
    pieFill = "#ffffff",
    pieBackground = "gainsboro",

  } = $props();

  const TOPIC_LABELS = [
    "national identity",
    "identity & exclusion",
    "conspiracy narratives",
    "street action",
    "doctrine",
    "electoral politics",
  ];

  const OTHER_LABEL = "other topics";

  const topicMap = new Map(
    TOPIC_LABELS.map((label) => [label.toLowerCase(), label])
  );

  const { posts, links } = data;
  const prepared = prepareNetwork(data, { circleColor });
  const preparedNodes = prepared.nodes;

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
    };
  });

  const pieCounts = {
    posts: posts.length,
    topics: new Set(graphNodes.map((n) => n.type)).size,
    links: links.length,
  };

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

  const buildTypeOrder = (nodes) => {
    const present = new Set(nodes.map((n) => n.type));
    const ordered = TOPIC_LABELS.filter((label) => present.has(label));
    if (present.has(OTHER_LABEL)) ordered.push(OTHER_LABEL);
    return ordered.length ? ordered : [OTHER_LABEL];
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

  $effect(() => {
    sizeMode;
    showLinks;
    selectedEmoji;
    selectedGroupId;
    pieFill;
    requestRedraw();
  });

  const sketch = (p) => {
    let nodes = [];
    let linksLocal = [];
    let types = [];
    let wedgeData = {};
    let outerRadius = 0;
    const innerRadius = 0;
    let zoom = 1.8;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartScreenX = 0;
    let dragStartScreenY = 0;
    let hasDragged = false;
    let hoverNode = null;
    const nodeMargin = dotSize;
    let nodesById = {};
    let groupMaxLinks = {};
    let groupMaxReactions = {};
    const hoverCellSize = 220;
    let hoverGrid = new Map();
    let localRedrawPending = false;

    const scheduleRedraw = () => {
      if (localRedrawPending) return;
      localRedrawPending = true;
      requestAnimationFrame(() => {
        localRedrawPending = false;
        p.redraw();
      });
    };

    const rebuildHoverGrid = () => {
      hoverGrid = new Map();
      const key = (x, y) =>
        `${Math.floor(x / hoverCellSize)},${Math.floor(y / hoverCellSize)}`;
      for (const node of nodes) {
        const k = key(node.x, node.y);
        const bucket = hoverGrid.get(k) ?? [];
        bucket.push(node);
        hoverGrid.set(k, bucket);
      }
    };

    const parseGraphData = () => {
      nodes = graphNodes.map((n) => ({ ...n }));
      linksLocal = graphLinks.map((l) => ({ ...l }));
      types = buildTypeOrder(nodes);
      types.forEach((t) => {
        const nodesInType = nodes.filter((n) => n.type === t);
        const maxLinks = Math.max(
          ...nodesInType.map((n) => n.radiusLinks || 0),
          0
        );
        const maxReactions = Math.max(
          ...nodesInType.map((n) => n.radiusReactions || 0),
          0
        );
        groupMaxLinks[t] = maxLinks > 0 ? maxLinks : 1;
        groupMaxReactions[t] = maxReactions > 0 ? maxReactions : 1;
      });
      nodesById = {};
      nodes.forEach((node) => {
        nodesById[node.id] = node;
      });
    };

    const capacityForWedge = (theta, radius) => {
      let cap = 0;
      let r = radius - nodeMargin;
      while (r >= innerRadius) {
        const ringCap = Math.floor((theta * r) / dotSize);
        if (ringCap < 1) break;
        cap += ringCap;
        r -= dotSize;
      }
      return cap;
    };

    const findMinimalThetaForWedge = (count, radius) => {
      let low = 0;
      let high = 2 * Math.PI;
      let best = high;
      for (let i = 0; i < 20; i += 1) {
        const mid = (low + high) / 2;
        if (capacityForWedge(mid, radius) >= count) {
          best = mid;
          high = mid;
        } else {
          low = mid;
        }
      }
      return best;
    };

    const totalThetaForRadius = (radius, groups) => {
      let total = 0;
      types.forEach((t) => {
        const count = groups[t].length;
        const theta = findMinimalThetaForWedge(count, radius);
        total += theta;
      });
      return total;
    };

    const findOuterRadius = (groups) => {
      let low = dotSize * 2;
      let high = dotSize * 500;
      let best = high;
      for (let i = 0; i < 20; i += 1) {
        const mid = (low + high) / 2;
        const total = totalThetaForRadius(mid, groups);
        if (total > 2 * Math.PI) {
          low = mid;
        } else {
          best = mid;
          high = mid;
        }
      }
      return best;
    };

    const computeWedgeData = (groups, radius) => {
      let sumTheta = 0;
      const temp = {};
      types.forEach((t) => {
        const count = groups[t].length;
        const theta = findMinimalThetaForWedge(count, radius);
        temp[t] = { angle: theta };
        sumTheta += theta;
      });
      const scale = (2 * Math.PI) / sumTheta;
      let start = 0;
      const result = {};
      types.forEach((t) => {
        const adjusted = temp[t].angle * scale;
        result[t] = {
          angle: adjusted,
          start,
          mid: start + adjusted / 2,
        };
        start += adjusted;
      });
      return result;
    };

    const assignNodePositions = (groups, radius, wedges) => {
      const cx = p.width / 2;
      const cy = p.height / 2;
      types.forEach((t) => {
        const nodesOfType = groups[t];
        const theta = wedges[t].angle;
        const startAngle = wedges[t].start;
        let remaining = nodesOfType.length;
        const assigned = [];
        let r = radius - nodeMargin;
        while (remaining > 0 && r >= innerRadius) {
          const ringCap = Math.floor((theta * r) / dotSize);
          if (ringCap < 1) {
            r -= dotSize;
            continue;
          }
          const countInRing = Math.min(remaining, ringCap);
          const stepA = theta / countInRing;
          for (let i = 0; i < countInRing; i += 1) {
            const a = startAngle + stepA * (i + 0.5);
            assigned.push({
              x: cx + r * Math.cos(a),
              y: cy + r * Math.sin(a),
            });
          }
          remaining -= countInRing;
          r -= dotSize;
        }
        nodesOfType.forEach((node, i) => {
          if (assigned[i]) {
            node.x = assigned[i].x;
            node.y = assigned[i].y;
          } else {
            node.x = cx;
            node.y = cy;
          }
        });
      });
    };

    const computeLayout = () => {
      const groups = {};
      types.forEach((t) => {
        groups[t] = nodes
          .filter((n) => n.type === t)
          .sort(
            (a, b) =>
              (a.degreeCentrality || 0) - (b.degreeCentrality || 0) ||
              (b.timestamp || 0) - (a.timestamp || 0)
          );
      });
      outerRadius = findOuterRadius(groups);
      wedgeData = computeWedgeData(groups, outerRadius);
      assignNodePositions(groups, outerRadius, wedgeData);
      rebuildHoverGrid();
      rebuildStaticLayer();
    };

    const screenToWorld = (sx, sy) => {
      sx -= p.width / 2 + panX;
      sy -= p.height / 2 + panY;
      sx /= zoom;
      sy /= zoom;
      sx += p.width / 2;
      sy += p.height / 2;
      return { x: sx, y: sy };
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
          for (const node of bucket) {
            if (!visibleNodeIds.has(node.id)) continue;
            const d = p.dist(m.x, m.y, node.x, node.y);
            if (d < hitRadius && d < bestDist) {
              best = node;
              bestDist = d;
            }
          }
        }
      }
      return best;
    };

    const getArcPoints = (cx, cy, r, startAng, endAng, steps = 32) => {
      const pts = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = p.map(i, 0, steps, startAng, endAng);
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      return pts;
    };

    const drawArcText = (ctx, txt, cx, cy, r, startAngle, endAngle) => {
      let totalWidth = 0;
      for (const ch of txt) {
        totalWidth += ctx.textWidth(ch);
      }
      const spacingFactor = 1.26;
      const gap = ctx.textWidth(" ") * 0.35;
      const totalAngle = totalWidth / r;
      const midAngle = (startAngle + endAngle) / 2;
      const reverse = midAngle < Math.PI;
      let currentAngle = reverse
        ? midAngle + totalAngle / 2
        : midAngle - totalAngle / 2;
      for (let i = 0; i < txt.length; i += 1) {
        const charWidth = ctx.textWidth(txt[i]);
        let theta;
        const adjust = (charWidth * spacingFactor + gap) / 2;
        if (reverse) {
          theta = currentAngle - adjust / r;
        } else {
          theta = currentAngle + adjust / r;
        }
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        ctx.push();
        ctx.translate(x, y);
        let rotation = theta + ctx.HALF_PI;
        if (reverse) rotation += ctx.PI;
        ctx.rotate(rotation);
        ctx.textAlign(ctx.CENTER, ctx.CENTER);
        ctx.text(i === 0 ? txt[i].toUpperCase() : txt[i], 0, 0);
        ctx.pop();
        if (reverse) {
          currentAngle -= (charWidth * spacingFactor + gap) / r;
        } else {
          currentAngle += (charWidth * spacingFactor + gap) / r;
        }
      }
    };

    const drawWedgeLayer = (ctx) => {
      ctx.push();
      ctx.fill(pieFill);
      ctx.noStroke();
      const cx = ctx.width / 2;
      const cy = ctx.height / 2;
      ctx.ellipse(cx, cy, outerRadius * 2, outerRadius * 2);
      ctx.pop();
      ctx.push();
      Object.keys(wedgeData).forEach((t) => {
        const w = wedgeData[t];
        ctx.stroke(circleColor);
        ctx.strokeWeight(1);
        ctx.noFill();
        ctx.arc(
          cx,
          cy,
          outerRadius * 2,
          outerRadius * 2,
          w.start,
          w.start + w.angle
        );
        ctx.line(
          cx,
          cy,
          cx + outerRadius * Math.cos(w.start),
          cy + outerRadius * Math.sin(w.start)
        );
        ctx.line(
          cx,
          cy,
          cx + outerRadius * Math.cos(w.start + w.angle),
          cy + outerRadius * Math.sin(w.start + w.angle)
        );
        const label = shortenText(t, 24);
        const baseMargin = dotSize;
        const labelRadius = outerRadius + baseMargin + dotSize * 0.2;
        const angleAvailable = Math.max(w.angle - 0.02, 0.01);
        let currentSize = dotSize;
        while (currentSize > 5) {
          ctx.textSize(currentSize);
          const totalWidth = ctx.textWidth(label);
          const totalAngle = totalWidth / Math.max(labelRadius, 1);
          if (totalAngle <= angleAvailable) break;
          currentSize *= 0.85;
        }
        ctx.fill(highlightColor);
        ctx.stroke(255);
        drawArcText(
          ctx,
          label,
          cx,
          cy,
          labelRadius,
          w.start,
          w.start + w.angle
        );
      });
      ctx.pop();
    };

    const shortenText = (str, maxLen = 30) => {
      if (!str) return "";
      return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
    };

    const nodeMetric = (node) => {
      if (sizeMode === "reactions") return node.radiusReactions || 0;
      return node.radiusLinks || 0;
    };

    const nodeInnerSize = (node) => {
      const metric = nodeMetric(node);
      const groupId = node.type;
      const maxMetric =
        sizeMode === "reactions"
          ? groupMaxReactions[groupId] || 1
          : groupMaxLinks[groupId] || 1;
      const clamped = Math.max(0, Math.min(metric, maxMetric));
      return p.map(clamped, 0, maxMetric, dotSize * 0.2, dotSize);
    };

    const drawBaseGeometry = () => {
      const cx = p.width / 2;
      const cy = p.height / 2;
      p.fill(pieFill);
      p.stroke(circleColor);
      p.ellipse(
        cx + extrudeOffsetX,
        cy + extrudeOffsetY,
        outerRadius * 2,
        outerRadius * 2
      );
      const extrusionMargin = dotSize * 0.10;
      p.noStroke();
      p.fill(pieFill);
      p.beginShape();
      p.vertex(cx - outerRadius + extrusionMargin, cy);
      p.vertex(cx + outerRadius - extrusionMargin, cy);
      p.vertex(
        cx + extrudeOffsetX + outerRadius - extrusionMargin,
        cy + extrudeOffsetY
      );
      p.vertex(
        cx + extrudeOffsetX - outerRadius + extrusionMargin,
        cy + extrudeOffsetY
      );
      p.endShape(p.CLOSE);
      Object.keys(wedgeData).forEach((t) => {
        const w = wedgeData[t];
        const topArcPoints = getArcPoints(
          cx,
          cy,
          outerRadius,
          w.start,
          w.start + w.angle
        );
        const bottomArcPoints = topArcPoints.map((pt) => ({
          x: pt.x + extrudeOffsetX,
          y: pt.y + extrudeOffsetY,
        }));
        p.stroke(circleColor);
        p.noFill();
        p.strokeWeight(1);
        p.line(
          topArcPoints[0].x,
          topArcPoints[0].y,
          bottomArcPoints[0].x,
          bottomArcPoints[0].y
        );
        p.line(
          topArcPoints[topArcPoints.length - 1].x,
          topArcPoints[topArcPoints.length - 1].y,
          bottomArcPoints[bottomArcPoints.length - 1].x,
          bottomArcPoints[bottomArcPoints.length - 1].y
        );
      });
      drawWedgeLayer(p);
    };

    let staticLayer = null;
    let renderer = null;

    const rebuildStaticLayer = () => {
      if (!renderer) return;
      if (
        !staticLayer ||
        staticLayer.width !== renderer.width ||
        staticLayer.height !== renderer.height
      ) {
        staticLayer = renderer.createGraphics(renderer.width, renderer.height);
      }
      staticLayer.clear();
      drawWedgeLayer(staticLayer);
    };

    const drawAllLinks = () => {
      if (!showLinks) return;
      p.stroke(highlightColor);
      p.strokeWeight(1);
      p.noFill();
      for (const l of linksLocal) {
        const a = nodesById[l.source];
        const b = nodesById[l.target];
        if (!a || !b) continue;
        if (!visibleNodeIds.has(a.id) || !visibleNodeIds.has(b.id)) continue;
        p.line(a.x, a.y, b.x, b.y);
      }
    };

    const drawNodes = () => {
      nodes.forEach((node) => {
        p.stroke(0);
        p.strokeWeight(0.1);
        p.noFill();
        p.ellipse(node.x, node.y, dotSize, dotSize);
        if (!visibleNodeIds.has(node.id)) return;
        const innerSize = nodeInnerSize(node);
        p.noStroke();
        const innerColor = p.color(node.color);
        innerColor.setAlpha(160);
        p.fill(innerColor);
        p.ellipse(node.x, node.y, innerSize, innerSize);
      });
    };

    const drawHover = () => {
      if (!hoverNode) return;
      const innerSize = nodeInnerSize(hoverNode);
      p.stroke(0);
      p.fill(highlightColor);
      p.ellipse(hoverNode.x, hoverNode.y, dotSize, dotSize);
      p.noStroke();
      p.fill(highlightColor);
      p.ellipse(hoverNode.x, hoverNode.y, innerSize, innerSize);
      p.push();
      p.noFill();
      p.textSize(8);
      p.stroke(255);
      p.strokeWeight(1);
      p.fill(highlightColor);
      p.text(shortenText(hoverNode.id), hoverNode.x, hoverNode.y - 10);
      p.pop();
    };

    p.setup = () => {
      renderer = p;
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.textAlign(p.CENTER, p.CENTER);
      parseGraphData();
      computeLayout();
      p.noLoop();
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      computeLayout();
      rebuildStaticLayer();
      scheduleRedraw();
    };

    p.mouseWheel = (event) => {
      const step = 0.001;
      let nextZoom = zoom - event.deltaY * step;
      nextZoom = p.constrain(nextZoom, 0.5, 5);
      const scale = nextZoom / zoom;
      const dx = p.mouseX - (p.width / 2 + panX);
      const dy = p.mouseY - (p.height / 2 + panY);
      panX -= dx * (scale - 1);
      panY -= dy * (scale - 1);
      zoom = nextZoom;
      scheduleRedraw();
      return false;
    };

    p.mousePressed = () => {
      isDragging = true;
      dragStartScreenX = p.mouseX;
      dragStartScreenY = p.mouseY;
      dragStartX = p.mouseX - panX;
      dragStartY = p.mouseY - panY;
      hasDragged = false;
    };

    p.mouseDragged = () => {
      if (!isDragging) return;
      panX = p.mouseX - dragStartX;
      panY = p.mouseY - dragStartY;
      if (p.dist(p.mouseX, p.mouseY, dragStartScreenX, dragStartScreenY) > 5) {
        hasDragged = true;
      }
      scheduleRedraw();
    };

    p.mouseReleased = () => {
      isDragging = false;
    };

    p.mouseMoved = () => {
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
        if (p.canvas) {
          p.canvas.style.cursor = hoverNode ? "pointer" : "default";
        }
        scheduleRedraw();
      }
    };

    p.mouseClicked = () => {
      if (hasDragged) return;
      if (hoverNode && hoverNode.post && hoverNode.post.url) {
        window.open(hoverNode.post.url, "_blank", "noreferrer");
      }
    };

    p.draw = () => {
      p.background(pieBackground);
      p.textSize(8);
      p.strokeJoin(p.ROUND);
      p.push();
      p.translate(p.width / 2 + panX, p.height / 2 + panY);
      p.scale(zoom);
      p.translate(-p.width / 2, -p.height / 2);
      drawBaseGeometry();
      drawNodes();
      drawAllLinks();
      drawHover();
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
  style={`background:${pieBackground}; color:${textColor};`}
>
  <div class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none">
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
        }}
        on:clearSelection={() => {
          selectedGroupId = null;
        }}
      />
    </div>
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
</section>

<style>
  :global(canvas) {
    display: block;
  }
</style>
