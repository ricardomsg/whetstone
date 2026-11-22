# Seed content

Everything the app needs on day one, generated once and committed as JSON, then loaded into SQLite by `npm run seed`. The loader is idempotent: it upserts by `id`.

## Files

| File | Holds |
|---|---|
| `lexicon/en.tsv.gz`, `lexicon/pt.tsv.gz` | `word<TAB>zipf`, the most frequent words per language. Built locally from `wordfreq` by `npm run lexicon` or the Docker build, and not committed. See [NOTICE](../NOTICE.md) |
| `items/a1.en.json`, `items/a1.pt-PT.json` | Definition-to-word items (A1) |
| `items/a4.en.json`, `items/a4.pt-PT.json` | Synonym-ladder items (A4) |
| `items/a1.twins.en.json`, `items/a1.twins.pt-PT.json`, `items/pairs.a1.json` | Matching cards for A1 across languages, and the list of matched pairs |
| `items/a8.pt-PT.json`, `items/a8.en.json` | Translation items (A8): English cue → Portuguese answer, and the reverse |
| `../content/prompts/a2.json` | Fluency prompts (A2), both languages |

## Item formats

A1 item:

```json
{
  "id": "a1-en-0001",
  "lang": "en",
  "target": "ephemeral",
  "accept": ["ephemeral"],
  "pos": "adj",
  "zipf": 3.1,
  "band": 3,
  "concreteness": "abstract",
  "definition": "Lasting for a very short time.",
  "example": "Fame on social media is often ___.",
  "hints": { "syllables": 4, "stress": 2, "firstSound": "starts with \"e\", as in \"ep-\"", "similar": "sounds a little like \"federal\"", "lastSound": "ends in \"-al\"" },
  "parallelSet": 0,
  "validated": { "solverAnswer": "ephemeral", "model": "deepseek-flash" }
}
```

- `band` is the Zipf frequency band: 1 is Zipf ≥ 4.5 (very common), 2 is 3.5 to 4.5, 3 is 2.5 to 3.5, 4 is below 2.5 (rare).
- `stress` is the 1-based index of the stressed syllable.
- `parallelSet` 0 is practice; 1 to 4 are benchmark sets of matched difficulty, never used in practice.
- `accept` lists spellings or forms graded as exactly correct.

A4 item:

```json
{ "id": "a4-en-0001", "lang": "en", "sentence": "The certificate expiry was an important factor in the outage.", "target": "important", "register": "incident-report", "difficulty": 2, "parallelSet": 0 }
```

A2 prompt:

```json
{ "id": "a2-en-sem-emotions", "lang": "en", "kind": "semantic", "prompt": "emotions", "difficulty": 1, "parallelSet": 0 }
```

`kind` is `semantic` (a category) or `letter` (a starting letter); `difficulty` runs 1 to 3.

## A1 matching cards

Most A1 practice cards have a match in the other language for the same sense (475 pairs on 2026-10-09, after a first pass and two `--retry` passes), listed in `pairs.a1.json` as `{"en": id, "pt-PT": id}`. The loader writes each match's id into the other card's `prompt.pair`.

- `seed/scripts/a1_twins.py en` matches the English cards, then `pt-PT` the Portuguese ones that are still unmatched. Run them in that order: `uv run --with wordfreq --with pronouncing python seed/scripts/a1_twins.py en`.
- The model names the closest single word for the card's sense, or skips the card when only a phrase, a loanword or a much broader or narrower word fits.
- If that word is already a practice card in the other language with the same part of speech, the two are linked. Otherwise a new card is written with the A1 generator's prompt and must pass the A1 validator's code checks, blind solver and QA. New cards go in `a1.twins.<lang>.json` with ids `a1t-<lang>-NNNN`, which are never renumbered.
- `--retry` runs again over unmatched cards: failed words are regenerated with a request for sharper definitions, and a short fixed expression is allowed where no single word fits.
- A word is taught by one card only, so a second card wanting the same match stays unmatched. Benchmark cards are not matched.

## A8 items

The file name and `lang` give the language of the answer: `a8.pt-PT.json` shows an English cue and wants Portuguese.

```json
{
  "id": "a8-pt-PT-0001",
  "lang": "pt-PT",
  "cue": "deadline",
  "context": "We moved the deadline to Friday.",
  "target": "prazo",
  "accept": ["data-limite"],
  "gapped": "Adiámos o ___ para sexta-feira.",
  "trap": "",
  "note": "",
  "kind": "word",
  "category": "work",
  "pos": "noun",
  "difficulty": 2,
  "hints": { "syllables": 2, "stress": 1, "firstSound": "começa por \"pra-\"", "similar": "rima com \"braço\"", "lastSound": "termina em \"-zo\"" },
  "parallelSet": 0
}
```

- `kind` is `word`, `phrase` or `idiom`; `difficulty` runs 1 to 3 and sets the starting rating.
- `trap` is the tempting wrong answer (a false friend, anglicism or calque); typing it is recorded and named.
- `retired: true` keeps an item's id and history but takes it out of play: the loader stores it inactive and `a8_build.py` carries the flag into a rebuild. The 14 Portuguese idioms were retired on 2026-11-04 as unnatural in everyday Portugal or wrongly translated.
- `syllables` and `stress` are present only for single words where the rule-based syllabifier (`pt_syll.py`) or CMUdict agreed with the generator.
- `seed/scripts/a8_build.py` generates, validates and builds in one run: `uv run --with pronouncing python seed/scripts/a8_build.py pt-PT` (or `en`). A blind translator must reach the target or an accepted form, and a QA pass checks the European Portuguese, the accepted forms and the hints. Ids are keyed by category and cue, and an id already in the committed file is kept, so rerunning it does not renumber anything.

## Regenerating

**Retained after review, 2026-09-26:** all eight items raised in the content review were deliberately kept: `brasileiro` (`a1-pt-PT-0002`), `russo` (`a1-pt-PT-0043`), `iraniano` (`a1-pt-PT-0142`), `alentejano` (`a1-pt-PT-0239`), `xiita` (`a1-pt-PT-0257`), `bielorrusso` (`a1-pt-PT-0290`), `americano` (`a1-en-0153`) and `tandoori` (`a1-en-0297`). Geography, religious vocabulary or being a loanword is not by itself a reason to remove an item. Their ids and benchmark assignments remain unchanged; specific factual or hint defects can still be corrected individually.

The generators live in `scripts/` and call the provider the app uses, read from the repo's `.env`: `WS_LLM_PROVIDER=anthropic` sends them to `claude-haiku-5-5` with `WS_ANTHROPIC_API_KEY` (since 2026-10-14), `deepseek` to `deepseek-flash` with `WS_DEEPSEEK_API_KEY`. The items built before 2026-10-14 were generated and validated on DeepSeek, and their `validated.model` says so. Run from the repo root, in order: `uv run --with wordfreq python seed/scripts/lexicon.py`; for each language (`en`, `pt-PT`) `a1_candidates.py`, `a1_generate.py`, `a1_validate.py` (with `--with wordfreq --with pronouncing`) and `a1_build.py`; then `a4_generate.py` and `a2_prompts.py`. Intermediate results and token usage go to `work/` (ignored); a rerun of a stage reuses its cached LLM answers. Hand-review decisions are kept in `scripts/a1_overrides.json` and `scripts/a4_overrides.json` and applied at build time.

⚠️ **Never rerun `a1_build.py` against a live database.** It numbers A1 ids by sorting on band, part of speech and word, so a rebuild renumbers them and every stored attempt, card and rating would point at a different word. To change live content, edit the JSON in place and keep each id, or add new items with new ids; then `npm run seed` upserts them.
