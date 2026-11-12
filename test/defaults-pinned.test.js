/* The default output of every indicator is the 0.2.0 output, to the last bit.

   0.3.0 adds { compat: "talib" } to nine functions and promises that nothing a caller already gets has moved. This file holds
   the promise: defaults-0.2.0.json was generated from the v0.2.0 tree (scripts/make-defaults-pin.mjs) and records a SHA-256 of
   what each of the 89 indicators returns on RELIANCE (6,126 bars), ten more companies, a 45-bar new listing and a plain series
   of closes, with the default parameters and, for the nine that changed, with the non-default ones too.
   If this fails, a default moved. That is a major version (README, "Versioning"), not a patch to a fixture. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pin } from "../scripts/make-defaults-pin.mjs";

const PINNED = JSON.parse(readFileSync(new URL("./fixtures/defaults-0.2.0.json", import.meta.url), "utf8"));

test("every indicator's default output equals the 0.2.0 output, byte for byte", () => {
  assert.equal(PINNED.version, "0.2.0");
  const now = pin();
  assert.deepEqual(Object.keys(now).sort(), Object.keys(PINNED.pins).sort(), "an indicator was added or removed: that is not a patch");
  let compared = 0;
  for (const [fn, byData] of Object.entries(PINNED.pins)) {
    for (const [key, want] of Object.entries(byData)) {
      assert.equal(now[fn][key], want, `${fn} on ${key}: the default output changed`);
      compared++;
    }
  }
  assert.ok(compared > 1200, `only ${compared} outputs pinned`);
});

test("passing no options, undefined, an empty object or the default string is the default", async () => {
  const I = await import("../src/index.js");
  const bars = JSON.parse(readFileSync(new URL("./fixtures/RELIANCE.json", import.meta.url), "utf8")).slice(0, 300)
    .map(([d, o, h, l, c, v]) => ({ d, o, h, l, c, v }));
  const calls = {
    rsi: [bars, 14], atr: [bars, 14], dmi: [bars, 14], macd: [bars, 12, 26, 9], bollinger: [bars, 20, 2],
    psar: [bars, 0.02, 0.2], stochRsi: [bars, 14, 3, 3], supertrend: [bars, 10, 3], sma: [bars.map((b) => b.c), 20],
  };
  for (const [fn, args] of Object.entries(calls)) {
    const base = JSON.stringify(I[fn](...args));
    for (const opts of [undefined, {}, { compat: undefined }, { compat: null }, { compat: "default" }]) {
      assert.equal(JSON.stringify(I[fn](...args, opts)), base, `${fn} with ${JSON.stringify(opts)}`);
    }
  }
});
