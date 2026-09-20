#!/usr/bin/env python3

from __future__ import annotations

import ast
import csv
import json
import shutil
from pathlib import Path
from typing import Any

DEFAULT_PRIMARY_TOPIC = "Unlabeled"


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_id(value: Any) -> str:
    return normalize_text(value).lower()


def normalize_slug(value: Any) -> str:
    return normalize_text(value).lower()


def dedupe_keep_order(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        item_clean = normalize_text(item)
        if not item_clean:
            continue
        key = item_clean.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item_clean)
    return out


def parse_listish(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [normalize_text(item) for item in value if normalize_text(item)]

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
        return [normalize_text(item) for item in parsed if normalize_text(item)]

    if isinstance(parsed, str):
        return [parsed] if parsed else []

    return [raw]


def parse_locations(value: Any) -> list[dict[str, Any]]:
    if value is None:
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


def should_tag_row(row: dict[str, str], mode: str, min_text_length: int) -> bool:
    text = normalize_text(row.get("text"))
    if not text or len(text) < min_text_length:
        return False

    current_topics = parse_listish(row.get("topics"))
    has_topics = bool(current_topics)
    has_error = bool(normalize_text(row.get("tagging_error")))
    has_attempt = bool(
        normalize_text(row.get("tagged_at")) or normalize_text(row.get("tagging_model"))
    )

    if mode == "all":
        return True
    if mode == "errors":
        return has_error or (not has_topics and not has_attempt)
    return not has_topics and not has_attempt


def ensure_tag_columns(fieldnames: list[str]) -> list[str]:
    out = list(fieldnames)
    for col in ("topics", "primaryTopic", "topics_ollama_raw", "locations_ranked",
                "tagging_error", "tagged_at", "tagging_model"):
        if col not in out:
            out.append(col)
    return out


def update_graph_json(
    graph_path: Path,
    by_id: dict[str, dict[str, Any]],
    changed_ids: set[str],
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
        if not msg_id or msg_id not in changed_ids:
            continue
        row = by_id.get(msg_id)
        if row is None:
            continue
        matched += 1

        before = (msg.get("topics"), msg.get("primaryTopic"), msg.get("topics_ollama_raw"),
                  msg.get("locations_ranked"), msg.get("tagging_error"))
        msg["topics"] = parse_listish(row.get("topics"))
        msg["primaryTopic"] = normalize_text(row.get("primaryTopic")) or DEFAULT_PRIMARY_TOPIC
        msg["topics_ollama_raw"] = parse_listish(row.get("topics_ollama_raw"))
        msg["locations_ranked"] = parse_locations(row.get("locations_ranked"))
        msg["tagging_error"] = normalize_text(row.get("tagging_error"))
        after = (msg.get("topics"), msg.get("primaryTopic"), msg.get("topics_ollama_raw"),
                 msg.get("locations_ranked"), msg.get("tagging_error"))
        if after != before:
            updated += 1

    if updated:
        atomic_write_text(graph_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return matched, updated


def atomic_write_text(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]
    return fieldnames, rows


def write_csv_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def sync_to_app_static(repo_root: Path, dataset_slug: str) -> None:
    source_dir = repo_root / "notebooks" / "data" / dataset_slug
    target_dir = repo_root / "app" / "static" / "data" / dataset_slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ("message_nodes.csv", "graph.json"):
        source = source_dir / filename
        if source.exists():
            shutil.copy2(source, target_dir / filename)
