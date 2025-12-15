## Notebook tooling

- `topic_modeling.py`/`topic_modeling.ipynb`: TF-IDF → SVD → clustering pipeline that matches cluster centroids to canonical topic labels and prints representative snippets. Lightweight, completely offline after you install `pandas numpy scikit-learn`.
- `topic_zero_shot.py`: Transformers zero-shot classification to score every message against the canonical topic list using a local `facebook/bart-large-mnli` (or any compatible checkpoint). Install `transformers` plus a backend (`torch`/`flax`) and run `python3 notebooks/topic_zero_shot.py` (add `--multi-label`/`--sample-size`/`--batch-size` as desired). Output lands in `notebooks/data/topic_zero_shot.csv`.

Both scripts expect the CSV at `notebooks/data/jungenationalisten/message_nodes.csv` and drop rows without `text`. Use `pip install pandas numpy scikit-learn transformers torch` before running.
