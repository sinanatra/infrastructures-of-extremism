import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { csvParse, csvFormat } from "d3-dsv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "static", "data");
const sourceDir = path.resolve(projectRoot, "..", "notebooks", "data");

const readCsv = async (filename) => {
  const fullPath = path.join(sourceDir, filename);
  const raw = await fs.readFile(fullPath, "utf8");
  return csvParse(raw);
};

const parseNumber = (value) => {
  const num = Number(value ?? "");
  return Number.isFinite(num) ? num : undefined;
};

const parseDateMs = (value) => {
  const ms = Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : undefined;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
  const TAU = Math.PI * 2;
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
};

const clampAngleToSlice = (angle, slice) => {
  const TAU = Math.PI * 2;
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

const loadData = async () => {
  const [postsCsv, linksCsv, groupsCsv] = await Promise.all([
    readCsv("message_nodes.csv"),
    readCsv("message_edges.csv"),
    readCsv("nodes.csv"),
  ]);

  const excludedGroupIds = new Set(["boost"]);
  const excludedGroupLabels = new Set(["update to boost"]);

  const groups = groupsCsv
    .map((row) => {
      const id = row.id?.trim() ?? "";
      return {
        id,
        label: row.label?.trim() || id,
        subscribers: parseNumber(row.subscribers),
      };
    })
    .filter(
      (group) =>
        group.id !== "" &&
        !excludedGroupIds.has(group.id.toLowerCase()) &&
        !excludedGroupLabels.has(group.label.toLowerCase())
    );

  const seenPostIds = new Set();
  const sanitizedPosts = [];

  const posts = postsCsv
    .map((row) => {
      const dateMs = parseDateMs(row.date);
      if (!dateMs) return null;

      const id = (row.id ?? "").trim();
      const chat = (row.chat ?? "").trim();
      const rawLabel = row.label?.trim() ?? "";
      const text = row.text?.trim() ?? "";
      if (!id || !chat || !text) return null;
      if (seenPostIds.has(id)) return null;

      const label =
        rawLabel ||
        `${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`;

      const post = {
        id,
        label,
        chat,
        messageId: row.message_id?.trim() ?? "",
        dateIso: new Date(dateMs).toISOString(),
        dateMs,
        views: parseNumber(row.views),
        reactions: parseNumber(row.reaction_count),
        url: row.url?.trim(),
        text,
        senderId: row.sender_id?.trim?.() ?? "",
        reactionBreakdown: row.reaction_breakdown ?? "",
      };

      if (
        excludedGroupIds.has(post.chat.toLowerCase()) ||
        excludedGroupLabels.has(post.chat.toLowerCase())
      )
        return null;

      seenPostIds.add(id);
      sanitizedPosts.push({
        id,
        chat,
        message_id: post.messageId,
        date: row.date,
        url: post.url ?? "",
        views: row.views ?? "",
        reaction_count: row.reaction_count ?? "",
        reaction_breakdown: row.reaction_breakdown ?? "",
        text,
        sender_id: post.senderId,
        label: rawLabel || "",
      });

      return post;
    })
    .filter((post) => post !== null)
    .sort((a, b) => a.dateMs - b.dateMs);

  const postIds = new Set(posts.map((p) => p.id));

  const links = linksCsv
    .map((row) => ({
      source: row.source?.trim?.() ?? row.from?.trim?.() ?? "",
      target: row.target?.trim?.() ?? row.to?.trim?.() ?? "",
      type: row.type?.trim() || "link",
    }))
    .filter(
      (link) =>
        link.source &&
        link.target &&
        postIds.has(link.source) &&
        postIds.has(link.target)
    );

  const sanitizedLinks = links.map((link) => ({
    from: link.source,
    to: link.target,
    type: link.type,
  }));

  await fs.mkdir(dataDir, { recursive: true });
  const postsOut = csvFormat(sanitizedPosts, [
    "id",
    "chat",
    "message_id",
    "date",
    "url",
    "views",
    "reaction_count",
    "reaction_breakdown",
    "text",
    "sender_id",
    "label",
  ]);
  const linksOut = csvFormat(sanitizedLinks, ["from", "to", "type"]);
  await fs.writeFile(path.join(dataDir, "message_nodes.csv"), postsOut, "utf8");
  await fs.writeFile(path.join(dataDir, "message_edges.csv"), linksOut, "utf8");

  return { posts, links, groups };
};

const computeLayout = ({ posts, links, groups }) => {
  const TAU = Math.PI * 2;
  const width = 3000;
  const height = 3000;
  const cx = width / 2;
  const cy = height / 2;
  const innerRadius = 3;
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
  const maxNodeRadiusDesired = 20;

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
  const postsByGroup = new Map();
  for (const post of posts) {
    if (!postsByGroup.has(post.chat)) postsByGroup.set(post.chat, []);
    postsByGroup.get(post.chat).push(post);
  }

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

  const maxNodeRadius = nodes.reduce((m, n) => Math.max(m, n.radius ?? 0), 0);

  const simulate = (iterations = 300) => {
    if (nodes.length === 0) return;

    const anchorStrength = 0.25;
    const linkStrength = 0.01;
    const damping = 0.2;
    const collisionPadding = 4;
    const cellSize = Math.max(32, maxNodeRadius * 4);

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

  simulate(200);

  const ringTicks = (() => {
    if (!sortedTimes.length) return [];
    const start = new Date(minTime);
    const end = new Date(maxTime);
    // walk backwards from the latest month to ensure the outer ring is aligned with the latest date
    let cursor = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      1,
      0,
      0,
      0
    );
    const first = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      1,
      0,
      0,
      0
    );
    const ticks = [];
    const minRadiusGap = 60;
    let lastRadius = Infinity;
    while (cursor >= first) {
      const r = radiusForTime(cursor);
      if (ticks.length === 0 || lastRadius - r >= minRadiusGap) {
        ticks.push(cursor);
        lastRadius = r;
      }

      const d = new Date(cursor);
      cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1, 0, 0, 0);
    }
    return ticks
      .sort((a, b) => a - b)
      .map((t) => ({
        time: t,
        radius: radiusForTime(t),
      }));
  })();

  return {
    width,
    height,
    cx,
    cy,
    nodes: nodes.map((n) => ({
      id: n.id,
      groupId: n.groupId,
      x: n.x,
      y: n.y,
      radiusReactions: n.radiusReactions,
      radiusLinks: n.radiusLinks,
      collisionRadius: n.collisionRadius,
    })),
    ringTicks,
    generatedAt: new Date().toISOString(),
  };
};

const main = async () => {
  const dataset = await loadData();
  const layout = computeLayout(dataset);
  const outputPath = path.join(dataDir, "layout.json");
  await fs.writeFile(outputPath, JSON.stringify(layout, null, 2), "utf8");
  console.log(
    `Wrote ${layout.nodes.length} nodes to ${path.relative(
      projectRoot,
      outputPath
    )}`
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
