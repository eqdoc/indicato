#!/usr/bin/env python3
"""Regenerate test/fixtures/talib-compat.json.gz: what TA-Lib 0.7.1 returns for the functions that take { compat: "talib" }.

    python3 scripts/make-talib-fixture.py test/fixtures test/fixtures/talib-compat.json.gz

The first argument is the directory holding RELIANCE.json and events-reference.json (the bars every other test already uses); nothing
is downloaded. Needs numpy and TA-Lib 0.7.1 (`pip install TA-Lib==0.7.1`). test/talib-compat.test.js requires indicato to equal these
outputs to 1e-12, NaN for NaN, so the first value lands on the same bar.

Datasets: ten companies x 600 sessions, RELIANCE's first 1,000, a 45-bar new listing, and five synthetic series (fixed seed, bars
stored in the file) that reach what real shares rarely do: a liquid-fund-like series (price ~1,100, variance ~1e-6, where BBANDS cancels),
a flat run (zero range, TA_IS_ZERO), and the three ways TA-Lib's SAR starts (down, up, an inside bar).

Supertrend has no TA-Lib function: the reference is the Python scan's own (eqdoc-api pipeline/jobs/pattern_scan.py supertrend()) on
talib.ATR, reproduced below line for line."""
import gzip, json, sys
import numpy as np
import talib

assert talib.__version__ == "0.7.1", talib.__version__
fx = sys.argv[1]

def supertrend(h, l, c, period=10, mult=3.0):
    atr = talib.ATR(h, l, c, period)
    hl2 = (h + l) / 2.0
    ub = hl2 + mult * atr
    lb = hl2 - mult * atr
    n = len(c)
    fub = np.full(n, np.nan); flb = np.full(n, np.nan); st = np.full(n, np.nan); d = np.zeros(n, dtype=int)
    started = False
    for i in range(n):
        if atr[i] != atr[i]:
            continue
        if not started:
            fub[i] = ub[i]; flb[i] = lb[i]; st[i] = ub[i]; d[i] = -1; started = True
            continue
        fub[i] = ub[i] if (ub[i] < fub[i - 1] or c[i - 1] > fub[i - 1]) else fub[i - 1]
        flb[i] = lb[i] if (lb[i] > flb[i - 1] or c[i - 1] < flb[i - 1]) else flb[i - 1]
        if st[i - 1] == fub[i - 1]:
            d[i] = 1 if c[i] > fub[i] else -1
        else:
            d[i] = -1 if c[i] < flb[i] else 1
        st[i] = flb[i] if d[i] == 1 else fub[i]
    return st, d

def ser(a):
    return [None if x != x else float(x) for x in a]

def walk(rng, n, start, vol, tick=0.05):
    """A random walk of OHLC bars on a price grid of `tick`."""
    c = start
    rows = []
    for _ in range(n):
        o = c
        c = o + rng.normal(0, vol)
        hi = max(o, c) + abs(rng.normal(0, vol / 2))
        lo = min(o, c) - abs(rng.normal(0, vol / 2))
        r = lambda x: round(round(x / tick) * tick, 4)
        rows.append([r(o), r(hi), r(lo), r(c), int(rng.integers(1000, 100000))])
        c = rows[-1][3]
    return rows

rng = np.random.default_rng(20261112)
data = {}
rel = json.load(open(f"{fx}/RELIANCE.json"))
data["RELIANCE"] = {"from": "RELIANCE.json", "slice": [0, 1000], "bars": [r[1:] for r in rel[:1000]]}
ev = json.load(open(f"{fx}/events-reference.json"))["symbols"]
for sym, d in ev.items():
    if sym != "RELIANCE":
        data[sym] = {"from": "events-reference.json", "slice": [0, 600], "bars": d["bars"]}
data["NEWLISTING"] = {"from": "events-reference.json", "slice": [0, 45], "bars": ev["TCS"]["bars"][:45]}
# a liquid fund: ~1,100, moves of a few paise
fund, c = [], 1100.0
for _ in range(600):
    o = c; c = round(o + rng.integers(-3, 4) * 0.01 + 0.002, 2)
    fund.append([o, round(max(o, c) + 0.01, 2), round(min(o, c) - 0.01, 2), c, int(rng.integers(100, 5000))])
