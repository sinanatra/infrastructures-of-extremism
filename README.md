# Infrastructures of Extremism

An investigation into far-right Telegram networks, automated data collection, topic tagging, and interactive visualization.

## Setup

```bash
pip install -r requirements.txt
cd app && npm install
```

---

## Pipeline: crawl → tag → build → app

### 1. Crawl — `notebooks/crawler.py`

Scrapes Telegram channels/groups using Telethon. Incremental by default: reuses `graph.json` and stops each chat scan after a streak of already-known messages.

```bash
python3 notebooks/crawler.py --start-seed generationidentitaire --output-path notebooks/data
```

Writes per-dataset files under `notebooks/data/<dataset>/`:

| File | Contents |
|---|---|
| `graph.json` | Full network with messages |
| `nodes.csv` / `edges.csv` | Group nodes and inter-group links |
| `message_nodes.csv` / `message_edges.csv` | Posts and post-level links |
| `broken_groups.csv` / `broken_group_links.csv` | Unreachable channels with error reason |

Options:
- `--handle-delay` — seconds between requests (default: 15). Increase to reduce Telegram rate limiting.
- `--max-wait` — max flood wait to tolerate before skipping a channel (default: 3600s).
- `--no-incremental` — full rebuild from scratch.
- `--phone +<countrycode><number>` (or set `TG_PHONE`) — for first-time login.

---

### 2. Tag — `notebooks/tag_st.py` (recommended) or `tag.py`

Both scripts run incrementally: only untagged rows are processed. Re-run after each crawl.

#### `tag_st.py` — sentence-transformers (fast, no external service needed)

Uses `paraphrase-multilingual-mpnet-base-v2` to classify messages via embedding similarity. Runs on MPS/CUDA if available, falls back to CPU.

```bash
python3 notebooks/tag_st.py --dataset generationidentitaire
```

| Flag | Default | Description |
|---|---|---|
| `--model` | `paraphrase-multilingual-mpnet-base-v2` | sentence-transformers model |
| `--mode` | `missing` | `missing` / `errors` / `all` |
| `--limit` | `0` (no limit) | Cap rows per run |
| `--sync-app-static` | off | Also copy outputs to `app/static/data/` |
| `--dry-run` | off | Preview pending rows without tagging |

Note: does not extract `locations_ranked` (set to `[]`).

#### `tag.py` — Ollama (slower, also extracts location mentions)

Requires Ollama running locally (`ollama serve`).

```bash
python3 notebooks/tag.py --dataset generationidentitaire
```

| Flag | Default | Description |
|---|---|---|
| `--model` | `qwen3:4b` | Ollama model to use |
| `--workers` | `3` | Parallel requests |
| `--mode` | `missing` | `missing` / `errors` / `all` |
| `--limit` | `0` (no limit) | Cap rows per run |
| `--sync-app-static` | off | Also copy outputs to `app/static/data/` |
| `--dry-run` | off | Preview pending rows without tagging |

Output columns added to `message_nodes.csv` (both scripts):
- `topics` — JSON array of canonical topic labels
- `primaryTopic` — first topic or `"Unlabeled"`
- `topics_ollama_raw` — raw model output before canonicalization
- `locations_ranked` — `[{"location": "...", "count": N}, ...]`
- `tagging_error`, `tagged_at`, `tagging_model`

#### Merge external tags — `merge_tags.py`

If you have tags computed outside the pipeline (e.g. from a notebook), merge them in:

```bash
python3 notebooks/merge_tags.py \
  --dataset tricoloredelsangueitalico \
  --tagged-csv notebooks/data/message_nodes_tagged.csv
```

---

### 3. Build — `app/scripts/precompute-layout.js`

Compiles crawled and tagged data into the JSON/CSV files consumed by the app.

```bash
node app/scripts/precompute-layout.js
```

---

### 4. App

```bash
cd app && npm run dev
```

---

## Full update sequence

```bash
python3 notebooks/crawler.py --start-seed generationidentitaire --output-path notebooks/data
python3 notebooks/crawler.py --start-seed tricoloredelsangueitalico --output-path notebooks/data
python3 notebooks/crawler.py --start-seed jungenationalisten --output-path notebooks/data
python3 notebooks/crawler.py --start-seed afdjugendbw --output-path notebooks/data
python3 notebooks/crawler.py --start-seed WhiteLivesMatterOfficial --output-path notebooks/data

python3 notebooks/tag_st.py --dataset generationidentitaire
python3 notebooks/tag_st.py --dataset tricoloredelsangueitalico
python3 notebooks/tag_st.py --dataset jungenationalisten
python3 notebooks/tag_st.py --dataset afdjugendbw
python3 notebooks/tag_st.py --dataset WhiteLivesMatterOfficial

node app/scripts/precompute-layout.js
```

---

## Notes

- Session files (`*.session`) are excluded from source control.
- Dataset files under `notebooks/data/` are excluded from source control.
- Telegram rate limits: run one seed at a time and space crawls by a few hours to avoid flood bans.
