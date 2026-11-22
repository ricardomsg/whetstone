# Notices

The code in this repository is under the [MIT License](LICENSE), except as stated here.

## Word-frequency data

Whetstone uses **wordfreq**, Copyright 2022 Robyn Speer ([repository](https://github.com/rspeer/wordfreq)). Version 3.1.1 is the build input. The upstream citation is: Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. [doi:10.5281/zenodo.7199437](https://doi.org/10.5281/zenodo.7199437). Its code is under the Apache License 2.0 and its data files may be redistributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Its full notice and citations are kept unchanged in [licenses/wordfreq-NOTICE.md](licenses/wordfreq-NOTICE.md).

**The word-frequency lexicon is not stored in this repository**, because wordfreq's documentation advises against converting its data into standalone word lists. `seed/scripts/lexicon.py` builds it on your machine from the wordfreq package, and the Docker build runs that script. This project does not publish a Docker image. If you distribute an image you built, it contains that lexicon, so check wordfreq's terms first and include this notice.

The four files `seed/items/a1.en.json`, `seed/items/a1.pt-PT.json`, `seed/items/a1.twins.en.json` and `seed/items/a1.twins.pt-PT.json` record a Zipf frequency value from wordfreq for each item. Those four files are offered under CC BY-SA 4.0. Changes made: items were written for this project, and frequency values were rounded and attached to them. `seed/scripts/a2_prompts.py` also records aggregate counts of wordfreq's top words by starting letter, used to set prompt difficulty.

wordfreq's data derives from these sources, which its notice asks to be credited:

- [Google Books Ngrams](http://books.google.com/ngrams) and Google Books Syntactic Ngrams
- The [Leeds Internet Corpus](http://corpus.leeds.ac.uk/list.html), University of Leeds Centre for Translation Studies
- [Wikipedia](http://www.wikipedia.org)
- [ParaCrawl](https://paracrawl.eu)
- [OPUS OpenSubtitles 2018](http://opus.nlpl.eu/OpenSubtitles.php), from the [OpenSubtitles](http://www.opensubtitles.org/) project
- The SUBTLEX word lists SUBTLEX-US, SUBTLEX-UK, SUBTLEX-CH, SUBTLEX-DE and SUBTLEX-NL, created by Marc Brysbaert et al., with co-authors named in the citations in the full notice. SUBTLEX is [freely available data](http://crr.ugent.be/programs-data/subtitle-frequencies).
- Word statistics collected from the Twitter streaming API

## Pronunciation data

The English syllable counts and stress positions in the A1 seed items are derived from **the CMU Pronouncing Dictionary**, Copyright (C) 1993-2015 Carnegie Mellon University, read through the `pronouncing` Python package. Its BSD-style licence is kept unchanged in [licenses/cmudict-LICENSE.txt](licenses/cmudict-LICENSE.txt).

## Generated content

Seed items and prompts were generated with language models and checked by a separate blind solver. European Portuguese hints were not all reviewed by a native speaker.
