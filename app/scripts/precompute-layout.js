import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { csvParse, csvFormat } from "d3-dsv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(projectRoot, "static", "data");
const sourceRoot = path.resolve(projectRoot, "..", "notebooks", "data");
const requiredSourceFiles = [
  "message_nodes.csv",
  "message_edges.csv",
  "nodes.csv",
];

const normalizeGroupId = (value) => (value ?? "").trim().toLowerCase();

const parseEnvSeeds = (envText) => {
  const match = envText.match(/^TG_START_SEEDS\s*=\s*(.+)$/m);
  if (!match) return [];
  let raw = match[1].trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeGroupId(s));
};

const readEnvSeeds = async () => {
  const envPath = path.resolve(projectRoot, "..", ".env");
  try {
    const contents = await fs.readFile(envPath, "utf8");
    return parseEnvSeeds(contents);
  } catch {
    return [];
  }
};

const fileExists = async (fullPath) => {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
};

const hasRequiredFiles = async (dir) => {
  for (const filename of requiredSourceFiles) {
    const exists = await fileExists(path.join(dir, filename));
    if (!exists) return false;
  }
  return true;
};

const findDatasets = async (preferredSlugs = []) => {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const dirEntries = entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, slug: normalizeGroupId(e.name) }));
  const dirMap = new Map(dirEntries.map((entry) => [entry.slug, entry.name]));

  const datasets = [];
  const missingPreferred = preferredSlugs.filter((slug) => !dirMap.has(slug));
  if (missingPreferred.length) {
    console.warn(
      `[precompute] preferred seeds without matching folder in ${sourceRoot}: ${missingPreferred.join(
        ", "
      )}`
    );
  }

  const tryAddDataset = async (slug) => {
    if (datasets.some((d) => d.slug === slug)) return;
    const dirName = dirMap.get(slug);
    if (!dirName) return;
    const dirPath = path.join(sourceRoot, dirName);
    if (!(await hasRequiredFiles(dirPath))) return;
    datasets.push({ slug, dir: dirPath });
  };



  if (preferredSlugs.length) {
    for (const slug of preferredSlugs) {
      await tryAddDataset(slug);
    }
  }

  for (const entry of dirEntries) {
    if (datasets.some((d) => d.slug === entry.slug)) continue;
    await tryAddDataset(entry.slug);
  }

  if (!datasets.length && (await hasRequiredFiles(sourceRoot))) {
    const fallbackSlug = preferredSlugs[0] ?? "default";
    datasets.push({ slug: fallbackSlug, dir: sourceRoot, usesRoot: true });
  }

  if (!datasets.length) {
    const available = dirEntries.map((e) => e.name).join(", ");
    throw new Error(
      `No datasets found in ${sourceRoot}. Checked folders: ${
        available || "(none)"
      }`
    );
  }

  return datasets;
};

