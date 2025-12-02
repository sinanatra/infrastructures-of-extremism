import gifenc from 'gifenc';

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
