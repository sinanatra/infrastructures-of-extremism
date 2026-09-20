#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sentence_transformers import SentenceTransformer, util

from utils import (
    DEFAULT_PRIMARY_TOPIC,
    atomic_write_text,
    dedupe_keep_order,
    normalize_id,
    normalize_text,
    parse_listish,
    parse_locations,
    read_csv_rows,
    sync_to_app_static,
    write_csv_rows,
)

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
TOPIC_THRESHOLD = 0.10
FALLBACK_MIN = 0.08
MAX_TOPICS = 4
BATCH_SIZE = 128
KEYWORD_BOOST = 0.25
TOPIC_DEDUP_SIM = 0.75

URL_PATTERN = re.compile(r"https?://\S+")
RT_PATTERN = re.compile(r"^rt\s+@\w+:\s*", re.IGNORECASE)
CONTROL_PATTERN = re.compile(r"[--]")
MULTISPACE_PATTERN = re.compile(r"\s+")


def clean_text(text: str) -> str:
    text = URL_PATTERN.sub(" ", text)
    text = RT_PATTERN.sub("", text)
    text = CONTROL_PATTERN.sub(" ", text)
    return MULTISPACE_PATTERN.sub(" ", text).strip()


def choose_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_topic_specs(topics_json_path: Path) -> tuple[list[str], list[str], dict[str, set[str]]]:
    payload = json.loads(topics_json_path.read_text(encoding="utf-8"))
    labels, label_texts, keywords = [], [], {}
    for item in payload.get("topics", []):
        if not isinstance(item, dict):
            continue
        label = normalize_text(item.get("label"))
        desc = normalize_text(item.get("description", ""))
        kws = {normalize_text(k) for k in item.get("keywords", []) if k}
        if label:
            labels.append(label)
            label_texts.append(f"{label} — {desc}" if desc else label)
            keywords[label] = kws
    return labels, label_texts, keywords


