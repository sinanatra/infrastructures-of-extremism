const TAU = Math.PI * 2;
const VIEW_PADDING = 280;
const INNER_RADIUS = 3;

const colorForGroup = () => "#ffffff";

const normalizeAngle = (angle) => {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
};

export const prepareNetwork = ({ posts, links, groups, layout }) => {
  const width = layout?.width ?? 3000;
  const height = layout?.height ?? 3000;
  const cx = width / 2;
  const cy = height / 2;
  const viewPadding = VIEW_PADDING;
  const innerRadius = INNER_RADIUS;
  const outerRadius = Math.min(width, height) / 2 - 50;

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
  const precomputedNodeById = layout
    ? new Map(layout.nodes.map((n) => [n.id, n]))
    : null;

  if (!precomputedNodeById) {
    throw new Error("Precomputed layout is required for page2");
  }

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

  const topEmojiInfo = (post) => {
    if (!post.reactionBreakdown) return { emoji: null, count: 0 };
    const entries = Object.entries(post.reactionBreakdown).filter(
      ([, v]) => typeof v === "number"
    );
    if (!entries.length) return { emoji: null, count: 0 };
    entries.sort((a, b) => b[1] - a[1]);
    const [emoji, count] = entries[0];
    return { emoji, count };
  };

  const nodes = [];
  let nodeIndex = 0;
  for (const post of posts) {
    const saved = precomputedNodeById.get(post.id);
    if (!saved) continue;
    const slice = sliceForGroup.get(post.chat);
    const { emoji, count } = topEmojiInfo(post);

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
      topEmoji: emoji,
      topEmojiCount: count,
    });
  }

  const sizeStats = {
    links: { min: Infinity, max: 0 },
    reactions: { min: Infinity, max: 0 },
  };
  for (const node of nodes) {
    sizeStats.links.min = Math.min(sizeStats.links.min, node.radiusLinks);
    sizeStats.links.max = Math.max(sizeStats.links.max, node.radiusLinks);
    sizeStats.reactions.min = Math.min(
      sizeStats.reactions.min,
      node.radiusReactions
    );
    sizeStats.reactions.max = Math.max(
      sizeStats.reactions.max,
      node.radiusReactions
    );
  }
  if (!Number.isFinite(sizeStats.links.min)) sizeStats.links.min = 0;
  if (!Number.isFinite(sizeStats.reactions.min)) sizeStats.reactions.min = 0;

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

  const ringTicks = layout?.ringTicks ?? [];
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

  return {
    width,
    height,
    cx,
    cy,
    viewPadding,
    innerRadius,
    outerRadius,
    orderedGroups,
    slicePaths,
    linkPaths,
    nodes,
    sizeStats,
    ringTicks,
    innerTicks,
    outerTick,
    radialPosts,
    outerRingRadius,
    ticksByRadius,
    linkCountByPost,
    sliceForGroup,
  };
};
