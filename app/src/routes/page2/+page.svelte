<script>
  const TAU = Math.PI * 2;

  export let data;
  const { posts, links, groups, layout: precomputedLayout } = data;

  const width = precomputedLayout?.width ?? 3000;
  const height = precomputedLayout?.height ?? 3000;
  const cx = width / 2;
  const cy = height / 2;
  const innerRadius = 3;
  const outerRadius = Math.min(width, height) / 2 - 50;

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

  const orderedGroups = [...knownGroups.values()].sort((a, b) => {
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

  const formatTick = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC", // avoid local TZ rolling the year forward
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

  $: visibleLinks = showLinks ? linkPaths : [];
</script>

<section
  class="min-h-screen bg-black text-white px-4 sm:px-6 md:px-10 py-8 space-y-6"
>
  <header class="flex flex-wrap justify-between gap-4">
    <div class="space-y-2">
      <div class="flex flex-wrap gap-3 text-gray-100 font-semibold">
        <span>{posts.length} posts</span>
        <span>{orderedGroups.length} groups</span>
        <span>{links.length} links</span>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <div class="flex rounded-md border border-gray-700 overflow-hidden">
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
          Size by mentions/forwards
        </button>
      </div>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" bind:checked={showLinks} class="accent-white" />
        <span>Show links</span>
      </label>
    </div>
  </header>

  <div class="relative bg-black p-4">
    <div class="overflow-auto">
      <svg
        role="img"
        class="w-full h-auto"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Radial network"
      >
        <defs />

        <g class="slices">
          {#each slicePaths as slice}
            <text
              x={slice.labelPos.x}
              y={slice.labelPos.y}
              text-anchor={slice.labelPos.x >= cx ? "start" : "end"}
              dominant-baseline="middle"
              fill="#f5f5f5"
              font-size="1rem"
              font-weight="800"
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
              stroke="red"
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
                stroke="red"
                stroke-width={link.crossGroup ? 1.3 : 0.8}
                opacity={link.crossGroup ? 0.6 : 0.28}
              />
            {/each}
          </g>
        {/if}

        <g class="nodes">
          {#each nodes as node (node.id)}
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
          {#each ringTicks as tick}
            <g>
              <circle
                {cx}
                {cy}
                r={tick.radius}
                fill="none"
                stroke="red"
                stroke-dasharray="3 5"
              />
              <text
                x={cx}
                y={cy - tick.radius + 18}
                text-anchor="middle"
                fill="red"
                font-size="1rem"
                font-weight="700"
              >
                {formatTick.format(tick.time)}
              </text>
            </g>
          {/each}
        </g>
      </svg>
    </div>
  </div>
</section>
