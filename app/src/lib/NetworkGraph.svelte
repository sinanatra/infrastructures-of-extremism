<script>
  import NetworkControls from "$lib/NetworkControls.svelte";
  import { prepareNetwork } from "$lib/networkPrep.js";

  export let data;
  const { posts, links } = data;
  const prepared = prepareNetwork(data);
  const {
    width,
    height,
    cx,
    cy,
    viewPadding,
    outerRingRadius,
    orderedGroups,
    slicePaths,
    linkPaths,
    nodes,
    sizeStats,
    ringTicks,
    innerTicks,
    outerTick,
    radialPosts,
    ticksByRadius,
    linkCountByPost,
    sliceForGroup,
  } = prepared;
  let viewBox = {
    x: -viewPadding,
    y: -viewPadding,
    width: width + viewPadding * 2,
    height: height + viewPadding * 2,
  };
  let isPanning = false;
  let panState = null;
  const zoomStep = 1.08;
  const minScale = 0.5;
  const maxScale = 4;

  let sizeMode = "links";
  let showLinks = false;
  let showEmoji = false;
  let selectedGroupId = null;
  $: selectedGroup =
    selectedGroupId === null
      ? null
      : (sliceForGroup.get(selectedGroupId)?.group ?? null);

  const toggleGroup = (groupId) => {
    selectedGroupId = selectedGroupId === groupId ? null : groupId;
  };

  const timeAtRadius = (radius) => {
    if (!ticksByRadius.length) return null;
    if (radius <= ticksByRadius[0].radius) return ticksByRadius[0].time;
    if (radius >= ticksByRadius[ticksByRadius.length - 1].radius)
      return ticksByRadius[ticksByRadius.length - 1].time;
    for (let i = 1; i < ticksByRadius.length; i++) {
      const prev = ticksByRadius[i - 1];
      const curr = ticksByRadius[i];
      if (radius <= curr.radius) {
        const span = curr.radius - prev.radius || 1;
        const frac = (radius - prev.radius) / span;
        return prev.time + frac * (curr.time - prev.time);
      }
    }
    return ticksByRadius[ticksByRadius.length - 1].time;
  };

  let hoverTick = null;

  const toViewCoords = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const x = viewBox.x + (px / rect.width) * viewBox.width;
    const y = viewBox.y + (py / rect.height) * viewBox.height;
    return { x, y };
  };

  const onMouseMoveSvg = (event) => {
    const { x, y } = toViewCoords(event);
    const radiusRaw = Math.hypot(x - cx, y - cy);
    const radius = Math.min(radiusRaw, outerRingRadius);
    const tol = 12;
    const near = radialPosts.filter((p) => Math.abs(p.radius - radius) <= tol);
    if (near.length) {
      const minDate = Math.min(...near.map((p) => p.dateMs));
      const maxDate = Math.max(...near.map((p) => p.dateMs));
      const midDate = (minDate + maxDate) / 2;
      hoverTick = {
        radius,
        time: midDate,
        minDate,
        maxDate,
        count: near.length,
      };
      return;
    }
    const time = timeAtRadius(radius);
    hoverTick = time !== null ? { radius, time } : null;
  };

  const onMouseLeaveSvg = () => {
    hoverTick = null;
  };

  const subscriberText = (value) => {
    if (!value) return null;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m subs`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k subs`;
    return `${value} subs`;
  };

  const formatTick = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const formatHoverDate = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
  const tooltipForPost = (post) => {
    const lines = [
      post.label || post.id,
      `Group: ${post.chat}`,
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

  $: visibleNodes =
    selectedGroupId === null
      ? nodes
      : nodes.filter((n) => n.groupId === selectedGroupId);

  $: visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  $: visibleLinks = showLinks
    ? linkPaths.filter(
        (link) =>
          visibleNodeIds.has(link.sourceId) && visibleNodeIds.has(link.targetId)
      )
    : [];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const nodeSize = (node) =>
    sizeMode === "links" ? node.radiusLinks : node.radiusReactions;
  const emojiFontSize = (node) => {
    const base = nodeSize(node);
    const multiplier = sizeMode === "links" ? 3.4 : 2.8;
    return clamp(base * multiplier, 12, 72);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const pointerX =
      viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width;
    const pointerY =
      viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height;

    const direction = event.deltaY > 0 ? zoomStep : 1 / zoomStep;
    const nextScale = clamp(
      (viewBox.width / (width + viewPadding * 2)) * direction,
      minScale,
      maxScale
    );

    const newWidth = (width + viewPadding * 2) * nextScale;
    const newHeight = (height + viewPadding * 2) * nextScale;
    const offsetX = (pointerX - viewBox.x) / viewBox.width;
    const offsetY = (pointerY - viewBox.y) / viewBox.height;

    viewBox = {
      width: newWidth,
      height: newHeight,
      x: pointerX - offsetX * newWidth,
      y: pointerY - offsetY * newHeight,
    };
  };

  const startPan = (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target && (target.closest("a") || target.closest("text"))) return;
    isPanning = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    panState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      viewBoxX: viewBox.x,
      viewBoxY: viewBox.y,
    };
  };

  const handlePan = (event) => {
    if (!isPanning || !panState || event.pointerId !== panState.pointerId)
      return;
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - panState.x) / rect.width) * viewBox.width;
    const dy = ((event.clientY - panState.y) / rect.height) * viewBox.height;
    viewBox = {
      ...viewBox,
      x: panState.viewBoxX - dx,
      y: panState.viewBoxY - dy,
    };
  };

  const endPan = (event) => {
    if (!isPanning || !panState || event.pointerId !== panState.pointerId)
      return;
    isPanning = false;
    panState = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      console.warn("Pan end without capture", error);
    }
  };
