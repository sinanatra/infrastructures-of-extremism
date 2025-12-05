import * as gifencNs from 'gifenc';

const gifenc = gifencNs.default ?? gifencNs;

const {
	GIFEncoder,
	applyPalette,
	nearestColor,
	nearestColorIndex,
	nearestColorIndexWithDistance,
	prequantize,
	quantize,
	snapColorsToPalette
} = gifenc;

export {
	GIFEncoder,
	applyPalette,
	nearestColor,
	nearestColorIndex,
	nearestColorIndexWithDistance,
	prequantize,
	quantize,
	snapColorsToPalette
};

export default gifenc;
