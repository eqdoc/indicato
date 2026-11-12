/* { compat: "talib" } equals TA-Lib 0.7.1 to 1e-12, bar for bar, including the bar the first value lands on.

   talib-compat.json.gz is what Python TA-Lib 0.7.1 returns (scripts/make-talib-fixture.py) for ten real companies, RELIANCE, a
   45-bar new listing and five synthetic series built to reach the corners (a liquid fund, a flat run, the three SAR starts), at two
   parameter sets each for the main ones. Every output is compared as: null exactly where TA-Lib has NaN, and elsewhere
   |got - want| <= 1e-12 * max(1, |want|). The worst gap per function is printed so the number is in the log, not just in a pass.

   Supertrend has no TA-Lib function: its reference is the Python scan's own (pattern_scan.py supertrend() on talib.ATR). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import * as I from "../src/index.js";

const F = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/talib-compat.json.gz", import.meta.url))).toString());
const TOL = 1e-12;
const toBars = (rows) => rows.map(([o, h, l, c, v]) => ({ o, h, l, c, v }));
const BARS = Object.fromEntries(Object.entries(F.datasets).map(([k, d]) => [k, toBars(d.bars)]));
const CLOSE = Object.fromEntries(Object.entries(BARS).map(([k, b]) => [k, b.map((x) => x.c)]));
const T = { compat: "talib" };

/* how each function is called in compat mode for a case, and which keys of the result are compared to which of TA-Lib's */
const CALL = {
  rsi: (b, c, a) => ({ v: I.rsi(b, ...a, T) }),
  atr: (b, c, a) => ({ v: I.atr(b, ...a, T) }),
  dmi: (b, c, a) => I.dmi(b, ...a, T),
  macd: (b, c, a) => I.macd(b, ...a, T),
  bollinger: (b, c, a) => I.bollinger(b, ...a, T),
  sma: (b, c, a) => ({ v: I.sma(c, ...a, T) }),
  psar: (b, c, a) => ({ v: I.psar(b, ...a, T) }),
  stochRsi: (b, c, a) => I.stochRsi(b, ...a, T),
  supertrend: (b, c, a) => ({ line: I.supertrend(b, ...a, T).line, up: I.supertrend(b, ...a, T).up }),
};

const worst = {};
function compare(label, got, want, fn) {
  assert.equal(got.length, want.length, `${label}: length`);
  for (let i = 0; i < want.length; i++) {
    const w = want[i], g = got[i];
    if (w === null) { assert.ok(g === null, `${label} bar ${i}: TA-Lib has no value, indicato has ${g}`); continue; }
    if (typeof w === "boolean") { assert.equal(g, w, `${label} bar ${i}`); continue; }
    assert.ok(typeof g === "number" && g === g, `${label} bar ${i}: TA-Lib has ${w}, indicato has ${g}`);
    const rel = Math.abs(g - w) / Math.max(1, Math.abs(w));
    worst[fn] = Math.max(worst[fn] ?? 0, rel);
    assert.ok(rel <= TOL, `${label} bar ${i}: ${g} vs TA-Lib ${w} (relative ${rel})`);
  }
}

test("the fixture holds what it says: TA-Lib 0.7.1, 16 datasets, every function", () => {
  assert.equal(F.talib, "0.7.1");
  assert.equal(Object.keys(F.datasets).length, 16);
  assert.deepEqual([...new Set(F.cases.map((c) => c.fn))].sort(), Object.keys(CALL).sort());
});

for (const fn of Object.keys(CALL)) {
  test(`${fn}: equal to TA-Lib to 1e-12 on every dataset and parameter set, first value on the same bar`, () => {
    const cases = F.cases.filter((c) => c.fn === fn);
    assert.ok(cases.length >= 16);
    let bars = 0;
    for (const c of cases) {
      const got = CALL[fn](BARS[c.data], CLOSE[c.data], c.args);
      for (const [key, want] of Object.entries(c.out)) {
        assert.ok(key in got, `${fn} returns no ${key}`);
        compare(`${fn}(${c.args}) ${c.data} ${key}`, got[key], want, fn);
        bars += want.length;
      }
      // the first value is where TA-Lib's is
      for (const key of Object.keys(c.out)) assert.equal(got[key].findIndex((x) => x !== null), c.out[key].findIndex((x) => x !== null), `${fn}(${c.args}) ${c.data} ${key}: first value`);
    }
    assert.ok(bars > 8000);
  });
}

test("a short series (a new listing, fewer bars than a lookback) is TA-Lib's prefix: null where TA-Lib has none, never a throw", () => {
  /* Every function here is causal, so TA-Lib on the first n bars is the first n of TA-Lib on all of them (the fixture script asserts it). */
  for (const n of [0, 1, 2, 3, 5, 13, 14, 15, 27, 33, 34, 35, 41]) {
    for (const c of F.cases.filter((x) => x.data === "TCS" || x.data === "NEWLISTING")) {
      const bars = BARS[c.data].slice(0, n);
      const got = CALL[c.fn](bars, bars.map((b) => b.c), c.args);
      for (const [key, want] of Object.entries(c.out)) {
        assert.equal(got[key].length, n, `${c.fn} ${key} at ${n} bars`);
        compare(`${c.fn}(${c.args}) ${c.data} ${key} at ${n} bars`, got[key], want.slice(0, n), c.fn);
      }
    }
  }
});

