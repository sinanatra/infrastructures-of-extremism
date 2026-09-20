<script>
  import { onMount } from "svelte";
  import Trailer from "$lib/Trailer.svelte";
  import { prepareTreeData } from "$lib/tree/prepare.js";

  let {
    data,
    backgroundColor = "#ffffff",
    circleColor = "#222222",
    textColor = "#111111",
    highlightColor = "#888888",
  } = $props();

  const { theme, nodes, linkSegments, trailerGroups, trailerSeedLabel, seed } =
    prepareTreeData(data, {
      backgroundColor,
      circleColor,
      textColor,
      highlightColor,
    });

  const trailerAvailable = trailerGroups.length > 0;
  let trailerBlocking = $state(trailerAvailable);

  const columns = $derived.by(() => {
    const cols = [];
    for (const node of nodes) {
      (cols[node.layerIndex] ??= []).push(node);
    }
    return cols.map((c) => c ?? []);
  });

  let hoveredId = $state(null);
  let pinnedId = $state(
    seed && nodes.some((n) => n.id === seed) ? seed : (nodes[0]?.id ?? null),
  );
  const activeId = $derived(pinnedId ?? hoveredId);
  const activeNode = $derived(nodes.find((n) => n.id === activeId) ?? null);

  const connectedIds = $derived.by(() => {
    const set = new Set();
    if (!activeId) return set;
    set.add(activeId);
    for (const link of linkSegments) {
      if (link.source.id === activeId) set.add(link.target.id);
      else if (link.target.id === activeId) set.add(link.source.id);
    }
    return set;
  });

  const handleNodeClick = (node, event) => {
    event?.stopPropagation();
    if (trailerBlocking) return;
    if (pinnedId === node.id) {
      window.open(`https://t.me/${node.id}`, "_blank", "noreferrer");
      return;
    }
    pinnedId = node.id;
  };

  const clearPin = () => {
    pinnedId = null;
  };

  const nodeClasses = (node) => {
    const isRoot = node.layerIndex === 0;
    const isActive = activeId === node.id;
    const isDim = Boolean(activeId) && !connectedIds.has(node.id);
    return [
      "appearance-none relative rounded-md border px-1.5 py-.5 text-xs text-left whitespace-nowrap overflow-hidden text-ellipsis max-w-[220px] cursor-pointer transition duration-150",
      "text-[var(--node-text)] shadow-[0_0_0_3px_var(--node-bg)]",
      isRoot ? "text-sm font-semibold" : "",
      isRoot
        ? "bg-[color-mix(in_srgb,var(--node-color)_25%,var(--node-bg))]"
        : "bg-[color-mix(in_srgb,var(--node-color)_16%,var(--node-bg))]",
      isActive
        ? "border-[var(--node-color)] translate-x-0.5"
        : "border-[color-mix(in_srgb,var(--node-color)_55%,transparent)]",
      node.isBroken ? "border-dashed" : "",
      isDim ? "opacity-30" : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  let canvasEl = $state(null);
  let edgePaths = $state([]);
  const nodeEls = {};

  const computeEdges = () => {
    if (!canvasEl || !activeId) {
      edgePaths = [];
      return;
    }
    const canvasRect = canvasEl.getBoundingClientRect();
    const paths = [];
    linkSegments.forEach((link, i) => {
      if (link.source.id !== activeId && link.target.id !== activeId) return;
      const sEl = nodeEls[link.source.id];
      const tEl = nodeEls[link.target.id];
      if (!sEl || !tEl) return;
      const sRect = sEl.getBoundingClientRect();
      const tRect = tEl.getBoundingClientRect();
      const x1 = sRect.right - canvasRect.left;
      const y1 = sRect.top - canvasRect.top + sRect.height / 2;
      const x2 = tRect.left - canvasRect.left;
      const y2 = tRect.top - canvasRect.top + tRect.height / 2;
      const forward = link.target.layerIndex > link.source.layerIndex;
      let d;
      if (forward) {
        const dx = Math.max(40, (x2 - x1) * 0.5);
        d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      } else {
        const loopY = Math.max(y1, y2) + 46;
        d = `M ${x1} ${y1} C ${x1} ${loopY}, ${x2} ${loopY}, ${x2} ${y2}`;
      }
      paths.push({
        key: `${i}:${link.source.id}->${link.target.id}:${link.kind}`,
        d,
        forward,
      });
    });
    edgePaths = paths;
  };

  let computeScheduled = false;
  const scheduleCompute = () => {
    if (computeScheduled) return;
    computeScheduled = true;
    requestAnimationFrame(() => {
      computeScheduled = false;
      computeEdges();
    });
  };

  const registerNode = (el, id) => {
    nodeEls[id] = el;
    scheduleCompute();
    return {
      destroy() {
        if (nodeEls[id] === el) delete nodeEls[id];
        scheduleCompute();
      },
    };
  };

  $effect(() => {
    activeId;
    pinnedId;
    scheduleCompute();
  });

  onMount(() => {
    scheduleCompute();
    const ro = new ResizeObserver(() => scheduleCompute());
    if (canvasEl) ro.observe(canvasEl);
    window.addEventListener("resize", scheduleCompute);
    const onKeydown = (e) => {
      if (e.key === "Escape") clearPin();
    };
    window.addEventListener("keydown", onKeydown);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleCompute);
      window.removeEventListener("keydown", onKeydown);
    };
  });
