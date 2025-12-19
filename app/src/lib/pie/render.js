export const shortenText = (str, maxLen = 30) => {
  if (!str) return "";
  return str.length <= maxLen ? str : str.substring(0, maxLen - 3) + "...";
};

const getArcPoints = (cx, cy, r, startAng, endAng, steps = 32) => {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = startAng + (endAng - startAng) * t;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
};

export const drawArcText = (ctx, txt, cx, cy, r, startAngle, endAngle) => {
  if (!txt || r <= 1) return;

  const baseSize = ctx.textSize();
  const padAngle = 0.03;
  const a0 = startAngle + padAngle;
  const a1 = endAngle - padAngle;
  if (a1 <= a0) return;

  const availableAngle = a1 - a0;
  const halfPi = Math.PI / 2;
  const minSize = Math.max(7, baseSize * 0.6);

  const buildChars = (s) => [...s];

  const measureRun = (chars) => {
    const textSize = ctx.textSize();
    const minAdvancePx = Math.max(1, textSize * 0.6);
    const minSpacePx = Math.max(1, textSize * 0.6);

    const s = chars.join("");
    const advances = new Array(s.length);
    const prefixWidths = new Array(s.length + 1);
    prefixWidths[0] = 0;

    for (let i = 0; i < s.length; i += 1) {
      let a = ctx.textWidth(s[i]);
      if (!Number.isFinite(a) || a <= 0) a = minAdvancePx;
      if (s[i] === " ") a = Math.max(a, minSpacePx);
      a = Math.max(a, minAdvancePx);
      advances[i] = a;
      prefixWidths[i + 1] = prefixWidths[i] + a;
    }

    const totalPx = prefixWidths[s.length];
    const totalAngle = totalPx / r;

    return { prefixWidths, advances, totalPx, totalAngle };
  };

  const fitChars = (chars) => {
    const ell = buildChars("…");

    const m0 = measureRun(chars);
    if (m0.totalAngle <= availableAngle) return { chars, m: m0 };

    const mell = measureRun(ell);
    if (mell.totalAngle > availableAngle) return { chars: ell, m: mell };

    let lo = 0;
    let hi = chars.length;
    let best = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const sliced = chars.slice(0, mid);
      const test = mid < chars.length ? sliced.concat(ell) : sliced;
      const tm = measureRun(test);
      if (tm.totalAngle <= availableAngle) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const sliced = chars.slice(0, best);
    const finalChars = best < chars.length ? sliced.concat(ell) : sliced;
    return { chars: finalChars, m: measureRun(finalChars) };
  };

  let chars = buildChars(txt);
  let fitted = fitChars(chars);

  while (fitted.m.totalAngle > availableAngle && ctx.textSize() > minSize) {
    ctx.textSize(ctx.textSize() * 0.9);
    fitted = fitChars(chars);
  }

  if (fitted.m.totalAngle > availableAngle) {
    ctx.textSize(baseSize);
    return;
  }

  chars = fitted.chars;
  const { prefixWidths, advances, totalPx } = fitted.m;

  const midAngle = (a0 + a1) / 2;
  const reverse = midAngle < Math.PI;

  const startTheta = reverse
    ? midAngle + totalPx / r / 2
    : midAngle - totalPx / r / 2;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const posPx = prefixWidths[i] + (advances?.[i] ?? 0) / 2;
    const theta = reverse ? startTheta - posPx / r : startTheta + posPx / r;

    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);

    if (ch === " ") continue;

    ctx.push();
    ctx.translate(x, y);
    let rotation = theta + halfPi;
    if (reverse) rotation += Math.PI;
    ctx.rotate(rotation);
    ctx.textAlign(ctx.CENTER, ctx.CENTER);
    ctx.text(ch, 0, 0);
    ctx.pop();
  }

  ctx.textSize(baseSize);
};

