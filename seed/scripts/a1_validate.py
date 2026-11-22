"""Step 3 of A1: code checks, syllable/stress checks, blind solver, then a QA pass that sees the target.

uv run --with wordfreq --with pronouncing python seed/scripts/a1_validate.py en|pt-PT
Reads  seed/work/a1.<lang>.generated.json
Writes seed/work/a1.<lang>.validated.json (every item with its verdicts; build step picks from the kept ones)
Each stage caches its LLM results in seed/work/ so a rerun does not pay twice.
"""
import json
import re
import sys
import unicodedata
from collections import Counter

from wordfreq import zipf_frequency

from llm import FAST, PRO, WORK, chat_json, pmap

LANG = sys.argv[1]
# reasoning effort for solver and QA: "high" (used for en) or "none" (used for pt-PT, to stay within budget)
EFFORT = sys.argv[2] if len(sys.argv) > 2 else "high"
WF = "en" if LANG == "en" else "pt"
SOLVER_BATCH = 30
QA_BATCH = 25


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def tokens(s: str) -> list[str]:
    return re.findall(r"[^\W\d_]+", fold(s))


def root_of(w: str) -> str:
    w = fold(w)
    if len(w) <= 4:
        return w
    return w[: max(4, math.ceil(len(w) * 0.6))]


import math  # noqa: E402


def leaks(text: str, target: str) -> bool:
    r = root_of(target)
    for t in tokens(text):
        if t == fold(target) or (len(r) >= 4 and t.startswith(r)) or (len(r) < 4 and t == r):
            return True
    return False


def quoted(s: str) -> str:
    m = re.findall(r"[\"“«]([^\"”»]+)[\"”»]", s or "")
    return m[0] if m else ""


def code_checks(x: dict) -> list[str]:
    g = x["gen"]
    t = x["word"]
    errs = []
    if g.get("skip"):
        return ["generator skipped"]
    for k in ("definition", "example", "firstSound", "similar", "lastSound", "syllables_split"):
        if not str(g.get(k, "")).strip():
            errs.append(f"missing {k}")
    if errs:
        return errs
    for k in ("firstSound", "similar", "lastSound"):  # normalise 'x' to "x"
        if '"' not in g[k]:
            g[k] = re.sub(r"'([^']+)'", r'"\1"', g[k])
    if g.get("pos") != x["pos"]:
        errs.append(f"pos changed to {g.get('pos')}")
    if leaks(g["definition"], t):
        errs.append("definition leaks target/root")
    if g["example"].count("___") != 1 or re.search(r"_{4,}", g["example"]):
        errs.append("example blank count")
    if leaks(g["example"].replace("___", " "), t):
        errs.append("example leaks target/root")
    sim = quoted(g["similar"])
    if not sim or " " in sim.strip():
        errs.append("similar not a single quoted word")
    elif fold(sim) == fold(t) or root_of(sim) == root_of(t) or zipf_frequency(sim, WF) < 1.5:
        errs.append(f"similar bad: {sim}")
    fs = quoted(g["firstSound"]).replace("-", "")
    if not fs or fold(t)[:1] != fold(fs)[:1] or len(fs) > max(4, math.ceil(len(t) * 0.55)):
        errs.append(f"firstSound bad: {fs}")
    ls = quoted(g["lastSound"]).replace("-", "")
    if not ls or len(ls) > max(5, math.ceil(len(t) * 0.6)):
        errs.append(f"lastSound bad: {ls}")
    if "".join(g["syllables_split"].split("-")).lower() != t and LANG != "en":
        errs.append("syllables_split does not spell the word")
    return errs


def en_syllables(x: dict):
    import pronouncing
    for w in [x["word"], *x["gen"].get("accept", [])]:
        ph = pronouncing.phones_for_word(w.lower())
        if ph:
            st = pronouncing.stresses(ph[0])
            if "1" in st:
                return len(st), st.index("1") + 1, "cmudict"
    parts = x["gen"]["syllables_split"].split("-")
    return len(parts), int(x["gen"].get("stress") or 0), "llm"


def pt_syllables(x: dict):
    from pt_syll import stress, syllabify
    rule = syllabify(x["word"])
    rs = stress(x["word"], rule)
    llm = x["gen"]["syllables_split"].lower().split("-")
    ls = int(x["gen"].get("stress") or 0)
    if [p for p in llm] == rule and ls == rs:
        return len(rule), rs, "rules+llm"
    return None, None, f"disagree rules={'-'.join(rule)}/{rs} llm={'-'.join(llm)}/{ls}"


