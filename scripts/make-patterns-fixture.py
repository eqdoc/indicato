#!/usr/bin/env python3
"""Regenerate test/fixtures/patterns-reference.json: the chart patterns eqdoc's Python scan detects on ten real companies,
as of 30 dates over 600 sessions each, with their full geometry.

    python3 scripts/make-patterns-fixture.py <bars.csv.gz> <pipeline/jobs dir of eqdoc-api> test/fixtures/patterns-reference.json

<bars.csv.gz> is eqdoc's pipeline/tests/fixtures/signals_p1_bars.csv.gz. The second argument holds chart_geometry.py, the
REFERENCE implementation (numpy only); src/patterns.js is its port and test/patterns.test.js requires the two to agree,
detection for detection, point for point. Each as-of run is made on the last 520 sessions up to that date, as the nightly scan does."""
import csv, gzip, json, sys
sys.path.insert(0, sys.argv[2])
import chart_geometry as cg

by = {}
with gzip.open(sys.argv[1], "rt") as f:
    for r in csv.DictReader(f):
        by.setdefault(r["symbol"], []).append({"d": r["d"], "open": float(r["open"]), "high": float(r["high"]), "low": float(r["low"]),
                                                "close": float(r["close"]), "volume": float(r["volume"])})
out = {"symbols": {}}
total = 0
for sym, rows in by.items():
    runs = []
    for cut in range(len(rows) - 1, 250, -20):
        sub = rows[:cut + 1][-520:]
        res = cg.detect_all(cg.make_bars(sub), cg.weekly_bars(sub))
        runs.append({"cut": cut, "detections": [{"name": r["name"], "side": r["side"], "state": r["state"], "formed_i": r["formed_i"],
                                                  "formed_date": r["formed_date"], "conf": r["conf"], "tf": r["_tf"], "geometry": r["geometry"]}
                                                 for r in sorted(res, key=lambda r: (r["name"], r["side"]))]})
        total += len(res)
    out["symbols"][sym] = {"bars": [[r["d"], r["open"], r["high"], r["low"], r["close"], r["volume"]] for r in rows], "runs": runs}
json.dump(out, open(sys.argv[3], "w"), separators=(",", ":"))
print(sys.argv[3], total, "detections over", sum(len(s["runs"]) for s in out["symbols"].values()), "as-of runs")
