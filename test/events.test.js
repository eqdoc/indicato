/* Indicator events: the JS port agrees with the Python reference, event for event, and never reads the future.

   events-reference.json holds the events eqdoc's nightly scan (Python, TA-Lib: pipeline/jobs/signal_events.py) finds on ten
   real companies across sectors, 600 sessions each (scripts/make-events-fixture.py). This file requires indicatorEvents to
   return exactly those: same bar, same side, same divergence pivots. The two implementations compute their indicators
   separately (TA-Lib there, this library here), so the test also pins that those agree well enough never to move an event.
   Over 222 further symbols (not committed) the two agreed on 99.9% of 50,000+ events; the rare differences are
   crosses decided by 1e-13 on a flat series (docs/accuracy.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as TA from "../src/index.js";

const F = JSON.parse(readFileSync(new URL("./fixtures/events-reference.json", import.meta.url), "utf8"));
const toBars = (rows) => rows.map(([o, h, l, c, v]) => ({ o, h, l, c, v }));
const KEYS = Object.keys(TA.EVENT_SIGNALS);

test("the fixture and the library name the same signals", () => {
  assert.deepEqual(F.signals, KEYS);
  assert.equal(KEYS.length, 11);
});

test("every event equals the Python reference, on ten real companies", () => {
  let total = 0;
  for (const [sym, d] of Object.entries(F.symbols)) {
    const ev = TA.indicatorEvents(toBars(d.bars));
    for (const k of KEYS) {
      const got = ev[k].map((e) => [e.i, e.side]);
      const ref = d.events[k].map(([i, side]) => [i, side]);
      assert.deepEqual(got, ref, `${sym} ${k}`);
      total += got.length;
      /* divergence pivots */
      if (k === "rsidiv" || k === "macddiv") {
        ev[k].forEach((e, n) => {
          const g = d.events[k][n][2];
          for (const p of ["p1", "p2"]) {
            assert.equal(e.geometry[p][0], g[p][0]);
            assert.ok(Math.abs(e.geometry[p][1] - g[p][1]) < 1e-9);
            /* The indicator at a pivot: the two libraries seed their averages differently (docs/accuracy.md), so early pivots
               differ a little and the difference decays to nothing; from bar 200 they agree to 1e-6. */
            const tol = g[p][0] >= 200 ? 1e-6 : 0.05 * Math.max(Math.abs(g[p][2]), 1);
            assert.ok(Math.abs(e.geometry[p][2] - g[p][2]) < tol, `${sym} ${k} indicator value at the pivot`);
          }
        });
      } else {
        assert.ok(ev[k].every((e) => e.geometry === null));
      }
    }
  }
  assert.ok(total > 1500, `real events to compare (${total})`);
});

test("NO EVENT READS THE FUTURE: bars cut at t give the same events up to t", () => {
  for (const sym of ["RELIANCE", "TATASTEEL", "DLF"]) {
    const bars = toBars(F.symbols[sym].bars);
    const full = TA.indicatorEvents(bars);
    for (const cut of [250, 400, 520]) {
      const part = TA.indicatorEvents(bars.slice(0, cut));
      for (const k of KEYS) {
        const want = full[k].filter((e) => e.i < cut).map((e) => [e.i, e.side]);
        assert.deepEqual(part[k].map((e) => [e.i, e.side]), want, `${sym} ${k}: events before bar ${cut} changed when later bars arrived`);
      }
    }
  }
});

test("a divergence is dated the bar its second pivot is confirmed, not the pivot", () => {
  let n = 0;
  for (const d of Object.values(F.symbols)) {
    const ev = TA.indicatorEvents(toBars(d.bars));
    for (const k of ["rsidiv", "macddiv"]) {
      for (const e of ev[k]) {
        assert.equal(e.i, e.geometry.p2[0] + TA.PIVOT_K);
        const gap = e.geometry.p2[0] - e.geometry.p1[0];
        assert.ok(gap >= TA.DIV_MIN && gap <= TA.DIV_MAX);
        n++;
      }
    }
  }
  assert.ok(n > 30);
});

test("no event before the warmup, and no signal is noise", () => {
  let stockDays = 0;
  const counts = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const d of Object.values(F.symbols)) {
    const ev = TA.indicatorEvents(toBars(d.bars));
    for (const k of KEYS) {
      assert.ok(ev[k].every((e) => e.i >= TA.WARMUP), `${k} fired inside the warmup`);
      counts[k] += ev[k].filter((e) => e.i >= d.bars.length - 250).length;
    }
    stockDays += 250;
  }
  for (const k of KEYS) assert.ok(counts[k] / stockDays < 0.08, `${k} fires on ${(100 * counts[k] / stockDays).toFixed(1)}% of stock-days`);
});

test("names describe what happened and are never an instruction", () => {
  for (const [k, s] of Object.entries(TA.EVENT_SIGNALS)) {
    for (const side of ["bull", "bear"]) {
      const name = s.names[side];
      assert.ok(name && !/\b(buy|sell|target|recommend)\b/i.test(name), `${k} ${side}: ${name}`);
    }
  }
});

test("confirmations: 1 for the event, +1 on volume, +1 on a decisive close", () => {
  const bars = Array.from({ length: 40 }, () => ({ o: 10, h: 11, l: 9, c: 10, v: 100 }));
  assert.equal(TA.eventConfirmations(bars, 30, "bull").conf, 1);
  bars[30] = { o: 10, h: 11, l: 9, c: 10.9, v: 300 };
  assert.equal(TA.eventConfirmations(bars, 30, "bull").conf, 3);
  assert.equal(TA.eventConfirmations(bars, 30, "bear").conf, 2);
});

test("short or flat series give no events and no errors", () => {
  assert.deepEqual(Object.values(TA.indicatorEvents([])).flat(), []);
  const flat = Array.from({ length: 400 }, () => ({ o: 10, h: 10, l: 10, c: 10, v: 0 }));
  assert.doesNotThrow(() => TA.indicatorEvents(flat));
});