def predict_topics_batch(
    texts: list[str],
    model: SentenceTransformer,
    topic_embeddings: Any,
    topic_labels: list[str],
    topic_keywords: dict[str, set[str]],
) -> list[list[str]]:
    cleaned = [clean_text(t) for t in texts]
    embeddings = model.encode(
        cleaned,
        convert_to_tensor=True,
        normalize_embeddings=True,
        batch_size=BATCH_SIZE,
        show_progress_bar=False,
    )
    scores = util.dot_score(embeddings, topic_embeddings).cpu().numpy()
    results = []
    for text_idx, row in enumerate(scores):
        order = np.argsort(-row)
        best_score = float(row[order[0]]) if len(order) else -1
        candidates = [(i, float(row[i])) for i in order if float(row[i]) >= TOPIC_THRESHOLD]
        original = texts[text_idx].lower()
        boosted = []
        for topic_idx, score in candidates:
            label = topic_labels[topic_idx]
            kws = topic_keywords.get(label, set())
            if any(k in original for k in kws if k):
                score = min(1.0, score + KEYWORD_BOOST)
            boosted.append((topic_idx, score))
        boosted.sort(key=lambda x: -x[1])
        if not boosted and best_score >= FALLBACK_MIN and len(order):
            boosted = [(int(order[0]), best_score)]
        selected: list[str] = []
        for topic_idx, _ in boosted:
            label = topic_labels[topic_idx]
            is_redundant = False
            for existing in selected:
                ei = topic_labels.index(existing)
                sim = float(util.dot_score(
                    topic_embeddings[topic_idx : topic_idx + 1],
                    topic_embeddings[ei : ei + 1],
                ))
                if sim > TOPIC_DEDUP_SIM:
                    is_redundant = True
                    break
            if not is_redundant:
                selected.append(label)
            if len(selected) >= MAX_TOPICS:
                break
        results.append(selected)
    return results


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
        before = (msg.get("topics"), msg.get("primaryTopic"))
        msg["topics"] = parse_listish(row.get("topics"))
        msg["primaryTopic"] = normalize_text(row.get("primaryTopic")) or DEFAULT_PRIMARY_TOPIC
        msg["topics_ollama_raw"] = parse_listish(row.get("topics_ollama_raw"))
        msg["locations_ranked"] = parse_locations(row.get("locations_ranked"))
        msg["tagging_error"] = normalize_text(row.get("tagging_error"))
        if (msg.get("topics"), msg.get("primaryTopic")) != before:
            updated += 1
    if updated:
        atomic_write_text(graph_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    return matched, updated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tag dataset messages with sentence-transformers (incremental)."
    )
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--model", default=MODEL_NAME, help="sentence-transformers model name.")
    parser.add_argument("--mode", choices=["missing", "errors", "all"], default="missing")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--min-text-length", type=int, default=20)
    parser.add_argument("--checkpoint-every", type=int, default=500)
    parser.add_argument("--data-root", type=Path, default=Path("notebooks/data"))
    parser.add_argument("--topics-json", type=Path, default=Path("app/static/topics.json"))
    parser.add_argument("--no-update-graph", action="store_true")
    parser.add_argument("--sync-app-static", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
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

    topic_labels, topic_label_texts, topic_keywords = load_topic_specs(topics_json_path)
    if not topic_labels:
        raise ValueError(f"No topic labels found in {topics_json_path}")

    fieldnames, rows = read_csv_rows(message_nodes_path)
    fieldnames = ensure_tag_columns(fieldnames)

    by_id: dict[str, dict[str, Any]] = {}
    changed_ids: set[str] = set()
    candidates: list[int] = []

    for idx, row in enumerate(rows):
        row_id = normalize_id(row.get("id"))
        if not row_id:
            continue
        by_id[row_id] = row
        existing_topics = dedupe_keep_order(parse_listish(row.get("topics")))
        if existing_topics:
            row["topics"] = json.dumps(existing_topics, ensure_ascii=False)
            if not normalize_text(row.get("primaryTopic")):
                row["primaryTopic"] = existing_topics[0]
                changed_ids.add(row_id)
        if should_tag_row(row, args.mode, args.min_text_length):
            candidates.append(idx)

    if args.limit and args.limit > 0:
        candidates = candidates[: args.limit]

    tag_jobs: list[tuple[int, str, str]] = []
    for idx in candidates:
        row = rows[idx]
        row_id = normalize_id(row.get("id"))
        text = normalize_text(row.get("text"))
        if row_id and text:
            tag_jobs.append((idx, row_id, text))

    print(
        f"[tag] dataset={dataset_slug} mode={args.mode} model={args.model} "
        f"rows_total={len(rows)} rows_to_tag={len(tag_jobs)}"
    )

    if args.dry_run or not tag_jobs:
        return 0

    device = choose_device()
    print(f"[tag] loading model on {device}...")
    model = SentenceTransformer(args.model, device=device)
    topic_embeddings = model.encode(
        topic_label_texts,
        convert_to_tensor=True,
        normalize_embeddings=True,
    )
    print(f"[tag] model ready, processing {len(tag_jobs)} messages in batches of {BATCH_SIZE}...")

    now_iso = datetime.now(timezone.utc).isoformat()
    checkpoint_every = max(1, int(args.checkpoint_every))
    processed = 0

    for batch_start in range(0, len(tag_jobs), BATCH_SIZE):
        batch = tag_jobs[batch_start : batch_start + BATCH_SIZE]
        texts = [text for _, _, text in batch]
        topic_results = predict_topics_batch(
            texts, model, topic_embeddings, topic_labels, topic_keywords
        )
        for (idx, row_id, _), topics in zip(batch, topic_results):
            row = rows[idx]
            primary = topics[0] if topics else DEFAULT_PRIMARY_TOPIC
            row["topics"] = json.dumps(topics, ensure_ascii=False)
            row["primaryTopic"] = primary
            row["topics_ollama_raw"] = json.dumps(topics, ensure_ascii=False)
            row["locations_ranked"] = "[]"
            row["tagging_error"] = ""
            row["tagged_at"] = now_iso
            row["tagging_model"] = args.model
            by_id[row_id] = row
            changed_ids.add(row_id)
            processed += 1

        if processed % checkpoint_every < BATCH_SIZE:
            write_csv_rows(message_nodes_path, fieldnames, rows)
            print(f"[tag] checkpoint processed={processed}/{len(tag_jobs)}")

    if changed_ids:
        write_csv_rows(message_nodes_path, fieldnames, rows)

    graph_matched = graph_updated = 0
    if changed_ids and not args.no_update_graph:
        graph_matched, graph_updated = update_graph_json(graph_path, by_id, changed_ids)

    if changed_ids and args.sync_app_static:
        sync_to_app_static(repo_root=repo_root, dataset_slug=dataset_slug)

    print(
        f"[tag] done processed={processed} changed_rows={len(changed_ids)} "
        f"graph_matched={graph_matched} graph_updated={graph_updated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
