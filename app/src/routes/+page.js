export const load = async ({ fetch }) => {
	const res = await fetch('/data/datasets.json');
	if (!res.ok) {
		return { datasets: [] };
	}

	let datasets = [];
	try {
		datasets = await res.json();
	} catch (err) {
		console.warn('Failed to parse datasets.json', err);
		datasets = [];
	}

	if (!Array.isArray(datasets)) datasets = [];

	return { datasets };
};
