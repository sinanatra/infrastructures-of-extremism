import { stripHandle, cleanLabel } from '$lib/utils/normalize.js';
import {
  BASE_RADIUS,
  LAYER_GAP,
  MIN_RING_GAP,
  START_ANGLE,
  BROKEN_NODE_COLOR,
  BROKEN_EDGE_COLOR,
  DENSITY_SCALE_THRESHOLDS,
} from './constants.js';

export const prepareTreeData = (data, defaultTheme = {}) => {
  const base = data?.dataset?.theme ?? {};
  const theme = {
    backgroundColor: base.backgroundColor ?? defaultTheme.backgroundColor ?? '#000000',
    circleColor: base.circleColor ?? defaultTheme.circleColor ?? '#ffffff',
    textColor: base.textColor ?? defaultTheme.textColor ?? '#ffffff',
    highlightColor: base.highlightColor ?? defaultTheme.highlightColor ?? 'yellow',
  };

  const brokenGroupInfo = new Map(
    (data?.brokenGroups ?? [])
      .filter((row) => (row.status ?? '').toString().trim().toLowerCase() !== 'flood_wait_exceeded')
      .map((row) => {
        const id = stripHandle(row.id ?? '');
        return [
          id,
          {
            id,
            status: (row.status ?? 'resolve_failed').toString(),
            reason: (row.reason ?? '').toString(),
            totalMentions: Number(row.totalMentions ?? 0) || 0,
            sourceGroupCount: Number(row.sourceGroupCount ?? 0) || 0,
          },
        ];
      })
  );

  const groupInfo = new Map(
    (data.groups ?? []).map((g) => {
      const id = stripHandle(g.id);
      const broken = brokenGroupInfo.get(id);
      return [
        id,
        {
          label: cleanLabel(g) || id,
          subscribers: g.subscribers ?? 0,
          brokenStatus: broken?.status ?? '',
          brokenReason: broken?.reason ?? '',
          brokenMentions: broken?.totalMentions ?? 0,
        },
      ];
    })
  );

  const datasetRoot = stripHandle(data?.dataset?.slug ?? '');
  const trailerSeedLabel =
    groupInfo.get(datasetRoot)?.label ??
    data?.dataset?.label ??
    data?.dataset?.slug ??
    datasetRoot;

  const trailerGroups = (() => {
    const raw = data.groups ?? [];
    const seen = new Set();
    const result = [];
    for (const group of raw) {
      const id = stripHandle(group.id ?? group.username ?? group.slug ?? group.label ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push({ id, label: cleanLabel(group) || id });
    }
    if (datasetRoot) {
      const idx = result.findIndex((g) => g.id === datasetRoot);
      if (idx > 0) {
        const [seedGroup] = result.splice(idx, 1);
        if (seedGroup) {
          seedGroup.label = seedGroup.label || trailerSeedLabel;
          result.unshift(seedGroup);
        }
      } else if (idx === -1) {
        result.unshift({ id: datasetRoot, label: trailerSeedLabel || datasetRoot });
      } else if (idx === 0) {
        result[0].label = result[0].label || trailerSeedLabel;
      }
    }
    if (!result.length && datasetRoot) {
      result.push({ id: datasetRoot, label: trailerSeedLabel || datasetRoot });
    }
    return result;
  })();

  const rawLinks =
    (data.groupLinks?.length ? data.groupLinks : data.links) ?? [];

  const edges = rawLinks
    .map((l) => ({
      source: stripHandle(l.source),
      target: stripHandle(l.target),
      kind: (l.kind ?? 'live').toString().trim().toLowerCase() || 'live',
      status: (l.status ?? '').toString().trim(),
      reason: (l.reason ?? '').toString().trim(),
      count: Number(l.count ?? 1) || 1,
    }))
    .filter((l) => l.source && l.target && l.source !== l.target);

  const brokenNodeIds = new Set([...brokenGroupInfo.keys()]);
  for (const edge of edges) {
    if (edge.kind === 'broken' && edge.status.toLowerCase() !== 'flood_wait_exceeded') {
      brokenNodeIds.add(edge.target);
    }
  }

  const allNodes = new Set();
  for (const e of edges) { allNodes.add(e.source); allNodes.add(e.target); }

  const hasNode = (id) => Boolean(id) && (allNodes.has(id) || brokenNodeIds.has(id));
  const groupRoot = (data.groups?.length ? stripHandle(data.groups[0].id) : null) || null;
  const firstEdgeSource = edges.length ? edges[0].source : null;
  const firstEdgeTarget = edges.length ? edges[0].target : null;

  let seed = null;
  if (hasNode(datasetRoot)) seed = datasetRoot;
  else if (hasNode(groupRoot)) seed = groupRoot;
  else if (hasNode(firstEdgeSource)) seed = firstEdgeSource;
  else if (hasNode(firstEdgeTarget)) seed = firstEdgeTarget;
  else seed = datasetRoot || groupRoot || firstEdgeSource || firstEdgeTarget;

  const children = new Map();
  for (const { source, target } of edges) {
    if (!children.has(source)) children.set(source, []);
    const arr = children.get(source);
    if (!arr.includes(target)) arr.push(target);
  }

  const buildPrimaryLayers = (rootId) => {
    const layers = [];
    const discovered = new Set();
    if (!rootId) return { layers, discovered };
    layers.push([rootId]);
    discovered.add(rootId);
    let currentLayer = [rootId];
    while (currentLayer.length) {
      const nextLayer = [];
      for (const node of currentLayer) {
        for (const target of children.get(node) ?? []) {
          if (discovered.has(target)) continue;
          discovered.add(target);
          nextLayer.push(target);
        }
      }
      if (!nextLayer.length) break;
      layers.push(nextLayer);
      currentLayer = nextLayer;
    }
    return { layers, discovered };
  };

  const { layers: primaryLayers, discovered: primaryDiscovered } = buildPrimaryLayers(seed);
  const layers = [...primaryLayers];
  const discovered = new Set(primaryDiscovered);
  if (layers.length === 0 && seed) {
    layers.push([seed]);
    discovered.add(seed);
  }

  const nodes = [];
  const nodeIndex = new Map();
  layers.forEach((layer, layerIndex) => {
    layer.forEach((id, indexInLayer) => {
      const info = groupInfo.get(id) ?? {
        label: id,
        subscribers: 0,
        brokenStatus: '',
        brokenReason: '',
        brokenMentions: 0,
      };
      const brokenInfo = brokenGroupInfo.get(id);
      const isBroken = brokenNodeIds.has(id);
      nodeIndex.set(id, nodes.length);
      nodes.push({
        id,
        label: info.label,
        subscribers: info.subscribers,
        isBroken,
        brokenStatus: brokenInfo?.status ?? info.brokenStatus ?? '',
        brokenReason: brokenInfo?.reason ?? info.brokenReason ?? '',
        brokenMentions: brokenInfo?.totalMentions ?? info.brokenMentions ?? 0,
        layerIndex,
        indexInLayer,
        visualRing: null,
        visualIndex: null,
        radius: 0,
        angle: 0,
        x: 0,
        y: 0,
      });
    });
  });

  const balancedVisualRings = layers
    .slice(1)
    .filter((layer) => Array.isArray(layer) && layer.length)
    .map((layer) => [...layer]);

  balancedVisualRings.forEach((ids, ringIndex) => {
    ids.forEach((id, indexInRing) => {
      const idx = nodeIndex.get(id);
      if (idx == null) return;
      nodes[idx].visualRing = ringIndex + 1;
      nodes[idx].visualIndex = indexInRing;
    });
  });

  const ringNodeCountByIndex = balancedVisualRings.map((ids) => Math.max(1, ids.length));

  const ringRadiusByIndex = [];
  for (let i = 0; i < ringNodeCountByIndex.length; i += 1) {
    const count = ringNodeCountByIndex[i];
    const nominalRadius = BASE_RADIUS + i * LAYER_GAP;
    const densityRadius = BASE_RADIUS + Math.sqrt(count) * 34;
    const preferred = Math.max(nominalRadius, densityRadius);
    const prev = i > 0 ? ringRadiusByIndex[i - 1] : 0;
    ringRadiusByIndex[i] = i > 0 ? Math.max(preferred, prev + MIN_RING_GAP) : preferred;
  }

  const densityScaleForRing = (ringIndex) => {
    const count = ringNodeCountByIndex[Math.max(0, ringIndex - 1)] ?? 1;
    for (const { minCount, scale } of DENSITY_SCALE_THRESHOLDS) {
      if (count > minCount) return scale;
    }
    return 1;
  };

  for (const node of nodes) {
    if (node.layerIndex === 0) {
      node.radius = 0; node.angle = 0; node.x = 0; node.y = 0;
      continue;
    }
    const ring = node.visualRing ?? node.layerIndex;
    const ids = balancedVisualRings[ring - 1] ?? layers[node.layerIndex] ?? [node.id];
    const count = ids.length || 1;
    const indexOnRing = node.visualIndex ?? Math.max(0, ids.findIndex((id) => id === node.id));
    node.radius = ringRadiusByIndex[ring - 1] ?? BASE_RADIUS + (ring - 1) * LAYER_GAP;
    node.angle = START_ANGLE + indexOnRing * ((Math.PI * 2) / count);
    node.x = Math.cos(node.angle) * node.radius;
    node.y = Math.sin(node.angle) * node.radius;
  }

  const linkSegments = edges
    .map((e) => {
      const si = nodeIndex.get(e.source);
      const ti = nodeIndex.get(e.target);
      if (si == null || ti == null) return null;
      return {
        source: nodes[si],
        target: nodes[ti],
        kind: e.kind,
        status: e.status,
        reason: e.reason,
        count: Math.max(1, Number(e.count ?? 1) || 1),
      };
    })
    .filter(Boolean);

  const neighbors = new Map();
  for (const l of linkSegments) {
    if (!neighbors.has(l.source.id)) neighbors.set(l.source.id, new Set());
    if (!neighbors.has(l.target.id)) neighbors.set(l.target.id, new Set());
    neighbors.get(l.source.id).add(l.target.id);
    neighbors.get(l.target.id).add(l.source.id);
  }

  const revealGroups = (() => {
    const groups = [];
    const revealed = new Set();
    const queue = [];
    const componentSeeds = new Set();

    const enqueue = (id, forceSeed = false) => {
      if (!id) return;
      if (revealed.has(id)) { if (forceSeed) componentSeeds.add(id); return; }
      revealed.add(id);
      queue.push(id);
      if (forceSeed) componentSeeds.add(id);
    };

    const processQueue = () => {
      while (queue.length) {
        const current = queue.shift();
        const group = new Set([current]);
        let hasNew = false;
        for (const nid of neighbors.get(current) ?? new Set()) {
          if (revealed.has(nid)) continue;
          group.add(nid);
          enqueue(nid);
          hasNew = true;
        }
        const forceGroup = componentSeeds.delete(current);
        if (hasNew || forceGroup || groups.length === 0) groups.push([...group]);
      }
    };

    const candidates = [seed, groupRoot, datasetRoot, nodes[0]?.id].filter(Boolean);
    if (!candidates.length && nodes.length) candidates.push(nodes[0].id);
    for (const candidate of candidates) enqueue(candidate, true);
    processQueue();

    let pending = nodes.find((node) => !revealed.has(node.id));
    while (pending) {
      enqueue(pending.id, true);
      processQueue();
      pending = nodes.find((node) => !revealed.has(node.id));
    }

    return groups;
  })();

  return {
    theme,
    brokenNodeColor: BROKEN_NODE_COLOR,
    brokenEdgeColor: BROKEN_EDGE_COLOR,
    nodes,
    nodeIndex,
    edges,
    linkSegments,
    revealGroups,
    balancedVisualRings,
    ringNodeCountByIndex,
    ringRadiusByIndex,
    seed,
    trailerGroups,
    trailerSeedLabel,
    densityScaleForRing,
  };
};
