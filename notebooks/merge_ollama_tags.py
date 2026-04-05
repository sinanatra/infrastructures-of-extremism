#!/usr/bin/env python3
"""Merge Ollama tagging output into a dataset used by the visualizations.

This script reads a tagged CSV (for example notebooks/data/message_nodes_tagged.csv)
and applies tags to:
  - notebooks/data/<dataset>/message_nodes.csv
  - notebooks/data/<dataset>/graph.json (optional)
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
import shutil
from pathlib import Path
from typing import Any

LEGACY_TOPIC_MAP = {
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

DEFAULT_PRIMARY_TOPIC = "Unlabeled"
EXTRA_COLUMNS = ["topics_ollama_raw", "locations_ranked", "tagging_error"]


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_id(value: Any) -> str:
    return normalize_text(value).lower()


def normalize_slug(value: Any) -> str:
    return normalize_text(value).lower()


def parse_listish(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [normalize_text(item) for item in value if normalize_text(item)]
    if isinstance(value, float) and math.isnan(value):
        return []

    raw = normalize_text(value)
    if not raw or raw.lower() in {"nan", "none", "null"}:
        return []

    parsed: Any | None = None
    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(raw)
            break
        except Exception:
            continue

    if isinstance(parsed, (list, tuple, set)):
        out: list[str] = []
        for item in parsed:
            item_text = normalize_text(item)
            if item_text:
                out.append(item_text)
        return out

    if isinstance(parsed, str):
        return [parsed.strip()] if parsed.strip() else []

    return [raw]


def parse_locations(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if isinstance(value, float) and math.isnan(value):
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]

    raw = normalize_text(value)
    if not raw or raw.lower() in {"nan", "none", "null"}:
        return []

    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(raw)
        except Exception:
            continue
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
        return []
    return []


def dedupe_keep_order(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        key = normalize_text(item).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(normalize_text(item))
    return out


def load_topic_lookup(topics_json_path: Path) -> dict[str, str]:
    if not topics_json_path.exists():
        return {}
    payload = json.loads(topics_json_path.read_text(encoding="utf-8"))
    topics = payload.get("topics", [])
    lookup: dict[str, str] = {}
    for item in topics:
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
    keep_unknown_topics: bool,
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
        elif keep_unknown_topics:
            out.append(original)
    return dedupe_keep_order(out)


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]
    return fieldnames, rows


def write_csv_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def build_tag_map(
    tagged_rows: list[dict[str, str]],
    dataset_slug: str,
    topic_lookup: dict[str, str],
    use_legacy_map: bool,
    keep_unknown_topics: bool,
    allow_empty_topics: bool,
) -> dict[str, dict[str, Any]]:
    tag_map: dict[str, dict[str, Any]] = {}

    for row in tagged_rows:
        row_id = normalize_id(row.get("id"))
        if not row_id:
            continue

        row_chat = normalize_slug(row.get("chat"))
        in_dataset = row_chat == dataset_slug or row_id.startswith(f"{dataset_slug}:")
        if not in_dataset:
            continue

        raw_topics = dedupe_keep_order(parse_listish(row.get("topics")))
        canonical_topics = canonicalize_topics(
            raw_topics=raw_topics,
            topic_lookup=topic_lookup,
            use_legacy_map=use_legacy_map,
            keep_unknown_topics=keep_unknown_topics,
        )
        locations_ranked = parse_locations(row.get("locations_ranked"))
        tagging_error = normalize_text(row.get("tagging_error"))

        has_signal = bool(canonical_topics or raw_topics or locations_ranked or tagging_error)
        if not has_signal:
            continue
        if not canonical_topics and not allow_empty_topics:
            continue

        candidate = {
            "topics": canonical_topics,
            "primaryTopic": canonical_topics[0] if canonical_topics else DEFAULT_PRIMARY_TOPIC,
            "topics_ollama_raw": raw_topics,
            "locations_ranked": locations_ranked,
            "tagging_error": tagging_error,
        }

        existing = tag_map.get(row_id)
        if existing is None:
            tag_map[row_id] = candidate
            continue

        existing_score = (
            len(existing["topics"]),
            len(existing["locations_ranked"]),
            0 if existing["tagging_error"] else 1,
        )
        candidate_score = (
            len(candidate["topics"]),
            len(candidate["locations_ranked"]),
            0 if candidate["tagging_error"] else 1,
        )
        if candidate_score >= existing_score:
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
    for column in ("topics", "primaryTopic", *EXTRA_COLUMNS):
        if column not in merged_fieldnames:
            merged_fieldnames.append(column)

    matched = 0
    updated = 0
    for row in rows:
        row_id = normalize_id(row.get("id"))
        if not row_id or row_id not in tag_map:
            continue
        matched += 1
        tag = tag_map[row_id]

        touched = False
        if tag["topics"] or allow_empty_topics:
            serialized_topics = json.dumps(tag["topics"], ensure_ascii=False)
            if row.get("topics", "") != serialized_topics:
                row["topics"] = serialized_topics
                touched = True

            primary = tag["primaryTopic"] or DEFAULT_PRIMARY_TOPIC
            if row.get("primaryTopic", "") != primary:
                row["primaryTopic"] = primary
                touched = True

        raw_topics_json = json.dumps(tag["topics_ollama_raw"], ensure_ascii=False)
        if row.get("topics_ollama_raw", "") != raw_topics_json:
            row["topics_ollama_raw"] = raw_topics_json
            touched = True

        locations_json = json.dumps(tag["locations_ranked"], ensure_ascii=False)
        if row.get("locations_ranked", "") != locations_json:
            row["locations_ranked"] = locations_json
            touched = True

        if row.get("tagging_error", "") != tag["tagging_error"]:
            row["tagging_error"] = tag["tagging_error"]
            touched = True

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

    matched = 0
    updated = 0
    for message in messages:
        if not isinstance(message, dict):
            continue
        message_id = normalize_id(message.get("id"))
        if not message_id or message_id not in tag_map:
            continue
        matched += 1
        tag = tag_map[message_id]
        touched = False

        if tag["topics"] or allow_empty_topics:
            if message.get("topics") != tag["topics"]:
                message["topics"] = tag["topics"]
                touched = True
            primary = tag["primaryTopic"] or DEFAULT_PRIMARY_TOPIC
            if message.get("primaryTopic") != primary:
                message["primaryTopic"] = primary
                touched = True

        if message.get("topics_ollama_raw") != tag["topics_ollama_raw"]:
            message["topics_ollama_raw"] = tag["topics_ollama_raw"]
            touched = True
        if message.get("locations_ranked") != tag["locations_ranked"]:
            message["locations_ranked"] = tag["locations_ranked"]
            touched = True
        if message.get("tagging_error", "") != tag["tagging_error"]:
            message["tagging_error"] = tag["tagging_error"]
            touched = True

        if touched:
            updated += 1

    if not dry_run and updated:
        graph_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return matched, updated


def sync_to_app_static(repo_root: Path, dataset_slug: str, dry_run: bool) -> None:
    source_dir = repo_root / "notebooks" / "data" / dataset_slug
    target_dir = repo_root / "app" / "static" / "data" / dataset_slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ("message_nodes.csv", "graph.json"):
        source = source_dir / filename
        target = target_dir / filename
        if source.exists() and not dry_run:
            shutil.copy2(source, target)


def build_parser(default_tagged_csv: Path, default_topics_json: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Merge Ollama tags into a dataset and keep visualization files aligned."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Dataset slug under notebooks/data (example: tricoloredelsangueitalico).",
    )
    parser.add_argument(
        "--tagged-csv",
        type=Path,
        default=default_tagged_csv,
        help=f"Tagged CSV path (default: {default_tagged_csv}).",
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        default=Path("notebooks/data"),
        help="Root folder containing dataset directories.",
    )
    parser.add_argument(
        "--topics-json",
        type=Path,
        default=default_topics_json,
        help=f"Canonical topics file (default: {default_topics_json}).",
    )
    parser.add_argument(
        "--no-update-graph",
        action="store_true",
        help="Skip graph.json update.",
    )
    parser.add_argument(
        "--sync-app-static",
        action="store_true",
        help="Copy updated message_nodes.csv and graph.json to app/static/data/<dataset>.",
    )
    parser.add_argument(
        "--no-legacy-map",
        action="store_true",
        help="Disable mapping from legacy benchmark topic labels to app canonical labels.",
    )
    parser.add_argument(
        "--keep-unknown-topics",
        action="store_true",
        help="Keep unknown topic labels instead of dropping them.",
    )
    parser.add_argument(
        "--allow-empty-topics",
        action="store_true",
        help="Allow overriding existing topics with empty lists from the tagged CSV.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change without writing files.",
    )
    return parser


def resolve_tagged_csv_path(repo_root: Path, requested_path: Path) -> Path:
    if requested_path.exists():
        return requested_path

    default_candidates = [
        repo_root / "notebooks" / "data" / "message_nodes_tagged.csv",
        repo_root / "notebooks" / "data" / "message_nodes_tagged_fast.csv",
    ]

    # If caller passed a relative path, also try it from repo root for convenience.
    if not requested_path.is_absolute():
        repo_relative = repo_root / requested_path
        if repo_relative.exists():
            return repo_relative

    for candidate in default_candidates:
        if candidate.exists():
            return candidate

    return requested_path


def list_tagged_candidates(repo_root: Path) -> list[Path]:
    data_dir = repo_root / "notebooks" / "data"
    if not data_dir.exists():
        return []
    return sorted(data_dir.glob("message_nodes_tagged*.csv"))


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    default_tagged_csv = repo_root / "notebooks" / "data" / "message_nodes_tagged.csv"
    default_topics_json = repo_root / "app" / "static" / "topics.json"
    parser = build_parser(default_tagged_csv, default_topics_json)
    args = parser.parse_args()

    dataset_slug = normalize_slug(args.dataset)
    dataset_dir = Path(args.data_root) / dataset_slug
    message_nodes_path = dataset_dir / "message_nodes.csv"
    graph_path = dataset_dir / "graph.json"
    tagged_csv_path = resolve_tagged_csv_path(repo_root, Path(args.tagged_csv))
    topics_json_path = Path(args.topics_json)

    if not tagged_csv_path.exists():
        candidates = list_tagged_candidates(repo_root)
        hint = (
            " Available tagged files: "
            + ", ".join(str(path.relative_to(repo_root)) for path in candidates)
            if candidates
            else " No message_nodes_tagged*.csv files found in notebooks/data."
        )
        raise FileNotFoundError(f"Tagged CSV not found: {tagged_csv_path}.{hint}")
    if not message_nodes_path.exists():
        raise FileNotFoundError(f"Dataset message_nodes.csv not found: {message_nodes_path}")

    topic_lookup = load_topic_lookup(topics_json_path)
    _, tagged_rows = read_csv_rows(tagged_csv_path)
    tag_map = build_tag_map(
        tagged_rows=tagged_rows,
        dataset_slug=dataset_slug,
        topic_lookup=topic_lookup,
        use_legacy_map=not args.no_legacy_map,
        keep_unknown_topics=args.keep_unknown_topics,
        allow_empty_topics=args.allow_empty_topics,
    )

    print(
        "[merge_ollama_tags] "
        f"dataset={dataset_slug} tagged_rows={len(tagged_rows)} matched_ids={len(tag_map)} "
        f"legacy_map={'off' if args.no_legacy_map else 'on'}"
    )
    if not tag_map:
        print("[merge_ollama_tags] No matching tagged rows found for dataset; nothing to do.")
        return 0

    matched_csv, updated_csv = merge_message_nodes(
        message_nodes_path=message_nodes_path,
        tag_map=tag_map,
        allow_empty_topics=args.allow_empty_topics,
        dry_run=args.dry_run,
    )
    print(
        f"[merge_ollama_tags] message_nodes.csv matched={matched_csv} updated={updated_csv} "
        f"dry_run={args.dry_run}"
    )

    if not args.no_update_graph:
        matched_graph, updated_graph = merge_graph_json(
            graph_path=graph_path,
            tag_map=tag_map,
            allow_empty_topics=args.allow_empty_topics,
            dry_run=args.dry_run,
        )
        print(
            f"[merge_ollama_tags] graph.json matched={matched_graph} updated={updated_graph} "
            f"dry_run={args.dry_run}"
        )

    if args.sync_app_static:
        sync_to_app_static(repo_root=repo_root, dataset_slug=dataset_slug, dry_run=args.dry_run)
        print(
            "[merge_ollama_tags] "
            f"synced_to_app_static={'yes' if not args.dry_run else 'dry-run'}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