SOLVER = {
    "en": """You are solving a word-finding puzzle. For each numbered clue (a definition plus an example sentence with a blank ___), give the single English word that best fits BOTH the definition and the blank, in the exact form the blank needs.
Then list in "equally_good" any OTHER single words that fit the definition and the blank just as well, so that a careful reader could not say your answer is more correct. Do not list words that are merely related, broader, narrower, less precise or less idiomatic. Leave the list empty when your answer is clearly the best.
Return JSON {"answers": [{"n": 1, "best": "word", "equally_good": []}, ...]} covering every clue.""",
    "pt-PT": """Estás a resolver um jogo de palavras em português europeu. Para cada pista numerada (uma definição e uma frase com uma lacuna ___), dá a única palavra portuguesa que melhor serve a definição E a lacuna, na forma exata que a lacuna pede.
Depois lista em "equally_good" OUTRAS palavras únicas que sirvam a definição e a lacuna igualmente bem, de modo que um leitor atento não pudesse dizer que a tua resposta é mais correta. Não listes palavras apenas relacionadas, mais gerais, mais específicas, menos precisas ou menos idiomáticas. Deixa a lista vazia quando a tua resposta é claramente a melhor.
Devolve JSON {"answers": [{"n": 1, "best": "palavra", "equally_good": []}, ...]} para todas as pistas.""",
}

QA = {
    "en": """You review items for an English definition-to-word drill (the learner sees the definition and the example; hints are revealed one by one). For each numbered item check:
1. the definition is accurate for the target and does not give the word away;
2. the example is natural, idiomatic English and the target fits the blank in exactly its given form;
3. "similar" names a real English word that genuinely rhymes with or sounds like the target, and is NOT a synonym, NOT related in meaning and NOT sharing the target's root;
4. "firstSound" and "lastSound" are correct for the target;
5. the target is a good, fair item for an educated adult (not offensive, not a proper noun, not an obscure variant).
If something small is wrong in 3 or 4, supply a corrected hint string in "fix" (same style, e.g. {"similar": "rhymes with \\"hurry\\""}). If 1, 2 or 5 fails, set ok false.
Return JSON {"reviews": [{"n": 1, "ok": true, "problem": "", "fix": {}}, ...]} covering every item.""",
    "pt-PT": """Revês itens de um exercício definição -> palavra em PORTUGUÊS EUROPEU (Portugal). O aprendente vê a definição e o exemplo; as pistas são reveladas uma a uma. Para cada item numerado verifica:
1. a palavra-alvo é português europeu corrente e está na grafia de Portugal pós-Acordo de 1990 (ex. "facto", "receção", "ótimo", "económico", "género"); rejeita formas ou sentidos só brasileiros e grafias pré-Acordo (ex. "direcção", "acção");
2. a definição e o exemplo estão em português europeu natural (sem brasileirismos: "estou a fazer" e não "estou fazendo", "registo" e não "registro", "equipa" e não "time", "ecrã" e não "tela"), a definição é correta e não denuncia a palavra, e a palavra-alvo entra na lacuna exatamente na forma dada;
3. "similar" é uma palavra portuguesa real que rima ou soa parecido com o alvo e NÃO é sinónimo, NÃO tem sentido relacionado e NÃO partilha a raiz;
4. "firstSound" e "lastSound" estão corretos para o alvo;
5. a divisão silábica "syllables" (divisão gramatical como no Priberam: his-tó-ri-a, i-dei-a, ca-ir, ra-i-nha) e a sílaba tónica "stress" (índice a contar de 1) estão corretas;
6. o alvo é um item justo para um adulto culto (não ofensivo, não nome próprio, não variante obscura).
Se falhar só 3, 4 ou 5, dá a correção em "fix" (mesmo estilo, ex. {"similar": "rima com \\"...\\"", "syllables": "his-tó-ri-a", "stress": 2}). Se falhar 1, 2 ou 6, ok = false.
Devolve JSON {"reviews": [{"n": 1, "ok": true, "problem": "", "fix": {}}, ...]} para todos os itens.""",
}


def norm_answer(s: str) -> str:
    s = fold(str(s)).strip().strip(".").strip()
    s = re.sub(r"^(to|the|a|an|o|a|os|as|um|uma) ", "", s)
    return s


def cached(name: str, keyed: dict, fn, batch: int, tag: str, effort: str):
    path = WORK / f"a1.{LANG}.{name}.json"
    cache = json.loads(path.read_text()) if path.exists() else {}
    todo = [k for k in keyed if k not in cache]
    batches = [todo[i : i + batch] for i in range(0, len(todo), batch)]

    def run(keys):
        return keys, fn(keys, effort, tag)

    for keys, res in pmap(run, batches, workers=8):
        cache.update(res)
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    return cache


