"""Step 1 of A1: sample words per Zipf band from wordfreq and let the LLM keep good targets.

uv run --with wordfreq python seed/scripts/a1_candidates.py en|pt-PT
Writes seed/work/a1.<lang>.candidates.json: [{word, zipf, band, pos, conc, q}]
"""
import json
import random
import re
import sys

from wordfreq import top_n_list, zipf_frequency

from llm import WORK, chat_json, pmap

LANG = sys.argv[1]
VERBS_ONLY = len(sys.argv) > 2 and sys.argv[2] == "verbs"  # second pass: extra verbs only
WF = "en" if LANG == "en" else "pt"
WORD = re.compile(r"^[^\W\d_]+$")
# band -> (zipf lo, zipf hi, words to sample)
BANDS = {1: (4.5, 9, 700), 2: (3.5, 4.5, 1000), 3: (2.5, 3.5, 1300), 4: (1.9, 2.5, 1500)}
BATCH = 250


def band_of(z: float) -> int:
    return 1 if z >= 4.5 else 2 if z >= 3.5 else 3 if z >= 2.5 else 4


SYSTEM = {
    "en": """You select target words for a tip-of-the-tongue drill (definition -> word) for an educated adult native-level English speaker.
From the given list keep ONLY words that:
- are a common noun, verb or adjective in dictionary (lemma) form: singular noun, bare infinitive verb, positive-degree adjective (drop plurals, -ing/-ed/-s forms, comparatives, adverbs, function words);
- are standard English an educated adult knows and could produce (drop proper nouns, names, brands, abbreviations, foreign words, slang, offensive words, archaic or narrow technical jargon, misspellings);
- can be defined precisely enough that this word is the single best answer.
For each kept word output a string "word|pos|conc|q": pos is n, v or adj (its main use); conc is c (concrete) or a (abstract); q is 1-3, how uniquely a good definition could single it out over its synonyms (3 = clearly one best word, 1 = many near-synonyms).
Return JSON: {"keep": ["word|pos|conc|q", ...]}. Be strict: when in doubt, drop.""",
    "pt-PT": """Selecionas palavras-alvo para um exercício de "palavra na ponta da língua" (definição -> palavra) para um adulto culto falante nativo de português EUROPEU (Portugal).
Da lista dada mantém APENAS palavras que:
- sejam nome comum, verbo ou adjetivo na forma de dicionário (lema): nome no singular, verbo no infinitivo (-ar/-er/-ir/-or), adjetivo no masculino singular (descarta plurais, femininos flexionados, formas verbais conjugadas, gerúndios, particípios usados como verbo, advérbios, palavras gramaticais);
- sejam português europeu padrão, com a grafia de Portugal (Acordo Ortográfico de 1990, norma europeia: "facto", "receção", "económico", "género"). DESCARTA formas só brasileiras em grafia ou uso (ex.: "ônibus", "trem" no sentido de comboio, "tela" no sentido de ecrã, "celular", "econômico", "gênero", "banheiro", "geladeira", "xícara", "time" no sentido de equipa) e palavras que um português não usaria;
- sejam conhecidas por um adulto culto em Portugal (descarta nomes próprios, marcas, siglas, estrangeirismos, calão, palavras ofensivas, arcaísmos, jargão técnico estreito, erros ortográficos);
- possam ser definidas com precisão suficiente para que esta palavra seja a melhor resposta única.
Para cada palavra mantida devolve "palavra|pos|conc|q": pos é n (nome), v (verbo) ou adj; conc é c (concreto) ou a (abstrato); q de 1 a 3 = quão bem uma definição a distingue dos sinónimos (3 = claramente uma só palavra).
Devolve JSON: {"keep": ["palavra|pos|conc|q", ...]}. Sê rigoroso: na dúvida, descarta.""",
}


def main() -> None:
    rng = random.Random(20260924)
    pool = [w for w in top_n_list(WF, 400_000, wordlist="large") if WORD.match(w) and len(w) >= 3]
    zipf = {w: zipf_frequency(w, WF) for w in pool}
    batches = []
    out_path = WORK / f"a1.{LANG}.candidates.json"
    prev = json.loads(out_path.read_text()) if VERBS_ONLY else []
    prev_words = {k["word"] for k in prev}
    system = SYSTEM[LANG]
    if VERBS_ONLY:
        rng = random.Random(7)
        system += "\nThis pass: keep ONLY verbs (pos v); drop everything else." if LANG == "en" else "\nNesta passagem: mantém SÓ verbos no infinitivo (pos v); descarta o resto."
    for b, (lo, hi, n) in BANDS.items():
        ws = [w for w in pool if lo <= zipf[w] < hi and w not in prev_words]
        if VERBS_ONLY:
            if b == 1:
                continue
            if WF == "pt":
                ws = [w for w in ws if w.endswith(("ar", "er", "ir", "or"))]
            n = 1500
        pick = rng.sample(ws, min(n, len(ws)))
        for i in range(0, len(pick), BATCH):
            batches.append(pick[i : i + BATCH])

    def run(batch):
        out = chat_json(system, "Words:\n" + "\n".join(batch), tag=f"a1-cand-{LANG}")
        return out.get("keep", [])

    kept = list(prev)
    seen = set(prev_words)
    for res in pmap(run, batches):
        for s in res:
            parts = [p.strip() for p in str(s).split("|")]
            if len(parts) != 4:
                continue
            w, pos, conc, q = parts
            w = w.lower()
            if w in seen or w not in zipf or pos not in ("n", "v", "adj") or conc not in ("c", "a") or (VERBS_ONLY and pos != "v"):
                continue
            seen.add(w)
            z = zipf_frequency(w, WF)
            kept.append({"word": w, "zipf": round(z, 2), "band": band_of(z), "pos": {"n": "noun", "v": "verb", "adj": "adj"}[pos], "conc": "concrete" if conc == "c" else "abstract", "q": int(q) if q.isdigit() else 1})
    out_path.write_text(json.dumps(kept, ensure_ascii=False, indent=0))
    from collections import Counter
    print(LANG, len(kept), Counter((k["band"], k["pos"]) for k in kept))


if __name__ == "__main__":
    main()
