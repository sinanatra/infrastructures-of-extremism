# Right-Wing Telegram Exploration

This workspace ties together data ingestion, topic modelling, and an interactive visualization of Telegram datasets so you can explore how extremist groups position themselves across different narratives.

## Workflow
0. **Python deps**
   - Install once from repo root: `pip install -r requirements.txt`.
1. **Crawling & ingestion**  
   - Use `notebooks/crawler.ipynb` or `notebooks/crawler.py` to fetch messages from a Telegram dataset.  
   - `notebooks/crawler.py` supports incremental reruns by default (skips already-known messages) and exports broken Telegram targets with status metadata.  
   - The crawler writes `graph.json`, `message_nodes.csv`, and link metadata files under `notebooks/data/<dataset>`, providing the raw network and message data that the topic modelling notebook consumes.  
2. **Topic modelling**  
   - Open `notebooks/topic_modelling.ipynb`. It is already split into the cells you care about (config, taxonomy, normalization, model loading, prediction, dry-run, CSV update, graph update, deployment).  
   - Execute cells sequentially (model + prediction, then CSV/graph updates). The final cell copies the updated `message_nodes.csv` and `graph.json` files into `app/static/data/<dataset>` so the frontend reads the latest tags.
   - Use one tagging entrypoint: `python3 notebooks/tag.py --dataset <dataset>`.  
   - Backend selection is via `--engine` (`transformers` or `ollama`; `auto` defaults to transformers when available).
   - If you use `notebooks/benchmark.ipynb` with Ollama, merge its tagged CSV into the dataset before precompute: `python3 notebooks/merge_ollama_tags.py --dataset <dataset> --tagged-csv notebooks/data/message_nodes_tagged.csv`.
3. **Visualization**  
   - The network uses `app/src/lib/NetworkGraphP5.svelte`. It now accepts `pieFill`, which drives the ring fill/shadow colors so the extruded polygon stays beneath the nodes/links while matching the dataset theme.  
   - `app/src/lib/Pie.svelte` mirrors that behavior, defaulting `pieFill` to `circleColor` and always rendering the background-colored ring before drawing nodes/links.
3. **Deployment**  
   - Rebuild frontend dataset artifacts with `node app/scripts/precompute-layout.js`.  
   - Run `npm install` (if not already) and `npm run dev` from the `app` folder to preview.  
   - The `[dataset]/pie` page lets you compare the two renderers with a shared theme set via `app/static/data/dataset-themes.json`.

## Notes
- The topic taxonomy uses the `topicSpecs` list in the notebook and infers semantics via `sentence-transformers/all-MiniLM-L6-v2`.  
- Cleaning functions deduplicate retweets and unify canonical keys so identical messages always hit the same topic.  
- `pieFill` ensures the visualization components share a cohesive fill/shadow layer for the 12-sided ring and extrusion.

Let me know if you’d like README additions on testing, data ingestion, or deployment.
