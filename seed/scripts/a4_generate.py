"""A4 synonym-ladder items: sentences containing a flat word, balanced by register and difficulty.

uv run python seed/scripts/a4_generate.py        (writes seed/items/a4.en.json and seed/items/a4.pt-PT.json)
Assignments (flat word, register, difficulty) are made in code; the LLM writes one sentence per assignment.
"""
import json
import random
import re
import unicodedata
from pathlib import Path

from llm import WORK, chat_json, pmap

ITEMS = Path(__file__).resolve().parents[1] / "items"
REGISTERS = ["formal-email", "casual-chat", "incident-report", "design-doc", "stakeholder-update", "everyday"]
N_GEN = 84  # generated per language; 60 kept
N_KEEP = 60
FLAT = {
    "en": ["important", "said", "good", "big", "problem", "do", "get", "thing", "bad", "nice", "make", "change", "issue", "show", "use", "help", "look", "put", "interesting", "small", "hard", "fix", "think", "great", "go", "take", "really", "stuff"],
    "pt-PT": ["importante", "disse", "bom", "fazer", "coisa", "grande", "problema", "ter", "dar", "pôr", "mau", "ver", "ficar", "interessante", "mudar", "falar", "ajudar", "questão", "pequeno", "difícil", "bonito", "melhorar", "tratar", "usar", "mostrar", "achar", "muito", "situação"],
}
DIFF = {
    1: "difficulty 1: the flat word has several clearly better, common alternatives; plain context.",
    2: "difficulty 2: the best alternative depends on a specific detail in the sentence (degree, cause, audience).",
    3: "difficulty 3: subtle distinctions between close alternatives, or a tight register constraint (e.g. must stay formal and neutral, or casual without sounding stiff).",
}
SYSTEM = {
    "en": """You write items for a vocabulary precision drill. The learner sees a sentence containing a flat, overused word and must propose 5 more precise alternatives, then pick the best one for the context.
For each numbered assignment write ONE natural English sentence (12-35 words) in the given register that uses the given flat word EXACTLY as written (same form, lower case unless sentence-initial), once. The context must contain enough concrete detail for a clearly more precise word to exist. Registers: formal-email, casual-chat (text-message style), incident-report, design-doc, stakeholder-update, everyday (daily life). Work contexts are software, operations, product and management; keep them generic and free of real company or person names.
Return JSON {"items": [{"n": 1, "sentence": "..."}, ...]}.""",
    "pt-PT": """Escreves itens para um exercício de precisão de vocabulário. O aprendente vê uma frase com uma palavra vaga e gasta e tem de propor 5 alternativas mais precisas, e depois escolher a melhor para o contexto.
Para cada tarefa numerada escreve UMA frase natural em PORTUGUÊS EUROPEU (Portugal; grafia pós-Acordo de 1990 como aplicada em Portugal; "estou a fazer", nunca "estou fazendo"; "equipa", "ecrã", "registo", "utilizador", "ficheiro", "telemóvel"; tratamento formal com "o senhor/a Dra./V. Exa." ou sem sujeito, nunca "você" genérico) com 12 a 35 palavras, no registo indicado, que use a palavra vaga EXATAMENTE como escrita (mesma forma, minúsculas salvo início de frase), uma vez. O contexto deve ter detalhe concreto suficiente para existir uma palavra claramente mais precisa. Registos: formal-email, casual-chat (estilo mensagem), incident-report (relatório de incidente), design-doc, stakeholder-update (ponto de situação para a direção ou cliente), everyday (dia a dia). Contextos de trabalho: software, operações, produto e gestão; genéricos, sem nomes reais de empresas ou pessoas.
Devolve JSON {"items": [{"n": 1, "sentence": "..."}, ...]}.""",
}


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def assignments(lang: str):
    rng = random.Random(11 if lang == "en" else 12)
    flats = FLAT[lang] * 4
    rng.shuffle(flats)
    out = []
    for i in range(N_GEN):
        out.append({"target": flats[i], "register": REGISTERS[i % len(REGISTERS)], "difficulty": [1, 2, 2, 3][i % 4] if i % 7 else 1 + (i % 3)})
    return out


def gen(lang: str):
    asg = assignments(lang)
    batches = [asg[i : i + 21] for i in range(0, len(asg), 21)]

    def run(batch):
        lines = [f'{j+1}. flat word: "{a["target"]}" | register: {a["register"]} | {DIFF[a["difficulty"]]}' for j, a in enumerate(batch)]
        out = chat_json(SYSTEM[lang], "\n".join(lines), tag=f"a4-gen-{lang}", effort="none")
        res = {}
        for it in out.get("items", []):
            try:
                res[int(it["n"]) - 1] = str(it["sentence"]).strip()
            except (KeyError, ValueError, TypeError):
                pass
        return [{**a, "sentence": res.get(j, "")} for j, a in enumerate(batch)]

    rows = [r for b in pmap(run, batches) for r in b]
    (WORK / f"a4.{lang}.generated.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    return rows


def select(lang: str, rows: list[dict]):
    ok, seen = [], set()
    for r in rows:
        s = r["sentence"]
        hits = re.findall(r"(?<![^\W\d_])" + re.escape(r["target"]) + r"(?![^\W\d_])", s, flags=re.IGNORECASE)
        if len(hits) != 1 or fold(s) in seen or not (8 <= len(s.split()) <= 40):
            continue
        seen.add(fold(s))
        ok.append(r)
    rng = random.Random(5)
    # parallel sets 1-4: one item of each difficulty per set, registers rotated
    chosen, used = [], set()
    for ps in range(1, 5):
        for d in (1, 2, 3):
            pool = [r for i, r in enumerate(ok) if i not in used and r["difficulty"] == d and r["register"] == REGISTERS[(ps + d) % len(REGISTERS)]]
            pool = pool or [r for i, r in enumerate(ok) if i not in used and r["difficulty"] == d]
            r = pool[0]
            used.add(ok.index(r))
            chosen.append({**r, "parallelSet": ps})
    rest = [r for i, r in enumerate(ok) if i not in used]
    rng.shuffle(rest)
    chosen += [{**r, "parallelSet": 0} for r in rest[: N_KEEP - len(chosen)]]
    chosen.sort(key=lambda r: (r["parallelSet"] == 0, r["parallelSet"], r["difficulty"], r["register"]))
    items = [{"id": f"a4-{lang}-{i+1:04d}", "lang": lang, "sentence": r["sentence"], "target": r["target"], "register": r["register"], "difficulty": r["difficulty"], "parallelSet": r["parallelSet"]} for i, r in enumerate(chosen)]
    return items, len(ok)


def main():
    for lang in ("en", "pt-PT"):
        path = WORK / f"a4.{lang}.generated.json"
        rows = json.loads(path.read_text()) if path.exists() else gen(lang)
        # hand review: drop or fix rows by index (see a4_overrides.json)
        ov = json.loads((Path(__file__).parent / "a4_overrides.json").read_text()).get(lang, {})
        fixed = []
        for i, r in enumerate(rows):
            o = ov.get(str(i), {})
            if "drop" in o:
                continue
            fixed.append({**r, "sentence": o.get("sentence", r["sentence"]), "target": o.get("target", r["target"])})
        rows = fixed
        items, n_ok = select(lang, rows)
        ITEMS.mkdir(parents=True, exist_ok=True)
        (ITEMS / f"a4.{lang}.json").write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n")
        print(lang, "generated", len(rows), "passed checks", n_ok, "kept", len(items))


if __name__ == "__main__":
    main()