</script>

<section class="min-h-screen text-white">
  <div class="relative">
    <NetworkControls
      counts={{ posts: posts.length, groups: orderedGroups.length, links: links.length }}
      {selectedGroup}
      {sizeMode}
      {showLinks}
      {showEmoji}
      {subscriberText}
      on:sizeMode={(event) => {
        sizeMode = event.detail;
        showEmoji = false;
      }}
      on:showLinks={(event) => (showLinks = event.detail)}
      on:showEmoji={(event) => (showEmoji = event.detail)}
      on:clearSelection={() => (selectedGroupId = null)}
    />

    <div class="relative bg-black">
      <div class="overflow-auto">
        <div class="min-h-[70vh] flex items-center justify-center">
          <svg
            role="img"
            class="w-full h-auto max-w-full zoomable"
            class:grabbing={isPanning}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            preserveAspectRatio="xMidYMid meet"
            aria-label="Radial network"
            on:mousemove={onMouseMoveSvg}
            on:mouseleave={onMouseLeaveSvg}
            on:wheel|preventDefault={handleWheel}
            on:pointerdown={startPan}
            on:pointermove={handlePan}
            on:pointerup={endPan}
            on:pointerleave={endPan}
          >
            <defs />

            <g class="slices">
              {#each slicePaths as slice}
                <text
                  on:click={() => toggleGroup(slice.id)}
                  class="cursor-pointer select-none"
                  x={slice.labelPos.x}
                  y={slice.labelPos.y}
                  text-anchor="start"
                  dominant-baseline="middle"
                  transform={`rotate(${slice.angleDeg}, ${slice.labelPos.x}, ${slice.labelPos.y})`}
                  fill={selectedGroupId === null || selectedGroupId === slice.id
                    ? "#f5f5f5"
                    : "#555"}
                  font-size="1.5rem"
                  font-weight="400"
                >
                  {slice.label}
                </text>
              {/each}
            </g>

            {#if visibleLinks.length}
              <g class="links" stroke-linecap="round" stroke-linejoin="round">
                {#each visibleLinks as link}
                  <path
                    d={link.d}
                    fill="none"
                    class="guide"
                    stroke="var(--highlite-color)"
                    stroke-width={link.crossGroup ? 1.3 : 0.8}
                    opacity={link.crossGroup ? 0.6 : 0.28}
                  />
                {/each}
              </g>
            {/if}

            {#if hoverTick}
              <g>
                <circle
                  {cx}
                  {cy}
                  r={hoverTick.radius}
                  fill="none"
                  stroke="black"
                  stroke-width="4"
                  stroke-dasharray="4 6"
                  opacity="0.4"
                />
                <circle
                  {cx}
                  {cy}
                  r={hoverTick.radius}
                  fill="none"
                  class="guide"
                  stroke="var(--highlite-color)"
                  stroke-dasharray="4 6"
                  opacity="0.7"
                />
                <text
                  x={cx}
                  y={cy - hoverTick.radius - 12}
                  text-anchor="middle"
                  stroke="black"
                  stroke-width="1"
                  class="guide"
                  fill="var(--highlite-color)"
                  font-size="1.4rem"
                  font-weight="700"
                >
                  {#if hoverTick.minDate && hoverTick.maxDate && hoverTick.minDate !== hoverTick.maxDate}
                    {formatHoverDate.format(hoverTick.minDate)} – {formatHoverDate.format(
                      hoverTick.maxDate
                    )}{hoverTick.count ? ` (${hoverTick.count})` : ""}
                  {:else}
                    {formatHoverDate.format(hoverTick.time)}{hoverTick?.count
                      ? ` (${hoverTick.count})`
                      : ""}
                  {/if}
                </text>
              </g>
            {/if}

            <g class="nodes">
              {#each visibleNodes as node (node.id)}
                {#if node.post.url}
                  <a href={node.post.url} target="_blank" rel="noreferrer">
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      class="cursor-pointer"
                      role="presentation"
                    >
                      {#if showEmoji && node.topEmoji && node.topEmojiCount > 0}
                        <text
                          text-anchor="middle"
                          dominant-baseline="middle"
                          font-size={`${emojiFontSize(node)}px`}
                          opacity="1"
                        >
                          {node.topEmoji}
                        </text>
                      {:else if !showEmoji}
                        <circle
                          r={sizeMode === "links"
                            ? node.radiusLinks
                            : node.radiusReactions}
                          fill={node.color}
                          fill-opacity="1"
                          stroke="#000"
                          stroke-width="1.5"
                          stroke-opacity="1"
                        />
                      {/if}
                      <title>{tooltipForPost(node.post)}</title>
                    </g>
                  </a>
                {:else}
                  <g
                    transform={`translate(${node.x}, ${node.y})`}
                    class="cursor-pointer"
                    role="presentation"
                  >
                    {#if showEmoji && node.topEmoji && node.topEmojiCount > 0}
                      <text
                        text-anchor="middle"
                        dominant-baseline="middle"
                        font-size={`${emojiFontSize(node)}px`}
                        opacity="1"
                      >
                        {node.topEmoji}
                      </text>
                    {:else if !showEmoji}
                      <circle
                        r={sizeMode === "links"
                          ? node.radiusLinks
                          : node.radiusReactions}
                        fill={node.color}
                        fill-opacity="1"
                        stroke="#ffffff"
                        stroke-opacity="0.35"
                      />
                    {/if}
                    <title>{tooltipForPost(node.post)}</title>
                  </g>
                {/if}
              {/each}
            </g>

            <g class="rings">
              {#if innerTicks.length}
                {#each innerTicks as tick}
                  <g>
                    <circle
                      class="guide"
                      {cx}
                      {cy}
                      r={tick.radius}
                      fill="none"
                      stroke="var(--highlite-color)"
                      stroke-dasharray="3 5"
                    />
                    <text
                      class="guide"
                      x={cx}
                      y={cy - tick.radius - 6}
                      text-anchor="middle"
                      stroke="black"
                      stroke-width="1"
                      fill="var(--highlite-color)"
                      font-size="1.4rem"
                      font-weight="700"
                    >
                      {formatTick.format(tick.time)}
                    </text>
                  </g>
                {/each}
              {/if}

              {#if outerTick}
                <g>
                  <circle
                    {cx}
                    {cy}
                    r={outerRingRadius}
                    fill="none"
                    class="guide"
                    stroke="var(--highlite-color)"
                    stroke-dasharray="3 5"
                  />
                  <text
                    x={cx}
                    y={cy - outerRingRadius - 12}
                    text-anchor="middle"
                    stroke="black"
                    stroke-width="1"
                    class="guide"
                    fill="var(--highlite-color)"
                    font-size="1.4rem"
                    font-weight="700"
                  >
                    {formatTick.format(outerTick.time)}
                  </text>
                </g>
              {/if}
            </g>
          </svg>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .guide {
    pointer-events: none;
    user-select: none;
  }

  .zoomable {
    cursor: grab;
    touch-action: none;
  }

  .zoomable.grabbing {
    cursor: grabbing;
  }
</style>
