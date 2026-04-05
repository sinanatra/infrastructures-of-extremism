#!/usr/bin/env python3
"""Fast multilingual topic tagging with sentence-transformers.

This script is an Ollama-free alternative for full-dataset tagging.
It updates:
  - notebooks/data/<dataset>/message_nodes.csv
  - notebooks/data/<dataset>/graph.json (optional)

Default mode is incremental: tag only rows missing topics.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

DEFAULT_PRIMARY_TOPIC = "Unlabeled"


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_id(value: Any) -> str:
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
        return [parsed] if parsed else []

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
        item_clean = normalize_text(item)
        if not item_clean:
            continue
        key = item_clean.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item_clean)
    return out


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


def ensure_columns(fieldnames: list[str]) -> list[str]:
    out = list(fieldnames)
    needed = [
        "topics",
        "primaryTopic",
        "topics_ollama_raw",
        "locations_ranked",
        "tagging_error",
        "tagged_at",
        "tagging_model",
    ]
    for column in needed:
        if column not in out:
            out.append(column)
    return out


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


def resolve_device(device_arg: str) -> str:
    if device_arg != "auto":
        return device_arg
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def load_topics(topics_json_path: Path) -> tuple[list[str], list[str]]:
    payload = json.loads(topics_json_path.read_text(encoding="utf-8"))
    raw_topics = payload.get("topics", [])
    labels: list[str] = []
    prompts: list[str] = []
    for item in raw_topics:
        if not isinstance(item, dict):
            continue
        label = normalize_text(item.get("label"))
        if not label:
            continue
        description = normalize_text(item.get("description"))
        keywords = item.get("keywords", [])
        if not isinstance(keywords, list):
            keywords = []
        keywords_text = ", ".join(
            normalize_text(keyword) for keyword in keywords if normalize_text(keyword)
        )
        prompt_parts = [label]
        if description:
            prompt_parts.append(description)
        if keywords_text:
            prompt_parts.append(f"keywords: {keywords_text}")
        labels.append(label)
        prompts.append(". ".join(prompt_parts))
    return labels, prompts


def assign_topics_from_scores(
    scores: np.ndarray,
    labels: list[str],
    threshold: float,
    fallback_threshold: float,
    max_topics: int,
) -> list[str]:
    if scores.size == 0 or not labels:
        return []
    order = np.argsort(-scores)
    selected: list[str] = []
    for idx in order:
        score = float(scores[idx])
        if score < threshold:
            break
        selected.append(labels[int(idx)])
        if len(selected) >= max_topics:
            break

    if selected:
        return dedupe_keep_order(selected)

    best_idx = int(order[0])
    best_score = float(scores[best_idx])
    if best_score >= fallback_threshold:
        return [labels[best_idx]]
    return []


def apply_result_to_row(
    row: dict[str, str],
    *,
    topics: list[str],
    top_scores: list[dict[str, Any]],
    model_name: str,
    tagged_at_iso: str,
) -> bool:
    changed = False

    topics_json = json.dumps(topics, ensure_ascii=False)
    if row.get("topics", "") != topics_json:
        row["topics"] = topics_json
        changed = True

    primary = topics[0] if topics else DEFAULT_PRIMARY_TOPIC
    if row.get("primaryTopic", "") != primary:
        row["primaryTopic"] = primary
        changed = True

    # Keep compatibility with existing downstream columns.
    raw_topics_json = json.dumps([entry["label"] for entry in top_scores], ensure_ascii=False)
    if row.get("topics_ollama_raw", "") != raw_topics_json:
        row["topics_ollama_raw"] = raw_topics_json
        changed = True

    locations_json = "[]"
    if row.get("locations_ranked", "") != locations_json:
        row["locations_ranked"] = locations_json
        changed = True

    if row.get("tagging_error", "") != "":
        row["tagging_error"] = ""
        changed = True

    if row.get("tagged_at", "") != tagged_at_iso:
        row["tagged_at"] = tagged_at_iso
        changed = True
    if row.get("tagging_model", "") != model_name:
        row["tagging_model"] = model_name
        changed = True

    return changed


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

    matched = 0
    updated = 0
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

        topics = parse_listish(row.get("topics"))
        primary = normalize_text(row.get("primaryTopic")) or DEFAULT_PRIMARY_TOPIC
        raw_topics = parse_listish(row.get("topics_ollama_raw"))
        locations = parse_locations(row.get("locations_ranked"))
        tagging_error = normalize_text(row.get("tagging_error"))

        before = (
            msg.get("topics"),
            msg.get("primaryTopic"),
            msg.get("topics_ollama_raw"),
            msg.get("locations_ranked"),
            msg.get("tagging_error"),
        )
        msg["topics"] = topics
        msg["primaryTopic"] = primary
        msg["topics_ollama_raw"] = raw_topics
        msg["locations_ranked"] = locations
        msg["tagging_error"] = tagging_error
        after = (
            msg.get("topics"),
            msg.get("primaryTopic"),
            msg.get("topics_ollama_raw"),
            msg.get("locations_ranked"),
            msg.get("tagging_error"),
        )
        if after != before:
            updated += 1

    if updated:
        atomic_write_text(
            graph_path,
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        )
    return matched, updated


def sync_to_app_static(repo_root: Path, dataset_slug: str) -> None:
    source_dir = repo_root / "notebooks" / "data" / dataset_slug
    target_dir = repo_root / "app" / "static" / "data" / dataset_slug
    target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ("message_nodes.csv", "graph.json"):
        source = source_dir / filename
        target = target_dir / filename
        if source.exists():
            shutil.copy2(source, target)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fast multilingual topic tagging with sentence-transformers."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Dataset slug under notebooks/data (example: tricoloredelsangueitalico).",
    )
    parser.add_argument(
        "--model",
        default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        help="Sentence-transformers model name.",
    )
    parser.add_argument(
        "--device",
        choices=["auto", "cpu", "cuda", "mps"],
        default="auto",
        help="Inference device.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Embedding batch size.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.34,
        help="Cosine threshold for selecting topics.",
    )
    parser.add_argument(
        "--fallback-threshold",
        type=float,
        default=0.28,
        help="Assign top-1 topic when above this threshold and none pass main threshold.",
    )
    parser.add_argument(
        "--max-topics",
        type=int,
        default=4,
        help="Maximum topics per message.",
    )
    parser.add_argument(
        "--mode",
        choices=["missing", "errors", "all"],
        default="missing",
        help='Tagging mode: "missing" tags only untagged rows, "errors" retries failures too, "all" retags everything.',
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max number of rows to tag in this run (0 means no limit).",
    )
    parser.add_argument(
        "--min-text-length",
        type=int,
        default=20,
        help="Skip very short texts below this length.",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=500,
        help="Write CSV checkpoint every N processed rows.",
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
        default=Path("app/static/topics.json"),
        help="Canonical topics file used by the app.",
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
        "--dry-run",
        action="store_true",
        help="Print counts without running model or writing files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dataset_slug = normalize_text(args.dataset).lower()
    repo_root = Path(__file__).resolve().parents[1]
    data_root = Path(args.data_root)

    topics_json_path = Path(args.topics_json)
    if not topics_json_path.is_absolute():
        topics_json_path = repo_root / topics_json_path

    dataset_dir = data_root / dataset_slug
    message_nodes_path = dataset_dir / "message_nodes.csv"
    graph_path = dataset_dir / "graph.json"

    if not message_nodes_path.exists():
        raise FileNotFoundError(f"Missing dataset CSV: {message_nodes_path}")
    if not topics_json_path.exists():
        raise FileNotFoundError(f"Missing topics file: {topics_json_path}")

    topic_labels, topic_prompts = load_topics(topics_json_path)
    if not topic_labels:
        raise ValueError(f"No topic labels found in {topics_json_path}")

    fieldnames, rows = read_csv_rows(message_nodes_path)
    fieldnames = ensure_columns(fieldnames)

    candidates: list[int] = []
    by_id: dict[str, dict[str, Any]] = {}
    changed_ids: set[str] = set()

    for idx, row in enumerate(rows):
        row_id = normalize_id(row.get("id"))
        if not row_id:
            continue
        by_id[row_id] = row

        existing_topics = dedupe_keep_order(parse_listish(row.get("topics")))
        if existing_topics:
            primary = normalize_text(row.get("primaryTopic"))
            if not primary:
                row["primaryTopic"] = existing_topics[0]
                changed_ids.add(row_id)
            row["topics"] = json.dumps(existing_topics, ensure_ascii=False)

        if should_tag_row(row, args.mode, args.min_text_length):
            candidates.append(idx)

    if args.limit and args.limit > 0:
        candidates = candidates[: args.limit]

    print(
        "[tag_with_transformers] "
        f"dataset={dataset_slug} mode={args.mode} model={args.model} "
        f"rows_total={len(rows)} rows_to_tag={len(candidates)}"
    )

    if args.dry_run:
        return 0

    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:
        raise RuntimeError(
            "Missing dependency: sentence-transformers. "
            "Install with `python3 -m pip install -r requirements.txt`."
        ) from exc

    device = resolve_device(args.device)
    print(f"[tag_with_transformers] loading model on device={device}")
    model = SentenceTransformer(args.model, device=device)

    topic_matrix = model.encode(
        topic_prompts,
        batch_size=max(1, min(64, int(args.batch_size))),
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    tag_jobs: list[tuple[int, str, str]] = []
    for idx in candidates:
        row = rows[idx]
        row_id = normalize_id(row.get("id"))
        text = normalize_text(row.get("text"))
        if not row_id or not text:
            continue
        tag_jobs.append((idx, row_id, text))

    processed = 0
    ok_count = 0
    checkpoint_every = max(1, int(args.checkpoint_every))
    now_iso = datetime.now(timezone.utc).isoformat()
    batch_size = max(1, int(args.batch_size))
    max_topics = max(1, int(args.max_topics))

    for start in range(0, len(tag_jobs), batch_size):
        chunk = tag_jobs[start : start + batch_size]
        texts = [text for _, _, text in chunk]
        text_matrix = model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        scores_matrix = np.matmul(text_matrix, topic_matrix.T)

        for i, (idx, row_id, _text) in enumerate(chunk):
            row = rows[idx]
            scores = scores_matrix[i]
            order = np.argsort(-scores)
            top_scores = [
                {"label": topic_labels[int(j)], "score": float(scores[int(j)])}
                for j in order[: min(6, len(topic_labels))]
            ]
            topics = assign_topics_from_scores(
                scores=scores,
                labels=topic_labels,
                threshold=float(args.threshold),
                fallback_threshold=float(args.fallback_threshold),
                max_topics=max_topics,
            )
            row_changed = apply_result_to_row(
                row,
                topics=topics,
                top_scores=top_scores,
                model_name=args.model,
                tagged_at_iso=now_iso,
            )

            processed += 1
            ok_count += 1
            if row_changed:
                changed_ids.add(row_id)
                by_id[row_id] = row

            if processed % checkpoint_every == 0:
                write_csv_rows(message_nodes_path, fieldnames, rows)
                print(
                    "[tag_with_transformers] "
                    f"checkpoint processed={processed}/{len(tag_jobs)}"
                )

    if changed_ids:
        write_csv_rows(message_nodes_path, fieldnames, rows)

    graph_matched = 0
    graph_updated = 0
    if changed_ids and not args.no_update_graph:
        graph_matched, graph_updated = update_graph_json(graph_path, by_id, changed_ids)

    if changed_ids and args.sync_app_static:
        sync_to_app_static(repo_root=repo_root, dataset_slug=dataset_slug)

    print(
        "[tag_with_transformers] "
        f"done processed={processed} ok={ok_count} changed_rows={len(changed_ids)} "
        f"graph_matched={graph_matched} graph_updated={graph_updated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
