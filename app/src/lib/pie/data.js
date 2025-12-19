export const createCanonicalTopic = (topicLabels, otherLabel) => {
  const topicMap = new Map(
    (topicLabels ?? []).map((label) => [label.toLowerCase(), label])
  );

  return (raw) => {
    const candidate = ((Array.isArray(raw) ? raw[0] : raw) ?? "")
      .toString()
      .trim()
      .toLowerCase();
    return topicMap.get(candidate) ?? otherLabel;
  };
};

export const normalizeGraphLinks = (links) => {
  return (links ?? []).map((l) => ({
    source: typeof l.source === "object" ? l.source.id : l.source,
    target: typeof l.target === "object" ? l.target.id : l.target,
  }));
};

export const buildLinkCountByPost = (graphLinks) => {
  const linkCountByPost = new Map();
  for (const l of graphLinks ?? []) {
    linkCountByPost.set(l.source, (linkCountByPost.get(l.source) ?? 0) + 1);
    linkCountByPost.set(l.target, (linkCountByPost.get(l.target) ?? 0) + 1);
  }
  return linkCountByPost;
};

export const buildGraphNodes = (preparedNodes, { circleColor, canonicalTopic }) => {
  return (preparedNodes ?? []).map((n) => {
    const rawTopic =
      (Array.isArray(n.post?.topics) ? n.post.topics : null) ??
      (n.groupId ? [n.groupId] : null);
    const topicLabel = canonicalTopic(rawTopic);
    return {
      id: n.id,
      type: topicLabel,
      radiusLinks: n.radiusLinks ?? 0,
      radiusReactions: n.radiusReactions ?? 0,
      timestamp: n.post?.dateMs ?? 0,
      topEmoji: n.topEmoji ?? null,
      color: n.color ?? circleColor,
      post: n.post ?? null,
      degreeCentrality: n.degreeCentrality ?? n.degree_centrality ?? 0,
    };
  });
};

export const computeTopEmojis = (graphNodes, limit = 30) => {
  const counts = new Map();
  for (const node of graphNodes ?? []) {
    if (!node.topEmoji) continue;
    counts.set(node.topEmoji, (counts.get(node.topEmoji) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([emoji, count]) => ({ emoji, count }));
};

export const buildTrailerGroups = (prepared) => {
  return (prepared?.slicePaths ?? []).map((slice) => ({
    id: slice.id ?? slice.group?.id ?? slice.label ?? "group",
    label: slice.label ?? slice.group?.label ?? slice.id ?? "group",
  }));
};

export const createTooltipForPost = ({ linkCountByPost }) => {
  return (node) => {
    const post = node?.post;
    if (!post) return node?.id ?? "";
    const groupLabel = post.chatLabel ?? post.chat ?? node.type ?? "";
    const lines = [];
    lines.push(post.label || post.id || node.id);
    if (groupLabel) lines.push(`Group: ${groupLabel}`);
    if (post.dateMs) {
      const fmt = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
      lines.push(`Date: ${fmt.format(post.dateMs)}`);
    }
    const linkCount = linkCountByPost?.get(node.id) ?? 0;
    if (post.reactions)
      lines.push(`Reactions: ${post.reactions.toLocaleString()}`);
    if (linkCount) lines.push(`Links: ${linkCount}`);
    if (post.views) lines.push(`Views: ${post.views.toLocaleString()}`);
    if (post.url) lines.push(post.url);
    return lines.join("\n");
  };
};

