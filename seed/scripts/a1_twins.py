"""Matching cards for A1 (Definition → word) across languages.

uv run --with wordfreq --with pronouncing python seed/scripts/a1_twins.py en|pt-PT
  en:    for every English practice item, find its European Portuguese match
  pt-PT: for every Portuguese practice item, find its English match

Steps: the model names the closest equivalent word for the item's sense (or skips it); when that word
is already an A1 item in the other language with the same part of speech, the two are linked and no
new item is made; otherwise the A1 generator writes a definition, example and hints for it, and it
must pass the same code checks, blind solver and QA as the original A1 items.

Writes seed/items/a1.twins.<other>.json (new items, ids a1t-<other>-NNNN, kept across reruns) and
updates seed/items/pairs.a1.json ([{"en": id, "pt-PT": id}, ...]); the loader links each pair.
Benchmark items (parallelSet > 0) get no match: practice never shows them.
"""
import json
import sys
from pathlib import Path

SRC = sys.argv[1]
assert SRC in ("en", "pt-PT")
# --retry: a second pass over cards still unmatched. Failed words are generated again with a request
# for sharper definitions, and a short fixed expression is allowed when no single word fits.
RETRY = "--retry" in sys.argv
OTHER = "pt-PT" if SRC == "en" else "en"
sys.argv = [sys.argv[0], OTHER]  # a1_generate and a1_validate read the language at import
import a1_generate as GEN  # noqa: E402
import a1_validate as VAL  # noqa: E402
from llm import FAST, WORK, chat_json, pmap  # noqa: E402

ROOT = WORK.parents[1]
ITEMS = ROOT / "seed" / "items"
NAME = {"en": "English", "pt-PT": "European Portuguese (Portugal's norm and post-1990 spelling, never Brazilian forms)"}

EQUIV = f"""You match vocabulary across languages. Each numbered line gives a {NAME[SRC]} word, its part of speech and the definition of the sense meant. Give the single {NAME[OTHER]} word that a careful bilingual would use for exactly that sense, in dictionary form and the same part of speech (verbs in the infinitive; nouns singular; adjectives masculine singular in Portuguese).
Set "skip" true when no single common word fits that sense well (only a phrase, only a loanword, a culture-specific term, or a much broader or narrower word).
Return JSON {{"items": [{{"n": 1, "word": "...", "pos": "noun|verb|adj", "skip": false}}, ...]}} covering every line."""
EQUIV_RETRY = EQUIV.replace(
    'Set "skip" true when no single common word fits that sense well (only a phrase, only a loanword, a culture-specific term, or a much broader or narrower word).',
    'Prefer a single word; when none fits, give the short fixed expression of two or three words a native speaker uses for it (e.g. "dia de pagamento", "arma de fogo"). Set "skip" true only when nothing natural exists.',
)
SHARPER = "\nThese words failed a first attempt because a blind solver found other words equally good. Make each definition and example especially distinctive, naming the feature that rules out the closest synonyms."



def checks(x: dict) -> list[str]:
    """The A1 code checks; a short expression has no single syllable split, so that check is skipped."""
    errs = VAL.code_checks(x)
    return [e for e in errs if not (" " in x["word"] and e.startswith("syllables_split"))]


def cache(name: str):
    p = WORK / f"a1t.{SRC}.{name}.json"
    return p, (json.loads(p.read_text()) if p.exists() else {})


def batched(keys, fn, size, name):
    p, c = cache(name)
    todo = [k for k in keys if k not in c]
    for res in pmap(fn, [todo[i : i + size] for i in range(0, len(todo), size)], workers=8):
        c.update(res)
    p.write_text(json.dumps(c, ensure_ascii=False, indent=1))
    return c