test("a plain series of closes is accepted wherever only the close is read, and refused where it is not", () => {
  const c = CLOSE.TCS;
  for (const fn of ["rsi", "macd", "bollinger", "stochRsi"]) {
    assert.deepEqual(I[fn](c, ...(fn === "stochRsi" ? [14, 5, 3] : []), T), I[fn](BARS.TCS, ...(fn === "stochRsi" ? [14, 5, 3] : []), T), fn);
  }
  for (const fn of ["atr", "dmi", "psar", "supertrend"]) assert.throws(() => I[fn](c, undefined, undefined, T), TypeError, fn);
  assert.throws(() => I.atr(c, 14, T), TypeError);
});

test("the mode is a choice, not a rename: on real bars the defaults differ from TA-Lib where docs/accuracy.md says they do", () => {
  const b = BARS.RELIANCE, at = (x, i) => x[i];
  const gap = (a, t) => Math.max(...a.map((v, i) => (v === null || t[i] === null ? 0 : Math.abs(v - t[i]))));
  assert.ok(gap(I.rsi(b, 14), I.rsi(b, 14, T)) > 1e-9);
  assert.ok(gap(I.atr(b, 10), I.atr(b, 10, T)) > 1e-9);
  assert.ok(gap(I.dmi(b, 14).adx, I.dmi(b, 14, T).adx) > 1e-9);
  assert.ok(gap(I.macd(b).line, I.macd(b, 12, 26, 9, T).line) > 1e-9);
  assert.ok(gap(I.psar(BARS.LT), I.psar(BARS.LT, 0.02, 0.2, T)) > 1);            // LT: a reversal bar, where the start rule matters
  assert.equal(at(I.rsi(b, 14), 13) !== null, true);                              // the default starts a bar earlier ...
  assert.equal(at(I.rsi(b, 14, T), 13), null);                                    // ... and compat does not
  assert.equal(I.rsi(b, 14, T)[14] !== null, true);
});

test("on a series that barely moves, Bollinger's bands are TA-Lib's, not the direct sum's", () => {
  const b = BARS.LIQUIDLIKE;
  const def = I.bollinger(b, 20, 2), tal = I.bollinger(b, 20, 2, T);
  const c = F.cases.find((x) => x.fn === "bollinger" && x.data === "LIQUIDLIKE" && x.args[0] === 20);
  let off = 0;
  for (let i = 19; i < b.length; i++) off = Math.max(off, Math.abs(def.upper[i] - c.out.upper[i]));
  assert.ok(off > 1e-10, `the default is only ${off} from TA-Lib here, so this series no longer shows the difference`);
  compare("bollinger liquid", tal.upper, c.out.upper, "bollinger");
  // twenty identical closes: variance under TA_IS_ZERO is a deviation of 0
  const flat = I.bollinger(Array.from({ length: 40 }, () => 1100.5), 20, 2, T);
  assert.equal(flat.upper[39], flat.mid[39]);
  assert.equal(flat.lower[39], flat.mid[39]);
});

test("Parabolic SAR starts the way TA-Lib's does: the first bar's minus-DM decides the leg", () => {
  const mk = (h, l) => h.map((x, i) => ({ o: x, h: x, l: l[i], c: l[i], v: 1 }));
  assert.equal(I.psar(mk([10, 9.5, 9.4, 9.3], [9, 8, 8, 7.9]), 0.02, 0.2, T)[1], 10);       // lower low, no higher high: short, starts at the first high
  assert.equal(I.psar(mk([10, 11, 11.5, 12], [9, 9.5, 10, 10.5]), 0.02, 0.2, T)[1], 9);     // higher high: long, starts at the first low
  assert.equal(I.psar(mk([10, 9.8, 9.9], [9, 9.2, 9.3]), 0.02, 0.2, T)[1], 9);              // an inside bar is long
  assert.equal(I.psar(mk([10], [9]), 0.02, 0.2, T)[0], null);
});

test("an unknown compat mode is refused, and so is a typo; nothing else in the options matters", () => {
  const b = BARS.TCS.slice(0, 60);
  for (const fn of ["rsi", "atr", "dmi", "macd", "bollinger", "psar", "supertrend"]) {
    const args = { rsi: [b, 14], atr: [b, 14], dmi: [b, 14], macd: [b, 12, 26, 9], bollinger: [b, 20, 2], psar: [b, 0.02, 0.2], supertrend: [b, 10, 3] }[fn];
    assert.throws(() => I[fn](...args, { compat: "talib " }), RangeError, fn);
    assert.throws(() => I[fn](...args, { compat: "TA-Lib" }), RangeError, fn);
    assert.deepEqual(I[fn](...args, { compat: "talib", other: 1 }), I[fn](...args, T), fn);
  }
  assert.throws(() => I.sma([1, 2, 3], 2, { compat: "x" }), RangeError);
  assert.throws(() => I.stochRsi(b, 14, 5, 3, { compat: "x" }), RangeError);
});

test.after(() => {
  const rows = Object.entries(worst).map(([fn, w]) => `${fn.padEnd(11)} ${w.toExponential(2)}`);
  console.log("\nworst relative gap to TA-Lib 0.7.1 (compat: talib), per function:\n  " + rows.join("\n  "));
});
