export const load = async ({ fetch }) => {
	const [datasetsRes, themesRes] = await Promise.all([
		fetch('/data/datasets.json'),
		fetch('/data/dataset-themes.json')
	]);

	let datasets = [];
	if (datasetsRes.ok) {
		try {
			datasets = await datasetsRes.json();
		} catch (err) {
			console.warn('Failed to parse datasets.json', err);
		}
	}
	if (!Array.isArray(datasets)) datasets = [];

	let themes = [];
	if (themesRes.ok) {
		try {
			themes = await themesRes.json();
		} catch (err) {
			console.warn('Failed to parse dataset-themes.json', err);
		}
	}
	if (!Array.isArray(themes)) themes = [];

	const themeBySlug = new Map(
		themes
			.filter((t) => t?.slug && t.theme)
			.map((t) => [t.slug, t.theme])
	);

	const merged = datasets.map((d) => ({
		...d,
		theme: themeBySlug.get(d?.slug) ?? d?.theme
	}));

	return { datasets: merged };
};
