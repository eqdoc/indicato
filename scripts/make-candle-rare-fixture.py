#!/usr/bin/env python3
"""Regenerate test/fixtures/candles-talib-rare.json: 45-bar windows around the hits of the patterns that are rare on a
ten-company sample, with TA-Lib's output for all 61 patterns on each window.

    python3 scripts/make-candle-rare-fixture.py <universe.json> test/fixtures/candles-talib-rare.json

<universe.json> is {symbol: {"bars": [[open, high, low, close, volume], ...]}} for a large universe of daily bars
(eqdoc used 1,053 symbols x 5 years). Each window holds 40 bars before the hit and 4 after, so every average the pattern
reads exists; TA-Lib is run on the WINDOW, so the expected values and the lookback agree with what the test feeds indicato."""
import json, sys
import numpy as np
import talib

ALL = json.load(open(__file__.replace("make-candle-rare-fixture.py", "candle-patterns.json")))   # all 61: indicato name -> TA-Lib function
# the patterns that are rare on a ten-company sample: fewer than ~1,000 hits over 1,053 symbols x 5 years, plus the stateful hikkakes
RARE_NAMES = ["threeWhiteSoldiers", "threeBlackCrows", "abandonedBaby", "matHold", "ladderBottom", "morningDojiStar", "eveningDojiStar",
              "piercing", "darkCloudCover", "threeStarsInSouth", "concealingBabySwallow", "kicking", "kickingByLength", "breakaway",
              "identicalThreeCrows", "riseFallThreeMethods", "stalledPattern", "upsideGapTwoCrows", "twoCrows", "inNeck", "onNeck",
              "counterattack", "hikkakeMod", "hikkake", "advanceBlock", "threeLineStrike", "tasukiGap", "gapSideSideWhite", "stickSandwich"]
RARE = {k: ALL[k] for k in RARE_NAMES}
PER, BEFORE, AFTER = 10, 40, 4
U = json.load(open(sys.argv[1]))
out = {"talib": talib.__version__, "windows": []}
count = {k: 0 for k in RARE}
for sym in sorted(U):
    b = np.array(U[sym]["bars"], float)
    o, h, l, c = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    for name, fn in RARE.items():
        if count[name] >= PER:
            continue
        a = getattr(talib, fn)(o, h, l, c)
        hits = np.nonzero(a)[0]
        for i in (hits if len(hits) < 40 else hits[::max(1, len(hits) // 40)]):
            if i < BEFORE or i + AFTER >= len(c) or count[name] >= PER:
                continue
            seg = b[i - BEFORE:i + AFTER + 1]
            so, sh, sl, sc = seg[:, 0], seg[:, 1], seg[:, 2], seg[:, 3]
            exp = {}
            for nm, f in ALL.items():
                r = getattr(talib, f)(so, sh, sl, sc)
                exp[nm] = [[int(j), int(r[j])] for j in np.nonzero(r)[0]]
            out["windows"].append({"symbol": sym, "hit": name, "bars": seg.tolist(), "expected": exp})
            count[name] += 1
json.dump(out, open(sys.argv[2], "w"), separators=(",", ":"))
print(count, len(out["windows"]), "windows")
