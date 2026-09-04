/* What happens when a caller passes the wrong shape.
 *
 * Before eqdoc/indicato#2 the answer was "nothing visible": `rsi` of a number series
 * returned NaN and `bollinger` returned a middle band of 0, both with the right length
 * and the right warmup nulls. These tests exist so that cannot come back. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as TA from "../src/index.js";

const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.3 + Math.sin(i / 7) * 6);
const bars = closes.map((c) => ({ o: c, h: c, l: c, c }));

const CLOSE_ONLY = ["rsi", "bollinger", "macd", "bbPercent", "bbWidth", "envelopes",
  "stochRsi", "crsi", "ulcerIndex", "historicalVolatility"];

test("a close series gives the close-only indicators the same answer as bars do", () => {
  for (const name of CLOSE_ONLY) {
    const a = TA[name](closes), b = TA[name](bars);
    assert.deepEqual(a, b, `${name} disagreed between a series and the equivalent bars`);
  }
});

test("no close-only indicator returns NaN or a bare 0 for a series", () => {
  for (const name of CLOSE_ONLY) {
    const out = TA[name](closes);
    const series = Array.isArray(out) ? { v: out } : out;
    for (const [line, vals] of Object.entries(series)) {
      const defined = vals.filter((v) => v !== null);
      assert.ok(defined.length > 0, `${name}.${line} was entirely null`);
      assert.ok(!defined.some((v) => Number.isNaN(v)), `${name}.${line} produced NaN`);
      assert.ok(!defined.every((v) => v === 0), `${name}.${line} was all zero`);
    }
  }
});

test("an indicator that reads the high, low or volume refuses a series of numbers", () => {
  const accepted = [];
  for (const [name, fn] of Object.entries(TA)) {
    if (typeof fn !== "function" || CLOSE_ONLY.includes(name)) continue;
    const first = fn.toString().match(/\(([^)]*)\)/)?.[1].split(",")[0].trim();
    if (first !== "bars") continue;
    try { fn(closes); accepted.push(name); } catch (err) {
      assert.ok(err instanceof TypeError, `${name} threw something other than a TypeError`);
      assert.match(err.message, /needs bars/, `${name}'s message does not say what is wrong`);
    }
  }
  assert.deepEqual(accepted, [], "these took numbers where they need a high, low or volume");
});

test("an empty array is still an empty array, not an error", () => {
  assert.deepEqual(TA.rsi([], 14), []);
  assert.deepEqual(TA.atr([], 14), []);
});

test("the prior-bar Donchian is satisfiable and the default one is not", () => {
  const wave = Array.from({ length: 400 }, (_, i) => {
    const c = 100 + Math.sin(i / 11) * 25 + i * 0.05;
    return { o: c, h: c + 1.5, l: c - 1.5, c, v: 1000 };
  });
  const inclusive = TA.donchian(wave, 20);
  const prior = TA.donchian(wave, 20, true);

  const breakouts = (d) => wave.filter((b, i) => d.upper[i] !== null && b.c > d.upper[i]).length;
  assert.equal(breakouts(inclusive), 0, "a channel containing today's high cannot be broken");
  assert.ok(breakouts(prior) > 0, "the prior-bar channel must be breakable");

  /* Shifted by exactly one bar, and warmed up one bar later for it. */
  assert.equal(prior.upper.findIndex((v) => v !== null), 20);
  assert.equal(inclusive.upper.findIndex((v) => v !== null), 19);
  for (let i = 20; i < wave.length; i++) assert.equal(prior.upper[i], inclusive.upper[i - 1]);
});

test("the default Donchian is unchanged", () => {
  const wave = Array.from({ length: 100 }, (_, i) => {
    const c = 100 + Math.sin(i / 5) * 10;
    return { o: c, h: c + 1, l: c - 1, c, v: 1 };
  });
  const d = TA.donchian(wave, 20);
  for (let i = 19; i < wave.length; i++) {
    assert.equal(d.upper[i], Math.max(...wave.slice(i - 19, i + 1).map((b) => b.h)));
    assert.equal(d.lower[i], Math.min(...wave.slice(i - 19, i + 1).map((b) => b.l)));
  }
});
