"""Step 2 of A1: pick balanced candidates and have the LLM write definition, example and hints.

uv run --with wordfreq python seed/scripts/a1_generate.py en|pt-PT
Reads  seed/work/a1.<lang>.candidates.json
Writes seed/work/a1.<lang>.generated.json
"""
import json
import math
import random
import sys
from collections import Counter

from llm import WORK, chat_json, pmap

LANG = sys.argv[1]
FINAL = 300
BAND_SHARE = {1: 0.15, 2: 0.35, 3: 0.35, 4: 0.15}
POS_SHARE = {"noun": 0.5, "verb": 0.25, "adj": 0.25}
OVERSAMPLE = 1.9  # solver and QA rejects
BATCH = 20

SYSTEM = {
    "en": """You write items for a tip-of-the-tongue drill: the learner (an educated adult) reads a definition and an example sentence with a blank, and must produce ONE English word.
For each target word return an object with:
- "word": the target exactly as given.
- "skip": true if the word is a poor target (proper-noun-like, offensive, too obscure, not really a single standard word, or impossible to define so that it is the single best answer); otherwise false. When skip is true you may leave the other fields empty.
- "pos": noun, verb or adj (the sense you define).
- "concreteness": "concrete" or "abstract" for that sense.
- "definition": a precise dictionary-style definition of that sense, max 25 words, written so that THIS word is the one best answer and its near-synonyms are excluded (add the distinguishing feature: degree, manner, purpose, register, typical context). It must NOT contain the target, any inflection of it, or any word sharing its root. No meta-phrases like "a word for".
- "example": one natural sentence with exactly one blank written as ___ (three underscores) where the target fits in EXACTLY its given form (verbs: bare infinitive, so use frames like "to ___", "will ___", "didn't ___", "can ___"; nouns: singular; adjectives: base form). The sentence must not contain the target or its root, and should add context that helps single out the target.
- "accept": list of exact spellings graded correct: the target plus standard spelling variants only (US/UK, hyphenation). Never synonyms.
- "syllables_split": the word split into syllables with hyphens, e.g. "e-phem-er-al".
- "stress": 1-based index of the syllable with primary stress.
- "firstSound": a hint giving the first sound, e.g. "starts with \\"ep-\\"" (first letter plus at most the first syllable; never more than half the word).
- "similar": a hint naming a real, common English word that rhymes with or sounds like the target (shares its rhythm/ending or opening) but is NOT a synonym, NOT related in meaning, NOT sharing its root, e.g. "sounds a little like \\"federal\\"" or "rhymes with \\"...\\"".
- "lastSound": a hint with the ending, e.g. "ends in \\"-al\\"" (at most the last syllable).
Return JSON {"items": [ ... ]} in the same order as the input.""",
    "pt-PT": """Escreves itens para um exercício de "palavra na ponta da língua": o aprendente (adulto culto, português de Portugal) lê uma definição e uma frase de exemplo com uma lacuna, e tem de produzir UMA palavra em português europeu.
Escreve TUDO em português europeu (norma de Portugal, grafia do Acordo Ortográfico de 1990 tal como aplicado em Portugal: "facto", "receção", "ótimo", "económico", "género", "equipa", "ecrã", "autocarro", "telemóvel", "comboio", "casa de banho", "frigorífico"). Nunca uses formas, grafias ou construções brasileiras (nada de "você" genérico, gerúndio progressivo "estou fazendo" -> usa "estou a fazer", nada de "ônibus", "tela", "celular", "trem", "time", "registro" -> "registo", "econômico").
Para cada palavra-alvo devolve um objeto com:
- "word": a palavra exatamente como dada.
- "skip": true se a palavra for um mau alvo (nome próprio, ofensiva, demasiado obscura, forma brasileira ou pré-Acordo, não é uma palavra padrão, ou impossível de definir de forma a ser a única melhor resposta); senão false. Com skip true podes deixar os outros campos vazios.
- "pos": noun, verb ou adj (o sentido que defines).
- "concreteness": "concrete" ou "abstract" para esse sentido.
- "definition": definição precisa, estilo dicionário, no máximo 25 palavras, escrita para que ESTA palavra seja a única melhor resposta e os quase-sinónimos fiquem excluídos (acrescenta o traço distintivo: grau, modo, finalidade, registo, contexto típico). NÃO pode conter a palavra-alvo, flexões dela, nem palavras da mesma raiz. Sem meta-frases como "palavra que significa".
- "example": uma frase natural com exatamente uma lacuna escrita ___ (três underscores) onde a palavra-alvo entra EXATAMENTE na forma dada (verbos: infinitivo, usa estruturas como "vai ___", "é preciso ___", "tentou ___", "acabou por ___"; nomes no singular; adjetivos no masculino singular a concordar com um nome masculino singular). A frase não pode conter a palavra-alvo nem a sua raiz e deve dar contexto que ajude a distingui-la.
- "accept": lista de grafias exatas aceites: a palavra-alvo e só variantes ortográficas válidas em Portugal (ex. "carácter"/"caráter"). Nunca sinónimos.
- "syllables_split": divisão silábica gramatical com hífenes, como no Priberam: "his-tó-ri-a", "i-dei-a", "pai-xão", "car-ro".
- "stress": índice (a contar de 1) da sílaba tónica nessa divisão.
- "firstSound": pista com o som inicial, ex. "começa por \\"ep-\\"" (primeira letra e no máximo a primeira sílaba; nunca mais de metade da palavra).
- "similar": pista com uma palavra portuguesa real e comum que rima ou soa parecido (mesmo ritmo, terminação ou início) mas NÃO é sinónimo, NÃO tem sentido relacionado e NÃO partilha a raiz, ex. "soa um pouco como \\"federal\\"" ou "rima com \\"...\\"".
- "lastSound": pista com a terminação, ex. "termina em \\"-al\\"" (no máximo a última sílaba).
Devolve JSON {"items": [ ... ]} pela mesma ordem da entrada.""",
}