data["LIQUIDLIKE"] = {"from": "synthetic", "bars": fund}
# sixty identical bars, then a walk
flat = [[100.0, 100.0, 100.0, 100.0, 1000]] * 60 + walk(rng, 80, 100.0, 1.0)
data["FLATRUN"] = {"from": "synthetic", "bars": flat}
# the three ways SAR starts: bar 1 makes a lower low and no higher high (short), a higher high and no lower low (long), neither (inside bar)
for name, first in (("SARDOWN", [[10, 10.5, 9.5, 10, 1000], [9.9, 10.2, 8.5, 9, 1000]]),
                    ("SARUP", [[10, 10.5, 9.5, 10, 1000], [10.1, 11.5, 9.8, 11, 1000]]),
                    ("SARINSIDE", [[10, 10.5, 9.5, 10, 1000], [10, 10.3, 9.7, 10.1, 1000]])):
    data[name] = {"from": "synthetic", "bars": first + walk(rng, 80, first[-1][3], 0.4)}

CASES = [
    ("rsi", [(14,), (7,)]), ("atr", [(14,), (10,)]), ("dmi", [(14,), (10,)]),
    ("macd", [(12, 26, 9), (5, 35, 5), (26, 12, 9)]), ("bollinger", [(20, 2), (10, 1.5)]),
    ("sma", [(20,), (5,)]), ("psar", [(0.02, 0.2), (0.01, 0.1)]), ("stochRsi", [(14, 5, 3), (10, 3, 3)]),
    ("supertrend", [(10, 3), (7, 2)]),
]

# the second parameter set of each function runs on three companies and every synthetic series; the other seven companies run the standard one
FULL = {"RELIANCE", "TCS", "HDFCBANK", "NEWLISTING", "LIQUIDLIKE", "FLATRUN", "SARDOWN", "SARUP", "SARINSIDE"}

def run(fn, a, o, h, l, c):
    if fn == "rsi": return {"v": ser(talib.RSI(c, *a))}
    if fn == "atr": return {"v": ser(talib.ATR(h, l, c, *a))}
    if fn == "dmi": return {"pdi": ser(talib.PLUS_DI(h, l, c, *a)), "mdi": ser(talib.MINUS_DI(h, l, c, *a)), "adx": ser(talib.ADX(h, l, c, *a))}
    if fn == "macd":
        m, s, hi = talib.MACD(c, *a); return {"line": ser(m), "signal": ser(s), "hist": ser(hi)}
    if fn == "bollinger":
        u, m, lo = talib.BBANDS(c, a[0], a[1], a[1], 0); return {"upper": ser(u), "mid": ser(m), "lower": ser(lo)}
    if fn == "sma": return {"v": ser(talib.SMA(c, *a))}
    if fn == "psar": return {"v": ser(talib.SAR(h, l, *a))}
    if fn == "stochRsi":
        k, d = talib.STOCHRSI(c, a[0], a[1], a[2], 0); return {"k": ser(k), "d": ser(d)}
    if fn == "supertrend":
        st, d = supertrend(h, l, c, *a); return {"line": ser(st), "up": [None if x == 0 else bool(x > 0) for x in d]}

out = {"talib": talib.__version__, "datasets": data, "cases": []}
for name, ds in data.items():
    b = np.array(ds["bars"], dtype=float)
    o, h, l, c = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    for fn, argsets in CASES:
        for a in (argsets if name in FULL else argsets[:1]):
            out["cases"].append({"fn": fn, "args": list(a), "data": name, "out": run(fn, a, o, h, l, c)})
    # every function here is causal, so TA-Lib on a prefix is the prefix of TA-Lib on the whole: the tests lean on it for short series
    for n in (13, 14, 15, 27, 34, 41):
        if n < len(c):
            full = run("macd", (12, 26, 9), o, h, l, c)["line"][:n]
            assert full == run("macd", (12, 26, 9), o[:n], h[:n], l[:n], c[:n])["line"], (name, n)
            full = run("psar", (0.02, 0.2), o, h, l, c)["v"][:n]
            assert full == run("psar", (0.02, 0.2), o[:n], h[:n], l[:n], c[:n])["v"], (name, n)
with gzip.open(sys.argv[2], "wt", compresslevel=9) as f:
    json.dump(out, f, separators=(",", ":"))
print(sys.argv[2], len(data), "datasets", len(out["cases"]), "cases")
