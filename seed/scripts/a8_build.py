"""A8 (Translate it): generate, validate and build translation items in one script.

uv run --with pronouncing python seed/scripts/a8_build.py pt-PT|en
  pt-PT: English cue -> European Portuguese answer (the main direction)
  en:    European Portuguese cue -> English answer
Writes seed/work/a8.<lang>.*.json (cached LLM results; a rerun does not pay twice)
and seed/items/a8.<lang>.json.

Pipeline: the generator writes candidates per category; code checks drop malformed ones; a blind
solver translates each cue in its sentence without seeing the target, and an item is kept only
when the solver's answers meet the target or its accepted forms; a QA pass that sees everything
checks the European Portuguese, the accepted forms and the hints.

Ids are keyed by category and cue: an item already in seed/items/a8.<lang>.json keeps its id and
new items get the next free number, so a rebuild never renumbers an existing item.
"""
import json
import re
import sys
import unicodedata
from collections import Counter

from llm import WORK, chat_json, pmap

ROOT = WORK.parents[1]
LANG = sys.argv[1]
assert LANG in ("pt-PT", "en")
SRC = "English" if LANG == "pt-PT" else "European Portuguese"
TGT = "European Portuguese" if LANG == "pt-PT" else "English"
PER_CALL = 24
CALLS = 2
CAP = 30  # kept items per category

PT_RULES = """European Portuguese means the norm of Portugal, post-1990 spelling as used in Portugal ("facto", "receção", "ótimo", "económico", "equipa", "ecrã", "autocarro", "telemóvel", "comboio", "casa de banho", "frigorífico", "registo", "contactar"). Never Brazilian words, spellings or constructions ("estou a fazer", never "estou fazendo"; "tu"/"você" as in Portugal; no "tela", "celular", "trem", "ônibus", "time" for team, "registro", "econômico", "xícara", "geladeira", "banheiro")."""

CATEGORIES = {
    "pt-PT": {
        "conversation": "discourse markers, fillers and connectors people use when speaking: actually, anyway, by the way, I mean, to be fair, it depends, so to speak, on second thought, no wonder, fair enough",
        "feelings": "emotions, moods and character traits used in everyday talk: awkward, overwhelmed, grumpy, reliable, stubborn, relieved, nosy, touchy, smug, homesick",
        "work": "office and project talk where Portuguese speakers often fall back on English: deadline, meeting, to follow up, to schedule, to hand over, workload, shift, payroll, raise, to step down",
        "tech-ops": "computing and operations words that have natural Portuguese equivalents in Portugal: outage, to shut down, to update, password, keyboard, screen, backup copy (cópia de segurança), to download, network, to restart",
        "life-admin": "bank, home, tax and paperwork vocabulary: mortgage, landlord, receipt, refund, bill, appointment, lease, tax return, fine, to sign up",
        "household": "kitchen, cleaning, rooms, furniture and house parts: sink, drawer, dishwasher, mop, ironing, cupboard, doorbell, ceiling, mould, grater",
        "hands-tools": "tools, materials, DIY, garden and car: screwdriver, hinge, drill, sandpaper, rake, hose, ladder, jack (car), flat tyre, bolt",
        "body-health": "body parts, symptoms and the doctor: ankle, sprain, bruise, rash, dizzy, prescription, shoulder blade, sore throat, check-up, stitches",
        "phrasal-verbs": "English phrasal verbs and their natural Portuguese verb or expression: give up, figure out, put off, run out of, turn down, catch up, look forward to, get along, show up, back out",
        "collocations-idioms": "collocations whose verb differs in Portuguese, and idioms with an established Portuguese equivalent: make a decision (tomar), take a break, pay attention, piece of cake (canja), break the ice, cost an arm and a leg (os olhos da cara), by heart, out of the blue",
        "false-friends": "English words whose Portuguese look-alike means something else, so the obvious answer is wrong: actually (not atualmente), eventually (not eventualmente), pretend (not pretender), assist, attend, realize, sensible, library, push, exquisite, parents, college, resume, constipated, lunch",
    },
    "en": {
        "conversation": "Portuguese discourse markers and spoken expressions: aliás, pois, enfim, já agora, quer dizer, ou seja, pelos vistos, de qualquer forma, por acaso, ainda bem",
        "feelings": "Portuguese words for feelings and character: saudade (describe the closest English rendering), chateado, desenrascado, teimoso, envergonhado, aliviado, mesquinho, ranzinza, deslumbrado, desconfiado",
        "work": "Portuguese work and admin words: prazo, reunião, orçamento, despacho, fatura, recibo verde, subsídio, chefia, estagiário, rescisão",
        "household-tools": "Portuguese words for household items, tools and DIY: alicate, dobradiça, berbequim, lixa, esfregona, ralador, estendal, gaveta, torneira, escadote",
        "expressions": "Portuguese idioms and set expressions with an established English equivalent: custar os olhos da cara, é canja, meter água, estar com a pulga atrás da orelha, a mais não poder, de mão beijada, fazer ouvidos de mercador, dar com a língua nos dentes",
        "verbs-collocations": "Portuguese verbs and collocations whose English rendering is not word-for-word: dar jeito, fazer questão, tomar conta, levar a mal, dar conta de, pôr-se a, ficar de, ter a ver com, contar com, desenrascar-se",
    },
}

