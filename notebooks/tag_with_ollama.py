#!/usr/bin/env python3
"""Incremental Ollama tagging for dataset message nodes.

Workflow:
1) Read notebooks/data/<dataset>/message_nodes.csv
2) Tag only rows that are not already tagged (default behavior)
3) Update message_nodes.csv (topics/primaryTopic + metadata columns)
4) Optionally update graph.json and sync files to app/static/data/<dataset>
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
import shutil
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PRIMARY_TOPIC = "Unlabeled"


@dataclass
class TagResult:
    topics: list[str]
    raw_topics: list[str]
    locations_ranked: list[dict[str, Any]]
    tagging_error: str


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


def load_topic_labels(topics_json_path: Path) -> list[str]:
    payload = json.loads(topics_json_path.read_text(encoding="utf-8"))
    raw_topics = payload.get("topics", [])
    out: list[str] = []
    for item in raw_topics:
        if not isinstance(item, dict):
            continue
        label = normalize_text(item.get("label"))
        if label:
            out.append(label)
    return dedupe_keep_order(out)


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


def build_prompt(topic_labels: list[str]) -> str:
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

    prompt = build_prompt(topic_labels)

    attempts = max(1, max_retries + 1)
    last_error = ""
    for _ in range(attempts):
        try:
            response = chat(
                model=model,
                messages=[
                    {"role": "system", "content": prompt},
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
            canonical_lookup = {label.lower(): label for label in topic_labels}
            canonical_topics = [
                canonical_lookup[item.lower()]
                for item in raw_topics
                if item.lower() in canonical_lookup
            ]
            canonical_topics = dedupe_keep_order(canonical_topics)

            locations = args.get("locations_ranked", [])
            if not isinstance(locations, list):
                locations = []
            normalized_locations = []
            for item in locations:
                if not isinstance(item, dict):
                    continue
                location = normalize_text(item.get("location"))
                count_raw = item.get("count")
                try:
                    count = int(count_raw)
                except Exception:
                    continue
                if not location or count < 1:
                    continue
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


def apply_tag_result_to_row(
    row: dict[str, str],
    *,
    result: TagResult,
    model: str,
    tagged_at_iso: str,
) -> bool:
    row_changed = False

    topics_json = json.dumps(result.topics, ensure_ascii=False)
    if row.get("topics", "") != topics_json:
        row["topics"] = topics_json
        row_changed = True

    primary = result.topics[0] if result.topics else DEFAULT_PRIMARY_TOPIC
    if row.get("primaryTopic", "") != primary:
        row["primaryTopic"] = primary
        row_changed = True

    raw_topics_json = json.dumps(result.raw_topics, ensure_ascii=False)
    if row.get("topics_ollama_raw", "") != raw_topics_json:
        row["topics_ollama_raw"] = raw_topics_json
        row_changed = True

    locations_json = json.dumps(result.locations_ranked, ensure_ascii=False)
    if row.get("locations_ranked", "") != locations_json:
        row["locations_ranked"] = locations_json
        row_changed = True

    if row.get("tagging_error", "") != result.tagging_error:
        row["tagging_error"] = result.tagging_error
        row_changed = True

    if row.get("tagged_at", "") != tagged_at_iso:
        row["tagged_at"] = tagged_at_iso
        row_changed = True
    if row.get("tagging_model", "") != model:
        row["tagging_model"] = model
        row_changed = True

    return row_changed


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tag dataset messages with Ollama and resume incrementally."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Dataset slug under notebooks/data (example: tricoloredelsangueitalico).",
    )
    parser.add_argument(
        "--model",
        default="qwen3:4b",
        help="Ollama model name (example: qwen3:4b, qwen3:8b).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="Parallel Ollama requests (benchmark-like behavior).",
    )
    parser.add_argument(
        "--max-inflight",
        type=int,
        default=0,
        help="Max queued futures (0 = workers * 3).",
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
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Optional delay between requests.",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=50,
        help="Write CSV checkpoint every N processed rows.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=1,
        help="Retries per row when Ollama call fails.",
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
        help="Print counts without calling Ollama or writing files.",
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

    topic_labels = load_topic_labels(topics_json_path)
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

    tag_jobs: list[tuple[int, str, str]] = []
    for idx in candidates:
        row = rows[idx]
        row_id = normalize_id(row.get("id"))
        text = normalize_text(row.get("text"))
        if not row_id or not text:
            continue
        tag_jobs.append((idx, row_id, text))

    workers = max(1, int(args.workers))

    print(
        "[tag_with_ollama] "
        f"dataset={dataset_slug} mode={args.mode} model={args.model} workers={workers} "
        f"rows_total={len(rows)} rows_to_tag={len(tag_jobs)}"
    )

    if args.dry_run:
        return 0

    processed = 0
    ok_count = 0
    error_count = 0
    checkpoint_every = max(1, int(args.checkpoint_every))
    now_iso = datetime.now(timezone.utc).isoformat()

    if workers == 1:
        for idx, row_id, text in tag_jobs:
            result = call_ollama(
                text=text,
                model=args.model,
                topic_labels=topic_labels,
                max_retries=max(0, int(args.max_retries)),
            )
            row = rows[idx]
            row_changed = apply_tag_result_to_row(
                row,
                result=result,
                model=args.model,
                tagged_at_iso=now_iso,
            )

            processed += 1
            if result.tagging_error:
                error_count += 1
            else:
                ok_count += 1

            if row_changed:
                changed_ids.add(row_id)
                by_id[row_id] = row

            if processed % checkpoint_every == 0:
                write_csv_rows(message_nodes_path, fieldnames, rows)
                print(
                    "[tag_with_ollama] "
                    f"checkpoint processed={processed}/{len(tag_jobs)} ok={ok_count} errors={error_count}"
                )

            if args.sleep_seconds > 0:
                time.sleep(args.sleep_seconds)
    else:
        if args.sleep_seconds > 0:
            print(
                "[tag_with_ollama] "
                "sleep_seconds is ignored when workers > 1 (parallel mode)."
            )

        max_inflight = int(args.max_inflight)
        if max_inflight <= 0:
            max_inflight = workers * 3
        max_inflight = max(workers, max_inflight)

        job_iter = iter(tag_jobs)

        with ThreadPoolExecutor(max_workers=workers) as executor:
            pending: dict[Any, tuple[int, str]] = {}

            def schedule_one() -> bool:
                try:
                    idx, row_id, text = next(job_iter)
                except StopIteration:
                    return False
                future = executor.submit(
                    call_ollama,
                    text=text,
                    model=args.model,
                    topic_labels=topic_labels,
                    max_retries=max(0, int(args.max_retries)),
                )
                pending[future] = (idx, row_id)
                return True

            for _ in range(min(max_inflight, len(tag_jobs))):
                if not schedule_one():
                    break

            while pending:
                done, _ = wait(set(pending.keys()), return_when=FIRST_COMPLETED)
                for future in done:
                    idx, row_id = pending.pop(future)
                    result = future.result()
                    row = rows[idx]
                    row_changed = apply_tag_result_to_row(
                        row,
                        result=result,
                        model=args.model,
                        tagged_at_iso=now_iso,
                    )

                    processed += 1
                    if result.tagging_error:
                        error_count += 1
                    else:
                        ok_count += 1

                    if row_changed:
                        changed_ids.add(row_id)
                        by_id[row_id] = row

                    if processed % checkpoint_every == 0:
                        write_csv_rows(message_nodes_path, fieldnames, rows)
                        print(
                            "[tag_with_ollama] "
                            f"checkpoint processed={processed}/{len(tag_jobs)} ok={ok_count} errors={error_count}"
                        )

                while len(pending) < max_inflight and schedule_one():
                    pass

    if changed_ids:
        write_csv_rows(message_nodes_path, fieldnames, rows)

    graph_matched = 0
    graph_updated = 0
    if changed_ids and not args.no_update_graph:
        graph_matched, graph_updated = update_graph_json(graph_path, by_id, changed_ids)

    if changed_ids and args.sync_app_static:
        sync_to_app_static(repo_root=repo_root, dataset_slug=dataset_slug)

    print(
        "[tag_with_ollama] "
        f"done processed={processed} ok={ok_count} errors={error_count} "
        f"changed_rows={len(changed_ids)} graph_matched={graph_matched} graph_updated={graph_updated}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
