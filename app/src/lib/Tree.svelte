<script>
  import { onMount } from "svelte";
  import * as d3 from "d3";

  let { data } = $props();
  let container;

  const normalize = (v) => (v ?? "").trim().toLowerCase();

  const strip = (v) => {
    const base = normalize(v).split(":")[0];
    return base;
  };

  const theme = data?.dataset?.theme ?? {
    backgroundColor: "#111",
    circleColor: "#fff",
    textColor: "#fff",
    highlightColor: "#7B68EE",
  };

  const groupInfo = new Map(
    data.groups.map((g) => [
      strip(g.id),
      { label: g.label || g.id, subscribers: g.subscribers ?? 0 },
    ])
  );

  const edges = data.links
    .map((l) => ({
      source: strip(l.source || l.from),
      target: strip(l.target || l.to),
    }))
    .filter((l) => l.source && l.target && l.source !== l.target);

  const datasetRoot = strip(data?.dataset?.slug ?? "");

  const allNodes = new Set();
  edges.forEach((e) => {
    if (e.source) allNodes.add(e.source);
    if (e.target) allNodes.add(e.target);
  });

  let seed = datasetRoot || (edges.length ? edges[0].source : null);

  const children = new Map();
  for (const { source, target } of edges) {
    if (!children.has(source)) children.set(source, []);
    const arr = children.get(source);
    if (!arr.includes(target)) arr.push(target);
  }

  let layers = [];
  let discovered = new Set();

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

  enqueueRoot(seed);

  for (const id of allNodes) {
    if (!discovered.has(id)) enqueueRoot(id);
  }

  onMount(() => {
    if (!layers.length) return;

    const width = 2200;
    const height = 800;
    const left = 200;
    const top = 200;

    const xGap = 260;
    const yGap = 140;

    const pos = new Map();
    layers.forEach((layer, i) => {
      layer.forEach((id, j) => {
        pos.set(id, { x: left + i * xGap, y: top + j * yGap });
      });
    });

    const visibleEdges = edges.filter(
      (e) => pos.has(e.source) && pos.has(e.target)
    );

    const svg = d3
      .select(container)
      .append("svg")
      .attr("viewBox", [0, 0, width, height])
      .style("width", "100%")
      .style("height", "100%")
      .style("cursor", "grab");

    const zoomG = svg.append("g");

    zoomG
      .append("g")
      .selectAll("rect")
      .data(layers)
      .join("rect")
      .attr("x", (_, i) => left + i * xGap - xGap * 0.3)
      .attr("y", top - 200)
      .attr("width", xGap)
      .attr("height", height)
      .attr("fill", "rgba(255,255,255,0.02)");

    const edgesG = zoomG
      .append("g")
      .attr("stroke", theme.highlightColor)
      .attr("fill", "none");

    const lines = edgesG
      .selectAll("line")
      .data(visibleEdges)
      .join("line")
      .attr("x1", (d) => pos.get(d.source).x)
      .attr("y1", (d) => pos.get(d.source).y)
      .attr("x2", (d) => pos.get(d.target).x)
      .attr("y2", (d) => pos.get(d.target).y)
      .attr("stroke-width", 1.3)
      .attr("stroke-opacity", 0.35);

    const node = zoomG
      .append("g")
      .selectAll("a")
      .data([...discovered])
      .join("a")
      .attr("transform", (id) => {
        const p = pos.get(id);
        return `translate(${p.x},${p.y})`;
      })
      .attr("href", (id) => `https://t.me/${id}`)
      .attr("target", "_blank")
      .attr("rel", "noopener noreferrer");

    node.append("circle").attr("r", 5).attr("fill", theme.textColor);

    node
      .append("text")
      .attr("x", 0)
      .attr("dy", "-0.45em")
      .attr("fill", theme.textColor)
      .attr("font-size", 17)
      .text((id) => groupInfo.get(id)?.label || id);

    node
      .on("mouseenter", (event, id) => {
        lines.attr("stroke-opacity", (d) =>
          d.source === id || d.target === id ? 0.85 : 0.05
        );
      })
      .on("mouseleave", () => {
        lines.attr("stroke-opacity", 0.35);
      });

    const zoom = d3
      .zoom()
      .scaleExtent([0.15, 6])
      .on("zoom", (e) => zoomG.attr("transform", e.transform));

    const seedPos = pos.get(seed || [...discovered][0]);
    const startScale = 4.2;
    const tx = width / 2 - seedPos.x * startScale;
    const ty = height / 2 - seedPos.y * startScale;

    const initial = d3.zoomIdentity.translate(tx, ty).scale(startScale);

    zoomG.attr("transform", initial);
    svg.call(zoom).call(zoom.transform, initial);
  });
</script>

<div
  bind:this={container}
  style="width:100vw;height:100vh;overflow:hidden;"
></div>

