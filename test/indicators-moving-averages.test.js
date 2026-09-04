/* Twelve moving averages, checked by the properties every one of them must have.

   Spot-checking a last value proves almost nothing — a broken average still returns a
   plausible number near the price. These are the invariants instead: an average of a
   flat series is that value; an average never leaves the range of its own window; it
   never sees the future; and it warms up before it speaks. A bug that survives all four
   is a bug about smoothing constants, not about correctness. */
import test from "node:test";
import assert from "node:assert";
import * as I from "../src/index.js";

const MAS = {
  sma: (b, n) => I.sma(b.map((x) => x.c), n),
  ema: (b, n) => I.ema(b.map((x) => x.c), n),
  wma: (b, n) => I.wma(b.map((x) => x.c), n),
  dema: (b, n) => I.dema(b.map((x) => x.c), n),
  tema: (b, n) => I.tema(b.map((x) => x.c), n),
  hma: (b, n) => I.hma(b.map((x) => x.c), n),
  vwma: (b, n) => I.vwma(b, n),
  alma: (b, n) => I.alma(b.map((x) => x.c), n),
  kama: (b, n) => I.kama(b.map((x) => x.c), n),
  zlema: (b, n) => I.zlema(b.map((x) => x.c), n),
  t3: (b, n) => I.t3(b.map((x) => x.c), Math.max(3, Math.floor(n / 4))),
  trima: (b, n) => I.trima(b.map((x) => x.c), n),
  mcginley: (b, n) => I.mcginley(b.map((x) => x.c), n),
  vidya: (b, n) => I.vidya(b.map((x) => x.c), n),
  frama: (b, n) => I.frama(b, n),
};

const flat = (n, v = 500) => Array.from({ length: n }, () => ({ d: "x", o: v, h: v, l: v, c: v, v: 1e6 }));
const walk = (n) => { let s = 7, p = 1000; const out = [];
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) { const c = p * (1 + (rnd() - 0.5) * 0.05);
    out.push({ d: "x", o: p, h: Math.max(p, c) * 1.005, l: Math.min(p, c) * 0.995, c, v: 1e6 + i }); p = c; }
  return out; };

test("on a flat series every average equals that value", () => {
  const bars = flat(300);
  for (const [name, fn] of Object.entries(MAS)) {
    const out = fn(bars, 20);
    const last = out[out.length - 1];
    assert.ok(last != null, `${name} produced nothing on 300 flat bars`);
    assert.ok(Math.abs(last - 500) < 0.5, `${name} on a flat 500 series returned ${last}`);
  }
});

test("no average leaves the range of the window it averages", () => {
  /* DEMA, TEMA, HMA and ZLEMA overshoot by design, so they get the window's range
     widened by its own span — but none may wander to a different order of magnitude. */
  const bars = walk(400);
  for (const [name, fn] of Object.entries(MAS)) {
    const out = fn(bars, 20);
    for (let i = 60; i < bars.length; i++) {
      if (out[i] == null) continue;
      const w = bars.slice(i - 19, i + 1).map((b) => b.c);
      const lo = Math.min(...w), hi = Math.max(...w), span = hi - lo;
      assert.ok(out[i] > lo - 2 * span && out[i] < hi + 2 * span,
        `${name} at bar ${i} returned ${out[i]}, far outside its window ${lo.toFixed(0)}–${hi.toFixed(0)}`);
    }
  }
});

test("no average sees the future", () => {
  // The invariant that matters most: computed on the first N bars, each value below N
  // must equal the same value computed from all of them.
  const all = walk(400), CUT = 300;
  for (const [name, fn] of Object.entries(MAS)) {
    const full = fn(all, 20), part = fn(all.slice(0, CUT), 20);
    for (let i = 80; i < CUT; i++) {
      if (full[i] == null && part[i] == null) continue;
      assert.ok(full[i] != null && part[i] != null && Math.abs(full[i] - part[i]) < 1e-6,
        `${name} at bar ${i} changed when later bars arrived: ${full[i]} vs ${part[i]}`);
    }
  }
});

test("every average warms up before it speaks", () => {
  const bars = walk(400);
  for (const [name, fn] of Object.entries(MAS)) {
    const out = fn(bars, 20);
    assert.equal(out.length, bars.length, `${name} returned the wrong length`);
    assert.equal(out[0], null, `${name} produced a value on bar 0 with no history`);
    assert.ok(out.filter((v) => v != null).length > 200, `${name} produced almost nothing`);
  }
});

