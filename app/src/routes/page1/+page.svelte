<script>
  export let data;
  const { posts, links, groups } = data;

  const margin = { top: 60, right: 120, bottom: 60, left: 220 };
  const innerWidth = Math.max(groups.length * 220, 960);
  const width = innerWidth + margin.left + margin.right;

  const minTime = posts.length
    ? Math.min(...posts.map((p) => p.dateMs))
    : Date.now();
  const maxTime = posts.length
    ? Math.max(...posts.map((p) => p.dateMs))
    : minTime + 1;
  const timeSpan = Math.max(1, maxTime - minTime);

  const innerHeight = Math.max(800, posts.length * 14);
  const height = innerHeight + margin.top + margin.bottom;

  const yForTime = (dateMs) =>
    margin.top + ((dateMs - minTime) / timeSpan) * innerHeight;

  const postCountByGroup = new Map(posts.map((p) => [p.chat, 0]));
  for (const post of posts) {
    postCountByGroup.set(post.chat, (postCountByGroup.get(post.chat) ?? 0) + 1);
  }

  const knownGroups = new Map(groups.map((g) => [g.id, g]));
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
    const aPosts = a.postCount ?? postCountByGroup.get(a.id) ?? 0;
    const bPosts = b.postCount ?? postCountByGroup.get(b.id) ?? 0;
    if (aPosts !== bPosts) return bPosts - aPosts;
    return a.label.localeCompare(b.label);
  });

  const groupIndex = new Map(orderedGroups.map((g, idx) => [g.id, idx]));
  const columnGap =
    orderedGroups.length > 1
      ? innerWidth / (orderedGroups.length - 1)
      : innerWidth / 2;
  const xForGroup = (groupId) =>
    margin.left + (groupIndex.get(groupId) ?? 0) * columnGap;

  const postById = new Map(posts.map((p) => [p.id, p]));
  const crossLinks = links.filter((link) => {
    const source = postById.get(link.source);
    const target = postById.get(link.target);
    if (!source || !target) return false;
    return source.chat !== target.chat;
  });

  const subscriberText = (value) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m subs`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k subs`;
    return `${value} subs`;
  };

  const tickValues = (() => {
    if (timeSpan === 0) return [minTime];
    const ticks = [];
    const start = new Date(minTime);
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    for (
      let d = start;
      d.getTime() <= maxTime + 1000;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    ) {
      ticks.push(d.getTime());
    }
    if (ticks.length < 4) {
      const count = 6;
      ticks.length = 0;
      for (let i = 0; i < count; i++) {
        ticks.push(minTime + (timeSpan * i) / (count - 1));
      }
    }
    return ticks;
  })();

  const formatTick = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  });

  const formatShortDate = (ms) =>
    new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      ms
    );
</script>

<section
  class="min-h-screen bg-white text-black px-4 sm:px-6 md:px-8 py-6 space-y-5"
>
  <header
    class="flex justify-between items-end gap-4 mb-2 text-2xl md:text-3xl font-bold"
  >
    <div>
      <div
        class="flex flex-wrap items-center gap-3 text-lg md:text-xl text-gray-900 mt-2 font-semibold"
      >
        <p>{posts.length} posts</p>
        <p>{orderedGroups.length} groups</p>
        <p>{crossLinks.length} cross-group links</p>
      </div>
    </div>
  </header>

  <div class="relative rounded-xl border border-gray-200 bg-white p-4">
    <div class="overflow-auto rounded-lg">
      <svg
        role="img"
        class="w-full h-auto min-h-[900px]"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Timeline of posts across groups with arrows for cross-posts"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {#each tickValues as tick}
          <g class="tick" transform={`translate(0, ${yForTime(tick)})`}>
            <line x1="0" x2={width} stroke="#ddd" stroke-dasharray="4 6" />
            <text
              x={margin.left - 18}
              y="-6"
              text-anchor="end"
              fill="#000"
              font-size="1.25rem"
              font-weight="700">{formatTick.format(tick)}</text
            >
          </g>
        {/each}

        {#each orderedGroups as group}
          <g class="group" transform={`translate(${xForGroup(group.id)},0)`}>
            <line
              stroke="#000"
              stroke-width="2"
              y1={margin.top}
              y2={height - margin.bottom}
              x1="0"
              x2="0"
            />
            <text
              y={margin.top - 20}
              text-anchor="middle"
              fill="#000"
              font-size="1.6rem"
              font-weight="800"
            >
              {group.label}
            </text>
            {#if group.subscribers}
              <text
                y={margin.top - 4}
                text-anchor="middle"
                fill="#222"
                font-size="1.2rem"
                font-weight="600"
              >
                {subscriberText(group.subscribers)}
              </text>
            {/if}
          </g>
        {/each}

        {#each crossLinks as link (link.source + link.target)}
          {@const source = postById.get(link.source)}
          {@const target = postById.get(link.target)}
          {#if source && target}
            {@const sx = xForGroup(source.chat)}
            {@const sy = yForTime(source.dateMs)}
            {@const tx = xForGroup(target.chat)}
            {@const ty = yForTime(target.dateMs)}
            {@const midY = sy + (ty - sy) / 2}
            {@const curve = Math.max(30, Math.abs(tx - sx) * 0.35)}
            <path
              fill="none"
              stroke="#000"
              stroke-width="2.5"
              opacity="0.8"
              d={`M ${sx} ${sy} C ${sx + Math.sign(tx - sx) * curve} ${midY}, ${tx - Math.sign(tx - sx) * curve} ${midY}, ${tx} ${ty}`}
              marker-end="url(#arrow)"
            />
          {/if}
        {/each}

        {#each posts as post (post.id)}
          {@const x = xForGroup(post.chat)}
          {@const y = yForTime(post.dateMs)}
          <g class="post" transform={`translate(${x}, ${y})`}>
            {#if post.url}
              <a href={post.url} target="_blank" rel="noreferrer">
                <line
                  x1="-11"
                  y1="-11"
                  x2="11"
                  y2="11"
                  stroke="#000"
                  stroke-width="6"
                  stroke-linecap="round"
                />
                <line
                  x1="-11"
                  y1="11"
                  x2="11"
                  y2="-11"
                  stroke="#000"
                  stroke-width="6"
                  stroke-linecap="round"
                />
                <text
                  x="24"
                  y="7"
                  fill="#000"
                  font-size="1.35rem"
                  font-weight="700">{formatShortDate(post.dateMs)}</text
                >
                <title>
                  {post.label || post.id}
                  &#10;{post.url}
                </title>
              </a>
            {:else}
              <line
                x1="-11"
                y1="-11"
                x2="11"
                y2="11"
                stroke="#000"
                stroke-width="6"
                stroke-linecap="round"
              />
              <line
                x1="-11"
                y1="11"
                x2="11"
                y2="-11"
                stroke="#000"
                stroke-width="6"
                stroke-linecap="round"
              />
              <text
                x="24"
                y="7"
                fill="#000"
                font-size="1.35rem"
                font-weight="700">{formatShortDate(post.dateMs)}</text
              >
              <title>{post.label || post.id}</title>
            {/if}
          </g>
        {/each}
      </svg>
    </div>
  </div>
</section>

<style>
  text, line, :global(circle) {
    pointer-events: none;
    user-select: none;
  }
</style>
