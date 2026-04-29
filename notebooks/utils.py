#!/usr/bin/env python3
"""Shared utilities for the data pipeline (tagging and merging)."""

from __future__ import annotations

import ast
import csv
import json
import math
import shutil
from pathlib import Path
from typing import Any

DEFAULT_PRIMARY_TOPIC = "Unlabeled"


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_listish(value: Any) -> list[str]:
    """Parse a value that might be a list, JSON string, or literal string."""
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
        return [normalize_text(item) for item in parsed if normalize_text(item)]

    if isinstance(parsed, str):
        return [parsed] if parsed else []

    return [raw]


def parse_locations(value: Any) -> list[dict[str, Any]]:
    """Parse a value that might be a list of location dicts or a JSON string."""
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


# ---------------------------------------------------------------------------
# File I/O
# ---------------------------------------------------------------------------


def atomic_write_text(path: Path, text: str) -> None:
    """Write text to a file atomically via a .tmp swap."""
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
    """Write rows to CSV atomically."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def sync_to_app_static(repo_root: Path, dataset_slug: str) -> None:
    """Copy message_nodes.csv and graph.json to app/static/data/<dataset>."""
    source_dir = repo_root / "notebooks" / "data" / dataset_slug
    target_dir = repo_root / "app" / "static" / "data" / dataset_slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ("message_nodes.csv", "graph.json"):
        source = source_dir / filename
        if source.exists():
            shutil.copy2(source, target_dir / filename)