GEN = f"""You write items for a fast translation-retrieval drill. It practises finding the {TGT} word when the {SRC} one comes to mind first. Each item shows a {SRC} word or short expression (the "cue") inside a natural {SRC} sentence; the learner must produce the {TGT} equivalent that fits that sentence.

{PT_RULES}

Return JSON {{"items": [ ... ]}} with one object per item:
- "cue": the {SRC} word or expression, as it appears in the sentence (verbs may be inflected in the sentence; give the cue in the form used there).
- "context": one natural {SRC} sentence, under 18 words, containing the cue verbatim, of the kind a person would actually say aloud.
- "target": the single most natural {TGT} rendering of the cue in that sentence, in dictionary form (verbs in the infinitive, nouns singular without article, adjectives masculine singular), unless the sentence forces a fixed expression.
- "accept": other {TGT} renderings that are equally natural and correct in this sentence (dictionary form). Only real equivalents a careful native speaker would accept. Never Brazilian forms. Often empty.
- "gapped": the {TGT} translation of the whole sentence with the target replaced by ___ (exactly one blank, the target fits it in the form the sentence needs; if the inflected form differs, the sentence must still be completable by the learner).
- "trap": the tempting wrong answer, if there is a common one: a false friend, an anglicism or a literal calque (e.g. "atualmente" for "actually"); else "".
- "note": one short English sentence a learner should remember about this item (a nuance, the trap, a register difference); may be "".
- "kind": "word" for a single word, "phrase" for a multiword expression or collocation, "idiom" for an idiom.
- "pos": noun, verb, adj, adv or other (of the target).
- "difficulty": 1 (common, most adults retrieve it at once), 2 (common but easily lost when the other language comes to mind first), 3 (less common or tricky).
- "syllables_split": if the target is a single word, its syllables split with hyphens (Portuguese: grammatical division as in Priberam, "his-tó-ri-a"; English: dictionary division); else "".
- "stress": if a single word, the 1-based index of the stressed syllable; else 0.
- "firstSound": a hint with the first sound of the target, e.g. "começa por \\"pra-\\"" or "starts with \\"pra-\\"" (at most the first syllable; never more than half the target), written in {TGT}.
- "similar": a hint naming a real, common {TGT} word that rhymes with or sounds like the target (or, for an expression, its key word), NOT a synonym and NOT related in meaning, e.g. "rima com \\"braço\\"", written in {TGT}.
- "lastSound": a hint with the ending of the target (or of its last word), e.g. "termina em \\"-azo\\"", written in {TGT}.

Rules: mix single words (about two thirds) and expressions. Vary difficulty, mostly 2. Prefer what people say in daily life over literary vocabulary. Each cue must have one clearly best answer in context, with the alternatives listed in "accept". Do not repeat cues from the list of cues already used."""

SOLVER = f"""You translate. For each numbered line you get a {SRC} sentence and an expression from it (the cue). Give the most natural {TGT} rendering of the cue as used in that sentence, in dictionary form (infinitive, singular, masculine, no article), plus up to three other renderings a careful native speaker would accept as equally correct there.
{PT_RULES}
Return JSON {{"answers": [{{"n": 1, "best": "...", "also": ["..."]}}, ...]}} covering every line."""

QA = f"""You review items for a translation-retrieval drill ({SRC} cue -> {TGT} answer).
{PT_RULES}
For each numbered item check:
1. the {SRC} sentence is natural and uses the cue;
2. the target is a correct, natural {TGT} rendering of the cue in that sentence, and the best or joint-best one;
3. every form in "accept" is also correct and natural there; remove any that is not, Brazilian, or an anglicism; add any clearly equivalent common rendering that is missing (also counting the blind translator's answers when they are correct);
4. "gapped" is natural {TGT}, has one blank, and the target fits it;
5. hints: "firstSound" and "lastSound" are correct for the target; "similar" names a real word that sounds like the target and is not a synonym;
6. "trap" is really a tempting wrong answer (or empty), and "note" is accurate.
Set ok false if 1, 2 or 4 fails, or if the item has no single clearly best answer. Otherwise ok true and put corrections in "fix" with the same keys (e.g. {{"accept": [...], "similar": "rima com \\"...\\"", "note": "..."}}).
Return JSON {{"reviews": [{{"n": 1, "ok": true, "problem": "", "fix": {{}}}}, ...]}} covering every item."""


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn").strip()


