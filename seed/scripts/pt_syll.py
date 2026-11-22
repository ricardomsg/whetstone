"""Rule-based grammatical syllabification and stress for European Portuguese (Priberam-style division).

Used only to cross-check the LLM: disagreements go to a second opinion or the item is dropped.
Conventions: rising vowel sequences are hiatus (his-tó-ri-a), falling diphthongs stay together (pai-xão),
i/u before nh or before l/m/n/r/z closing the syllable are hiatus (ra-i-nha, ca-ir, ju-iz).
"""
VOW = set("aeiouáéíóúâêôãõàü")
ACUTE_CIRC = set("áéíóúâêô")
TILDE = set("ãõ")
ONSET2 = {a + b for a in "pbtdcgfv" for b in "lr"}
FALLING = {"ai", "ei", "oi", "ui", "au", "eu", "iu", "ou", "éi", "ói", "éu", "ão", "ãe", "õe", "ãi", "âi", "êi", "ôi"}


def units(w: str) -> list[str]:
    out, i = [], 0
    while i < len(w):
        two = w[i : i + 2]
        if two in ("ch", "lh", "nh"):
            out.append(two); i += 2; continue
        if two in ("qu", "gu") and i + 2 < len(w) and w[i + 2] in VOW:
            out.append(two); i += 2; continue  # u is silent or a glide in the onset
        out.append(w[i]); i += 1
    return out


def is_v(u: str) -> bool:
    return len(u) == 1 and u in VOW


def syllabify(word: str) -> list[str]:
    w = word.lower()
    us = units(w)
    n = len(us)
    # nucleus boundaries: indexes where a new syllable nucleus starts
    nuclei = []  # list of (start, end) unit index ranges of vowel nuclei
    i = 0
    while i < n:
        if not is_v(us[i]):
            i += 1; continue
        j = i + 1
        if j < n and is_v(us[j]) and (us[i] + us[j]) in FALLING:
            nxt = us[j + 1] if j + 1 < n else ""
            nxt2 = us[j + 2] if j + 2 < n else ""
            glide_hiatus = us[j] in "iu" and (nxt == "nh" or (nxt in ("l", "m", "n", "r", "z") and (nxt2 == "" or not is_v(nxt2)) and not (nxt in ("m", "n") and nxt2 and nxt2 not in VOW and us[i] == "a" and us[j] == "i")))
            # 'ainda', 'cãibra' keep the diphthong; 'cair', 'juiz', 'ruim', 'rainha' do not
            if not glide_hiatus:
                j += 1
        nuclei.append((i, j))
        i = j
    if not nuclei:
        return [word]
    sylls = []
    start = 0
    for k, (a, b) in enumerate(nuclei):
        if k + 1 == len(nuclei):
            sylls.append("".join(us[start:]))
            break
        c0, c1 = b, nuclei[k + 1][0]  # consonant units between nuclei
        cons = us[c0:c1]
        if len(cons) <= 1:
            cut = c0
        elif len(cons) >= 2 and (cons[-2] + cons[-1]) in ONSET2:
            cut = c1 - 2
        else:
            cut = c1 - 1
        sylls.append("".join(us[start:cut]))
        start = cut
    return sylls


def stress(word: str, sylls: list[str] | None = None) -> int:
    """1-based index of the stressed syllable."""
    sylls = sylls or syllabify(word)
    n = len(sylls)
    if n == 1:
        return 1
    for idx, s in enumerate(sylls):
        if any(ch in ACUTE_CIRC for ch in s):
            return idx + 1
    for idx, s in enumerate(sylls):
        if any(ch in TILDE for ch in s):
            return idx + 1
    w = word.lower()
    if w.endswith(("a", "e", "o", "as", "es", "os", "am", "em", "ens")):
        return n - 1
    return n


if __name__ == "__main__":
    tests = {
        "história": ("his-tó-ri-a", 2), "rainha": ("ra-i-nha", 2), "cair": ("ca-ir", 2), "juiz": ("ju-iz", 2),
        "ideia": ("i-dei-a", 2), "paixão": ("pai-xão", 2), "carro": ("car-ro", 1), "nascer": ("nas-cer", 2),
        "problema": ("pro-ble-ma", 2), "quando": ("quan-do", 1), "guerra": ("guer-ra", 1), "telemóvel": ("te-le-mó-vel", 3),
        "ecrã": ("e-crã", 2), "autocarro": ("au-to-car-ro", 3), "facto": ("fac-to", 1), "coração": ("co-ra-ção", 3),
        "saúde": ("sa-ú-de", 2), "muito": ("mui-to", 1), "ritmo": ("rit-mo", 1), "abstrato": ("abs-tra-to", 2),
        "efémero": ("e-fé-me-ro", 2), "partir": ("par-tir", 2), "ainda": ("ain-da", 1), "país": ("pa-ís", 2),
        "cidadão": ("ci-da-dão", 3), "leões": ("le-ões", 2), "melancia": ("me-lan-ci-a", 4), "teimoso": ("tei-mo-so", 2),
        "saudade": ("sau-da-de", 2), "arrumar": ("ar-ru-mar", 3), "chuva": ("chu-va", 1), "olhar": ("o-lhar", 2),
        "extraordinário": ("ex-tra-or-di-ná-ri-o", 5), "egoísta": ("e-go-ís-ta", 3), "persuadir": ("per-su-a-dir", 4),
    }
    bad = 0
    for w, (exp, st) in tests.items():
        got = "-".join(syllabify(w)); gs = stress(w)
        if got != exp or gs != st:
            bad += 1
            print("MISMATCH", w, got, gs, "expected", exp, st)
    print(f"{len(tests) - bad}/{len(tests)} ok")
