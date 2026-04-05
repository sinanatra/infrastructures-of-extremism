import { error } from '@sveltejs/kit';
import { csvParse } from 'd3-dsv';
import { normalizeGroupId } from '$lib/utils/normalize.js';
import { parseNumber, parseDateMs } from '$lib/utils/parse.js';

const summarizeBroken = (brokenGroups) => {
	return brokenGroups.reduce(
		(acc, row) => {
			const mentions = Math.max(0, parseNumber(row.totalMentions) ?? 0);
			const status = (row.status || 'resolve_failed').trim() || 'resolve_failed';
			acc.totalTargets += 1;
			acc.totalMentions += mentions;
			acc.statusCounts[status] = (acc.statusCounts[status] ?? 0) + 1;
			return acc;
		},
		{ totalTargets: 0, totalMentions: 0, statusCounts: {} }
	);
};

export const load = async ({ fetch, params }) => {
	const datasetSlug = params.dataset;
	const basePath = `/data/${encodeURIComponent(datasetSlug)}`;

	const [
		postsRes,
		linksRes,
		groupsRes,
		layoutRes,
		datasetsRes,
		themesRes,
		groupEdgesRes,
		brokenGroupsRes,
		brokenGroupLinksRes
	] = await Promise.all([
		fetch(`${basePath}/message_nodes.csv`),
		fetch(`${basePath}/message_edges.csv`),
		fetch(`${basePath}/nodes.csv`),
		fetch(`${basePath}/layout.json`),
		fetch(`/data/datasets.json`),
		fetch(`/data/dataset-themes.json`),
		fetch(`${basePath}/edges.csv`),
		fetch(`${basePath}/broken_groups.csv`),
		fetch(`${basePath}/broken_group_links.csv`)
	]);

	if ([postsRes, linksRes, groupsRes, layoutRes].some((res) => res.status === 404)) {
		throw error(404, `Dataset "${datasetSlug}" not found.`);
	}

	if (!postsRes.ok || !linksRes.ok || !groupsRes.ok || !layoutRes.ok) {
		throw error(500, `Failed to load dataset files for "${datasetSlug}".`);
	}

	const [postsCsv, linksCsv, groupsCsv, layoutJson, datasetsJson, themesJson, groupEdgesCsv, brokenGroupsCsv, brokenGroupLinksCsv] = await Promise.all([
		postsRes.text(),
		linksRes.text(),
		groupsRes.text(),
		layoutRes.text(),
		datasetsRes.ok ? datasetsRes.text() : Promise.resolve('[]'),
		themesRes.ok ? themesRes.text() : Promise.resolve('[]'),
		groupEdgesRes.ok ? groupEdgesRes.text() : Promise.resolve(''),
		brokenGroupsRes.ok ? brokenGroupsRes.text() : Promise.resolve(''),
		brokenGroupLinksRes.ok ? brokenGroupLinksRes.text() : Promise.resolve('')
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
				} catch {
					reactionBreakdown = {};
				}
			}

			let topics = [];
			const topicsRaw = row.topics?.trim();
			if (topicsRaw) {
				try {
					topics = JSON.parse(topicsRaw.replace(/'/g, '"'));
				} catch {
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
	const messageEdgeRows = csvParse(linksCsv);

	const links = messageEdgeRows
		.map((row) => ({
			source: row.source?.trim?.() ?? row.from?.trim?.() ?? '',
			target: row.target?.trim?.() ?? row.to?.trim?.() ?? '',
			type: row.type?.trim() || 'link'
		}))
		.filter((link) => link.source && link.target && postIds.has(link.source) && postIds.has(link.target));

	const postsByMessageId = new Map(posts.map((post) => [post.id, post]));

	const groupLinksMap = new Map();
	const addGroupLink = ({ source, target, count = 1, kind = 'live', type = 'link', status = '', reason = '' }) => {
		const normalizedSource = normalizeGroupId(source);
		const normalizedTarget = normalizeGroupId(target);
		if (!normalizedSource || !normalizedTarget || normalizedSource === normalizedTarget) return;

		const sourceLabel = canonicalGroups.get(normalizedSource)?.label?.toLowerCase() ?? normalizedSource;
		const targetLabel = canonicalGroups.get(normalizedTarget)?.label?.toLowerCase() ?? normalizedTarget;
		if (excludedGroupIds.has(normalizedSource) || excludedGroupIds.has(normalizedTarget)) return;
		if (excludedGroupLabels.has(sourceLabel) || excludedGroupLabels.has(targetLabel)) return;

		const normalizedCount = Math.max(1, parseNumber(count) ?? 1);
		const key = [normalizedSource, normalizedTarget, kind || 'live', status || '', reason || '']
			.join('::')
			.toLowerCase();
		const existing = groupLinksMap.get(key);
		if (!existing) {
			groupLinksMap.set(key, {
				source: normalizedSource,
				target: normalizedTarget,
				count: normalizedCount,
				kind: kind || 'live',
				type: type || 'link',
				status: status || '',
				reason: reason || ''
			});
			return;
		}
		existing.count += normalizedCount;
		if (!existing.type && type) existing.type = type;
		if (!existing.status && status) existing.status = status;
		if (!existing.reason && reason) existing.reason = reason;
	};

	const groupLinksFromCsv = groupEdgesCsv
		? csvParse(groupEdgesCsv)
				.map((row) => ({
					source: normalizeGroupId(row.from ?? row.source ?? row.from_id),
					target: normalizeGroupId(row.to ?? row.target ?? row.to_id),
					count: row.count,
					kind: row.kind?.trim?.() || 'live',
					type: row.type?.trim?.() || 'link',
					status: row.status?.trim?.() || '',
					reason: row.reason?.trim?.() || ''
				}))
				.filter((link) => link.source && link.target && link.source !== link.target)
		: [];

	if (groupLinksFromCsv.length) {
		for (const link of groupLinksFromCsv) {
			addGroupLink(link);
		}
	} else {
		for (const row of messageEdgeRows) {
			const sourceId = row.source?.trim?.() ?? row.from?.trim?.() ?? '';
			const targetId = row.target?.trim?.() ?? row.to?.trim?.() ?? '';
			const sourcePost = postsByMessageId.get(sourceId);
			const targetPost = postsByMessageId.get(targetId);
			const source = normalizeGroupId(sourcePost?.chat ?? '');
			const target = normalizeGroupId(targetPost?.chat ?? '');
			if (!source || !target || source === target) continue;
			addGroupLink({ source, target, count: 1, kind: 'live', type: row.type?.trim() || 'link' });
		}
	}

	const brokenLinks = brokenGroupLinksCsv
		? csvParse(brokenGroupLinksCsv)
				.map((row) => ({
					source: normalizeGroupId(row.from ?? row.source ?? row.from_id),
					target: normalizeGroupId(row.to ?? row.target ?? row.to_id),
					count: row.count,
					kind: 'broken',
					type: 'broken',
					status: row.status?.trim?.() || 'resolve_failed',
					reason: row.reason?.trim?.() || ''
				}))
				.filter((link) => link.source && link.target && link.source !== link.target)
		: [];

	for (const link of brokenLinks) {
		addGroupLink(link);
	}

	const groupLinks = [...groupLinksMap.values()].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
		if (b.count !== a.count) return b.count - a.count;
		if (a.source !== b.source) return a.source.localeCompare(b.source);
		return a.target.localeCompare(b.target);
	});

	const brokenGroupMap = new Map();
	if (brokenGroupsCsv) {
		for (const row of csvParse(brokenGroupsCsv)) {
			const id = normalizeGroupId(row.id ?? row.group_id ?? row.handle ?? '');
			if (!id) continue;
			const sourceGroups = String(row.source_groups ?? '')
				.split('|')
				.map((value) => normalizeGroupId(value))
				.filter(Boolean);
			brokenGroupMap.set(id, {
				id,
				status: row.status?.trim?.() || 'resolve_failed',
				reason: row.reason?.trim?.() || '',
				totalMentions: Math.max(0, parseNumber(row.total_mentions) ?? 0),
				sourceGroupCount: Math.max(parseNumber(row.source_group_count) ?? 0, sourceGroups.length),
				sourceGroups
			});
		}
	}

	for (const link of groupLinks) {
		if (link.kind !== 'broken') continue;
		const id = normalizeGroupId(link.target);
		if (!id) continue;
		const existing = brokenGroupMap.get(id) ?? {
			id,
			status: link.status || 'resolve_failed',
			reason: link.reason || '',
			totalMentions: 0,
			sourceGroupCount: 0,
			sourceGroups: []
		};
		existing.totalMentions += Math.max(0, parseNumber(link.count) ?? 1);
		if (!existing.status && link.status) existing.status = link.status;
		if (!existing.reason && link.reason) existing.reason = link.reason;
		if (link.source && !existing.sourceGroups.includes(link.source)) {
			existing.sourceGroups.push(link.source);
		}
		existing.sourceGroupCount = Math.max(existing.sourceGroupCount, existing.sourceGroups.length);
		brokenGroupMap.set(id, existing);
	}

	const brokenGroups = [...brokenGroupMap.values()].sort((a, b) => {
		if (b.totalMentions !== a.totalMentions) return b.totalMentions - a.totalMentions;
		return a.id.localeCompare(b.id);
	});
	const brokenSummary = summarizeBroken(brokenGroups);

	let layout = null;
	try {
		layout = JSON.parse(layoutJson);
	} catch {
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
		brokenGroups,
		brokenSummary,
		layout
	};
};
