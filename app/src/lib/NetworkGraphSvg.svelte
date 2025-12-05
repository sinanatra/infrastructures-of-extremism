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
  const baseWidth = width + viewPadding * 2;
  const baseHeight = height + viewPadding * 2;
  const initialScale = 0.6;
  let viewBox = {
    width: baseWidth * initialScale,
    height: baseHeight * initialScale,
    x: -viewPadding + (baseWidth - baseWidth * initialScale) / 2,
    y: -viewPadding + (baseHeight - baseHeight * initialScale) / 2,
  };
  let isPanning = false;
  let panState = null;
  const zoomStep = 1.08;
  const minScale = 0.1;
  const maxScale = 0.9;

  let sizeMode = "links";
  let showLinks = false;
  let selectedEmoji = null;
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

  $: topEmojis =
    (() => {
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
    })();

  $: visibleNodes =
    nodes.filter(
      (n) =>
        (selectedGroupId === null || n.groupId === selectedGroupId) &&
        (selectedEmoji === null || n.topEmoji === selectedEmoji)
    );

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

<section class="relative h-screen text-white overflow-hidden bg-black">
  <div class="absolute inset-x-0 top-0 z-10 p-4 pointer-events-none">
    <div class="pointer-events-auto max-w-5xl mx-auto">
      <NetworkControls
        counts={{
          posts: posts.length,
          groups: orderedGroups.length,
          links: links.length,
        }}
        {selectedGroup}
        {sizeMode}
        {showLinks}
        {topEmojis}
        {selectedEmoji}
        {subscriberText}
        on:sizeMode={(event) => {
          sizeMode = event.detail;
        }}
        on:showLinks={(event) => (showLinks = event.detail)}
        on:selectEmoji={(event) => (selectedEmoji = event.detail)}
        on:clearSelection={() => (selectedGroupId = null)}
      />
    </div>
  </div>

  <div class="h-full w-full flex items-center justify-center">
    <svg
      role="img"
      class="w-full h-full max-w-full max-h-full zoomable"
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
            text-anchor={slice.labelAnchor}
            dominant-baseline="middle"
            transform={`rotate(${slice.labelRotation}, ${slice.labelPos.x}, ${slice.labelPos.y})`}
            fill="var(--highlite-color)"
            font-size="1.6rem"
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
              stroke-width={link.crossGroup ? 0.9 : 0.6}
              opacity={link.crossGroup ? 0.55 : 0.25}
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
            class="guide"
            stroke="var(--highlite-color)"
            stroke-dasharray="4 6"
            opacity="0.7"
          />
          <text
            x={cx}
            y={cy - hoverTick.radius - 12}
            text-anchor="middle"
            class="guide"
            fill="var(--highlite-color)"
            stroke="black"
            stroke-width="0.4"
            font-size="1.1rem"
            font-weight="600"
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
              <circle
                r={sizeMode === "links" ? node.radiusLinks : node.radiusReactions}
                fill={node.color}
                fill-opacity="1"
                stroke="var(--highlite-color)"
                stroke-width="0.7"
                stroke-opacity="0.7"
              />
                <title>{tooltipForPost(node.post)}</title>
              </g>
            </a>
          {:else}
            <g
              transform={`translate(${node.x}, ${node.y})`}
              class="cursor-pointer"
              role="presentation"
            >
              <circle
                r={sizeMode === "links" ? node.radiusLinks : node.radiusReactions}
                fill={node.color}
                fill-opacity="1"
                stroke="var(--highlite-color)"
                stroke-width="0.7"
                stroke-opacity="0.6"
              />
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
                stroke-width="0.8"
                stroke-dasharray="3 5"
              />
              <text
                class="guide"
                x={cx}
                y={cy - tick.radius - 6}
                text-anchor="middle"
                fill="var(--highlite-color)"
                stroke="black"
                stroke-width="0.4"
                font-size="1.1rem"
                font-weight="600"
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
              stroke-width="0.8"
              stroke-dasharray="3 5"
            />
            <text
              x={cx}
              y={cy - outerRingRadius - 12}
              text-anchor="middle"
              class="guide"
              fill="var(--highlite-color)"
              stroke="black"
              stroke-width="0.4"
              font-size="1.1rem"
              font-weight="600"
            >
              {formatTick.format(outerTick.time)}
            </text>
          </g>
        {/if}
      </g>
    </svg>
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
