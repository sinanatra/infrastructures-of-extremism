export const computeTopEmojis = (nodes, limit = 30) => {
  const counts = new Map();
  for (const node of nodes ?? []) {
    if (!node.topEmoji || node.topEmojiCount <= 0) continue;
    counts.set(node.topEmoji, (counts.get(node.topEmoji) ?? 0) + node.topEmojiCount);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([emoji, count]) => ({ emoji, count }));
};

export const buildLinkSegments = (links, nodeById) => {
  return (links ?? [])
    .map((l) => {
      const source = nodeById.get(l.source);
      const target = nodeById.get(l.target);
      if (!source || !target) return null;
      return {
        source,
        target,
        crossGroup: source.groupId !== target.groupId,
      };
    })
    .filter(Boolean);
};

export const createTooltipForPost = ({ linkCountByPost, formatDate }) => {
  return (post) => {
    if (!post) return "";
    const groupLabel = post.chatLabel ?? post.chat;
    const lines = [
      post.label || post.id,
      `Group: ${groupLabel}`,
      `Date: ${formatDate.format(post.dateMs)}`,
    ];
    const linkCount = linkCountByPost.get(post.id) ?? 0;
    if (post.reactions) lines.push(`Reactions: ${post.reactions.toLocaleString()}`);
    if (linkCount) lines.push(`Links: ${linkCount}`);
    if (post.views) lines.push(`Views: ${post.views.toLocaleString()}`);
    if (post.url) lines.push(post.url);
    return lines.join("\n");
  };
};

export const buildTrailerGroups = ({ slicePaths, linkSegments, datasetSlug }) => {
  const labelById = new Map(
    (slicePaths ?? []).map((s) => [s.id, s.group?.label || s.group?.id || s.id])
  );

  const startId = (() => {
    const slices = slicePaths ?? [];
    if (!datasetSlug) return slices[0]?.id ?? null;
    const match = slices.find(
      (s) => s.id && s.id.toLowerCase() === datasetSlug.toLowerCase()
    );
    return match?.id ?? slices[0]?.id ?? null;
  })();

  const edgeMap = new Map();
  for (const link of linkSegments ?? []) {
    const a = link.source.groupId;
    const b = link.target.groupId;
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}::${b}` : `${b}::${a}`;
    const t = Math.min(link.source.post.dateMs, link.target.post.dateMs);
    const prev = edgeMap.get(key);
    if (!prev || t < prev.time) edgeMap.set(key, { a, b, time: t });
  }
  const edges = [...edgeMap.values()].sort((x, y) => x.time - y.time);

  const visited = new Set();
  const order = [];
  if (startId) {
    visited.add(startId);
    order.push(startId);
  }
  for (const e of edges) {
    const { a, b } = e;
    if (visited.has(a) && !visited.has(b)) {
      visited.add(b);
      order.push(b);
    } else if (visited.has(b) && !visited.has(a)) {
      visited.add(a);
      order.push(a);
    }
  }
  for (const s of slicePaths ?? []) {
    if (!visited.has(s.id)) {
      visited.add(s.id);
      order.push(s.id);
    }
  }

  return order.map((id) => ({ id, label: labelById.get(id) ?? id ?? "group" }));
};

