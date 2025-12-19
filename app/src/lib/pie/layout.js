const TAU = Math.PI * 2;

export const buildTypeOrder = (nodes, preferredOrder = [], otherLabel = null) => {
  const present = new Set(nodes.map((node) => node.type));
  const ordered = preferredOrder.filter((label) => present.has(label));
  if (otherLabel && present.has(otherLabel)) ordered.push(otherLabel);
  return ordered.length ? ordered : otherLabel ? [otherLabel] : [];
};

export const computeGroupMetricMaxes = (nodes, types, { linksKey = "radiusLinks", reactionsKey = "radiusReactions" } = {}) => {
  const groupMaxLinks = {};
  const groupMaxReactions = {};

  for (const type of types) {
    const nodesInType = nodes.filter((n) => n.type === type);
    const maxLinks = Math.max(...nodesInType.map((n) => n[linksKey] || 0), 0);
    const maxReactions = Math.max(
      ...nodesInType.map((n) => n[reactionsKey] || 0),
      0
    );
    groupMaxLinks[type] = maxLinks > 0 ? maxLinks : 1;
    groupMaxReactions[type] = maxReactions > 0 ? maxReactions : 1;
  }

  return { groupMaxLinks, groupMaxReactions };
};

const capacityForWedge = ({ theta, radius, innerRadius, dotSize, nodeMargin }) => {
  let cap = 0;
  let r = radius - nodeMargin;
  while (r >= innerRadius) {
    const ringCap = Math.floor((theta * r) / dotSize);
    if (ringCap < 1) break;
    cap += ringCap;
    r -= dotSize;
  }
  return cap;
};

const findMinimalThetaForWedge = ({ count, radius, innerRadius, dotSize, nodeMargin }) => {
  let low = 0;
  let high = TAU;
  let best = high;
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    if (capacityForWedge({ theta: mid, radius, innerRadius, dotSize, nodeMargin }) >= count) {
      best = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  return best;
};

const computeWedgeData = ({ types, groups, radius, innerRadius, dotSize, nodeMargin }) => {
  let sumTheta = 0;
  const temp = {};
  for (const type of types) {
    const count = groups[type].length;
    const theta = findMinimalThetaForWedge({ count, radius, innerRadius, dotSize, nodeMargin });
    temp[type] = { angle: theta };
    sumTheta += theta;
  }

  const scale = TAU / Math.max(sumTheta, 1e-6);
  let start = 0;
  const result = {};

  for (const type of types) {
    const adjusted = temp[type].angle * scale;
    result[type] = { angle: adjusted, start, mid: start + adjusted / 2 };
    start += adjusted;
  }
  return result;
};

const findOuterRadius = ({ types, groups, innerRadius, dotSize, nodeMargin }) => {
  const totalThetaForRadius = (radius) => {
    let total = 0;
    for (const type of types) {
      const count = groups[type].length;
      total += findMinimalThetaForWedge({ count, radius, innerRadius, dotSize, nodeMargin });
    }
    return total;
  };

  let low = dotSize * 2;
  let high = dotSize * 600;
  let best = high;
  for (let i = 0; i < 22; i += 1) {
    const mid = (low + high) / 2;
    const total = totalThetaForRadius(mid);
    if (total > TAU) low = mid;
    else {
      best = mid;
      high = mid;
    }
  }
  return best;
};

export const computePieLayout = ({
  nodes,
  types,
  cx,
  cy,
  dotSize,
  nodeMargin,
  innerRadius = 0,
  sortKey = (node) => [(node.degreeCentrality || 0), -(node.timestamp || 0)],
} = {}) => {
  const groups = {};
  for (const type of types) {
    groups[type] = nodes
      .filter((n) => n.type === type)
      .sort((a, b) => {
        const [aCentrality, aTimestamp] = sortKey(a);
        const [bCentrality, bTimestamp] = sortKey(b);
        return aCentrality - bCentrality || aTimestamp - bTimestamp;
      });
  }

  const outerRadius = findOuterRadius({ types, groups, innerRadius, dotSize, nodeMargin });
  const wedgeData = computeWedgeData({ types, groups, radius: outerRadius, innerRadius, dotSize, nodeMargin });

  for (const type of types) {
    const nodesOfType = groups[type];
    const theta = wedgeData[type].angle;
    const startAngle = wedgeData[type].start;

    let remaining = nodesOfType.length;
    const assigned = [];
    let r = outerRadius - nodeMargin;

    while (remaining > 0 && r >= innerRadius) {
      const ringCap = Math.floor((theta * r) / dotSize);
      if (ringCap < 1) {
        r -= dotSize;
        continue;
      }
      const countInRing = Math.min(remaining, ringCap);
      const stepA = theta / countInRing;
      for (let i = 0; i < countInRing; i += 1) {
        const a = startAngle + stepA * (i + 0.5);
        assigned.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      remaining -= countInRing;
      r -= dotSize;
    }

    for (let i = 0; i < nodesOfType.length; i += 1) {
      const node = nodesOfType[i];
      const point = assigned[i];
      if (point) {
        node.x = point.x;
        node.y = point.y;
      } else {
        node.x = cx;
        node.y = cy;
      }
    }
  }

  return { outerRadius, wedgeData };
};

