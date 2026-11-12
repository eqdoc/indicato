#!/usr/bin/env python3
"""Regenerate test/fixtures/events-reference.json: the indicator events eqdoc's Python scan finds on ten real companies.

    python3 scripts/make-events-fixture.py <bars.csv.gz> <pipeline/jobs dir of eqdoc-api> test/fixtures/events-reference.json

<bars.csv.gz> is eqdoc's pipeline/tests/fixtures/signals_p1_bars.csv.gz (symbol,d,open,high,low,close,volume). The second
argument is the directory holding signal_events.py (eqdoc-api, pipeline/jobs): that file is the REFERENCE implementation
(numpy + TA-Lib); src/events.js is its port, and test/events.test.js requires the two to agree event for event."""
import csv, gzip, json, sys
import numpy as np
sys.path.insert(0, sys.argv[2])
import signal_events as se

by = {}
with gzip.open(sys.argv[1], "rt") as f:
    for r in csv.DictReader(f):
        by.setdefault(r["symbol"], []).append(r)
out = {"signals": list(se.SIGNALS), "symbols": {}}
for sym, rows in by.items():
    o, h, l, c, v = (np.array([float(r[k]) for r in rows]) for k in ("open", "high", "low", "close", "volume"))
    ev = se.indicator_events(o, h, l, c, v)
    out["symbols"][sym] = {
        "bars": [[float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]), float(r["volume"])] for r in rows],
        "events": {k: [[int(i), side, g] for i, side, g in lst] for k, lst in ev.items()}}
json.dump(out, open(sys.argv[3], "w"), separators=(",", ":"))
print(sys.argv[3], {k: sum(len(s["events"][k]) for s in out["symbols"].values()) for k in out["signals"]})