export const drawWedgeLayer = (ctx, { cx, cy, outerRadius, wedgeData }, theme, style) => {
  const { pieFill, circleColor, highlightColor, labelFont, dotSize } = theme;
  const { shortenLabel = (s) => shortenText(s, 64).toLowerCase() } = style ?? {};

  ctx.push();
  ctx.fill(pieFill);
  ctx.noStroke();
  ctx.ellipse(cx, cy, outerRadius * 2, outerRadius * 2);
  ctx.pop();

  ctx.push();
  for (const type of Object.keys(wedgeData)) {
    const wedge = wedgeData[type];

    ctx.stroke(circleColor);
    ctx.strokeWeight(0.5);
    ctx.noFill();
    ctx.arc(cx, cy, outerRadius * 2, outerRadius * 2, wedge.start, wedge.start + wedge.angle);

    ctx.line(
      cx,
      cy,
      cx + outerRadius * Math.cos(wedge.start + wedge.angle),
      cy + outerRadius * Math.sin(wedge.start + wedge.angle)
    );

    const labelRaw = shortenLabel(type);
    const labelRadius = outerRadius + dotSize * 1.45;

    ctx.push();
    ctx.noStroke();
    ctx.fill(highlightColor);
    ctx.textFont(labelFont);
    ctx.textSize(dotSize * 1.5);
    drawArcText(ctx, labelRaw, cx, cy, labelRadius, wedge.start, wedge.start + wedge.angle);
    ctx.pop();
  }
  ctx.pop();
};

export const drawBaseGeometry = (
  ctx,
  { cx, cy, outerRadius, wedgeData },
  theme,
  { extrudeOffsetX = 0, extrudeOffsetY = 0 } = {}
) => {
  const { pieFill, circleColor, dotSize } = theme;

  ctx.fill(pieFill);
  ctx.stroke(circleColor);
  ctx.strokeWeight(0.5);

  ctx.ellipse(cx + extrudeOffsetX, cy + extrudeOffsetY, outerRadius * 2, outerRadius * 2);

  const extrusionMargin = dotSize * 0.1;
  ctx.noStroke();
  ctx.fill(pieFill);
  ctx.beginShape();
  ctx.vertex(cx - outerRadius + extrusionMargin, cy);
  ctx.vertex(cx + outerRadius - extrusionMargin, cy);
  ctx.vertex(cx + extrudeOffsetX + outerRadius - extrusionMargin, cy + extrudeOffsetY);
  ctx.vertex(cx + extrudeOffsetX - outerRadius + extrusionMargin, cy + extrudeOffsetY);
  ctx.endShape(ctx.CLOSE);

  for (const type of Object.keys(wedgeData)) {
    const wedge = wedgeData[type];
    const topArcPoints = getArcPoints(cx, cy, outerRadius, wedge.start, wedge.start + wedge.angle);
    const bottomArcPoints = topArcPoints.map((pt) => ({
      x: pt.x + extrudeOffsetX,
      y: pt.y + extrudeOffsetY,
    }));

    ctx.stroke(circleColor);
    ctx.noFill();
    ctx.strokeWeight(0.5);

    ctx.line(topArcPoints[0].x, topArcPoints[0].y, bottomArcPoints[0].x, bottomArcPoints[0].y);
    ctx.line(
      topArcPoints[topArcPoints.length - 1].x,
      topArcPoints[topArcPoints.length - 1].y,
      bottomArcPoints[bottomArcPoints.length - 1].x,
      bottomArcPoints[bottomArcPoints.length - 1].y
    );
  }

  drawWedgeLayer(ctx, { cx, cy, outerRadius, wedgeData }, theme, {});
};

export const drawHoverOverlay = ({
  p,
  hoverNode,
  linksByNode,
  nodesById,
  visibleNodeIds,
  nodeInnerSize,
  dotSize,
  highlightColor,
  labelFont,
  labelText,
}) => {
  if (!hoverNode) return;

  const neighborIds = linksByNode.get(hoverNode.id);
  if (neighborIds && neighborIds.size) {
    p.push();
    p.stroke(highlightColor);
    p.strokeWeight(0.5);
    p.noFill();
    for (const neighborId of neighborIds) {
      if (!visibleNodeIds.has(neighborId)) continue;
      const neighbor = nodesById[neighborId];
      if (!neighbor) continue;
      p.line(hoverNode.x, hoverNode.y, neighbor.x, neighbor.y);
    }
    p.pop();
  }

  const innerSize = nodeInnerSize(hoverNode);

  p.noStroke();
  p.fill(highlightColor);
  p.ellipse(hoverNode.x, hoverNode.y, dotSize, dotSize);

  p.noStroke();
  p.fill(highlightColor);
  p.ellipse(hoverNode.x, hoverNode.y, innerSize, innerSize);

  p.push();
  p.textFont(labelFont);
  p.textSize(8);
  p.stroke(255);
  p.strokeWeight(1);
  p.fill(highlightColor);
  p.text(labelText, hoverNode.x, hoverNode.y - 8);
  p.pop();
};

