"""Step 4 of A1: pick the final balanced ~300 items, apply the hand review, assign benchmark sets, write seed/items.

python3 seed/scripts/a1_build.py en|pt-PT
Reads seed/work/a1.<lang>.validated.json and seed/scripts/a1_overrides.json (hand review: drops and fixes).
"""
import hashlib
import json
import re
import random
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parent / "work"
ITEMS = HERE.parent / "items"
LANG = sys.argv[1]
# final counts per (band, pos): bands 15/35/35/15 %, POS 50/25/25 %
QUOTA = {
    (1, "noun"): 22, (1, "verb"): 12, (1, "adj"): 11,
    (2, "noun"): 53, (2, "verb"): 26, (2, "adj"): 26,
    (3, "noun"): 53, (3, "verb"): 26, (3, "adj"): 26,
    (4, "noun"): 22, (4, "verb"): 11, (4, "adj"): 12,
}
# one benchmark set = these 10 (band, pos) slots; the 4 sets are filled slot by slot with items of close zipf
SLOTS = [(1, "noun"), (2, "noun"), (3, "noun"), (3, "noun"), (4, "noun"), (2, "verb"), (2, "verb"), (3, "verb"), (2, "adj"), (3, "adj")]
NEIGHBOUR = {1: [2], 2: [3, 1], 3: [2, 4], 4: [3]}


def sentence_case(s: str) -> str:
    s = re.sub(r"___ ([,.;:!?])", r"___\1", s.strip())
    s = s[:1].upper() + s[1:]
    return s if s.endswith((".", "!", "?")) else s + "."


def main() -> None:
    items = json.loads((WORK / f"a1.{LANG}.validated.json").read_text())
    ov = json.loads((HERE / "a1_overrides.json").read_text()).get(LANG, {})
    pool = []
    for x in items:
        o = ov.get(x["word"], {})
        if x["errors"] or "drop" in o:
            continue
        g = x["gen"]
        conc = g.get("concreteness") if g.get("concreteness") in ("concrete", "abstract") else x["conc"]
        acc = [x["word"]] + [a.lower() for a in g.get("accept", []) if isinstance(a, str) and a.strip() and " " not in a.strip()]
        item = {
            "id": "",
            "lang": LANG,
            "target": x["word"],
            "accept": list(dict.fromkeys(o.get("accept", acc))),
            "pos": x["pos"],
            "zipf": round(x["zipf"], 2),
            "band": x["band"],
            "concreteness": o.get("concreteness", conc),
            "definition": sentence_case(o.get("definition", g["definition"])),
            "example": sentence_case(o.get("example", g["example"])),
            "hints": {
                "syllables": o.get("syllables", x["syllables"]),
                "stress": o.get("stress", x["stress"]),
                "firstSound": o.get("firstSound", g["firstSound"]),
                "similar": o.get("similar", g["similar"]),
                "lastSound": o.get("lastSound", g["lastSound"]),
            },
            "parallelSet": 0,
            "validated": {"solverAnswer": x["solver"]["best"], "model": x["solver"].get("model", "deepseek-flash")},
        }
        assert item["example"].count("___") == 1, item
        assert 1 <= item["hints"]["stress"] <= item["hints"]["syllables"], item
        pool.append(item)

    rng = random.Random(2026)
    # stable order keyed by the word, so dropping one item in review changes only its own slot
    pool.sort(key=lambda i: hashlib.sha1(("2026" + i["target"]).encode()).hexdigest())
    by_cell: dict[tuple[int, str], list[dict]] = {}
    for it in pool:
        by_cell.setdefault((it["band"], it["pos"]), []).append(it)
    chosen: list[dict] = []
    short: Counter = Counter()
    for (b, p), q in QUOTA.items():
        cell = by_cell.get((b, p), [])
        conc = [i for i in cell if i["concreteness"] == "concrete"]
        abst = [i for i in cell if i["concreteness"] == "abstract"]
        picked = []
        while len(picked) < q and (conc or abst):
            for src in (conc, abst):
                if src and len(picked) < q:
                    picked.append(src.pop())
        by_cell[(b, p)] = conc + abst
        short[(b, p)] = q - len(picked)
        chosen += picked
    for (b, p), n in short.items():  # fill shortfalls from the neighbouring band, same POS
        for nb in NEIGHBOUR[b]:
            while n > 0 and by_cell.get((nb, p)):
                chosen.append(by_cell[(nb, p)].pop()); n -= 1
        if n:
            print("still short", b, p, n)

    # benchmark sets: per slot, take 4 items of equal concreteness nearest the cell's median zipf
    used = set()
    sets = {s: [] for s in range(1, 5)}
    for k, (b, p) in enumerate(SLOTS):
        cell = [i for i in chosen if i["band"] == b and i["pos"] == p and i["target"] not in used]
        want = "concrete" if k % 2 == 0 else "abstract"
        same = [i for i in cell if i["concreteness"] == want]
        cand = same if len(same) >= 4 else cell
        zs = sorted(i["zipf"] for i in cand)
        med = zs[len(zs) // 2]
        four = sorted(cand, key=lambda i: abs(i["zipf"] - med))[:4]
        rng.shuffle(four)
        for s, it in zip(range(1, 5), four):
            it["parallelSet"] = s
            used.add(it["target"])
            sets[s].append(it)

    order = {"noun": 0, "verb": 1, "adj": 2}
    chosen.sort(key=lambda i: (i["band"], order[i["pos"]], i["target"]))
    for n, it in enumerate(chosen, 1):
        it["id"] = f"a1-{LANG}-{n:04d}"
    ITEMS.mkdir(parents=True, exist_ok=True)
    (ITEMS / f"a1.{LANG}.json").write_text(json.dumps(chosen, ensure_ascii=False, indent=1) + "\n")
    print(LANG, len(chosen), "items; pool", len(pool))
    print(" band", sorted(Counter(i["band"] for i in chosen).items()), "pos", sorted(Counter(i["pos"] for i in chosen).items()), "conc", sorted(Counter(i["concreteness"] for i in chosen).items()))
    for s, its in sets.items():
        print(f" set {s}: mean zipf {sum(i['zipf'] for i in its)/len(its):.2f}", [i["target"] for i in its])


if __name__ == "__main__":
    main()
