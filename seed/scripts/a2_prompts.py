"""Write content/prompts/a2.json: fluency-sprint prompts (A2) for en and pt-PT.

python3 seed/scripts/a2_prompts.py
Categories are hand-written. Letter difficulty follows how many of the top 20,000 wordfreq words
start with the letter (checked 2026-09-24):
  en: s 2090, c 1938, p 1486, b 1119 | m 1037, d 1149, t 965, f 834 | h 698, l 653, g 547, w 530
  pt: c 2417, a 2009, p 1833, d 1291 | m 1173, s 1247, r 1073, t 930 | f 881, b 716, l 634, v 606
Very unproductive letters (q, x, y, z, k, j, u...) are left out.
Benchmark sets 1-4: each gets one difficulty-2 "things at a place" category and one difficulty-2 letter.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "content" / "prompts" / "a2.json"

# (slug, prompt, difficulty, parallelSet)
SEM = {
    "en": [
        ("animals", "animals", 1, 0), ("fruit", "fruit", 1, 0), ("kitchen", "things in a kitchen", 1, 0), ("clothing", "clothing", 1, 0),
        ("jobs", "jobs and professions", 1, 0), ("sports", "sports", 1, 0), ("countries", "countries", 1, 0), ("transport", "means of transport", 1, 0),
        ("body", "parts of the body", 1, 0), ("tools", "tools", 1, 0),
        ("office", "things in an office", 2, 1), ("hospital", "things in a hospital", 2, 2), ("workshop", "things in a workshop", 2, 3), ("airport", "things at an airport", 2, 4),
        ("data-center", "things in a data center", 2, 0), ("movement-verbs", "verbs of movement", 2, 0), ("speaking-verbs", "verbs of speaking", 2, 0),
        ("emotions", "emotions", 2, 0), ("weather", "kinds of weather", 2, 0), ("cooking", "ways of cooking food", 2, 0), ("birds", "birds", 2, 0),
        ("regret", "emotions of regret", 3, 0), ("leader", "qualities of a good leader", 3, 0), ("mistakes", "words for mistakes and failures", 3, 0),
        ("project-failure", "reasons a project fails", 3, 0), ("flaws", "flaws of character", 3, 0), ("uncertainty", "words for uncertainty and doubt", 3, 0),
        ("thinking-verbs", "verbs of thinking and reasoning", 3, 0), ("change", "words for change", 3, 0), ("risk", "kinds of risk", 3, 0), ("trust", "words for trust and reliability", 3, 0),
    ],
    "pt-PT": [
        ("animais", "animais", 1, 0), ("fruta", "fruta", 1, 0), ("cozinha", "coisas numa cozinha", 1, 0), ("roupa", "roupa e calçado", 1, 0),
        ("profissoes", "profissões", 1, 0), ("desportos", "desportos", 1, 0), ("paises", "países", 1, 0), ("transportes", "meios de transporte", 1, 0),
        ("corpo", "partes do corpo", 1, 0), ("ferramentas", "ferramentas", 1, 0),
        ("escritorio", "coisas num escritório", 2, 1), ("hospital", "coisas num hospital", 2, 2), ("oficina", "coisas numa oficina", 2, 3), ("aeroporto", "coisas num aeroporto", 2, 4),
        ("centro-de-dados", "coisas num centro de dados", 2, 0), ("verbos-movimento", "verbos de movimento", 2, 0), ("verbos-dizer", "verbos de dizer e falar", 2, 0),
        ("emocoes", "emoções", 2, 0), ("tempo", "estados do tempo (meteorologia)", 2, 0), ("cozinhar", "formas de cozinhar", 2, 0), ("aves", "aves", 2, 0),
        ("arrependimento", "emoções de arrependimento", 3, 0), ("lider", "qualidades de um bom líder", 3, 0), ("erros", "palavras para erros e falhas", 3, 0),
        ("projeto-falha", "razões por que um projeto falha", 3, 0), ("defeitos", "defeitos de carácter", 3, 0), ("incerteza", "palavras para incerteza e dúvida", 3, 0),
        ("verbos-pensar", "verbos de pensar e raciocinar", 3, 0), ("mudanca", "palavras para mudança", 3, 0), ("risco", "tipos de risco", 3, 0), ("confianca", "palavras para confiança e fiabilidade", 3, 0),
    ],
}
LET = {
    "en": [("s", 1, 0), ("c", 1, 0), ("p", 1, 0), ("b", 1, 0), ("m", 2, 1), ("d", 2, 2), ("t", 2, 3), ("f", 2, 4), ("h", 3, 0), ("l", 3, 0), ("g", 3, 0), ("w", 3, 0)],
    "pt-PT": [("c", 1, 0), ("a", 1, 0), ("p", 1, 0), ("d", 1, 0), ("m", 2, 1), ("s", 2, 2), ("r", 2, 3), ("t", 2, 4), ("f", 3, 0), ("b", 3, 0), ("l", 3, 0), ("v", 3, 0)],
}


def main() -> None:
    out = []
    for lang in ("en", "pt-PT"):
        for slug, prompt, d, ps in SEM[lang]:
            out.append({"id": f"a2-{lang}-sem-{slug}", "lang": lang, "kind": "semantic", "prompt": prompt, "difficulty": d, "parallelSet": ps})
        for letter, d, ps in LET[lang]:
            out.append({"id": f"a2-{lang}-let-{letter}", "lang": lang, "kind": "letter", "prompt": letter, "difficulty": d, "parallelSet": ps})
    ids = [o["id"] for o in out]
    assert len(ids) == len(set(ids))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(len(out), "prompts ->", OUT)


if __name__ == "__main__":
    main()