def quotas() -> dict[tuple[int, str], int]:
    return {(b, p): math.ceil(FINAL * bs * ps * OVERSAMPLE) for b, bs in BAND_SHARE.items() for p, ps in POS_SHARE.items()}


def select(cands: list[dict]) -> list[dict]:
    rng = random.Random(42)
    chosen = []
    for (b, p), q in quotas().items():
        pool = [c for c in cands if c["band"] == b and c["pos"] == p]
        rng.shuffle(pool)
        pool.sort(key=lambda c: -c["q"])  # stable: q3 first, random within q
        # alternate concrete/abstract for nouns and adjectives so both are represented
        conc = [c for c in pool if c["conc"] == "concrete"]
        abst = [c for c in pool if c["conc"] == "abstract"]
        picked = []
        while len(picked) < q and (conc or abst):
            for src in (conc, abst):
                if src and len(picked) < q:
                    picked.append(src.pop(0))
        chosen += picked
    return chosen


def main() -> None:
    cands = json.loads((WORK / f"a1.{LANG}.candidates.json").read_text())
    chosen = select(cands)
    print(LANG, "chosen", len(chosen), Counter((c["band"], c["pos"]) for c in chosen))
    batches = [chosen[i : i + BATCH] for i in range(0, len(chosen), BATCH)]

    def run(batch):
        lines = [f'{c["word"]} ({c["pos"]})' for c in batch]
        out = chat_json(SYSTEM[LANG], "Target words (with the intended part of speech):\n" + "\n".join(lines), tag=f"a1-gen-{LANG}", effort="high")
        items = out.get("items", [])
        res = []
        by_word = {str(it.get("word", "")).lower(): it for it in items if isinstance(it, dict)}
        for c in batch:
            it = by_word.get(c["word"])
            if it:
                res.append({**c, "gen": it})
        return res

    gen = [x for r in pmap(run, batches, workers=8) for x in r]
    (WORK / f"a1.{LANG}.generated.json").write_text(json.dumps(gen, ensure_ascii=False, indent=1))
    print(LANG, "generated", len(gen), "skipped", sum(1 for g in gen if g["gen"].get("skip")))


if __name__ == "__main__":
    main()
