<script>
  import P5 from "p5-svelte";
  import NetworkControls from "$lib/NetworkControls.svelte";
  import Tooltip from "$lib/Tooltip.svelte";
  import Trailer from "$lib/Trailer.svelte";
  import ExportControl from "$lib/ExportControl.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";
  import { captureCanvasAsPng } from "$lib/captureCanvas.js";

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

    let zoom = 1.8;
    let panX = 0;
    let panY = 0;
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

    const getWorldSize = () => ({
      w: p.width * increase,
      h: p.height * increase,
    });

    const getWorldCenter = () => {
      const { w, h } = getWorldSize();
      return { x: w / 2, y: h / 2 };
    };

    const updatePanEnabled = () => {
      const w = p.windowWidth ?? p.width ?? 0;
      panEnabled = w >= 760;
      if (!panEnabled) {
        panX = 0;
        panY = 0;
      }
    };

    const scheduleRedraw = () => {
      if (localRedrawPending) return;
      localRedrawPending = true;
      requestAnimationFrame(() => {
        localRedrawPending = false;
        p.redraw();
      });
    };

    const getLayoutCenter = () => ({
      cx: getWorldCenter().x - extrudeOffsetX / 2,
      cy: getWorldCenter().y - extrudeOffsetY / 2,
    });

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
      types = buildTypeOrder(nodes);

      groupMaxLinks = {};
      groupMaxReactions = {};
      for (const t of types) {
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
      }

      nodesById = {};
      for (const n of nodes) nodesById[n.id] = n;
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
      for (const t of types) {
        const count = groups[t].length;
        total += findMinimalThetaForWedge(count, radius);
      }
      return total;
    };

    const findOuterRadius = (groups) => {
      let low = dotSize * 2;
      let high = dotSize * 600;
      let best = high;
      for (let i = 0; i < 22; i += 1) {
        const mid = (low + high) / 2;
        const total = totalThetaForRadius(mid, groups);
        if (total > 2 * Math.PI) low = mid;
        else {
          best = mid;
          high = mid;
        }
      }
      return best;
    };

    const computeWedgeData = (groups, radius) => {
      let sumTheta = 0;
      const temp = {};
      for (const t of types) {
        const count = groups[t].length;
        const theta = findMinimalThetaForWedge(count, radius);
        temp[t] = { angle: theta };
        sumTheta += theta;
      }
      const scale = (2 * Math.PI) / Math.max(sumTheta, 1e-6);
      let start = 0;
      const result = {};
      for (const t of types) {
        const adjusted = temp[t].angle * scale;
        result[t] = { angle: adjusted, start, mid: start + adjusted / 2 };
        start += adjusted;
      }
      return result;
    };

    const assignNodePositions = (groups, radius, wedges) => {
      const { cx, cy } = getLayoutCenter();

      for (const t of types) {
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
            assigned.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
          }
          remaining -= countInRing;
          r -= dotSize;
        }

        for (let i = 0; i < nodesOfType.length; i += 1) {
          const n = nodesOfType[i];
          const pt = assigned[i];
          if (pt) {
            n.x = pt.x;
            n.y = pt.y;
          } else {
            n.x = cx;
            n.y = cy;
          }
        }
      }
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
      zoom = p.constrain(fitZoom * fill, 0.001, 5);
      panX = 0;
      panY = 0;
    };

    const computeLayout = () => {
      const groups = {};
      for (const t of types) {
        groups[t] = nodes
          .filter((n) => n.type === t)
          .sort(
            (a, b) =>
              (a.degreeCentrality || 0) - (b.degreeCentrality || 0) ||
              (b.timestamp || 0) - (a.timestamp || 0)
          );
      }
      outerRadius = findOuterRadius(groups);
      wedgeData = computeWedgeData(groups, outerRadius);
      assignNodePositions(groups, outerRadius, wedgeData);
      rebuildHoverGrid();
      invalidateLayers();
      rebuildStaticLayer();
      rebuildNodesLayer();
      rebuildLinksLayer();
      fitZoomToView();
    };

    const screenToWorld = (sx, sy) => {
      const { x: worldCx, y: worldCy } = getWorldCenter();
      sx -= p.width / 2 + panX;
      sy -= p.height / 2 + panY;
      sx /= zoom;
      sy /= zoom;
      sx += worldCx;
      sy += worldCy;
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

    const shortenText = (str, maxLen = 30) => {
      if (!str) return "";
      return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
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

    const getArcPoints = (cx, cy, r, startAng, endAng, steps = 32) => {
      const pts = [];
      for (let i = 0; i <= steps; i += 1) {
        const a = p.map(i, 0, steps, startAng, endAng);
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      return pts;
    };

    const drawArcText = (ctx, txt, cx, cy, r, startAngle, endAngle) => {
      if (!txt || r <= 1) return;

      const baseSize = ctx.textSize();
      const padAngle = 0.03;
      const a0 = startAngle + padAngle;
      const a1 = endAngle - padAngle;
      if (a1 <= a0) return;

      const availableAngle = a1 - a0;
      const halfPi = Math.PI / 2;
      const minSize = Math.max(7, baseSize * 0.6);

      // const buildChars = (s) =>
      //   [...s].map((ch, i) => (i === 0 ? ch.toUpperCase() : ch));
      const buildChars = (s) => [...s];

      const measureRun = (chars) => {
        const textSize = ctx.textSize();
        const minAdvancePx = Math.max(1, textSize * 0.6);
        const minSpacePx = Math.max(1, textSize * 0.6);

        const s = chars.join("");
        const advances = new Array(s.length);
        const prefixWidths = new Array(s.length + 1);
        prefixWidths[0] = 0;

        for (let i = 0; i < s.length; i += 1) {
          let a = ctx.textWidth(s[i]);
          if (!Number.isFinite(a) || a <= 0) a = minAdvancePx;
          if (s[i] === " ") a = Math.max(a, minSpacePx);
          a = Math.max(a, minAdvancePx);
          advances[i] = a;
          prefixWidths[i + 1] = prefixWidths[i] + a;
        }

        const totalPx = prefixWidths[s.length];
        const totalAngle = totalPx / r;

        return { prefixWidths, advances, totalPx, totalAngle, text: s };
      };

      const fitChars = (chars) => {
        const ell = buildChars("…");

        const m0 = measureRun(chars);
        if (m0.totalAngle <= availableAngle) return { chars, m: m0 };

        const mell = measureRun(ell);
        if (mell.totalAngle > availableAngle) return { chars: ell, m: mell };

        let lo = 0;
        let hi = chars.length;
        let best = 0;

        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const sliced = chars.slice(0, mid);
          const test = mid < chars.length ? sliced.concat(ell) : sliced;
          const tm = measureRun(test);
          if (tm.totalAngle <= availableAngle) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }

        const sliced = chars.slice(0, best);
        const finalChars = best < chars.length ? sliced.concat(ell) : sliced;
        return { chars: finalChars, m: measureRun(finalChars) };
      };

      let chars = buildChars(txt);
      let fitted = fitChars(chars);

      while (fitted.m.totalAngle > availableAngle && ctx.textSize() > minSize) {
        ctx.textSize(ctx.textSize() * 0.9);
        fitted = fitChars(chars);
      }

      if (fitted.m.totalAngle > availableAngle) {
        ctx.textSize(baseSize);
        return;
      }

      chars = fitted.chars;

      const { prefixWidths, advances, totalPx } = fitted.m;

      const midAngle = (a0 + a1) / 2;
      const reverse = midAngle < Math.PI;

      const startTheta = reverse
        ? midAngle + totalPx / r / 2
        : midAngle - totalPx / r / 2;

      for (let i = 0; i < chars.length; i += 1) {
        const ch = chars[i];
        const posPx = prefixWidths[i] + (advances?.[i] ?? 0) / 2;
        const theta = reverse ? startTheta - posPx / r : startTheta + posPx / r;

        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);

        if (ch === " ") continue;

        ctx.push();
        ctx.translate(x, y);
        let rotation = theta + halfPi;
        if (reverse) rotation += Math.PI;
        ctx.rotate(rotation);
        ctx.textAlign(ctx.CENTER, ctx.CENTER);
        ctx.text(ch, 0, 0);
        ctx.pop();
      }

      ctx.textSize(baseSize);
    };

    const drawWedgeLayer = (ctx) => {
      const cx = (p.width * increase) / 2 - extrudeOffsetX / 2;
      const cy = (p.height * increase) / 2 - extrudeOffsetY / 2;

      ctx.push();
      ctx.fill(pieFill);
      ctx.noStroke();
      ctx.ellipse(cx, cy, outerRadius * 2, outerRadius * 2);
      ctx.pop();

      ctx.push();
      for (const t of Object.keys(wedgeData)) {
        const w = wedgeData[t];

        ctx.stroke(circleColor);
        ctx.strokeWeight(0.5);
        ctx.noFill();
        ctx.arc(
          cx,
          cy,
          outerRadius * 2,
          outerRadius * 2,
          w.start,
          w.start + w.angle
        );

        // ctx.line(
        //   cx,
        //   cy,
        //   cx + outerRadius * Math.cos(w.start),
        //   cy + outerRadius * Math.sin(w.start)
        // );
        ctx.line(
          cx,
          cy,
          cx + outerRadius * Math.cos(w.start + w.angle),
          cy + outerRadius * Math.sin(w.start + w.angle)
        );

        const labelRaw = shortenText(t, 64).toLowerCase();
        const labelRadius = outerRadius + dotSize * 1.45;

        ctx.push();
        ctx.noStroke();
        ctx.fill(highlightColor);
        ctx.textFont(labelFont);
        ctx.textSize(dotSize * 1.5);
        drawArcText(
          ctx,
          labelRaw,
          cx,
          cy,
          labelRadius,
          w.start,
          w.start + w.angle
        );
        ctx.pop();
      }
      ctx.pop();
    };

    const drawBaseGeometry = (ctx) => {
      const cx = (p.width * increase) / 2 - extrudeOffsetX / 2;
      const cy = (p.height * increase) / 2 - extrudeOffsetY / 2;

      ctx.fill(pieFill);
      ctx.stroke(circleColor);
      ctx.strokeWeight(0.5);

      ctx.ellipse(
        cx + extrudeOffsetX,
        cy + extrudeOffsetY,
        outerRadius * 2,
        outerRadius * 2
      );

      const extrusionMargin = dotSize * 0.1;
      ctx.noStroke();
      ctx.fill(pieFill);
      ctx.beginShape();
      ctx.vertex(cx - outerRadius + extrusionMargin, cy);
      ctx.vertex(cx + outerRadius - extrusionMargin, cy);
      ctx.vertex(
        cx + extrudeOffsetX + outerRadius - extrusionMargin,
        cy + extrudeOffsetY
      );
      ctx.vertex(
        cx + extrudeOffsetX - outerRadius + extrusionMargin,
        cy + extrudeOffsetY
      );
      ctx.endShape(ctx.CLOSE);

      for (const t of Object.keys(wedgeData)) {
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

        ctx.stroke(circleColor);
        ctx.noFill();
        ctx.strokeWeight(0.5);

        ctx.line(
          topArcPoints[0].x,
          topArcPoints[0].y,
          bottomArcPoints[0].x,
          bottomArcPoints[0].y
        );
        ctx.line(
          topArcPoints[topArcPoints.length - 1].x,
          topArcPoints[topArcPoints.length - 1].y,
          bottomArcPoints[bottomArcPoints.length - 1].x,
          bottomArcPoints[bottomArcPoints.length - 1].y
        );
      }

      drawWedgeLayer(ctx);
    };

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
      drawBaseGeometry(staticLayer);
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

    const drawHover = () => {
      if (!hoverNode) return;

      const neighborIds = linksByNode.get(hoverNode.id);
      if (neighborIds && neighborIds.size) {
        p.push();
        p.stroke(highlightColor);
        p.strokeWeight(0.5);
        p.noFill();
        for (const neighborId of neighborIds) {
          if (!visibleNodeIds.has(neighborId)) continue;
          const neighbor = nodesById[neighborId];
          if (!neighbor) continue;
          p.line(hoverNode.x, hoverNode.y, neighbor.x, neighbor.y);
        }
        p.pop();
      }

      const innerSize = nodeInnerSize(hoverNode);

      // p.stroke(0);
      // p.strokeWeight(.5);
      p.noStroke();
      p.fill(highlightColor);
      p.ellipse(hoverNode.x, hoverNode.y, dotSize, dotSize);

      p.noStroke();
      p.fill(highlightColor);
      p.ellipse(hoverNode.x, hoverNode.y, innerSize, innerSize);

      p.push();
      p.textFont(labelFont);
      p.textSize(8);
      p.stroke(255);
      p.strokeWeight(1);
      p.fill(highlightColor);
      p.text(shortenText(hoverNode.id), hoverNode.x, hoverNode.y - 8);

      p.pop();
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
      const step = 0.001;
      let nextZoom = zoom - event.deltaY * step;
      nextZoom = p.constrain(nextZoom, 0.001, 5);

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
      if (trailerBlocking) return;
      const pressed = getNodeUnderPoint(p.mouseX, p.mouseY);
      pressedNodeUrl = pressed?.post?.url?.trim?.() ?? null;
      hasDragged = false;
      if (!panEnabled) return;
      isDragging = true;
      dragStartScreenX = p.mouseX;
      dragStartScreenY = p.mouseY;
      dragStartX = p.mouseX - panX;
      dragStartY = p.mouseY - panY;
    };

    p.mouseDragged = () => {
      if (trailerBlocking) return;
      if (!panEnabled) return;
      if (isDragging && !p.mouseIsPressed) {
        endDrag();
        return;
      }
      if (!isDragging) return;
      panX = p.mouseX - dragStartX;
      panY = p.mouseY - dragStartY;
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

      const { x: worldCx, y: worldCy } = getWorldCenter();

      p.push();
      p.translate(p.width / 2 + panX, p.height / 2 + panY);
      p.scale(zoom);
      p.translate(-worldCx, -worldCy);

      if (staticLayer) p.image(staticLayer, 0, 0);
      if (nodesLayer) p.image(nodesLayer, 0, 0);
      if (linksLayer && showLinks) p.image(linksLayer, 0, 0);

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
      introSummary="this visualization groups posts by dominant topics."
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
