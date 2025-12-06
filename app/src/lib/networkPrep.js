const TAU = Math.PI * 2;
const VIEW_PADDING = 280;
const INNER_RADIUS = 50;

const normalizeAngle = (angle) => {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
};

export const prepareNetwork = (
  { posts, links, groups, layout },
  { circleColor = "#ffffff" } = {}
) => {
  const width = layout?.width ?? 3000;
  const height = layout?.height ?? 3000;
  const cx = width / 2;
  const cy = height / 2;
  const viewPadding = VIEW_PADDING;
  const innerRadius = INNER_RADIUS;
  const outerRadius = Math.min(width, height) / 2 - 50;

  const postCountByGroup = new Map();
  const postLabelByGroup = new Map();
  for (const post of posts) {
    postCountByGroup.set(post.chat, (postCountByGroup.get(post.chat) ?? 0) + 1);
    if (post.chatLabel && !postLabelByGroup.has(post.chat)) {
      postLabelByGroup.set(post.chat, post.chatLabel);
    }
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
        label: postLabelByGroup.get(chat) ?? chat,
        postCount: postCountByGroup.get(chat) ?? 0,
      });
    }
  }

  const precomputedNodeById = layout
    ? new Map(layout.nodes.map((n) => [n.id, n]))
    : null;

  if (!precomputedNodeById) {
    throw new Error("Precomputed layout is required for page2");
  }

  const linkCountByPost = new Map();
  for (const link of links) {
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
    const angle = Math.atan2(saved.y - cy, saved.x - cx);
    const { emoji, count } = topEmojiInfo(post);

    nodes.push({
      index: nodeIndex++,
      id: post.id,
      groupId: post.chat,
      post,
      color: circleColor,
      radiusReactions: saved.radiusReactions ?? 5,
      radiusLinks: saved.radiusLinks ?? 5,
      collisionRadius: saved.collisionRadius ?? 5,
      x: saved.x,
      y: saved.y,
      angle,
      topEmoji: emoji,
      topEmojiCount: count,
    });
  }

  const nodesByGroup = nodes.reduce((map, node) => {
    if (!map.has(node.groupId)) map.set(node.groupId, []);
    map.get(node.groupId).push(node);
    return map;
  }, new Map());

  const orderedGroupsWithAngles = [...nodesByGroup.entries()]
    .map(([groupId, groupNodes]) => {
      const group = knownGroups.get(groupId);
      if (!group) return null;
      let sinSum = 0;
      let cosSum = 0;
      for (const node of groupNodes) {
        sinSum += Math.sin(node.angle);
        cosSum += Math.cos(node.angle);
      }
      const angle = Math.atan2(sinSum, cosSum);
      return { group, angle };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => {
      if (a.angle !== b.angle) return a.angle - b.angle;
      return a.group.label.localeCompare(b.group.label);
    });

  const orderedGroups = orderedGroupsWithAngles.map((entry) => ({
    ...entry.group,
    angle: entry.angle,
  }));

  let groupSlices = [];
  if (orderedGroups.length === 1) {
    const single = orderedGroups[0];
    groupSlices = [
      {
        group: single,
        start: 0,
        end: TAU,
        center: single.angle,
        idx: 0,
        color: circleColor,
      },
    ];
  } else if (orderedGroups.length > 1) {
    const midpoint = (a, b) => {
      const delta = normalizeAngle(b - a);
      return normalizeAngle(a + delta / 2);
    };

    groupSlices = orderedGroups.map((group, idx) => {
      const prev = orderedGroups[(idx - 1 + orderedGroups.length) % orderedGroups.length];
      const next = orderedGroups[(idx + 1) % orderedGroups.length];
      const start = midpoint(prev.angle, group.angle);
      const end = midpoint(group.angle, next.angle);
      return {
        group,
        start,
        end,
        center: group.angle,
        idx,
        color: circleColor,
      };
    });
  }

  const sliceForGroup = new Map(
    groupSlices.map((slice) => [slice.group.id, slice])
  );

  const colorByGroup = new Map(
    groupSlices.map((slice) => [slice.group.id, slice.color])
  );
  for (const node of nodes) {
    node.color = colorByGroup.get(node.groupId) ?? circleColor;
  }

  const maxRadiusByGroup = new Map();
  for (const node of nodes) {
    const r = Math.hypot(node.x - cx, node.y - cy);
    const prev = maxRadiusByGroup.get(node.groupId) ?? 0;
    if (r > prev) maxRadiusByGroup.set(node.groupId, r);
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
    const delta = normalizeAngle(endAngle - startAngle) || TAU;
    const end = startAngle + delta;
    const p0 = toCartesian(r1, startAngle);
    const p1 = toCartesian(r1, end);
    const p2 = toCartesian(r0, end);
    const p3 = toCartesian(r0, startAngle);
    const largeArc = delta > Math.PI ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${r1} ${r1} 0 ${largeArc} 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${r0} ${r0} 0 ${largeArc} 0 ${p3.x} ${p3.y} Z`;
  };

  const slicePaths = groupSlices.map((slice) => {
    const angleDeg = (slice.center * 180) / Math.PI;
    const normalized = ((angleDeg % 360) + 360) % 360;
    const flipped = normalized > 90 && normalized < 270;
    const baseLabelRadius = maxRadiusByGroup.get(slice.group.id) ?? outerRadius;
    const labelRadius = baseLabelRadius + 36;

    return {
      id: slice.group.id,
      label: slice.group.label ?? slice.group.id,
      color: slice.color,
      path: arcPath(innerRadius - 28, outerRadius + 12, slice.start, slice.end),
      labelPos: toCartesian(labelRadius, slice.center),
      angleDeg,
      labelRotation: flipped ? angleDeg + 180 : angleDeg,
      labelAnchor: flipped ? "end" : "start",
    };
  });

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