ART = r"^(to|the|a|an|o|a|os|as|um|uma|uns|umas) "


def norm(s: str) -> str:
    s = fold(s).strip(" .!?,;:\"'“”«»")
    s = re.sub(r"\s+", " ", s)
    return re.sub(ART, "", s)


def path(name: str):
    return WORK / f"a8.{LANG}.{name}.json"


def load(name: str, default):
    p = path(name)
    return json.loads(p.read_text()) if p.exists() else default


def save(name: str, data) -> None:
    path(name).write_text(json.dumps(data, ensure_ascii=False, indent=1))


def generate() -> list[dict]:
    gen = load("generated", {})
    jobs = [(cat, i) for cat in CATEGORIES[LANG] for i in range(CALLS) if f"{cat}:{i}" not in gen]

    def run(job):
        cat, i = job
        used = [x["cue"] for k, v in gen.items() if k.startswith(cat + ":") for x in v]
        user = f"Category: {cat}. Typical examples (use some, then go beyond them): {CATEGORIES[LANG][cat]}.\nWrite {PER_CALL} items.\nCues already used: {', '.join(used) or 'none'}."
        if i:
            user += "\nThis is a second batch: choose different cues from the examples above."
        out = chat_json(GEN, user, tag=f"a8-gen-{LANG}", effort="high")
        return f"{cat}:{i}", [dict(x, category=cat) for x in out.get("items", []) if isinstance(x, dict)]

    # second batches depend on the first, so run in two rounds
    for rnd in range(CALLS):
        todo = [j for j in jobs if j[1] == rnd]
        for key, items in pmap(run, todo, workers=6):
            gen[key] = items
        save("generated", gen)
    seen, out = set(), []
    for key in sorted(gen):
        for x in gen[key]:
            k = norm(x.get("cue", ""))
            if k and k not in seen:
                seen.add(k)
                out.append(x)
    return out


def code_checks(x: dict) -> list[str]:
    errs = []
    for k in ("cue", "context", "target", "gapped", "firstSound", "lastSound"):
        if not str(x.get(k, "")).strip():
            errs.append(f"missing {k}")
    if errs:
        return errs
    if fold(x["cue"]) not in fold(x["context"]):
        errs.append("cue not in context")
    if x["gapped"].count("___") != 1 or re.search(r"_{4,}", x["gapped"]):
        errs.append("gapped blank count")
    if norm(x["target"]) in norm(x["gapped"].replace("___", " ")).split(" ") and " " not in norm(x["target"]):
        errs.append("gapped leaks target")
    if LANG == "pt-PT" and norm(x["target"]) == norm(x["cue"]):
        errs.append("target equals cue")
    x["accept"] = [a for a in (x.get("accept") or []) if isinstance(a, str) and a.strip() and norm(a) != norm(x["target"])]
    return errs


def syllables(x: dict):
    t = x["target"].strip()
    if " " in t or "-" in t:
        return None, None
    if LANG == "pt-PT":
        from pt_syll import stress, syllabify
        w = t.lower()
        rule = syllabify(w)
        llm = str(x.get("syllables_split", "")).lower().split("-")
        if llm == rule and int(x.get("stress") or 0) == stress(w, rule):
            return len(rule), stress(w, rule)
        return None, None
    try:
        import pronouncing
        ph = pronouncing.phones_for_word(t.lower())
        if ph:
            st = pronouncing.stresses(ph[0])
            if "1" in st:
                return len(st), st.index("1") + 1
    except ImportError:
        pass
    return None, None


def cached(name: str, keys: list[str], fn, batch: int):
    cache = load(name, {})
    todo = [k for k in keys if k not in cache]
    batches = [todo[i : i + batch] for i in range(0, len(todo), batch)]
    for res in pmap(fn, batches, workers=8):
        cache.update(res)
    save(name, cache)
    return cache


