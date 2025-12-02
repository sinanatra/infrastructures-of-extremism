import { csvParse } from 'd3-dsv';

const parseNumber = (value) => {
	const num = Number(value ?? '');
	return Number.isFinite(num) ? num : undefined;
};

const parseDateMs = (value) => {
	const ms = Date.parse(value ?? '');
	return Number.isFinite(ms) ? ms : undefined;
};

export const load = async ({ fetch }) => {
	const [postsRes, linksRes, groupsRes, layoutRes] = await Promise.all([
		fetch('/data/message_nodes.csv'),
		fetch('/data/message_edges.csv'),
		fetch('/data/nodes.csv'),
		fetch('/data/layout.json')
	]);

	if (!postsRes.ok || !linksRes.ok || !groupsRes.ok || !layoutRes.ok) {
		throw new Error('Failed to load one or more data files from /data');
	}

	const [postsCsv, linksCsv, groupsCsv, layoutJson] = await Promise.all([
		postsRes.text(),
		linksRes.text(),
		groupsRes.text(),
		layoutRes.text()
	]);

	const excludedGroupIds = new Set(['boost']);
	const excludedGroupLabels = new Set(['update to boost']);

	const groups = csvParse(groupsCsv)
		.map((row) => {
			const id = row.id?.trim() ?? '';
			return {
				id,
				label: row.label?.trim() || id,
				subscribers: parseNumber(row.subscribers)
			};
		})
		.filter(
			(group) =>
				group.id !== '' &&
				!excludedGroupIds.has(group.id.toLowerCase()) &&
				!excludedGroupLabels.has(group.label.toLowerCase())
		);

	const posts = csvParse(postsCsv)
		.map((row) => {
			const dateMs = parseDateMs(row.date);
			if (!dateMs) return null;

			const id = (row.id ?? '').trim();
			const chat = (row.chat ?? '').trim();
			if (!id || !chat) return null;

			return {
				id,
				label: row.label?.trim() ?? '',
				chat,
				messageId: row.message_id?.trim() ?? '',
				dateIso: new Date(dateMs).toISOString(),
				dateMs,
				views: parseNumber(row.views),
				reactions: parseNumber(row.reaction_count),
				url: row.url?.trim()
			};
		})
		.filter(
			(post) =>
				post !== null &&
				!excludedGroupIds.has(post.chat.toLowerCase()) &&
				!excludedGroupLabels.has(post.chat.toLowerCase())
		);

	posts.sort((a, b) => a.dateMs - b.dateMs);

	const postIds = new Set(posts.map((p) => p.id));

	const links = csvParse(linksCsv)
		.map((row) => ({
			source: row.source?.trim() ?? '',
			target: row.target?.trim() ?? '',
			type: row.type?.trim() || 'link'
		}))
		.filter((link) => link.source && link.target && postIds.has(link.source) && postIds.has(link.target));

	let layout = null;
	try {
		layout = JSON.parse(layoutJson);
	} catch (err) {
		throw new Error('Failed to parse precomputed layout.json');
	}

	return {
		posts,
		groups,
		links,
		layout
	};
};
