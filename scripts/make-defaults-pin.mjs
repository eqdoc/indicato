#!/usr/bin/env node
/* Regenerate test/fixtures/defaults-0.2.0.json: a SHA-256 of what every indicator returns by default, on the committed fixtures.
 *
 *     node scripts/make-defaults-pin.mjs > test/fixtures/defaults-0.2.0.json
 *
 * It was generated ONCE, from the v0.2.0 tree (git checkout v0.2.0 -- src; run; git checkout HEAD -- src), before any
 * TA-Lib-compatible code existed, and is not regenerated when the library changes: its whole job is to fail when a default
 * output moves (test/defaults-pinned.test.js). Each entry hashes JSON.stringify of the result (NaN and Infinity spelled out), so a changed digit, a null that
 * became NaN, or a different length all change the hash. A call that throws is pinned as the message it throws. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as I from "../src/indicators.js";

const fx = (f) => JSON.parse(readFileSync(new URL(`../test/fixtures/${f}`, import.meta.url), "utf8"));
const toBars = (rows) => rows.map((r) => (r.length === 6 ? { d: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] } : { o: r[0], h: r[1], l: r[2], c: r[3], v: r[4] }));

export function datasets() {
  const sets = { RELIANCE: toBars(fx("RELIANCE.json")) };
  for (const [sym, d] of Object.entries(fx("events-reference.json").symbols)) sets[sym] = toBars(d.bars);
  sets.NEWLISTING = sets.TCS.slice(0, 45);
  return sets;
}

/* the functions whose 0.3 change touches them, with the non-default parameters a caller is likely to pass */
export const EXTRA = {
  rsi: [[7], [21]], atr: [[10], [20]], dmi: [[10], [20]], macd: [[5, 35, 5], [8, 17, 9]], bollinger: [[10, 1.5], [50, 3]],
  psar: [[0.01, 0.1], [0.03, 0.3]], stochRsi: [[14, 5, 3], [10, 3, 3]], supertrend: [[7, 2], [14, 3]], sma: [[5], [50]],
};

const keep = (_, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v);   // NaN and Infinity are not null
const digest = (v) => createHash("sha256").update(JSON.stringify(v, keep)).digest("hex");
function run(f, args) {
  try { return digest(f(...args)); } catch (e) { return `throws: ${e.message}`; }
}

export function pin() {
  const sets = datasets();
  const out = {};
  for (const [name, f] of Object.entries(I)) {
    if (typeof f !== "function") continue;
    out[name] = {};
    for (const [sym, bars] of Object.entries(sets)) {
      const subject = name === "sma" ? bars.map((b) => b.c) : bars;
      out[name][sym] = run(f, [subject]);
      (EXTRA[name] || []).forEach((a, k) => { out[name][`${sym}#${k}`] = run(f, [subject, ...a]); });
    }
    /* a plain series of closes, for the ones that accept it */
    out[name].numbers = run(f, [sets.RELIANCE.slice(0, 400).map((b) => b.c)]);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ version: "0.2.0", note: "SHA-256 of JSON.stringify(result) per function and dataset; see scripts/make-defaults-pin.mjs", pins: pin() }, null, 1));
}
