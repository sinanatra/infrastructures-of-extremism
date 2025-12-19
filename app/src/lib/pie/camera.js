const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const createCamera = ({
  getViewportSize,
  getWorldSize,
  initialZoom = 1,
  initialPanX = 0,
  initialPanY = 0,
} = {}) => {
  let zoom = initialZoom;
  let panX = initialPanX;
  let panY = initialPanY;

  const getWorldCenter = () => {
    const { width, height } = getWorldSize();
    return { x: width / 2, y: height / 2 };
  };

  const getViewportCenter = () => {
    const { width, height } = getViewportSize();
    return { x: width / 2, y: height / 2 };
  };

  const applyTransform = (p) => {
    const viewport = getViewportCenter();
    const world = getWorldCenter();
    p.translate(viewport.x + panX, viewport.y + panY);
    p.scale(zoom);
    p.translate(-world.x, -world.y);
  };

  const screenToWorld = (sx, sy) => {
    const viewport = getViewportCenter();
    const world = getWorldCenter();
    sx -= viewport.x + panX;
    sy -= viewport.y + panY;
    sx /= zoom;
    sy /= zoom;
    sx += world.x;
    sy += world.y;
    return { x: sx, y: sy };
  };

  const zoomAt = (deltaY, sx, sy, { step = 0.001, minZoom = 0.001, maxZoom = 5 } = {}) => {
    const nextZoom = clamp(zoom - deltaY * step, minZoom, maxZoom);
    const scale = nextZoom / zoom;

    const viewport = getViewportCenter();
    const dx = sx - (viewport.x + panX);
    const dy = sy - (viewport.y + panY);
    panX -= dx * (scale - 1);
    panY -= dy * (scale - 1);

    zoom = nextZoom;
  };

  return {
    get zoom() {
      return zoom;
    },
    set zoom(value) {
      zoom = value;
    },
    get panX() {
      return panX;
    },
    set panX(value) {
      panX = value;
    },
    get panY() {
      return panY;
    },
    set panY(value) {
      panY = value;
    },
    resetPan: () => {
      panX = 0;
      panY = 0;
    },
    getWorldCenter,
    applyTransform,
    screenToWorld,
    zoomAt,
  };
};

