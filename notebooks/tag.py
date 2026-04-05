from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
from pathlib import Path


def has_module(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def choose_engine(requested: str, *, require_backend: bool) -> str:
    if requested in {"transformers", "ollama"}:
        return requested

    # auto mode: prefer transformers for speed; fallback to ollama
    if has_module("sentence_transformers"):
        return "transformers"
    if has_module("ollama"):
        return "ollama"

    if not require_backend:
        # For dry-run we can still delegate to transformers script because it
        # doesn't import sentence-transformers until actual inference.
        return "transformers"

    raise RuntimeError(
        "No tagging backend available. Install dependencies with "
        "`python3 -m pip install -r requirements.txt`."
    )


def append_common_args(cmd: list[str], args: argparse.Namespace) -> None:
    cmd.extend(["--dataset", args.dataset])
    cmd.extend(["--mode", args.mode])
    cmd.extend(["--min-text-length", str(args.min_text_length)])
    cmd.extend(["--checkpoint-every", str(args.checkpoint_every)])

    if args.limit > 0:
        cmd.extend(["--limit", str(args.limit)])
    if args.no_update_graph:
        cmd.append("--no-update-graph")
    if args.sync_app_static:
        cmd.append("--sync-app-static")
    if args.dry_run:
        cmd.append("--dry-run")


def build_ollama_cmd(root: Path, args: argparse.Namespace) -> list[str]:
    script = root / "tag_with_ollama.py"
    cmd = [sys.executable, str(script)]
    append_common_args(cmd, args)

    if args.model:
        cmd.extend(["--model", args.model])
    cmd.extend(["--workers", str(args.workers)])
    if args.max_inflight > 0:
        cmd.extend(["--max-inflight", str(args.max_inflight)])
    if args.max_retries >= 0:
        cmd.extend(["--max-retries", str(args.max_retries)])
    if args.sleep_seconds > 0:
        cmd.extend(["--sleep-seconds", str(args.sleep_seconds)])
    return cmd


def build_transformers_cmd(root: Path, args: argparse.Namespace) -> list[str]:
    script = root / "tag_with_transformers.py"
    cmd = [sys.executable, str(script)]
    append_common_args(cmd, args)

    if args.model:
        cmd.extend(["--model", args.model])
    cmd.extend(["--batch-size", str(args.batch_size)])
    cmd.extend(["--threshold", str(args.threshold)])
    cmd.extend(["--fallback-threshold", str(args.fallback_threshold)])
    cmd.extend(["--max-topics", str(args.max_topics)])
    cmd.extend(["--device", args.device])
    return cmd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Single-file tagging launcher (transformers or ollama)."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Dataset slug under notebooks/data (example: tricoloredelsangueitalico).",
    )
    parser.add_argument(
        "--engine",
        choices=["auto", "transformers", "ollama"],
        default="auto",
        help='Tagging backend. "auto" prefers transformers.',
    )
    parser.add_argument(
        "--model",
        default="",
        help="Backend model name. Leave empty to use backend defaults.",
    )

    # Shared behavior
    parser.add_argument(
        "--mode",
        choices=["missing", "errors", "all"],
        default="missing",
        help='Tagging mode: "missing" tags only untagged rows, "errors" retries failures too, "all" retags everything.',
    )
    parser.add_argument("--limit", type=int, default=0, help="Max rows to tag in this run.")
    parser.add_argument("--min-text-length", type=int, default=20, help="Skip short rows.")
    parser.add_argument("--checkpoint-every", type=int, default=500, help="Checkpoint frequency.")
    parser.add_argument("--no-update-graph", action="store_true", help="Skip graph.json update.")
    parser.add_argument("--sync-app-static", action="store_true", help="Copy outputs to app/static/data.")
    parser.add_argument("--dry-run", action="store_true", help="Show pending rows without tagging.")

    # Ollama-specific
    parser.add_argument("--workers", type=int, default=3, help="Ollama parallel workers.")
    parser.add_argument("--max-inflight", type=int, default=0, help="Ollama max queued futures.")
    parser.add_argument("--max-retries", type=int, default=1, help="Ollama retries per row.")
    parser.add_argument("--sleep-seconds", type=float, default=0.0, help="Ollama delay between calls in sequential mode.")

    # Transformers-specific
    parser.add_argument("--batch-size", type=int, default=64, help="Transformers embedding batch size.")
    parser.add_argument("--threshold", type=float, default=0.34, help="Transformers main threshold.")
    parser.add_argument(
        "--fallback-threshold",
        type=float,
        default=0.28,
        help="Transformers fallback top-1 threshold.",
    )
    parser.add_argument("--max-topics", type=int, default=4, help="Transformers max topics per row.")
    parser.add_argument(
        "--device",
        choices=["auto", "cpu", "cuda", "mps"],
        default="auto",
        help="Transformers device.",
    )

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    notebooks_root = Path(__file__).resolve().parent
    engine = choose_engine(args.engine, require_backend=not args.dry_run)

    if engine == "ollama":
        cmd = build_ollama_cmd(notebooks_root, args)
    else:
        cmd = build_transformers_cmd(notebooks_root, args)

    print(f"[tag] engine={engine}")
    print("[tag] running:", " ".join(cmd))
    result = subprocess.run(cmd, check=False)
    return int(result.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
