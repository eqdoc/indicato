#!/usr/bin/env python3
"""Regenerate test/fixtures/candles-talib.json: real daily bars of ten companies and TA-Lib's own output on them.

    python3 scripts/make-candle-fixture.py <bars.csv.gz> test/fixtures/candles-talib.json

The CSV is eqdoc's pipeline/tests/fixtures/signals_p1_bars.csv.gz (symbol,d,open,high,low,close,volume), ten large
Indian companies across sectors, 600 sessions each. Needs numpy and TA-Lib (0.7.1 when this was written).
The expected arrays are sparse: [[bar index, TA-Lib value], ...] for every non-zero output. Nothing here is computed by
indicato; the test compares indicato to this file."""
import csv, gzip, json, sys
import numpy as np
import talib

PATTERNS = {
    "engulfing": "CDLENGULFING", "hammer": "CDLHAMMER", "invertedHammer": "CDLINVERTEDHAMMER", "hangingMan": "CDLHANGINGMAN",
    "shootingStar": "CDLSHOOTINGSTAR", "piercing": "CDLPIERCING", "darkCloudCover": "CDLDARKCLOUDCOVER",
    "morningStar": "CDLMORNINGSTAR", "morningDojiStar": "CDLMORNINGDOJISTAR", "eveningStar": "CDLEVENINGSTAR",
    "eveningDojiStar": "CDLEVENINGDOJISTAR", "harami": "CDLHARAMI", "threeWhiteSoldiers": "CDL3WHITESOLDIERS",
    "threeBlackCrows": "CDL3BLACKCROWS", "threeInside": "CDL3INSIDE", "threeOutside": "CDL3OUTSIDE",
    "abandonedBaby": "CDLABANDONEDBABY", "matHold": "CDLMATHOLD", "ladderBottom": "CDLLADDERBOTTOM", "marubozu": "CDLMARUBOZU",
}
src, dst = sys.argv[1], sys.argv[2]
by = {}
with gzip.open(src, "rt") as f:
    for r in csv.DictReader(f):
        by.setdefault(r["symbol"], []).append(r)
out = {"talib": talib.__version__, "patterns": list(PATTERNS), "symbols": {}}
for sym, rows in by.items():
    o, h, l, c = (np.array([float(r[k]) for r in rows]) for k in ("open", "high", "low", "close"))
    exp = {}
    for name, fn in PATTERNS.items():
        a = getattr(talib, fn)(o, h, l, c)
        exp[name] = [[int(i), int(a[i])] for i in np.nonzero(a)[0]]
    out["symbols"][sym] = {"d": [r["d"] for r in rows],
                           "bars": [[float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]), float(r["volume"])] for r in rows],
                           "expected": exp}
json.dump(out, open(dst, "w"), separators=(",", ":"))
print(dst, sum(len(v) for s in out["symbols"].values() for v in s["expected"].values()), "non-zero TA-Lib outputs")
