## Notebook tooling

- Install deps once from repo root: `pip install -r requirements.txt`

- `topic_modeling.py`/`topic_modeling.ipynb`: TF-IDF → SVD → clustering pipeline that matches cluster centroids to canonical topic labels and prints representative snippets. Lightweight, completely offline after you install `pandas numpy scikit-learn`.
- `topic_zero_shot.py`: Transformers zero-shot classification to score every message against the canonical topic list using a local `facebook/bart-large-mnli` (or any compatible checkpoint). Install `transformers` plus a backend (`torch`/`flax`) and run `python3 notebooks/topic_zero_shot.py` (add `--multi-label`/`--sample-size`/`--batch-size` as desired). Output lands in `notebooks/data/topic_zero_shot.csv`.

Both scripts expect the CSV at `notebooks/data/jungenationalisten/message_nodes.csv` and drop rows without `text`. Use `pip install pandas numpy scikit-learn transformers torch` before running.

## Crawler script

- `crawler.py`: Telethon crawler with incremental updates and broken-link tracking.
- Incremental mode is enabled by default: it reuses `graph.json` and stops each chat scan after a streak of already-known messages, so reruns avoid re-scraping old content.
- It writes `broken_groups.csv` and `broken_group_links.csv` next to the normal graph/message CSVs.

Example:

```bash
python3 notebooks/crawler.py --start-seed generationidentitaire --output-path notebooks/data
```

Use `--no-incremental` for a full rebuild.
If login is needed, provide `--phone +<countrycode><number>` (or set `TG_PHONE`).

## Ollama tag merge (benchmark -> dataset)

`benchmark.ipynb` writes tagged output in a separate CSV. To apply those tags to the dataset used by the app:

```bash
python3 notebooks/merge_ollama_tags.py \
  --dataset tricoloredelsangueitalico \
  --tagged-csv notebooks/data/message_nodes_tagged.csv
```

What it updates:
- `notebooks/data/<dataset>/message_nodes.csv` (`topics`, `primaryTopic`, plus `topics_ollama_raw` and `locations_ranked`)
- `notebooks/data/<dataset>/graph.json` messages with the same fields

Then refresh app data:

```bash
node app/scripts/precompute-layout.js
```

## Single tagging command

Use one file only:

```bash
python3 notebooks/tag.py --dataset tricoloredelsangueitalico
```

Default behavior is incremental (`--mode missing`): it tags only rows without `topics`.
Run it again after each crawl and it continues from untagged rows.
Preview queue without tagging: `python3 notebooks/tag.py --dataset <dataset> --dry-run`.

Backends:
- fast multilingual transformers (default auto choice): `--engine transformers`
- ollama: `--engine ollama --model qwen3:1.7b --workers 3`

Then rebuild visualization data:

```bash
node app/scripts/precompute-layout.js
```
