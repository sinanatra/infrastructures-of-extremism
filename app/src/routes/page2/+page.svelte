<script>
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  export let data;
  const { posts, links, groups } = data;

  const width = 3000;
  const height = 3000;
  const cx = width / 2;
  const cy = height / 2;
  const innerRadius = 2;
  const outerRadius = Math.min(width, height) / 2 - 50;

  const minTime = posts.length
    ? Math.min(...posts.map((p) => p.dateMs))
    : Date.now();
  const maxTime = posts.length
    ? Math.max(...posts.map((p) => p.dateMs))
    : minTime + 1;

  const sortedTimes = [...posts.map((p) => p.dateMs)].sort((a, b) => a - b);
  const radiusForTime = (ms) => {
    const total = sortedTimes.length;
    if (total === 0) return (innerRadius + outerRadius) / 2;
    if (total === 1) return (innerRadius + outerRadius) / 2;
    let lo = 0;
    let hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedTimes[mid] <= ms) lo = mid + 1;
      else hi = mid;
    }
    const fraction = Math.min(1, lo / (total - 1));
    return innerRadius + fraction * (outerRadius - innerRadius);
  };

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

  const maxReactions = posts.reduce((m, p) => Math.max(m, p.reactions ?? 0), 0);
  const maxLinks = [...linkCountByPost.values()].reduce(
    (m, v) => Math.max(m, v),
    0
  );
  const minNodeRadius = 2;
  const maxNodeRadiusDesired = 10;

  const radiusForReactions = (value) => {
    const v = Math.max(0, value ?? 0);
    if (!maxReactions) return minNodeRadius;
    const span = maxNodeRadiusDesired - minNodeRadius;
    return minNodeRadius + Math.sqrt(v / maxReactions) * span;
  };

  const radiusForLinks = (value) => {
    const v = Math.max(0, value ?? 0);
    if (!maxLinks) return minNodeRadius;
    const span = maxNodeRadiusDesired - minNodeRadius;
    return minNodeRadius + Math.sqrt(v / maxLinks) * span;
  };

  let sizeMode = "reactions";
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
  const postsByGroup = new Map();
  for (const post of posts) {
    if (!postsByGroup.has(post.chat)) postsByGroup.set(post.chat, []);
    postsByGroup.get(post.chat).push(post);
  }

  const hashToUnit = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    const x = Math.sin(h * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const normalizeAngle = (angle) => {
    const wrapped = angle % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
  };

  const clampAngleToSlice = (angle, slice) => {
    const a = normalizeAngle(angle);
    const start = normalizeAngle(slice.start);
    const end = normalizeAngle(slice.end);
    const inSlice =
      start <= end ? a >= start && a <= end : a >= start || a <= end;
    if (inSlice) return a;
    if (start <= end) return a < start ? start : end;
    const distToStart = (start - a + TAU) % TAU;
    const distToEnd = (a - end + TAU) % TAU;
    return distToStart < distToEnd ? start : end;
  };

  const nodes = [];
  let nodeIndex = 0;

  for (const slice of groupSlices) {
    const groupPosts = postsByGroup.get(slice.group.id) ?? [];
    const usableAngle = Math.max(0.01, slice.end - slice.start);

    for (let i = 0; i < groupPosts.length; i++) {
      const post = groupPosts[i];
      const fraction =
        groupPosts.length > 1 ? i / (groupPosts.length - 1) : 0.5;
      const angleBase = slice.start + fraction * usableAngle;
      const jitterAngle =
        (hashToUnit(post.id) - 0.5) *
        (usableAngle / Math.max(6, groupPosts.length));
      const preferredAngle = angleBase + jitterAngle;

      const targetRadius = radiusForTime(post.dateMs);
      const radial = targetRadius;
      const radiusReactions = radiusForReactions(post.reactions);
      const linkCount = linkCountByPost.get(post.id) ?? 0;
      const radiusLinks = radiusForLinks(linkCount);
      const collisionRadius = Math.max(radiusReactions, radiusLinks);

      const angle = preferredAngle;
      const x = cx + radial * Math.cos(angle);
      const y = cy + radial * Math.sin(angle);

      nodes.push({
        index: nodeIndex++,
        id: post.id,
        groupId: slice.group.id,
        post,
        color: slice.color,
        preferredAngle,
        targetRadius: radial,
        radiusReactions,
        radiusLinks,
        collisionRadius,
        x,
        y,
        vx: 0,
        vy: 0,
      });
    }
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

  const maxNodeRadius = nodes.reduce((m, n) => Math.max(m, n.radius), 0);

  const simulate = () => {
    if (nodes.length === 0) return;

    const anchorStrength = 0.25;
    const linkStrength = 0.01;
    const damping = 0.9;
    const collisionPadding = 22;
    const cellSize = Math.max(28, maxNodeRadius * 4);
    const iterations = 2;

    for (let step = 0; step < iterations; step++) {
      for (const edge of edges) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const force = (dist - edge.desired) * linkStrength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        edge.source.vx += fx;
        edge.source.vy += fy;
        edge.target.vx -= fx;
        edge.target.vy -= fy;
      }

      for (const node of nodes) {
        const slice = sliceForGroup.get(node.groupId);
        if (!slice) continue;

        const targetX = cx + node.targetRadius * Math.cos(node.preferredAngle);
        const targetY = cy + node.targetRadius * Math.sin(node.preferredAngle);
        node.vx += (targetX - node.x) * anchorStrength;
        node.vy += (targetY - node.y) * anchorStrength;

        const currentAngle = normalizeAngle(
          Math.atan2(node.y - cy, node.x - cx)
        );
        const clampedAngle = clampAngleToSlice(currentAngle, slice);
        if (clampedAngle !== currentAngle) {
          const radial = Math.hypot(node.x - cx, node.y - cy);
          const x = cx + radial * Math.cos(clampedAngle);
          const y = cy + radial * Math.sin(clampedAngle);
          node.vx += (x - node.x) * 0.18;
          node.vy += (y - node.y) * 0.18;
        }
      }

      const grid = new Map();
      for (const node of nodes) {
        const col = Math.floor(node.x / cellSize);
        const row = Math.floor(node.y / cellSize);
        const key = `${col},${row}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(node);
      }

      for (const node of nodes) {
        const col = Math.floor(node.x / cellSize);
        const row = Math.floor(node.y / cellSize);
        const bucket = grid.get(`${col},${row}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.index <= node.index) continue;
          const ddx = node.x - other.x;
          const ddy = node.y - other.y;
          const dist = Math.hypot(ddx, ddy) || 1e-6;
          const minDist =
            node.collisionRadius + other.collisionRadius + collisionPadding;
          if (dist < minDist) {
            const overlap = (minDist - dist) / dist;
            const adjust = overlap * 0.9;
            node.x += ddx * adjust;
            node.y += ddy * adjust;
            other.x -= ddx * adjust;
            other.y -= ddy * adjust;
          }
        }
      }

      for (const node of nodes) {
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;

        const radial = Math.hypot(node.x - cx, node.y - cy);
        const target = node.targetRadius;
        const bounded = clamp(radial, target - 4, target + 4);
        if (Math.abs(radial - bounded) > 0.01) {
          const angle = Math.atan2(node.y - cy, node.x - cx);
          node.x = cx + bounded * Math.cos(angle);
          node.y = cy + bounded * Math.sin(angle);
        }
      }
    }

    const resolvePass = () => {
      const grid = new Map();
      for (const node of nodes) {
        const col = Math.floor(node.x / cellSize);
        const row = Math.floor(node.y / cellSize);
        const key = `${col},${row}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(node);
      }

      for (const node of nodes) {
        const col = Math.floor(node.x / cellSize);
        const row = Math.floor(node.y / cellSize);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = grid.get(`${col + dx},${row + dy}`);
            if (!bucket) continue;
            for (const other of bucket) {
              if (other.index <= node.index) continue;
              const ddx = node.x - other.x;
              const ddy = node.y - other.y;
              const dist = Math.hypot(ddx, ddy) || 1e-6;
              const minDist =
                node.collisionRadius + other.collisionRadius + collisionPadding;
              if (dist < minDist) {
                const overlap = (minDist - dist) / dist;
                const adjust = overlap * 0.9;
                node.x += ddx * adjust;
                node.y += ddy * adjust;
                other.x -= ddx * adjust;
                other.y -= ddy * adjust;
              }
            }
          }
        }
      }
    };

    resolvePass();

    for (const node of nodes) {
      const radial = Math.hypot(node.x - cx, node.y - cy);
      const target = node.targetRadius;
      const bounded = clamp(radial, target - 1, target + 1);
      if (Math.abs(radial - bounded) > 0.01) {
        const angle = Math.atan2(node.y - cy, node.x - cx);
        node.x = cx + bounded * Math.cos(angle);
        node.y = cy + bounded * Math.sin(angle);
      }
    }
  };

  simulate();

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

  const sliceFill = "rgba(255, 255, 255, 0.06)";
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

  const ringTicks = (() => {
    if (!sortedTimes.length) return [];
    const startYear = new Date(minTime).getFullYear();
    const endYear = new Date(maxTime).getFullYear();
    const ticks = [];
    for (let y = startYear; y <= endYear; y++) {
      ticks.push(Date.UTC(y, 0, 1));
    }
    return ticks.map((t) => ({
      time: t,
      radius: radiusForTime(t),
    }));
  })();

  const formatTick = new Intl.DateTimeFormat("en", {
    year: "numeric",
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
                y={cy - tick.radius - 6}
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

        <g class="slices">
          {#each slicePaths as slice}
            <!-- <path d={slice.path} fill={sliceFill} stroke="#1a1a1a" /> -->
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
      </svg>
    </div>
  </div>
</section>
