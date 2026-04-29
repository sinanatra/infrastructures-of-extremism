#!/usr/bin/env python3
"""Tag dataset messages with Ollama and resume incrementally.

Workflow:
1) Read notebooks/data/<dataset>/message_nodes.csv
2) Tag only rows that are not already tagged (default behavior)
3) Update message_nodes.csv (topics/primaryTopic + metadata columns)
4) Optionally update graph.json and sync files to app/static/data/<dataset>

Usage:
    python tag.py --dataset tricoloredelsangueitalico
    python tag.py --dataset jungenationalisten --mode errors --workers 5
    python tag.py --dataset afdjugendbw --mode all --sync-app-static
"""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class TagResult:
    topics: list[str]
    raw_topics: list[str]
    locations_ranked: list[dict[str, Any]]
    tagging_error: str


# ---------------------------------------------------------------------------
# Topic loading
# ---------------------------------------------------------------------------


def load_topic_labels(topics_json_path: Path) -> list[str]:
    payload = json.loads(topics_json_path.read_text(encoding="utf-8"))
    out: list[str] = []
    for item in payload.get("topics", []):
        if not isinstance(item, dict):
            continue
        label = normalize_text(item.get("label"))
        if label:
            out.append(label)
    return dedupe_keep_order(out)


# ---------------------------------------------------------------------------
# Row filtering
# ---------------------------------------------------------------------------


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
    # "missing" (default)
    return not has_topics and not has_attempt


# ---------------------------------------------------------------------------
# Ollama calling
# ---------------------------------------------------------------------------


def build_system_prompt(topic_labels: list[str]) -> str:
    topic_list = "\n".join(f"- {label}" for label in topic_labels)
    return (
        "You are a strict classifier for Telegram messages.\n"
        "Return the smallest set of prominent topics from this canonical list "
        "(or an empty list if none apply):\n"
        f"{topic_list}\n\n"
        "Also extract explicit and implicit location mentions as objects with:\n"
        '- "location": string\n'
        '- "count": integer >= 1\n\n'
        "You MUST call the tool. Do not answer with plain text."
    )


def call_ollama(
    *,
    text: str,
    model: str,
    topic_labels: list[str],
    max_retries: int,
) -> TagResult:
    try:
        from ollama import chat
    except Exception as exc:
        raise RuntimeError(
            "Missing dependency: ollama. Install with `pip install -r requirements.txt`."
        ) from exc

    tool_schema = {
        "type": "function",
        "function": {
            "name": "extract_topics_locations",
            "description": "Extract canonical topics and ranked locations from a message.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topics": {
                        "type": "array",
                        "items": {"type": "string", "enum": topic_labels},
                    },
                    "locations_ranked": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "location": {"type": "string"},
                                "count": {"type": "integer", "minimum": 1},
                            },
                            "required": ["location", "count"],
                        },
                    },
                },
                "required": ["topics", "locations_ranked"],
            },
        },
    }

    system_prompt = build_system_prompt(topic_labels)
    canonical_lookup = {label.lower(): label for label in topic_labels}
    last_error = ""

    for _ in range(max(1, max_retries + 1)):
        try:
            response = chat(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                tools=[tool_schema],
            )

            tool_calls = getattr(response.message, "tool_calls", None)
            if not tool_calls:
                raise ValueError("model did not call tool")

            args = tool_calls[0].function.arguments
            if isinstance(args, str):
                args = json.loads(args)
            if not isinstance(args, dict):
                raise ValueError("tool arguments are not a JSON object")

            raw_topics = dedupe_keep_order(parse_listish(args.get("topics")))
            canonical_topics = dedupe_keep_order(
                [canonical_lookup[t.lower()] for t in raw_topics if t.lower() in canonical_lookup]
            )

            locations = args.get("locations_ranked", [])
            if not isinstance(locations, list):
                locations = []
            normalized_locations = []
            for item in locations:
                if not isinstance(item, dict):
                    continue
                location = normalize_text(item.get("location"))
                try:
                    count = int(item.get("count"))
                except Exception:
                    continue
                if location and count >= 1:
                    normalized_locations.append({"location": location, "count": count})

            return TagResult(
                topics=canonical_topics,
                raw_topics=raw_topics,
                locations_ranked=normalized_locations,
                tagging_error="",
            )
        except Exception as exc:
            last_error = normalize_text(exc)
            continue

    return TagResult(
        topics=[],
        raw_topics=[],
        locations_ranked=[],
        tagging_error=last_error or "unknown_ollama_error",
    )


# ---------------------------------------------------------------------------
# Applying results
# ---------------------------------------------------------------------------


def apply_tag_result(
    row: dict[str, str],
    *,
    result: TagResult,
    model: str,
    tagged_at_iso: str,
) -> bool:
    """Update row in-place. Returns True if any field changed."""
    changed = False

    def _set(key: str, val: str) -> None:
        nonlocal changed
        if row.get(key, "") != val:
            row[key] = val
            changed = True

    _set("topics", json.dumps(result.topics, ensure_ascii=False))
    _set("primaryTopic", result.topics[0] if result.topics else DEFAULT_PRIMARY_TOPIC)
    _set("topics_ollama_raw", json.dumps(result.raw_topics, ensure_ascii=False))
    _set("locations_ranked", json.dumps(result.locations_ranked, ensure_ascii=False))
    _set("tagging_error", result.tagging_error)
    _set("tagged_at", tagged_at_iso)
    _set("tagging_model", model)
    return changed


def update_graph_json(
    graph_path: Path,
    by_id: dict[str, dict[str, Any]],
    changed_ids: set[str],
) -> tuple[int, int]:
    """Sync tagging fields from CSV rows back into graph.json for changed IDs."""
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