def main() -> None:
    src = [x for x in json.loads((ITEMS / f"a1.{SRC}.json").read_text()) if x.get("parallelSet", 0) == 0]
    other = [x for x in json.loads((ITEMS / f"a1.{OTHER}.json").read_text()) if x.get("parallelSet", 0) == 0]
    by_id = {x["id"]: x for x in src}
    pairs_path = ITEMS / "pairs.a1.json"
    pairs = json.loads(pairs_path.read_text()) if pairs_path.exists() else []
    paired = {p[k] for p in pairs for k in ("en", "pt-PT")}
    twins_path = ITEMS / f"a1.twins.{OTHER}.json"
    twins = json.loads(twins_path.read_text()) if twins_path.exists() else []
    paired |= {t["twinOf"] for t in twins}

    # 1. the equivalent word
    def equiv(keys):
        lines = "\n".join(f'{i+1}. {by_id[k]["target"]} ({by_id[k]["pos"]}): {by_id[k]["definition"]}' for i, k in enumerate(keys))
        out = chat_json(EQUIV_RETRY if RETRY else EQUIV, lines, tag=f"a1t-equiv-{SRC}", effort="high")
        res = {}
        for r in out.get("items", []):
            try:
                i = int(r["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"word": str(r.get("word", "")).strip(), "pos": str(r.get("pos", "")), "skip": bool(r.get("skip")), "retried": RETRY}
        return res

    if RETRY:  # ask again for the cards that were skipped or got an expression
        p, c = cache("equiv")
        for x in src:
            e = c.get(x["id"])
            if x["id"] not in paired and e and (e["skip"] or " " in e["word"]) and not e.get("retried"):
                del c[x["id"]]
        p.write_text(json.dumps(c, ensure_ascii=False, indent=1))
    eq = batched([x["id"] for x in src], equiv, 30, "equiv")

    # 2. link to an existing item, or queue a new one
    existing = {(VAL.fold(x["target"]), x["pos"]): x for x in other}
    taken_words = {VAL.fold(x["target"]) for x in other} | {VAL.fold(t["target"]) for t in twins}
    links, todo = [], []
    for x in src:
        e = eq.get(x["id"])
        if x["id"] in paired or not e or e["skip"] or not e["word"] or (" " in e["word"] and not RETRY) or len(e["word"].split()) > 3:
            continue
        hit = existing.get((VAL.fold(e["word"]), x["pos"]))
        if hit:
            if hit["id"] not in paired:
                links.append({SRC: x["id"], OTHER: hit["id"]})
                paired |= {x["id"], hit["id"]}
            continue
        if VAL.fold(e["word"]) in taken_words:
            continue  # another card already teaches this word
        taken_words.add(VAL.fold(e["word"]))
        todo.append({"word": e["word"], "pos": x["pos"], "twinOf": x["id"], "concreteness": x.get("concreteness")})
    print("linked to existing items:", len(links), "· new to generate:", len(todo))

    # 3. definition, example and hints with the A1 generator's own prompt
    words = {t["word"]: t for t in todo}
    if RETRY:  # these words failed before: generate, solve and review them afresh
        for name in ("generated", "solver", "qa"):
            p, c = cache(name)
            for w in words:
                c.pop(w, None)
            p.write_text(json.dumps(c, ensure_ascii=False, indent=1))

    def gen(keys):
        lines = "\n".join(f"{k} ({words[k]['pos']})" for k in keys)
        out = chat_json(GEN.SYSTEM[OTHER] + (SHARPER if RETRY else ""), "Target words (with the intended part of speech):\n" + lines, tag=f"a1t-gen-{OTHER}", effort="high")
        res = {}
        for g in out.get("items", []):
            if isinstance(g, dict) and g.get("word") in words:
                res[g["word"]] = g
        return res

    gens = batched(list(words), gen, 20, "generated")
    cands = []
    for w, t in words.items():
        g = gens.get(w)
        if not g:
            continue
        x = {"word": w, "pos": t["pos"], "gen": g, "twinOf": t["twinOf"], "concreteness": g.get("concreteness") or t["concreteness"]}
        x["errors"] = checks(x)
        if not x["errors"]:
            n, st = (None, None) if " " in w else (VAL.en_syllables if OTHER == "en" else VAL.pt_syllables)(x)[:2]
            x["syllables"], x["stress"] = n, st
            cands.append(x)
    print("code checks kept", len(cands), "of", len(words))
    byw = {x["word"]: x for x in cands}

    # 4. blind solver, then QA, with the A1 validator's prompts
    def solve(keys):
        clues = "\n".join(f'{i+1}. Definition: {byw[k]["gen"]["definition"]} | Example: {byw[k]["gen"]["example"]}' for i, k in enumerate(keys))
        out = chat_json(VAL.SOLVER[OTHER], clues, tag=f"a1t-solve-{OTHER}", effort="high")
        res = {}
        for a in out.get("answers", []):
            try:
                i = int(a["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"best": str(a.get("best", "")), "equally_good": [str(e) for e in a.get("equally_good", []) or []], "model": FAST}
        return res

    sol = batched(list(byw), solve, 30, "solver")
    stage2 = []
    for x in cands:
        s = sol.get(x["word"])
        ok = {VAL.norm_answer(a) for a in [x["word"], *x["gen"].get("accept", [])]}
        if s and VAL.norm_answer(s["best"]) in ok and all(VAL.norm_answer(e) in ok for e in s["equally_good"]):
            stage2.append(x)
    print("solver kept", len(stage2), "of", len(cands))

    def qa(keys):
        lines = []
        for i, k in enumerate(keys):
            g = byw[k]["gen"]
            d = {"n": i + 1, "target": k, "pos": byw[k]["pos"], "definition": g["definition"], "example": g["example"], "firstSound": g["firstSound"], "similar": g["similar"], "lastSound": g["lastSound"]}
            if OTHER != "en":
                d["syllables"] = g["syllables_split"]; d["stress"] = g.get("stress")
            lines.append(json.dumps(d, ensure_ascii=False))
        out = chat_json(VAL.QA[OTHER], "\n".join(lines), tag=f"a1t-qa-{OTHER}", effort="high")
        res = {}
        for r in out.get("reviews", []):
            try:
                i = int(r["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"ok": bool(r.get("ok")), "fix": r.get("fix") or {}}
        return res

    rev = batched([x["word"] for x in stage2], qa, 25, "qa")
    n = max([int(t["id"].rsplit("-", 1)[1]) for t in twins] or [0])
    made = 0
    for x in stage2:
        r = rev.get(x["word"])
        if not r or not r["ok"]:
            continue
        fix = r["fix"] if isinstance(r["fix"], dict) else {}
        for k in ("firstSound", "similar", "lastSound"):
            if isinstance(fix.get(k), str) and fix[k].strip():
                x["gen"][k] = fix[k]
        if checks(x):
            continue
        g = x["gen"]
        zipf = VAL.zipf_frequency(x["word"], VAL.WF)
        n += 1
        made += 1
        tid = f"a1t-{OTHER}-{n:04d}"
        twins.append({
            "id": tid, "lang": OTHER, "target": x["word"], "accept": g.get("accept") or [x["word"]], "pos": x["pos"],
            "zipf": round(zipf, 2), "band": 1 if zipf >= 4.5 else 2 if zipf >= 3.5 else 3 if zipf >= 2.5 else 4,
            "concreteness": x["concreteness"], "definition": g["definition"], "example": g["example"],
            "hints": {k: v for k, v in {"syllables": x.get("syllables"), "stress": x.get("stress"), "firstSound": g["firstSound"], "similar": g["similar"], "lastSound": g["lastSound"]}.items() if v},
            "parallelSet": 0, "twinOf": x["twinOf"], "validated": {"solverAnswer": sol[x["word"]]["best"], "model": sol[x["word"]].get("model", "deepseek-flash")},
        })
        pairs.append({SRC: x["twinOf"], OTHER: tid})
    pairs += links
    twins_path.write_text(json.dumps(twins, ensure_ascii=False, indent=1) + "\n")
    pairs_path.write_text(json.dumps(pairs, ensure_ascii=False, indent=1) + "\n")
    print(f"new {OTHER} items: {made} (file now {len(twins)}) · links to existing: {len(links)} · pairs total: {len(pairs)}")


if __name__ == "__main__":
    main()
