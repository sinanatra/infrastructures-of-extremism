# Infrastructures of Extremism

An investigation into far-right Telegram networks — automated data collection, topic tagging, and interactive visualization.

## Pipeline

Install Python dependencies once from the repo root:

```bash
pip install -r requirements.txt
```

### 1. Crawl — `notebooks/crawler.py`

Scrapes Telegram channels using Telethon. Incremental by default (stops each chat scan after a streak of already-known messages).

```bash
python3 notebooks/crawler.py --start-seed generationidentitaire --output-path notebooks/data
```

Writes per-dataset files under `notebooks/data/<dataset>/`: `graph.json`, `nodes.csv`, `edges.csv`, `message_nodes.csv`, and broken-group metadata.

See `notebooks/README.md` for all options.

### 2. Tag — `notebooks/tag.py`

Tags each message with topics and location mentions using a local Ollama model. Only untagged rows are processed by default.

```bash
python3 notebooks/tag.py --dataset <dataset>
```

Re-run after each crawl — only new messages will be tagged.

### 3. Build — `app/scripts/precompute-layout.js`

Compiles crawled and tagged data into the JSON/CSV files consumed by the app.

```bash
node app/scripts/precompute-layout.js
```

### 4. App

```bash
cd app && npm install && npm run dev
```

## Notes

- Session files (`*.session`) are excluded from source control.
- Dataset files under `notebooks/data/` are excluded from source control.
- See `notebooks/README.md` for the full pipeline reference including merge utilities and tagging options.