def main() -> None:
    items = json.loads((WORK / f"a1.{LANG}.generated.json").read_text())
    # dedupe targets
    seen, uniq = set(), []
    for x in items:
        if x["word"] not in seen:
            seen.add(x["word"]); uniq.append(x)
    items = uniq
    byw = {x["word"]: x for x in items}
    for x in items:
        x["errors"] = code_checks(x)
        if not x["errors"]:
            n, st, src = (en_syllables if LANG == "en" else pt_syllables)(x)
            x["syllables"], x["stress"], x["syllSource"] = n, st, src
    stage1 = [x for x in items if not x["errors"]]
    print("code checks: kept", len(stage1), "of", len(items), Counter(e.split(":")[0] for x in items for e in x["errors"]).most_common(8))

    # blind solver
    def solve(keys, effort, tag):
        clues = "\n".join(f'{i+1}. Definition: {byw[k]["gen"]["definition"]} | Example: {byw[k]["gen"]["example"]}' for i, k in enumerate(keys))
        out = chat_json(SOLVER[LANG], clues, tag=tag, effort=effort)
        res = {}
        for a in out.get("answers", []):
            try:
                i = int(a["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"best": str(a.get("best", "")), "equally_good": [str(e) for e in a.get("equally_good", []) or []], "model": FAST}
        return res

    sol = cached("solver", {x["word"]: 1 for x in stage1}, solve, SOLVER_BATCH, f"a1-solve-{LANG}", EFFORT)
    stage2 = []
    for x in stage1:
        s = sol.get(x["word"])
        if not s:
            x["errors"].append("solver: no answer"); continue
        ok_forms = {norm_answer(a) for a in [x["word"], *x["gen"].get("accept", [])]}
        x["solver"] = s
        if norm_answer(s["best"]) not in ok_forms:
            x["errors"].append(f"solver: answered {s['best']}")
        elif any(norm_answer(e) not in ok_forms for e in s["equally_good"]):
            x["errors"].append(f"solver: alternatives {s['equally_good']}")
        else:
            stage2.append(x)
    print("solver: kept", len(stage2), "of", len(stage1))

    # QA with the target visible (PT also gets the syllable disagreements resolved here)
    def qa(keys, effort, tag):
        lines = []
        for i, k in enumerate(keys):
            g = byw[k]["gen"]
            d = {"n": i + 1, "target": k, "pos": byw[k]["pos"], "definition": g["definition"], "example": g["example"], "firstSound": g["firstSound"], "similar": g["similar"], "lastSound": g["lastSound"]}
            if LANG != "en":
                d["syllables"] = g["syllables_split"]; d["stress"] = g.get("stress")
            lines.append(json.dumps(d, ensure_ascii=False))
        out = chat_json(QA[LANG], "\n".join(lines), tag=tag, effort=effort)
        res = {}
        for r in out.get("reviews", []):
            try:
                i = int(r["n"]) - 1
            except (KeyError, ValueError, TypeError):
                continue
            if 0 <= i < len(keys):
                res[keys[i]] = {"ok": bool(r.get("ok")), "problem": str(r.get("problem", "")), "fix": r.get("fix") or {}}
        return res

    rev = cached("qa", {x["word"]: 1 for x in stage2}, qa, QA_BATCH, f"a1-qa-{LANG}", EFFORT)
    kept = 0
    for x in stage2:
        r = rev.get(x["word"])
        if not r:
            x["errors"].append("qa: no review"); continue
        x["qa"] = r
        if not r["ok"]:
            x["errors"].append(f"qa: {r['problem']}"); continue
        fix = r["fix"] if isinstance(r["fix"], dict) else {}
        for k in ("firstSound", "similar", "lastSound"):
            if isinstance(fix.get(k), str) and fix[k].strip():
                x["gen"][k] = fix[k]
        if LANG != "en":
            from pt_syll import stress, syllabify
            rule = syllabify(x["word"]); rs = stress(x["word"], rule)
            fs = str(fix.get("syllables") or x["gen"]["syllables_split"]).lower().split("-")
            fst = int(fix.get("stress") or x["gen"].get("stress") or 0)
            if fs == rule and fst == rs:
                x["syllables"], x["stress"], x["syllSource"] = len(rule), rs, "rules+qa"
            elif x.get("syllables") is None:
                x["errors"].append(f"syllables unresolved: {x['syllSource']} qa={'-'.join(fs)}/{fst}"); continue
        # re-run hint code checks after fixes
        errs = [e for e in code_checks(x) if e.startswith(("similar", "firstSound", "lastSound"))]
        if errs:
            x["errors"] += errs; continue
        kept += 1
    print("qa: kept", kept, "of", len(stage2))
    (WORK / f"a1.{LANG}.validated.json").write_text(json.dumps(items, ensure_ascii=False, indent=1))
    for x in items:
        x["effort"] = EFFORT
    print("reject reasons:", Counter(e.split(":")[0] for x in items for e in x["errors"]).most_common())


if __name__ == "__main__":
    main()
