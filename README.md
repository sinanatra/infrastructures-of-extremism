# Infrastructures of Extremism

## Setup

```bash
pip install -r requirements.txt
cd app && npm install
```

## Pipeline

1. **Crawl** — `python3 notebooks/crawler.py --start-seed <slug> --output-path notebooks/data`
   Incremental by default. Writes `graph.json`, `nodes.csv`/`edges.csv`, `message_nodes.csv`/`message_edges.csv`, `broken_groups.csv`/`broken_group_links.csv` under `notebooks/data/<dataset>/`. See `--help` for rate-limit/login flags.

2. **Tag** — `python3 notebooks/tag_st.py --dataset <slug>` (sentence-transformers, fast, local) or `python3 notebooks/tag.py --dataset <slug>` (Ollama, slower, also extracts locations). Both are incremental — re-run after each crawl. `notebooks/merge_tags.py` merges externally-computed tags back in. See `--help` on each for flags.

3. **Build** — `node app/scripts/precompute-layout.js` compiles crawled + tagged data into what the app reads from `app/static/data/`.

4. **App** — `cd app && npm run dev`