</script>

<section
  class="relative h-screen overflow-hidden"
  style={`background:${theme.backgroundColor}; color:${theme.textColor};`}
>
  <div class="w-full h-full overflow-auto">
    <div
      class="relative w-max min-w-full min-h-full p-12"
      bind:this={canvasEl}
      role="presentation"
      onclick={clearPin}
    >
      <svg
        class="absolute inset-0 z-0 w-full h-full pointer-events-none overflow-visible"
      >
        <defs>
          <marker
            id="tree-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={theme.highlightColor} />
          </marker>
        </defs>
        {#each edgePaths as edge (edge.key)}
          <path
            d={edge.d}
            class="transition-[opacity,stroke-width] duration-150"
            fill="none"
            stroke={theme.highlightColor}
            stroke-width="1"
            stroke-dasharray={edge.forward ? "none" : "3 3"}
            marker-end="url(#tree-arrow)"
          />
        {/each}
      </svg>

      <div class="relative z-[1] flex items-start gap-[120px]">
        {#each columns as column, layerIndex (layerIndex)}
          <div class="flex flex-col gap-2.5 min-w-[160px]">
            {#each column as node (node.id)}
              <button
                type="button"
                class={nodeClasses(node)}
                style={`--node-color:${node.layerIndex === 0 ? theme.highlightColor : theme.circleColor}; --node-text:${theme.textColor}; --node-bg:${theme.backgroundColor};`}
                title={node.label}
                onmouseenter={() => (hoveredId = node.id)}
                onmouseleave={() => {
                  if (hoveredId === node.id) hoveredId = null;
                }}
                onclick={(event) => handleNodeClick(node, event)}
                use:registerNode={node.id}
              >
                {node.label}
              </button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  {#if activeNode}
    <aside
      class="absolute bottom-4 left-4 z-20 max-w-xs rounded border px-3 py-2 text-xs backdrop-blur-sm pointer-events-none"
      style={`border-color:${theme.highlightColor}; background:${theme.backgroundColor}CC; color:${theme.textColor};`}
    >
      <div class="font-semibold">{activeNode.label}</div>
      <div>@{activeNode.id}</div>
      <div>Depth: {activeNode.layerIndex}</div>
      {#if activeNode.subscribers}
        <div>Subscribers: {activeNode.subscribers}</div>
      {/if}
      {#if activeNode.isBroken}
        <div style={`color:${theme.highlightColor};`}>
          Broken target ({activeNode.brokenStatus || "resolve failed"})
        </div>
        {#if activeNode.brokenMentions}
          <div>Mentions: {activeNode.brokenMentions}</div>
        {/if}
      {/if}
    </aside>
  {/if}

  {#if trailerAvailable}
    <Trailer
      seedLabel={trailerSeedLabel}
      highlightColor={theme.highlightColor}
      backgroundColor={theme.backgroundColor}
      textColor={theme.textColor}
      introSummary="the tree shows who links to whom."
      on:block={(event) => {
        trailerBlocking = event.detail?.blocking ?? false;
      }}
    />
  {/if}
</section>
