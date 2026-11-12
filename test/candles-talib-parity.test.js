/* Candlestick patterns match TA-Lib, bar for bar.

   A candle pattern is a few words turned into numbers, and every library turns them into different numbers. TA-Lib's are
   the reference traders compare against, so "agrees with TA-Lib" has to mean the same integer on the same bar, not "finds
   roughly the same shapes". These tests fail on any bar that differs.

   Two fixtures, both TA-Lib 0.7.1's own output on real daily bars (scripts/make-candle-fixture.py):
     candles-talib.json       ten large Indian companies across sectors, 600 sessions each, all twenty patterns
     candles-talib-rare.json  89 windows around the hits of the patterns that are rare on ten companies (Three White
                              Soldiers, Three Black Crows, Abandoned Baby, Mat Hold, Ladder Bottom, the doji stars...)
   On top of that, over 1,053 symbols x 5 years (1,047,363 bars, not committed) all twenty matched on every bar: see
   docs/accuracy.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as TA from "../src/index.js";

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const toBars = (rows) => rows.map(([o, h, l, c, v]) => ({ o, h, l, c, v }));
const names = Object.keys(TA.CANDLE_PATTERNS);

test("there are twenty patterns, each with a lookback", () => {
  assert.equal(names.length, 20);
  for (const n of names) assert.ok(TA.candleLookback(n) >= 2, n);
  assert.throws(() => TA.candleLookback("nope"));
});

test("every pattern equals TA-Lib on ten real companies, bar for bar", () => {
  const F = load("candles-talib.json");
  assert.deepEqual(F.patterns.slice().sort(), names.slice().sort(), "the fixture and the library name the same patterns");
  const wrong = [];
  let compared = 0, hits = 0;
  for (const [sym, d] of Object.entries(F.symbols)) {
    const bars = toBars(d.bars);
    for (const n of names) {
      const got = TA.CANDLE_PATTERNS[n](bars);
      assert.equal(got.length, bars.length, `${n} returned the wrong length`);
      const exp = new Map(d.expected[n]);
      for (let i = 0; i < got.length; i++) {
        compared++;
        const e = exp.get(i) ?? 0;
        if (e) hits++;
        if (got[i] !== e) wrong.push(`${sym} ${n} @${i} (${d.d[i]}): ours ${got[i]}, TA-Lib ${e}`);
      }
    }
  }
  assert.deepEqual(wrong.slice(0, 10), [], `${wrong.length} bars differ from TA-Lib`);
  assert.ok(hits > 1500, `the fixture should hold real hits to compare (${hits})`);
  assert.ok(compared > 100000);
});

test("the rare patterns equal TA-Lib on windows around their real hits", () => {
  const F = load("candles-talib-rare.json");
  const wrong = [];
  const seen = {};
  for (const w of F.windows) {
    const bars = toBars(w.bars);
    for (const [n, exp] of Object.entries(w.expected)) {
      const got = TA.CANDLE_PATTERNS[n](bars);
      const e = new Map(exp);
      for (let i = 0; i < got.length; i++) if (got[i] !== (e.get(i) ?? 0)) wrong.push(`${w.symbol} ${n} @${i}: ours ${got[i]}, TA-Lib ${e.get(i) ?? 0}`);
      if (n === w.hit && e.size) seen[n] = (seen[n] ?? 0) + 1;
    }
  }
  assert.deepEqual(wrong.slice(0, 10), [], `${wrong.length} bars differ from TA-Lib`);
  for (const n of ["threeWhiteSoldiers", "threeBlackCrows", "abandonedBaby", "matHold", "ladderBottom", "morningDojiStar", "eveningDojiStar", "piercing", "darkCloudCover"]) {
    assert.ok(seen[n] >= 5, `${n}: the windows must contain real hits (${seen[n] ?? 0})`);
  }
});

test("the first `lookback` bars are 0: the averages do not exist yet", () => {
  const F = load("candles-talib.json");
  const bars = toBars(F.symbols.RELIANCE.bars);
  for (const n of names) {
    const out = TA.CANDLE_PATTERNS[n](bars);
    const lb = TA.candleLookback(n);
    assert.ok(out.slice(0, lb).every((v) => v === 0), `${n} fired inside its lookback`);
  }
});

test("NO PATTERN READS THE FUTURE: bars cut at t give the same values up to t", () => {
  const F = load("candles-talib.json");
  const bars = toBars(F.symbols.TCS.bars);
  for (const n of names) {
    const full = TA.CANDLE_PATTERNS[n](bars);
    for (const cut of [200, 333, 480]) {
      const part = TA.CANDLE_PATTERNS[n](bars.slice(0, cut));
      assert.deepEqual(part, full.slice(0, cut), `${n} changed its past when later bars arrived (cut ${cut})`);
    }
  }
});

test("values are the signed integers TA-Lib uses", () => {
  const F = load("candles-talib.json");
  const bars = toBars(F.symbols.HDFCBANK.bars);
  for (const n of names) {
    for (const v of TA.CANDLE_PATTERNS[n](bars)) assert.ok([0, 100, -100, 80, -80].includes(v), `${n} produced ${v}`);
  }
  /* Single-direction patterns keep their direction. */
  assert.ok(TA.hammer(bars).every((v) => v >= 0));
  assert.ok(TA.hangingMan(bars).every((v) => v <= 0));
  assert.ok(TA.eveningStar(bars).every((v) => v <= 0));
  assert.ok(TA.morningStar(bars).every((v) => v >= 0));
});

test("a hand-drawn bullish engulfing, and the +-80 when an edge touches", () => {
  const pad = Array.from({ length: 15 }, (_, i) => ({ o: 100 + i * 0.1, h: 101 + i * 0.1, l: 99 + i * 0.1, c: 100.5 + i * 0.1, v: 1 }));
  const down = { o: 102, h: 102.2, l: 100.8, c: 101, v: 1 };
  const engulf = { o: 100.5, h: 102.8, l: 100.3, c: 102.5, v: 1 };
  const out = TA.engulfing([...pad, down, engulf]);
  assert.equal(out[out.length - 1], 100);
  const touch = { o: 101, h: 102.8, l: 100.8, c: 102.5, v: 1 };           // opens exactly at the prior close
  assert.equal(TA.engulfing([...pad, down, touch]).at(-1), 80);
});

test("an empty or short series is not an error", () => {
  for (const n of names) {
    assert.deepEqual(TA.CANDLE_PATTERNS[n]([]), []);
    assert.ok(TA.CANDLE_PATTERNS[n]([{ o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }]).every((v) => v === 0));
  }
});