def ensure_tag_columns(fieldnames: list[str]) -> list[str]:
    out = list(fieldnames)
    for col in ("topics", "primaryTopic", "topics_ollama_raw", "locations_ranked",
                "tagging_error", "tagged_at", "tagging_model"):
        if col not in out:
            out.append(col)
    return out


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tag dataset messages with Ollama (incremental)."
    )
    parser.add_argument("--dataset", required=True,
                        help="Dataset slug under notebooks/data (e.g. tricoloredelsangueitalico).")
    parser.add_argument("--model", default="qwen3:4b",
                        help="Ollama model name (e.g. qwen3:4b, qwen3:8b).")
    parser.add_argument("--workers", type=int, default=3,
                        help="Parallel Ollama requests.")
    parser.add_argument("--max-inflight", type=int, default=0,
                        help="Max queued futures (0 = workers * 3).")
    parser.add_argument("--max-retries", type=int, default=1,
                        help="Retries per row when Ollama call fails.")
    parser.add_argument("--sleep-seconds", type=float, default=0.0,
                        help="Delay between requests (sequential mode only).")
    parser.add_argument("--data-root", type=Path, default=Path("notebooks/data"),
                        help="Root folder containing dataset directories.")
    parser.add_argument("--topics-json", type=Path, default=Path("app/static/topics.json"),
                        help="Canonical topics file used by the app.")
    parser.add_argument("--mode", choices=["missing", "errors", "all"], default="missing",
                        help='"missing" tags untagged rows, "errors" retries failures, "all" retags everything.')
    parser.add_argument("--limit", type=int, default=0,
                        help="Max rows to tag in this run (0 = no limit).")
    parser.add_argument("--min-text-length", type=int, default=20,
                        help="Skip texts shorter than this.")
    parser.add_argument("--checkpoint-every", type=int, default=50,
                        help="Write CSV checkpoint every N processed rows.")
    parser.add_argument("--no-update-graph", action="store_true",
                        help="Skip graph.json update.")
    parser.add_argument("--sync-app-static", action="store_true",
                        help="Copy outputs to app/static/data/<dataset>.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print counts without calling Ollama or writing files.")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


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

    topic_labels = load_topic_labels(topics_json_path)
    if not topic_labels:
        raise ValueError(f"No topic labels found in {topics_json_path}")

    fieldnames, rows = read_csv_rows(message_nodes_path)
    fieldnames = ensure_tag_columns(fieldnames)

    # Build ID index and pre-normalise existing topics
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

    workers = max(1, int(args.workers))
    print(
        f"[tag] dataset={dataset_slug} mode={args.mode} model={args.model} "
        f"workers={workers} rows_total={len(rows)} rows_to_tag={len(tag_jobs)}"
    )

    if args.dry_run:
        return 0

    processed = ok_count = error_count = 0
    checkpoint_every = max(1, int(args.checkpoint_every))
    now_iso = datetime.now(timezone.utc).isoformat()

    def _handle_result(idx: int, row_id: str, result: TagResult) -> None:
        nonlocal processed, ok_count, error_count
        row = rows[idx]
        if apply_tag_result(row, result=result, model=args.model, tagged_at_iso=now_iso):
            changed_ids.add(row_id)
            by_id[row_id] = row
        processed += 1
        if result.tagging_error:
            error_count += 1
        else:
            ok_count += 1
        if processed % checkpoint_every == 0:
            write_csv_rows(message_nodes_path, fieldnames, rows)
            print(f"[tag] checkpoint processed={processed}/{len(tag_jobs)} ok={ok_count} errors={error_count}")

    if workers == 1:
        for idx, row_id, text in tag_jobs:
            result = call_ollama(text=text, model=args.model, topic_labels=topic_labels,
                                 max_retries=max(0, int(args.max_retries)))
            _handle_result(idx, row_id, result)
            if args.sleep_seconds > 0:
                time.sleep(args.sleep_seconds)
    else:
        if args.sleep_seconds > 0:
            print("[tag] sleep_seconds is ignored in parallel mode.")

        max_inflight = int(args.max_inflight)
        if max_inflight <= 0:
            max_inflight = workers * 3
        max_inflight = max(workers, max_inflight)

        job_iter = iter(tag_jobs)
        with ThreadPoolExecutor(max_workers=workers) as executor:
            pending: dict[Any, tuple[int, str]] = {}

            def _schedule() -> bool:
                try:
                    idx, row_id, text = next(job_iter)
                except StopIteration:
                    return False
                future = executor.submit(
                    call_ollama, text=text, model=args.model,
                    topic_labels=topic_labels, max_retries=max(0, int(args.max_retries)),
                )
                pending[future] = (idx, row_id)
                return True

            for _ in range(min(max_inflight, len(tag_jobs))):
                if not _schedule():
                    break

            while pending:
                done, _ = wait(set(pending.keys()), return_when=FIRST_COMPLETED)
                for future in done:
                    idx, row_id = pending.pop(future)
                    _handle_result(idx, row_id, future.result())
                while len(pending) < max_inflight and _schedule():
                    pass

    if changed_ids:
        write_csv_rows(message_nodes_path, fieldnames, rows)

    graph_matched = graph_updated = 0
    if changed_ids and not args.no_update_graph:
        graph_matched, graph_updated = update_graph_json(graph_path, by_id, changed_ids)

    if changed_ids and args.sync_app_static:
        sync_to_app_static(repo_root=repo_root, dataset_slug=dataset_slug)

    print(
        f"[tag] done processed={processed} ok={ok_count} errors={error_count} "
        f"changed_rows={len(changed_ids)} graph_matched={graph_matched} graph_updated={graph_updated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