const readCsv = async (baseDir, filename) => {
  const fullPath = path.join(baseDir, filename);
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

const loadData = async ({ slug, dir }) => {
  const [postsRows, linksRows, groupsRows] = await Promise.all([
    readCsv(dir, "message_nodes.csv"),
    readCsv(dir, "message_edges.csv"),
    readCsv(dir, "nodes.csv"),
  ]);

  const excludedGroupIds = new Set(["boost"]);
  const excludedGroupLabels = new Set(["update to boost"]);

  const canonicalGroups = new Map();
  for (const row of groupsRows) {
    const rawId = row.id?.trim() ?? "";
    const id = normalizeGroupId(rawId);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const label = row.label?.trim?.() || title || rawId || id;
    if (!id) continue;
    if (excludedGroupIds.has(id)) continue;
    if (excludedGroupLabels.has(label.toLowerCase())) continue;

    const subscribers = parseNumber(row.subscribers);
    const existing = canonicalGroups.get(id);
    if (!existing) {
      canonicalGroups.set(id, { id, label, subscribers });
    } else {
      const labelIsGeneric = existing.label.toLowerCase() === id;
      const candidateIsSpecific = label.toLowerCase() !== id;
      const mergedLabel =
        labelIsGeneric && candidateIsSpecific ? label : existing.label;
      const mergedSubscribers = Math.max(
        Number.isFinite(existing.subscribers)
          ? existing.subscribers
          : -Infinity,
        Number.isFinite(subscribers) ? subscribers : -Infinity
      );
      canonicalGroups.set(id, {
        id,
        label: mergedLabel,
        subscribers: Number.isFinite(mergedSubscribers)
          ? mergedSubscribers
          : undefined,
      });
    }
  }
  const groups = [...canonicalGroups.values()];

  const seenPostIds = new Set();
  const sanitizedPosts = [];

  const posts = postsRows
    .map((row) => {
      const dateMs = parseDateMs(row.date);
      if (!dateMs) return null;

      const id = (row.id ?? "").trim().toLowerCase();
      const chatRaw = (row.chat ?? "").trim();
      const chat = normalizeGroupId(chatRaw);
      const rawLabel = row.label?.trim() ?? "";
      const text = row.text?.trim() ?? "";
      if (!text) return null;
      if (!id || !chat) return null;
      if (seenPostIds.has(id)) return null;

      const label =
        rawLabel ||
        (text ? `${text.slice(0, 120)}${text.length > 120 ? "…" : ""}` : id);

      let reactionBreakdown = {};
      if (row.reaction_breakdown) {
        try {
          reactionBreakdown = JSON.parse(row.reaction_breakdown);
        } catch {
          reactionBreakdown = {};
        }
      }

      const post = {
        id,
        label,
        chat,
        chatLabel: canonicalGroups.get(chat)?.label ?? chatRaw ?? chat,
        messageId: row.message_id?.trim() ?? "",
        dateIso: new Date(dateMs).toISOString(),
        dateMs,
        views: parseNumber(row.views),
        reactions: parseNumber(row.reaction_count),
        url: row.url?.trim(),
        text,
        senderId: row.sender_id?.trim?.() ?? "",
        reactionBreakdown,
      };

      if (
        excludedGroupIds.has(post.chat) ||
        excludedGroupLabels.has((post.chatLabel ?? post.chat).toLowerCase())
      ) {
        return null;
      }

      seenPostIds.add(id);
      sanitizedPosts.push({
        id,
        chat: post.chat,
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

  const links = linksRows
    .map((row) => ({
      source: (row.source?.trim?.() ?? row.from?.trim?.() ?? "").toLowerCase(),
      target: (row.target?.trim?.() ?? row.to?.trim?.() ?? "").toLowerCase(),
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

  const targetDir = path.join(dataRoot, slug);
  await fs.mkdir(targetDir, { recursive: true });
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
  const groupsOut = csvFormat(groups, ["id", "label", "subscribers"]);
  await fs.writeFile(
    path.join(targetDir, "message_nodes.csv"),
    postsOut,
    "utf8"
  );
  await fs.writeFile(
    path.join(targetDir, "message_edges.csv"),
    linksOut,
    "utf8"
  );
  await fs.writeFile(path.join(targetDir, "nodes.csv"), groupsOut, "utf8");

  const datasetLabel =
    groups.find((g) => normalizeGroupId(g.id) === normalizeGroupId(slug))
      ?.label ||
    groups.find((g) => g.label)?.label ||
    slug;

  return {
    posts,
    links,
    groups,
    meta: {
      slug,
      label: datasetLabel,
      postCount: posts.length,
      groupCount: groups.length,
      startDate: posts[0]?.dateIso ?? null,
      endDate: posts[posts.length - 1]?.dateIso ?? null,
    },
  };
};

const computeLayout = ({ posts, links, groups }) => {
  const TAU = Math.PI * 2;
  const width = 5000;
  const height = 5000;
  const cx = width / 2;
  const cy = height / 2;
  const innerRadius = 0;
  const outerRadius = Math.min(width, height) / 2 - 50;
  const polygonSides = 12; 
  const baseStart = -Math.PI / 2;

  const minTime = posts.length
    ? Math.min(...posts.map((p) => p.dateMs))
    : Date.now();
  const maxTime = posts.length
    ? Math.max(...posts.map((p) => p.dateMs))
    : minTime + 1;

  const sortedTimes = [...posts.map((p) => p.dateMs)].sort((a, b) => a - b);
  const dayMs = 24 * 60 * 60 * 1000;
  const maxDayIndex = Math.max(0, Math.floor((maxTime - minTime) / dayMs));
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

  const polygonPointAtAngle = (R, n, angle) => {
    const verts = new Array(n);
    for (let k = 0; k < n; k++) {
      const a = baseStart + (TAU * k) / n;
      verts[k] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    }

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = null;

    for (let k = 0; k < n; k++) {
      const p1 = verts[k];
      const p2 = verts[(k + 1) % n];
      const a1x = p1.x - cx;
      const a1y = p1.y - cy;
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;

      const det = ex * -dy - -dx * ey;
      if (Math.abs(det) < 1e-12) continue;

      const u = (a1x * dy - dx * a1y) / det;
      const t = (a1x * ey - ex * a1y) / det;

      if (u >= -1e-9 && u <= 1 + 1e-9 && t >= 0) {
        if (!best || t < best.t) {
          const px = cx + t * dx;
          const py = cy + t * dy;
          best = { t, p: { x: px, y: py } };
        }
      }
    }

    if (!best) {
      return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle), r: R };
    }

    const r = Math.hypot(best.p.x - cx, best.p.y - cy);
    return { x: best.p.x, y: best.p.y, r };
  };

  const linkCountByPost = new Map();
  const forwardCountByPost = new Map();
  for (const link of links) {
    linkCountByPost.set(
      link.target,
      (linkCountByPost.get(link.target) ?? 0) + 1
    );
    if ((link.type ?? "").toLowerCase() === "forward") {
      forwardCountByPost.set(
        link.target,
        (forwardCountByPost.get(link.target) ?? 0) + 1
      );
    }
  }
  const sizeCountByPost = new Map(linkCountByPost);
  for (const [postId, count] of forwardCountByPost.entries()) {
    sizeCountByPost.set(postId, count);
  }

  const maxReactions = posts.reduce((m, p) => Math.max(m, p.reactions ?? 0), 0);
  const maxLinks = [...sizeCountByPost.values()].reduce(
    (m, v) => Math.max(m, v),
    0
  );
  const minNodeRadius = 2;
  const maxNodeRadiusDesired = 16;

  const radiusForReactions = (value) => {
    const v = Math.max(0, value ?? 0);
    if (!maxReactions) return minNodeRadius;
    const span = maxNodeRadiusDesired - minNodeRadius;
    return minNodeRadius + Math.sqrt(v / maxReactions) * span * 0.8;
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
  const sliceGap = Math.min(0.12, sliceAngle * 0.08);

  const colorForGroup = () => "#ffffff";

  const sizeWeight = orderedGroups.map((group) =>
    Math.max(1, Math.sqrt(group.postCount ?? 1))
  );
  const perSliceGap = Math.min(0.08, sliceAngle * 0.08);
  const totalGap = perSliceGap * orderedGroups.length;
  const availableAngle = Math.max(TAU - totalGap, TAU * 0.7);

  const labelRadius = outerRadius + 64;
  const labelCharPx = 9;
  const labelPadPx = 80;
  const minAngles = orderedGroups.map((group) => {
    const label = group.label || group.id || "";
    const px = label.length * labelCharPx + labelPadPx;
    return clamp(px / labelRadius, 0.05, 0.8);
  });

  let minTotal = minAngles.reduce((s, a) => s + a, 0);
  if (minTotal > availableAngle) {
    const scale = availableAngle / minTotal;
    minAngles.forEach((a, i) => (minAngles[i] = a * scale));
    minTotal = availableAngle;
  }

  const remaining = Math.max(0, availableAngle - minTotal);
  const totalSize = sizeWeight.reduce((sum, w) => sum + w, 0) || 1;

  let angleCursor = baseStart;
  const groupSlices = orderedGroups.map((group, idx) => {
    const weight = sizeWeight[idx] ?? 1;
    const span = minAngles[idx] + (weight / totalSize) * remaining;
    const start = angleCursor + perSliceGap / 2;
    const end = start + span;
    angleCursor = end + perSliceGap / 2;
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
    const sliceSpan = Math.max(0.01, slice.end - slice.start);
    const edgePad = sliceSpan * 0.02;
    const usableAngle = Math.max(0.001, sliceSpan - edgePad * 2);

    const dayBuckets = new Map();
    for (const post of groupPosts) {
      const dayIndex = Math.max(0, Math.floor((post.dateMs - minTime) / dayMs));
      if (!dayBuckets.has(dayIndex)) dayBuckets.set(dayIndex, []);
      dayBuckets.get(dayIndex).push(post);
    }
    const dayOrder = [...dayBuckets.keys()].sort((a, b) => a - b);
    const orderByDay = new Map(dayOrder.map((d, i) => [d, i]));
    const withinDayRank = new Map();
    for (const [dayIndex, arr] of dayBuckets.entries()) {
      arr.sort((a, b) => {
        const va = Math.max(0, a.views ?? 0);
        const vb = Math.max(0, b.views ?? 0);
        if (va !== vb) return vb - va;
        const fa = forwardCountByPost.get(a.id) ?? 0;
        const fb = forwardCountByPost.get(b.id) ?? 0;
        if (fa !== fb) return fb - fa;
        const ra = Math.max(0, a.reactions ?? 0);
        const rb = Math.max(0, b.reactions ?? 0);
        if (ra !== rb) return rb - ra;
        return a.dateMs - b.dateMs;
      });
      arr.forEach((post, idx) =>
        withinDayRank.set(post.id, { idx, total: arr.length, dayIndex })
      );
    }
    const perDaySpan = dayOrder.length ? 1 / dayOrder.length : 1;
    const dayGap = perDaySpan * 0.1;
    const usablePerDay = Math.max(0, perDaySpan - dayGap);

    for (let i = 0; i < groupPosts.length; i++) {
      const post = groupPosts[i];
      const rank = withinDayRank.get(post.id);
      const dayIndex =
        rank?.dayIndex ?? Math.max(0, Math.floor((post.dateMs - minTime) / dayMs));
      const dayPos = orderByDay.get(dayIndex) ?? 0;
      const baseFraction = dayPos * perDaySpan + dayGap / 2;
      const dayTotal = rank?.total ?? 1;
      const within =
        dayTotal > 1 ? (rank.idx / (dayTotal - 1)) * usablePerDay : usablePerDay * 0.5;
      const fraction = clamp(baseFraction + within, 0, 1);
      const angleBase = slice.start + edgePad + fraction * usableAngle;
      const preferredAngle = clampAngleToSlice(angleBase, slice);

      const targetRadius = radiusForTime(post.dateMs);
      const radial = targetRadius;
      const radiusReactions = radiusForReactions(post.reactions);
      const linkCount = sizeCountByPost.get(post.id) ?? 0;
      const radiusLinks = radiusForLinks(linkCount);
      const collisionRadius = Math.max(radiusReactions, radiusLinks);

      const angle = preferredAngle;
      const pt = polygonPointAtAngle(radial, polygonSides, angle);
      const x = pt.x;
      const y = pt.y;

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
    const collisionPadding = 8;
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

        const targetPt = polygonPointAtAngle(
          node.targetRadius,
          polygonSides,
          node.preferredAngle
        );
        const targetX = targetPt.x;
        const targetY = targetPt.y;
        node.vx += (targetX - node.x) * anchorStrength;
        node.vy += (targetY - node.y) * anchorStrength;

        const currentAngle = normalizeAngle(
          Math.atan2(node.y - cy, node.x - cx)
        );
        const clampedAngle = clampAngleToSlice(currentAngle, slice);
        if (clampedAngle !== currentAngle) {
          const radial = Math.hypot(node.x - cx, node.y - cy);
          const mapped = polygonPointAtAngle(radial, polygonSides, clampedAngle);
          const x = mapped.x;
          const y = mapped.y;
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

      const resolveCollisions = () => {
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
                  node.collisionRadius +
                  other.collisionRadius +
                  collisionPadding;
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

      resolveCollisions();

      for (const node of nodes) {
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;

        const target = node.targetRadius;
        const angle = Math.atan2(node.y - cy, node.x - cx);
        const snapped = polygonPointAtAngle(target, polygonSides, angle);
        node.x = snapped.x;
        node.y = snapped.y;
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
      const angle = Math.atan2(node.y - cy, node.x - cx);
      const finalPt = polygonPointAtAngle(node.targetRadius, polygonSides, angle);
      node.x = finalPt.x;
      node.y = finalPt.y;
    }
  };

  simulate(200);

  const ringTicks = (() => {
    if (!sortedTimes.length) return [];
    const start = new Date(minTime);
    const end = new Date(maxTime);

    let cursor = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 0, 0, 0);
    const first = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      1,
      0,
      0,
      0
    );
    const ticks = [];
    const minRadiusGap = 220;
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
    polygonSides,
    generatedAt: new Date().toISOString(),
  };
};

const main = async () => {
  const preferredSlugs = await readEnvSeeds();
  const datasets = await findDatasets(preferredSlugs);
  const summaries = [];

  for (const dataset of datasets) {
    const { posts, links, groups, meta } = await loadData(dataset);
    const layout = computeLayout({ posts, links, groups });
    const targetDir = path.join(dataRoot, dataset.slug);
    await fs.mkdir(targetDir, { recursive: true });
    const outputPath = path.join(targetDir, "layout.json");
    await fs.writeFile(outputPath, JSON.stringify(layout, null, 2), "utf8");
    console.log(
      `Wrote ${layout.nodes.length} nodes for ${
        dataset.slug
      } -> ${path.relative(projectRoot, outputPath)}`
    );
    summaries.push({
      slug: dataset.slug,
      label: meta.label,
      postCount: meta.postCount,
      groupCount: meta.groupCount,
      startDate: meta.startDate,
      endDate: meta.endDate,
    });
  }

  const indexPath = path.join(dataRoot, "datasets.json");
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(summaries, null, 2), "utf8");
  console.log(
    `Updated dataset index at ${path.relative(projectRoot, indexPath)}`
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
