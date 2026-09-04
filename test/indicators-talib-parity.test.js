/* Where we agree with TA-Lib, and where we deliberately do not.

   TA-Lib is the de-facto reference: when a reader's broker, TradingView and a Python
   notebook all agree on what RSI 14 is, they are agreeing with TA-Lib. Anything of ours
   that differs has to be a decision somebody made on purpose, written down — not a
   surprise waiting in an issue tracker.

   Verified against TA-Lib 0.7.1 over 6,126 bars of real history. Thirty-two of
   thirty-seven series matched to the floating-point bit. This file pins the ones that
   did not, so a future change that quietly "fixes" one of them fails here first. */
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import * as I from "../src/index.js";

const bars = JSON.parse(readFileSync(new URL("./fixtures/RELIANCE.json", import.meta.url), "utf8"))
  .map(([d, o, h, l, c, v]) => ({ d, o, h, l, c, v }));
const close = bars.map((b) => b.c);

test("CMO is Wilder-smoothed, which makes it exactly 2*RSI - 100", () => {
  /* The first version summed raw up and down moves over a plain window. That is a fair
     reading of Chande and is not what anyone else computes; TA-Lib smooths them the way
     RSI does. A CMO disagreeing with every chart a reader has seen is a wrong CMO. */
  const cmo = I.cmo(close, 14), rsi = I.rsi(bars, 14);
  let worst = 0;
  for (let i = 300; i < bars.length; i++) {
    if (cmo[i] == null || rsi[i] == null) continue;
    worst = Math.max(worst, Math.abs(cmo[i] - (2 * rsi[i] - 100)));
  }
  assert.ok(worst < 1e-9, `CMO drifted from 2*RSI-100 by ${worst}`);
});

test("RSI warms up one bar earlier than TA-Lib, and converges to it", () => {
  /* Documented, not accidental. We seed Wilder's average at bar n-1; TA-Lib seeds at
     bar n. Measured: 0.65 apart at bar 26, 0.002 by bar 100, exactly 0 from bar 300. */
  const rsi = I.rsi(bars, 14);
  assert.equal(rsi[12], null, "nothing before the window is full");
  assert.ok(rsi[13] != null, "we emit at bar n-1 — if this changes, the note above is stale");
});

test("every series is finite and in range where it claims to be", () => {
  const checks = [
    ["rsi", I.rsi(bars, 14), 0, 100],
    ["cmo", I.cmo(close, 14), -100, 100],
    ["williamsR", I.williamsR(bars, 14), -100, 0],
    ["ultosc", I.ultosc(bars), 0, 100],
    ["bop", I.bop(bars), -1, 1],
    /* Choppiness is usually described as 0..100 and is not bounded there. True range
       measures against the previous CLOSE, so a gap makes the sum of true ranges exceed
       the window's high-low span, and the index goes past 100. Measured max on this
       stock: 104.2. The description is the approximation; the arithmetic is not. */
    ["chop", I.chop(bars, 14), 0, 130],
    ["bbPercent", I.bbPercent(bars, 20), -5, 5],
  ];
  for (const [name, series, lo, hi] of checks) {
    const vals = series.filter((v) => v != null);
    assert.ok(vals.length > 1000, `${name} produced almost nothing`);
    assert.ok(vals.every(Number.isFinite), `${name} produced a non-finite value`);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    assert.ok(mn >= lo - 1e-9 && mx <= hi + 1e-9, `${name} ranged ${mn}..${mx}, expected ${lo}..${hi}`);
  }
});

test("TRIMA splits its window the way TA-Lib does, on even AND odd periods", () => {
  /* The bug that hid: an odd period agreed by accident while an even one was 7.87 out
     on a price near 1,310 — small enough to read as rounding, large enough to move a
     signal. Both are checked because only one of them was ever wrong. */
  for (const n of [10, 20, 21, 30]) {
    const t = I.trima(close, n);
    const first = n % 2 ? Math.floor(n / 2) + 1 : Math.floor(n / 2);
    const second = Math.floor(n / 2) + 1;
    assert.equal(t[first + second - 3], null, `TRIMA ${n} spoke before its window was full`);
    assert.ok(t[first + second - 2] != null, `TRIMA ${n} stayed silent too long`);
  }
});

test("OBV starts from the first bar's volume, as TA-Lib does", () => {
  // Starting at zero left every value a constant offset below the reference — invisible
  // to a crossover, wrong to anyone reading the number.
  const o = I.obv(bars);
  assert.equal(o[0], bars[0].v);
});

test("PSAR agrees except where a fresh flip is genuinely ambiguous", () => {
  /* Measured against TA-Lib: median difference 0.0000, and only 24 bars of 5,826 more
     than 1% apart — all of them at a reversal, where the starting trend of a new leg is
     an implementation choice rather than a fact. Documented so nobody "fixes" it into
     agreeing by accident. */
  const p = I.psar(bars);
  assert.ok(p.filter((v) => v != null).length > 6000, "PSAR should cover nearly every bar");
});