def main() -> None:
    cands = generate()
    for x in cands:
        x["errors"] = code_checks(x)
    ok = [x for x in cands if not x["errors"]]
    print("generated", len(cands), "code checks kept", len(ok), Counter(e.split(" ")[0] + " " + e.split(" ")[1] for x in cands for e in x["errors"]).most_common(6))
    by = {norm(x["cue"]): x for x in ok}

    def solve(keys):
        lines = "\n".join(f'{i+1}. Sentence: {by[k]["context"]} | Cue: {by[k]["cue"]}' for i, k in enumerate(keys))
        out = chat_json(SOLVER, lines, tag=f"a8-solve-{LANG}", effort="high")
        res = {}
        for a in out.get("answers", []):
            try:
                i = int(a["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"best": str(a.get("best", "")), "also": [str(s) for s in a.get("also", []) or []]}
        return res

    sol = cached("solver", list(by), solve, 30)
    kept = []
    for k, x in by.items():
        s = sol.get(k)
        if not s:
            x["errors"] = ["no solver answer"]
            continue
        forms = {norm(x["target"]), *(norm(a) for a in x["accept"])}
        answers = [s["best"], *s["also"]]
        if not any(norm(a) in forms for a in answers):
            x["errors"] = [f"solver disagrees: {s['best']}"]
            continue
        x["solver"] = s
        kept.append(k)
    print("solver kept", len(kept), "of", len(by))

    def qa(keys):
        lines = "\n".join(
            f'{i+1}. ' + json.dumps({f: by[k].get(f) for f in ("cue", "context", "target", "accept", "gapped", "trap", "note", "firstSound", "similar", "lastSound")} | {"blind_translator": by[k]["solver"]}, ensure_ascii=False)
            for i, k in enumerate(keys)
        )
        out = chat_json(QA, lines, tag=f"a8-qa-{LANG}", effort="high")
        res = {}
        for r in out.get("reviews", []):
            try:
                i = int(r["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"ok": bool(r.get("ok")), "problem": str(r.get("problem", "")), "fix": r.get("fix") or {}}
        return res

    rev = cached("qa", kept, qa, 20)
    final = []
    for k in kept:
        x, r = by[k], rev.get(k)
        if not r or not r["ok"]:
            x["errors"] = [f"qa: {r['problem'] if r else 'no review'}"]
            continue
        for f, v in r["fix"].items():
            if f in ("accept", "similar", "firstSound", "lastSound", "note", "trap", "gapped") and v is not None:
                x[f] = v
        x["accept"] = [a for a in x.get("accept") or [] if isinstance(a, str) and a.strip() and norm(a) != norm(x["target"])]
        if x["gapped"].count("___") != 1:
            continue
        final.append(x)
    print("qa kept", len(final), "of", len(kept))

    # cap per category, keeping a spread of difficulty
    bycat: dict[str, list] = {}
    for x in sorted(final, key=lambda x: (x["category"], int(x.get("difficulty") or 2), norm(x["cue"]))):
        bycat.setdefault(x["category"], []).append(x)
    chosen = []
    for cat, xs in bycat.items():
        chosen += xs[: CAP] if len(xs) <= CAP else [xs[round(i * (len(xs) - 1) / (CAP - 1))] for i in range(CAP)]

    ids = load("ids", {})
    out = ROOT / "seed" / "items" / f"a8.{LANG}.json"
    retired = set()
    for old in json.loads(out.read_text()) if out.exists() else []:  # the committed file is the source of truth for ids
        ids.setdefault(f'{old["category"]}|{norm(old["cue"])}', old["id"])
        if old.get("retired"):
            retired.add(old["id"])
    n = max([int(v.rsplit("-", 1)[1]) for v in ids.values()] or [0])
    items = []
    for x in sorted(chosen, key=lambda x: (x["category"], norm(x["cue"]))):
        key = f'{x["category"]}|{norm(x["cue"])}'
        if key not in ids:
            n += 1
            ids[key] = f"a8-{LANG}-{n:04d}"
        syl, st = syllables(x)
        d = int(x.get("difficulty") or 2)
        items.append({
            "id": ids[key],
            "lang": LANG,
            "cue": x["cue"].strip(),
            "context": x["context"].strip(),
            "target": x["target"].strip(),
            "accept": x["accept"],
            "gapped": x["gapped"].strip(),
            "trap": (x.get("trap") or "").strip(),
            "note": (x.get("note") or "").strip(),
            "kind": x.get("kind") if x.get("kind") in ("word", "phrase", "idiom") else ("phrase" if " " in x["target"].strip() else "word"),
            "category": x["category"],
            "pos": x.get("pos") or None,
            "difficulty": d if d in (1, 2, 3) else 2,
            "hints": {k: v for k, v in {"syllables": syl, "stress": st, "firstSound": x["firstSound"], "similar": x.get("similar") or "", "lastSound": x["lastSound"]}.items() if v},
            "parallelSet": 0,
        } | ({"retired": True} if ids[key] in retired else {}))
    save("ids", ids)
    out.write_text(json.dumps(sorted(items, key=lambda x: x["id"]), ensure_ascii=False, indent=1) + "\n")
    print("wrote", len(items), "items to", out.relative_to(ROOT), Counter(x["category"] for x in items))


if __name__ == "__main__":
    main()
