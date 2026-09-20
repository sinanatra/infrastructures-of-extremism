#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from utils import (
    DEFAULT_PRIMARY_TOPIC,
    dedupe_keep_order,
    normalize_id,
    normalize_slug,
    normalize_text,
    parse_listish,
    parse_locations,
    read_csv_rows,
    sync_to_app_static,
    write_csv_rows,
)

LEGACY_TOPIC_MAP: dict[str, str] = {
    "national identity": "Ideology",
    "migration & xenophobia": "Migration",
    "antisemitism": "Ideology",
    "islamophobia": "Ideology",
    "conspiracy narratives": "Censorship Claims",
    "street action / militancy": "Street Mobilization",
    "ideology / doctrine": "Ideology",
    "electoral politics": "Institutions",
    "violent rhetoric / incitement": "Conflict",
}

EXTRA_COLUMNS = ["topics_ollama_raw", "locations_ranked", "tagging_error"]


def load_topic_lookup(topics_json_path: Path) -> dict[str, str]:
    if not topics_json_path.exists():
        return {}
    payload = json.loads(topics_json_path.read_text(encoding="utf-8"))
    lookup: dict[str, str] = {}
    for item in payload.get("topics", []):
        if not isinstance(item, dict):
            continue
        label = normalize_text(item.get("label"))
        if label:
            lookup[label.lower()] = label
    return lookup


def canonicalize_topics(
    raw_topics: list[str],
    topic_lookup: dict[str, str],
    use_legacy_map: bool,
    keep_unknown: bool,
) -> list[str]:
    out: list[str] = []
    for topic in raw_topics:
        original = normalize_text(topic)
        if not original:
            continue
        lowered = original.lower()
        canonical = topic_lookup.get(lowered)
        if not canonical and use_legacy_map:
            mapped = LEGACY_TOPIC_MAP.get(lowered)
            if mapped:
                canonical = topic_lookup.get(mapped.lower(), mapped)
        if canonical:
            out.append(canonical)
        elif keep_unknown:
            out.append(original)
    return dedupe_keep_order(out)


def build_tag_map(
    tagged_rows: list[dict[str, str]],
    dataset_slug: str,
    topic_lookup: dict[str, str],
    use_legacy_map: bool,
    keep_unknown: bool,
    allow_empty_topics: bool,
) -> dict[str, dict[str, Any]]:
    tag_map: dict[str, dict[str, Any]] = {}

    for row in tagged_rows:
        row_id = normalize_id(row.get("id"))
        if not row_id:
            continue

        row_chat = normalize_slug(row.get("chat", ""))
        if row_chat != dataset_slug and not row_id.startswith(f"{dataset_slug}:"):
            continue

        raw_topics = dedupe_keep_order(parse_listish(row.get("topics")))
        canonical_topics = canonicalize_topics(raw_topics, topic_lookup, use_legacy_map, keep_unknown)
        locations = parse_locations(row.get("locations_ranked"))
        tagging_error = normalize_text(row.get("tagging_error"))

        if not (canonical_topics or raw_topics or locations or tagging_error):
            continue
        if not canonical_topics and not allow_empty_topics:
            continue

        candidate: dict[str, Any] = {
            "topics": canonical_topics,
            "primaryTopic": canonical_topics[0] if canonical_topics else DEFAULT_PRIMARY_TOPIC,
            "topics_ollama_raw": raw_topics,
            "locations_ranked": locations,
            "tagging_error": tagging_error,
        }

        existing = tag_map.get(row_id)
        if existing is None:
            tag_map[row_id] = candidate
            continue

        def _score(t: dict[str, Any]) -> tuple[int, int, int]:
            return (len(t["topics"]), len(t["locations_ranked"]), 0 if t["tagging_error"] else 1)

        if _score(candidate) >= _score(existing):
            tag_map[row_id] = candidate

    return tag_map


def merge_message_nodes(
    message_nodes_path: Path,
    tag_map: dict[str, dict[str, Any]],
    allow_empty_topics: bool,
    dry_run: bool,
) -> tuple[int, int]:
    fieldnames, rows = read_csv_rows(message_nodes_path)
    if "id" not in fieldnames:
        raise ValueError(f'Missing "id" column in {message_nodes_path}')

    merged_fieldnames = list(fieldnames)
    for col in ("topics", "primaryTopic", *EXTRA_COLUMNS):
        if col not in merged_fieldnames:
            merged_fieldnames.append(col)

    matched = updated = 0
    for row in rows:
        row_id = normalize_id(row.get("id"))
        if not row_id or row_id not in tag_map:
            continue
        matched += 1
        tag = tag_map[row_id]
        touched = False

        def _set(key: str, val: str) -> None:
            nonlocal touched
            if row.get(key, "") != val:
                row[key] = val
                touched = True

        if tag["topics"] or allow_empty_topics:
            _set("topics", json.dumps(tag["topics"], ensure_ascii=False))
            _set("primaryTopic", tag["primaryTopic"] or DEFAULT_PRIMARY_TOPIC)

        _set("topics_ollama_raw", json.dumps(tag["topics_ollama_raw"], ensure_ascii=False))
        _set("locations_ranked", json.dumps(tag["locations_ranked"], ensure_ascii=False))
        _set("tagging_error", tag["tagging_error"])

        if touched:
            updated += 1

    if not dry_run:
        write_csv_rows(message_nodes_path, merged_fieldnames, rows)

    return matched, updated


