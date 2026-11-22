"""Build seed/lexicon/{en,pt}.tsv.gz: word<TAB>zipf for the ~60,000 most frequent words.

Run from the repo root:  uv run --with wordfreq python seed/scripts/lexicon.py
Data: wordfreq 3.x (code Apache-2.0, data CC BY-SA 4.0).
"""
import gzip
import re
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

OUT = Path(__file__).resolve().parents[1] / "lexicon"
TARGET = 60_000
# letters (incl. accented), optional internal hyphen or apostrophe between letters
WORD = re.compile(r"^[^\W\d_]+(?:[-'’][^\W\d_]+)*$")


def build(lang: str) -> None:
    seen: set[str] = set()
    rows: list[tuple[str, float]] = []
    for w in top_n_list(lang, 200_000):
        w = w.lower().replace("’", "'")
        if w in seen or not WORD.match(w):
            continue
        seen.add(w)
        rows.append((w, zipf_frequency(w, lang)))
        if len(rows) >= TARGET:
            break
    OUT.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT / f"{lang}.tsv.gz", "wt", encoding="utf-8") as f:
        for w, z in rows:
            f.write(f"{w}\t{z:.2f}\n")
    print(lang, len(rows), "words, zipf", rows[0][1], "to", rows[-1][1])


if __name__ == "__main__":
    for lang in ("en", "pt"):
        build(lang)
