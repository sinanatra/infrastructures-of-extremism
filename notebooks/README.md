## Data pipeline

Install dependencies once from the repo root:

```bash
pip install -r requirements.txt
```

The pipeline has three steps: **crawl → tag → build**.

---

### 1. Crawl — `crawler.py`

Scrapes Telegram channels/groups using Telethon and writes per-dataset files under `notebooks/data/<dataset>/`:

| File | Contents |
|---|---|
| `graph.json` | Full network with messages |
| `nodes.csv` / `edges.csv` | Group nodes and inter-group links |
| `message_nodes.csv` / `message_edges.csv` | Posts and post-level links |
| `broken_groups.csv` / `broken_group_links.csv` | Unreachable channels with error reason |

**Incremental by default** — reuses `graph.json` and stops each chat scan after a streak of already-known messages.

```bash
python3 notebooks/crawler.py --start-seed generationidentitaire --output-path notebooks/data
```

Options:
- `--no-incremental` — full rebuild
- `--phone +<countrycode><number>` (or set `TG_PHONE`) — for first-time login

---

### 2. Tag — `tag.py`

Tags each message in `message_nodes.csv` with topics and location mentions using a local Ollama model.
Runs incrementally by default: only untagged rows are processed.

```bash
python3 notebooks/tag.py --dataset tricoloredelsangueitalico
```

Common options:

| Flag | Default | Description |
|---|---|---|
| `--model` | `qwen3:4b` | Ollama model to use |
| `--workers` | `3` | Parallel requests |
| `--mode` | `missing` | `missing` / `errors` / `all` |
| `--limit` | `0` (no limit) | Cap rows per run |
| `--sync-app-static` | off | Also copy outputs to `app/static/data/` |
| `--dry-run` | off | Preview pending rows without tagging |

Output columns added to `message_nodes.csv`:
- `topics` — JSON array of canonical topic labels
- `primaryTopic` — first topic or `"Unlabeled"`
- `topics_ollama_raw` — raw model output before canonicalization
- `locations_ranked` — `[{"location": "...", "count": N}, ...]`
- `tagging_error`, `tagged_at`, `tagging_model`

Re-run after each crawl and only new messages will be tagged.

#### Merge external tags — `merge_tags.py`

If you have tags computed outside the main pipeline (e.g. from a notebook experiment), merge them into the dataset files:

```bash
python3 notebooks/merge_tags.py \
  --dataset tricoloredelsangueitalico \
  --tagged-csv notebooks/data/message_nodes_tagged.csv
```

The script picks the best available tag when duplicates exist (more topics > more locations > no error) and maps legacy label names to current canonical labels automatically.

---

### 3. Build — `precompute-layout.js`

Compiles the crawled and tagged data into the JSON/CSV layout files consumed by the app:

```bash
node app/scripts/precompute-layout.js
```

Run this after tagging (or use `--sync-app-static` in `tag.py` to copy files first).

---

### Shared utilities — `utils.py`

Internal helpers (text normalization, CSV I/O, atomic writes, `sync_to_app_static`) used by both `tag.py` and `merge_tags.py`. Not intended to be run directly.