def merge_graph_json(
    graph_path: Path,
    tag_map: dict[str, dict[str, Any]],
    allow_empty_topics: bool,
    dry_run: bool,
) -> tuple[int, int]:
    if not graph_path.exists():
        return 0, 0

    payload = json.loads(graph_path.read_text(encoding="utf-8"))
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return 0, 0

    matched = updated = 0
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        msg_id = normalize_id(msg.get("id"))
        if not msg_id or msg_id not in tag_map:
            continue
        matched += 1
        tag = tag_map[msg_id]
        touched = False

        def _set_msg(key: str, val: Any) -> None:
            nonlocal touched
            if msg.get(key) != val:
                msg[key] = val
                touched = True

        if tag["topics"] or allow_empty_topics:
            _set_msg("topics", tag["topics"])
            _set_msg("primaryTopic", tag["primaryTopic"] or DEFAULT_PRIMARY_TOPIC)

        _set_msg("topics_ollama_raw", tag["topics_ollama_raw"])
        _set_msg("locations_ranked", tag["locations_ranked"])
        _set_msg("tagging_error", tag["tagging_error"])

        if touched:
            updated += 1

    if not dry_run and updated:
        graph_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    return matched, updated


def _find_default_tagged_csv(repo_root: Path, requested: Path) -> Path:
    if requested.exists():
        return requested
    if not requested.is_absolute():
        repo_relative = repo_root / requested
        if repo_relative.exists():
            return repo_relative
    for candidate in [
        repo_root / "notebooks" / "data" / "message_nodes_tagged.csv",
        repo_root / "notebooks" / "data" / "message_nodes_tagged_fast.csv",
    ]:
        if candidate.exists():
            return candidate
    return requested


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    default_tagged_csv = repo_root / "notebooks" / "data" / "message_nodes_tagged.csv"
    default_topics_json = repo_root / "app" / "static" / "topics.json"

    parser = argparse.ArgumentParser(
        description="Merge a pre-tagged CSV into a dataset and sync visualization files."
    )
    parser.add_argument("--dataset", required=True,
                        help="Dataset slug under notebooks/data (e.g. tricoloredelsangueitalico).")
    parser.add_argument("--tagged-csv", type=Path, default=default_tagged_csv,
                        help="Path to the tagged CSV (default: notebooks/data/message_nodes_tagged.csv).")
    parser.add_argument("--data-root", type=Path, default=Path("notebooks/data"),
                        help="Root folder containing dataset directories.")
    parser.add_argument("--topics-json", type=Path, default=default_topics_json,
                        help="Canonical topics file.")
    parser.add_argument("--no-update-graph", action="store_true",
                        help="Skip graph.json update.")
    parser.add_argument("--sync-app-static", action="store_true",
                        help="Copy outputs to app/static/data/<dataset>.")
    parser.add_argument("--no-legacy-map", action="store_true",
                        help="Disable mapping from legacy benchmark labels to current canonical labels.")
    parser.add_argument("--keep-unknown-topics", action="store_true",
                        help="Keep unrecognized topic labels instead of dropping them.")
    parser.add_argument("--allow-empty-topics", action="store_true",
                        help="Allow overriding existing topics with empty lists.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview changes without writing files.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    dataset_slug = normalize_slug(args.dataset)
    dataset_dir = Path(args.data_root) / dataset_slug
    message_nodes_path = dataset_dir / "message_nodes.csv"
    graph_path = dataset_dir / "graph.json"
    tagged_csv_path = _find_default_tagged_csv(repo_root, Path(args.tagged_csv))
    topics_json_path = Path(args.topics_json)

    if not tagged_csv_path.exists():
        candidates = sorted((repo_root / "notebooks" / "data").glob("message_nodes_tagged*.csv"))
        hint = (
            " Available: " + ", ".join(str(p.relative_to(repo_root)) for p in candidates)
            if candidates else " No message_nodes_tagged*.csv found in notebooks/data."
        )
        raise FileNotFoundError(f"Tagged CSV not found: {tagged_csv_path}.{hint}")
    if not message_nodes_path.exists():
        raise FileNotFoundError(f"Dataset CSV not found: {message_nodes_path}")

    topic_lookup = load_topic_lookup(topics_json_path)
    _, tagged_rows = read_csv_rows(tagged_csv_path)
    tag_map = build_tag_map(
        tagged_rows=tagged_rows,
        dataset_slug=dataset_slug,
        topic_lookup=topic_lookup,
        use_legacy_map=not args.no_legacy_map,
        keep_unknown=args.keep_unknown_topics,
        allow_empty_topics=args.allow_empty_topics,
    )

    print(
        f"[merge_tags] dataset={dataset_slug} tagged_rows={len(tagged_rows)} "
        f"matched_ids={len(tag_map)} legacy_map={'off' if args.no_legacy_map else 'on'}"
    )
    if not tag_map:
        print("[merge_tags] No matching tagged rows found; nothing to do.")
        return 0

    matched_csv, updated_csv = merge_message_nodes(
        message_nodes_path, tag_map, args.allow_empty_topics, args.dry_run
    )
    print(f"[merge_tags] message_nodes.csv matched={matched_csv} updated={updated_csv} dry_run={args.dry_run}")

    if not args.no_update_graph:
        matched_graph, updated_graph = merge_graph_json(
            graph_path, tag_map, args.allow_empty_topics, args.dry_run
        )
        print(f"[merge_tags] graph.json matched={matched_graph} updated={updated_graph} dry_run={args.dry_run}")

    if args.sync_app_static:
        if not args.dry_run:
            sync_to_app_static(repo_root=repo_root, dataset_slug=dataset_slug)
        print(f"[merge_tags] synced_to_app_static={'yes' if not args.dry_run else 'dry-run'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
