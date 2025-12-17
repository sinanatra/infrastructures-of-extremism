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

	const [postsRes, linksRes, groupsRes, layoutRes, datasetsRes, themesRes, groupEdgesRes] = await Promise.all([
		fetch(`${basePath}/message_nodes.csv`),
		fetch(`${basePath}/message_edges.csv`),
		fetch(`${basePath}/nodes.csv`),
		fetch(`${basePath}/layout.json`),
		fetch(`/data/datasets.json`),
		fetch(`/data/dataset-themes.json`),
		fetch(`${basePath}/edges.csv`)
	]);

	if ([postsRes, linksRes, groupsRes, layoutRes].some((res) => res.status === 404)) {
		throw error(404, `Dataset "${datasetSlug}" not found.`);
	}

	if (!postsRes.ok || !linksRes.ok || !groupsRes.ok || !layoutRes.ok) {
		throw error(500, `Failed to load dataset files for "${datasetSlug}".`);
	}

	const [postsCsv, linksCsv, groupsCsv, layoutJson, datasetsJson, themesJson, groupEdgesCsv] = await Promise.all([
		postsRes.text(),
		linksRes.text(),
		groupsRes.text(),
		layoutRes.text(),
		datasetsRes.ok ? datasetsRes.text() : Promise.resolve('[]'),
		themesRes.ok ? themesRes.text() : Promise.resolve('[]'),
		groupEdgesRes.ok ? groupEdgesRes.text() : Promise.resolve('')
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

			let topics = [];
			const topicsRaw = row.topics?.trim();
			if (topicsRaw) {
				try {
					topics = JSON.parse(topicsRaw.replace(/'/g, '"'));
				} catch (err) {
					topics = [];
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
				reactionBreakdown,
				topics
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

	const groupLinksFromCsv = groupEdgesCsv
		? csvParse(groupEdgesCsv)
				.map((row) => {
					const source = normalizeGroupId(row.from ?? row.source ?? row.from_id);
					const target = normalizeGroupId(row.to ?? row.target ?? row.to_id);
					return {
						source,
						target,
						messageId: row.message_id?.trim?.() ?? '',
					};
				})
				.filter((link) => link.source && link.target && link.source !== link.target)
		: [];

	const messageEdgeRows = csvParse(linksCsv);

	const links = messageEdgeRows
		.map((row) => ({
			source: row.source?.trim?.() ?? row.from?.trim?.() ?? '',
			target: row.target?.trim?.() ?? row.to?.trim?.() ?? '',
			type: row.type?.trim() || 'link'
		}))
		.filter((link) => link.source && link.target && postIds.has(link.source) && postIds.has(link.target));

	const postsByMessageId = new Map(posts.map((post) => [post.id, post]));

	const groupLinksFromMessages = messageEdgeRows
		.map((row) => {
			const sourceId = row.source?.trim?.() ?? row.from?.trim?.() ?? '';
			const targetId = row.target?.trim?.() ?? row.to?.trim?.() ?? '';
			const sourcePost = postsByMessageId.get(sourceId);
			const targetPost = postsByMessageId.get(targetId);
			const source = normalizeGroupId(sourcePost?.chat ?? '');
			const target = normalizeGroupId(targetPost?.chat ?? '');
			if (!source || !target || source === target) return null;
			return {
				source,
				target,
				messageId: row.message_id?.trim?.() ?? '',
			};
		})
		.filter(Boolean);

	const groupLinks = groupLinksFromCsv.length ? groupLinksFromCsv : groupLinksFromMessages;

	let layout = null;
	try {
		layout = JSON.parse(layoutJson);
	} catch (err) {
		throw error(500, `Failed to parse layout for dataset "${datasetSlug}".`);
	}

	let datasetMeta = null;
	try {
		const parsed = JSON.parse(datasetsJson);
		if (Array.isArray(parsed)) {
			datasetMeta = parsed.find((d) => d?.slug === datasetSlug) ?? null;
		}
	} catch (err) {
		console.warn('Failed to parse datasets.json', err);
		datasetMeta = null;
	}

	let datasetTheme = datasetMeta?.theme ?? null;
	try {
		const parsedThemes = JSON.parse(themesJson);
		if (Array.isArray(parsedThemes)) {
			const found = parsedThemes.find((t) => t?.slug === datasetSlug);
			if (found?.theme) datasetTheme = found.theme;
		}
	} catch (err) {
		console.warn('Failed to parse dataset-themes.json', err);
	}

	const datasetLabel =
		datasetMeta?.label ??
		groups.find((g) => normalizeGroupId(g.id) === normalizeGroupId(datasetSlug))?.label ??
		datasetSlug;

	return {
		dataset: { slug: datasetSlug, label: datasetLabel, theme: datasetTheme },
		posts,
		groups,
		links,
		groupLinks,
		layout
	};
};
