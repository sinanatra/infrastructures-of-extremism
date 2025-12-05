import { error } from '@sveltejs/kit';
import { csvParse } from 'd3-dsv';

const parseNumber = (value) => {
	const num = Number(value ?? '');
	return Number.isFinite(num) ? num : undefined;
};

const normalizeGroupId = (value) => (value ?? '').trim().toLowerCase();

const parseDateMs = (value) => {
	const ms = Date.parse(value ?? '');
	return Number.isFinite(ms) ? ms : undefined;
};

export const load = async ({ fetch, params }) => {
	const datasetSlug = params.dataset;
	const basePath = `/data/${encodeURIComponent(datasetSlug)}`;

	const [postsRes, linksRes, groupsRes, layoutRes] = await Promise.all([
		fetch(`${basePath}/message_nodes.csv`),
		fetch(`${basePath}/message_edges.csv`),
		fetch(`${basePath}/nodes.csv`),
		fetch(`${basePath}/layout.json`)
	]);

	if ([postsRes, linksRes, groupsRes, layoutRes].some((res) => res.status === 404)) {
		throw error(404, `Dataset "${datasetSlug}" not found.`);
	}

	if (!postsRes.ok || !linksRes.ok || !groupsRes.ok || !layoutRes.ok) {
		throw error(500, `Failed to load dataset files for "${datasetSlug}".`);
	}

	const [postsCsv, linksCsv, groupsCsv, layoutJson] = await Promise.all([
		postsRes.text(),
		linksRes.text(),
		groupsRes.text(),
		layoutRes.text()
	]);

	const excludedGroupIds = new Set(['boost']);
	const excludedGroupLabels = new Set(['update to boost']);

	const canonicalGroups = new Map();
	for (const row of csvParse(groupsCsv)) {
		const rawId = row.id?.trim() ?? '';
		const id = normalizeGroupId(rawId);
		const label = row.label?.trim() || rawId || id;
		if (!id) continue;
		if (excludedGroupIds.has(id)) continue;
		if (excludedGroupLabels.has(label.toLowerCase())) continue;

		const subscribers = parseNumber(row.subscribers);
		const existing = canonicalGroups.get(id);
		if (!existing) {
			canonicalGroups.set(id, { id, label, subscribers });
		} else {
			const labelIsGeneric = existing.label.toLowerCase() === id;
			const candidateIsSpecific = label.toLowerCase() !== id;
			const mergedLabel = labelIsGeneric && candidateIsSpecific ? label : existing.label;
			const mergedSubscribers = Math.max(
				Number.isFinite(existing.subscribers) ? existing.subscribers : -Infinity,
				Number.isFinite(subscribers) ? subscribers : -Infinity
			);
			canonicalGroups.set(id, {
				id,
				label: mergedLabel,
				subscribers: Number.isFinite(mergedSubscribers) ? mergedSubscribers : undefined
			});
		}
	}
	const groups = [...canonicalGroups.values()];

	const posts = csvParse(postsCsv)
		.map((row) => {
			const dateMs = parseDateMs(row.date);
			if (!dateMs) return null;

			const id = (row.id ?? '').trim();
			const chatRaw = (row.chat ?? '').trim();
			const chat = normalizeGroupId(chatRaw);
			const rawLabel = row.label?.trim() ?? '';
			const text = row.text?.trim() ?? '';
			if (!text) return null;
			const label = rawLabel || (text ? `${text.slice(0, 120)}${text.length > 120 ? '…' : ''}` : id);
			if (!id || !chat) return null;

			let reactionBreakdown = {};
			if (row.reaction_breakdown) {
				try {
					reactionBreakdown = JSON.parse(row.reaction_breakdown);
				} catch (err) {
					reactionBreakdown = {};
				}
			}

			return {
				id,
				label,
				chat,
				chatLabel: canonicalGroups.get(chat)?.label ?? chatRaw ?? chat,
				messageId: row.message_id?.trim() ?? '',
				dateIso: new Date(dateMs).toISOString(),
				dateMs,
				views: parseNumber(row.views),
				reactions: parseNumber(row.reaction_count),
				url: row.url?.trim(),
				reactionBreakdown
			};
		})
		.filter(
			(post) =>
				post !== null &&
				!excludedGroupIds.has(post.chat) &&
				!excludedGroupLabels.has((post.chatLabel ?? post.chat).toLowerCase())
		);

	posts.sort((a, b) => a.dateMs - b.dateMs);

	const postIds = new Set(posts.map((p) => p.id));

	const links = csvParse(linksCsv)
		.map((row) => ({
			source: row.source?.trim?.() ?? row.from?.trim?.() ?? '',
			target: row.target?.trim?.() ?? row.to?.trim?.() ?? '',
			type: row.type?.trim() || 'link'
		}))
		.filter((link) => link.source && link.target && postIds.has(link.source) && postIds.has(link.target));

	let layout = null;
	try {
		layout = JSON.parse(layoutJson);
	} catch (err) {
		throw error(500, `Failed to parse layout for dataset "${datasetSlug}".`);
	}

	const datasetLabel =
		groups.find((g) => normalizeGroupId(g.id) === normalizeGroupId(datasetSlug))?.label ?? datasetSlug;

	return {
		dataset: { slug: datasetSlug, label: datasetLabel },
		posts,
		groups,
		links,
		layout
	};
};
