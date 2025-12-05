class GIFEncoder {
  constructor() {
    throw new Error("GIF export is not supported in this build.");
  }
}

const applyPalette = () => {};
const nearestColor = () => null;
const nearestColorIndex = () => -1;
const nearestColorIndexWithDistance = () => ({ index: -1, distance: Infinity });
const prequantize = (input) => input;
const quantize = (input) => input;
const snapColorsToPalette = (input) => input;

const gifenc = {
  GIFEncoder,
  applyPalette,
  nearestColor,
  nearestColorIndex,
  nearestColorIndexWithDistance,
  prequantize,
  quantize,
  snapColorsToPalette,
};

export {
  GIFEncoder,
  applyPalette,
  nearestColor,
  nearestColorIndex,
  nearestColorIndexWithDistance,
  prequantize,
  quantize,
  snapColorsToPalette,
};

export default gifenc;
