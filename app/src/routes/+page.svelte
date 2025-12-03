<script>
  const TAU = Math.PI * 2;

  export let data;
  const { posts, links, groups, layout: precomputedLayout } = data;

  const width = precomputedLayout?.width ?? 3000;
  const height = precomputedLayout?.height ?? 3000;
  const cx = width / 2;
  const cy = height / 2;
  const viewPadding = 280;
  const innerRadius = 3;
  const outerRadius = Math.min(width, height) / 2 - 50;
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

  const linkCountByPost = new Map();
  for (const link of links) {
    linkCountByPost.set(
      link.source,
      (linkCountByPost.get(link.source) ?? 0) + 1
    );
    linkCountByPost.set(
      link.target,
      (linkCountByPost.get(link.target) ?? 0) + 1
    );
  }

  let sizeMode = "links";
  let showLinks = false;
  let selectedGroupId = null;
  $: selectedGroup =
    selectedGroupId === null
      ? null
      : (sliceForGroup.get(selectedGroupId)?.group ?? null);

  const toggleGroup = (groupId) => {
    selectedGroupId = selectedGroupId === groupId ? null : groupId;
  };

  const postCountByGroup = new Map();
  for (const post of posts) {
    postCountByGroup.set(post.chat, (postCountByGroup.get(post.chat) ?? 0) + 1);
  }

  const knownGroups = new Map(
    groups.map((g) => [
      g.id,
      {
        ...g,
        postCount: postCountByGroup.get(g.id) ?? 0,
      },
    ])
  );

  for (const chat of new Set(posts.map((p) => p.chat))) {
    if (!knownGroups.has(chat)) {
      knownGroups.set(chat, {
        id: chat,
        label: chat,
        postCount: postCountByGroup.get(chat) ?? 0,
      });
    }
  }

  const orderedGroups = [...knownGroups.values()]
    .filter((g) => (g.postCount ?? 0) > 0)
    .sort((a, b) => {
      const aSubs = a.subscribers ?? 0;
      const bSubs = b.subscribers ?? 0;
      if (aSubs !== bSubs) return bSubs - aSubs;
      const aPosts = a.postCount ?? 0;
      const bPosts = b.postCount ?? 0;
      if (aPosts !== bPosts) return bPosts - aPosts;
      return a.label.localeCompare(b.label);
    });

  const sliceAngle = orderedGroups.length ? TAU / orderedGroups.length : TAU;
  const sliceGap = Math.min(0.4, sliceAngle * 0.18);
  const baseStart = -Math.PI / 2;

  const colorForGroup = () => "#ffffff";

  const groupSlices = orderedGroups.map((group, idx) => {
    const start = baseStart + idx * sliceAngle + sliceGap / 2;
    const end = baseStart + (idx + 1) * sliceAngle - sliceGap / 2;
    return {
      group,
      start,
      end,
      center: start + (end - start) / 2,
      idx,
      color: colorForGroup(idx),
    };
  });

  const sliceForGroup = new Map(
    groupSlices.map((slice) => [slice.group.id, slice])
  );
  const precomputedNodeById = precomputedLayout
    ? new Map(precomputedLayout.nodes.map((n) => [n.id, n]))
    : null;

  const nodes = [];
  let nodeIndex = 0;

  if (!precomputedNodeById) {
    throw new Error("Precomputed layout is required for page2");
  }

  for (const post of posts) {
    const saved = precomputedNodeById.get(post.id);
    if (!saved) continue;
    const slice = sliceForGroup.get(post.chat);

    nodes.push({
      index: nodeIndex++,
      id: post.id,
      groupId: post.chat,
      post,
      color: slice?.color ?? "#ffffff",
      radiusReactions: saved.radiusReactions ?? 5,
      radiusLinks: saved.radiusLinks ?? 5,
      collisionRadius: saved.collisionRadius ?? 5,
      x: saved.x,
      y: saved.y,
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = links
    .map((link) => {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      if (!source || !target) return null;
      const minGap = source.collisionRadius + target.collisionRadius + 12;
      return {
        source,
        target,
        type: link.type,
        desired: minGap + 8,
      };
    })
    .filter((edge) => edge !== null);

  const toCartesian = (radius, angle) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  });

  const arcPath = (r0, r1, startAngle, endAngle) => {
    const p0 = toCartesian(r1, startAngle);
    const p1 = toCartesian(r1, endAngle);
    const p2 = toCartesian(r0, endAngle);
    const p3 = toCartesian(r0, startAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r1} ${r1} 0 ${largeArc} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r0} ${r0} 0 ${largeArc} 0 ${p3.x} ${p3.y} Z`;
  };

  const slicePaths = groupSlices.map((slice) => ({
    id: slice.group.id,
    label: slice.group.label ?? slice.group.id,
    color: slice.color,
    path: arcPath(innerRadius - 28, outerRadius + 12, slice.start, slice.end),
    labelPos: toCartesian(outerRadius + 26, slice.center),
    angleDeg: (slice.center * 180) / Math.PI,
  }));

  const linkPaths = edges.map((edge, idx) => {
    const sx = edge.source.x;
    const sy = edge.source.y;
    const tx = edge.target.x;
    const ty = edge.target.y;
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const offsetX = midX - cx;
    const offsetY = midY - cy;
    const ctrlX = midX + offsetX * 0.14;
    const ctrlY = midY + offsetY * 0.14;
    return {
      id: `${edge.source.id}-${edge.target.id}-${idx}`,
      d: `M ${sx} ${sy} Q ${ctrlX} ${ctrlY} ${tx} ${ty}`,
      crossGroup: edge.source.groupId !== edge.target.groupId,
      sourceId: edge.source.id,
      targetId: edge.target.id,
    };
  });

  const ringTicks = precomputedLayout?.ringTicks ?? [];
  const outerTick = ringTicks.length ? ringTicks[ringTicks.length - 1] : null;
  const innerTicks =
    ringTicks.length > 1 ? ringTicks.slice(0, ringTicks.length - 1) : [];
  const maxNodeRadial = nodes.reduce(
    (m, n) => Math.max(m, Math.hypot(n.x - cx, n.y - cy)),
    0
  );
  const radialPosts = nodes.map((n) => ({
    radius: Math.hypot(n.x - cx, n.y - cy),
    dateMs: n.post.dateMs,
  }));
  const outerRingRadius =
    Math.max(outerTick?.radius ?? 0, maxNodeRadial + 12) ||
    Math.min(width, height) / 2 - 50;

  const ticksByRadius = [...ringTicks].sort((a, b) => a.radius - b.radius);

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
    <header
      class="absolute left-1/2 top-4 z-20 flex w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-between gap-4 rounded-lg bg-black p-2"
    >
      <div class="space-y-2">
        <div class="flex flex-wrap gap-3 text-gray-100">
          <span>{posts.length} posts</span>
          <span>{orderedGroups.length} groups</span>
          <span>{links.length} links</span>
          {#if selectedGroup}
            <span
              class="flex items-center gap-3 bg-white text-black px-3 py-1 rounded-full text-sm"
            >
              <span>{selectedGroup.label}</span>
              {#if subscriberText(selectedGroup.subscribers)}
                <span>
                  {subscriberText(selectedGroup.subscribers)}
                </span>
              {/if}
              <span>
                {(selectedGroup.postCount ?? 0).toLocaleString()} posts
              </span>
              <button
                class="underline decoration-dotted"
                on:click={() => (selectedGroupId = null)}
              >
                clear
              </button>
            </span>
          {/if}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <div class="flex rounded-full border border-gray-700 overflow-hidden">
          <button
            class={`px-3 py-2 ${sizeMode === "reactions" ? "bg-white text-black" : "bg-transparent text-white"}`}
            on:click={() => (sizeMode = "reactions")}
          >
            Size by reactions
          </button>
          <button
            class={`px-3 py-2 ${sizeMode === "links" ? "bg-white text-black" : "bg-transparent text-white"}`}
            on:click={() => (sizeMode = "links")}
          >
            Size by forwards
          </button>
        </div>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={showLinks}
            class="accent-white"
          />
          <span>Show links</span>
        </label>
      </div>
    </header>

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

            <!-- <g class="links" stroke-linecap="round" stroke-linejoin="round">
          {#each linkPaths as link}
            <path
              d={link.d}
              fill="none"
              stroke="var(--highlite-color)"
              stroke-width={link.crossGroup ? 1.3 : 0.8}
              opacity={link.crossGroup ? 0.28 : 0.12}
            />
          {/each}
        </g> -->

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
                      r={sizeMode === "links"
                        ? node.radiusLinks
                        : node.radiusReactions}
                      fill={node.color}
                      fill-opacity="1"
                      stroke="#ffffff"
                      stroke-opacity="0.35"
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
            </g></svg
          >
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
