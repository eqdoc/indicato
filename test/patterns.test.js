/* Chart patterns with geometry: the JS port agrees with the Python reference, point for point, and the rules hold on
   drawn series.

   Three kinds of check.
     1. GOLDEN: patterns-reference.json is what eqdoc's nightly scan (pipeline/jobs/chart_geometry.py, numpy only) detects on
        ten real companies at thirty as-of dates over 600 sessions each, geometry included (scripts/make-patterns-fixture.py).
        detectPatterns must return the same detections: name, side, state, formed bar and date, confidence, and every point
        and line of the geometry (to the cent). 55 detections. Over 70 further symbols x 16 as-of runs (not committed) the
        two agreed on all 406.
     2. DRAWN SERIES, each with one pattern in it: found, named, in the right state, with the right defining points; the
        same series with the break's volume taken away is NOT reported; with the break left out it is "forming".
     3. CAUSALITY: the zigzag on bars cut at t is the zigzag of the whole series restricted to pivots confirmed by t, and
        no detection carries a date after its last bar. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as TA from "../src/index.js";

const F = JSON.parse(readFileSync(new URL("./fixtures/patterns-reference.json", import.meta.url), "utf8"));
const rowsOf = (d) => d.bars.map(([dd, o, h, l, c, v]) => ({ d: dd, o, h, l, c, v }));

const near = (a, b, path = "") => {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.011 ? null : `${path}: ${a} vs ${b}`;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b ? null : `${path}: ${a} vs ${b}`;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `${path}: keys ${ka} vs ${kb}`;
  for (const k of ka) { const r = near(a[k], b[k], `${path}.${k}`); if (r) return r; }
  return null;
};

test("detections equal the Python reference, point for point, on ten real companies", () => {
  let compared = 0;
  for (const [sym, d] of Object.entries(F.symbols)) {
    const rows = rowsOf(d);
    for (const run of d.runs) {
      const got = TA.detectPatterns(rows.slice(0, run.cut + 1).slice(-520));
      const key = (r) => `${r.name}|${r.side}`;
      assert.deepEqual(got.map(key).sort(), run.detections.map(key).sort(), `${sym} as of bar ${run.cut}: the set of patterns`);
      for (const ref of run.detections) {
        const g = got.find((x) => key(x) === key(ref));
        const where = `${sym} @${run.cut} ${ref.name}`;
        assert.equal(g.state, ref.state, where);
        assert.equal(g.formedIndex, ref.formed_i, where);
        assert.equal(g.formedDate, ref.formed_date, where);
        assert.equal(g.conf, ref.conf, where);
        assert.equal(g.tf, ref.tf, where);
        assert.equal(near(g.geometry, ref.geometry), null, `${where}: geometry`);
        compared++;
      }
    }
  }
  assert.ok(compared >= 50, `real detections to compare (${compared})`);
});

/* ---- drawn series -------------------------------------------------------------------------------------- */

/* Business-day bars on a piecewise-linear close path: legs [[price, 1], [target, bars], ...]. Volume 1000 a session, x4 on `spikes`. */
function draw(legs, spikes = new Set()) {
  const px = [legs[0][0]];
  for (const [tgt, k] of legs.slice(1)) { const a = px[px.length - 1]; for (let j = 1; j <= k; j++) px.push(a + (tgt - a) * j / k); }
  const rows = [];
  const d = new Date(Date.UTC(2025, 0, 6));
  px.forEach((p, i) => {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    const o = i ? px[i - 1] : p, c = p * (1 + 0.002 * ((i % 3) - 1));
    rows.push({ d: d.toISOString().slice(0, 10), o, h: Math.max(o, c) * 1.004, l: Math.min(o, c) * 0.996, c, v: 1000 * (spikes.has(i) ? 4 : 1) });
    d.setUTCDate(d.getUTCDate() + 1);
  });
  return rows;
}
const total = (legs) => legs.slice(1).reduce((s, [, k]) => s + k, 0) + 1;
const find = (rows, name) => TA.detectPatterns(rows).find((r) => r.name === name) ?? null;
const roles = (r) => Object.fromEntries(r.geometry.points.map((p) => [p.role, p]));
const lastSpikes = (legs, ...back) => new Set(back.map((b) => total(legs) - b));

test("head and shoulders: confirmed, with its five points and the neckline", () => {
  const HS = [[100, 1], [100, 60], [130, 20], [115, 10], [150, 14], [116, 14], [131, 10], [104, 12]];
  const r = find(draw(HS, lastSpikes(HS, 4, 3, 2)), "Head and shoulders");
  assert.deepEqual([r.side, r.state], ["bear", "confirmed"]);
  const p = roles(r);
  assert.deepEqual(Object.keys(p), ["left_shoulder", "neck_left", "head", "neck_right", "right_shoulder"]);
  assert.ok(p.head.p > p.left_shoulder.p && p.head.p > p.right_shoulder.p);
  const dates = Object.values(p).map((x) => x.d);
  assert.deepEqual(dates, [...dates].sort());
  assert.deepEqual(r.geometry.lines[0], { role: "neckline", from: { d: p.neck_left.d, p: p.neck_left.p }, to: { d: p.neck_right.d, p: p.neck_right.p } });
  assert.equal(r.formedDate, r.geometry.event.d);
  assert.ok(r.geometry.event.vol >= 1.25);
  assert.equal(find(draw(HS), "Head and shoulders"), null, "a break with no volume is not reported");
  const forming = find(draw([...HS.slice(0, -1), [122, 4]]), "Head and shoulders");
  assert.deepEqual([forming.state, forming.formedDate], ["forming", roles(forming).right_shoulder.d]);
  const failed = find(draw([...HS.slice(0, -1), [122, 4], [155, 8]]), "Head and shoulders");
  assert.equal(failed?.state, "failed", "price taking out the head");
});

test("inverse head and shoulders, double top, double bottom", () => {
  const IHS = [[150, 1], [150, 60], [120, 20], [135, 10], [90, 14], [134, 14], [121, 10], [146, 12]];
  const a = find(draw(IHS, lastSpikes(IHS, 4, 3, 2)), "Inverse head and shoulders");
  assert.deepEqual([a.side, a.state], ["bull", "confirmed"]);
  const DT = [[100, 1], [100, 50], [140, 25], [118, 15], [140, 15], [113, 8]];
  const b = find(draw(DT, lastSpikes(DT, 4, 3, 2)), "Double top");
  assert.deepEqual([b.side, b.state], ["bear", "confirmed"]);
  assert.deepEqual(Object.keys(roles(b)), ["first_top", "trough", "second_top"]);
  assert.equal(find(draw([...DT, [111, 6]]), "Double top"), null, "no volume on the break, after the volume window");
  assert.equal(find(draw(DT), "Double top").state, "forming", "a break in the last two sessions: volume not known yet");
  const DB = [[140, 1], [140, 50], [100, 25], [122, 15], [100, 15], [128, 8]];
  const c = find(draw(DB, lastSpikes(DB, 4, 3, 2)), "Double bottom");
  assert.deepEqual([c.side, c.state], ["bull", "confirmed"]);
  assert.equal(find(draw(DT, lastSpikes(DT, 4)), "Double top (weekly)"), null, "doubles are daily only");
});

test("triangles, wedges, cup and handle, flags", () => {
  const ASC = [[100, 1], [100, 40], [120, 12], [100, 10], [120, 10], [106, 8], [120, 8], [111, 6], [120, 6], [114, 5], [126, 5]];
  const asc = find(draw(ASC, lastSpikes(ASC, 3, 2, 1)), "Ascending triangle");
  assert.deepEqual([asc.side, asc.state], ["bull", "confirmed"]);
  assert.ok(asc.geometry.touches >= 5);
  const upper = asc.geometry.lines.find((x) => x.role === "upper"), lower = asc.geometry.lines.find((x) => x.role === "lower");
  assert.ok(Math.abs(upper.to.p - upper.from.p) < 1 && lower.to.p > lower.from.p + 5);
  const SYM = [[100, 1], [100, 40], [130, 12], [100, 10], [124, 10], [106, 8], [118, 8], [110, 6], [114, 5], [112, 3], [122, 5]];
  const sym = find(draw(SYM, lastSpikes(SYM, 3, 2, 1)), "Symmetrical triangle");
  assert.deepEqual([sym.state, sym.side], ["confirmed", "bull"], "a symmetrical triangle takes its side from the break");
  const FW = [[130, 1], [130, 30], [112, 10], [124, 8], [108, 8], [119, 6], [106, 6], [114, 5], [105, 4], [118, 6]];
  const fw = find(draw(FW, lastSpikes(FW, 3, 2, 1)), "Falling wedge");
  assert.deepEqual([fw.side, fw.state], ["bull", "confirmed"]);

  const cup = Array.from({ length: 40 }, (_, i) => [105 + 25 * (-1 + 2 * i / 39) ** 2, 1]);
  const CUP = [[100, 1], [100, 40], [130, 15], ...cup, [122, 6], [124, 3], [131, 6]];
  const cr = find(draw(CUP, lastSpikes(CUP, 3, 2, 1)), "Cup and handle");
  assert.deepEqual([cr.side, cr.state], ["bull", "confirmed"]);
  assert.deepEqual(Object.keys(roles(cr)), ["left_rim", "cup_low", "right_rim", "handle_low"]);
  assert.ok(cr.geometry.r2 >= 0.8);
  assert.equal(find(draw([...CUP, [135, 6]]), "Cup and handle"), null, "no volume behind the break");
  const V = [[100, 1], [100, 40], [130, 15], [105, 20], [130, 20], [122, 6], [124, 3], [131, 6]];
  assert.equal(find(draw(V, lastSpikes(V, 2)), "Cup and handle"), null, "a V is not a cup");

  const FLAG = [[100, 1], [100, 60], [125, 8], [117, 10], [128, 3]];
  const pole = new Set(Array.from({ length: 8 }, (_, i) => 61 + i));
  const fl = find(draw(FLAG, new Set([...pole, ...lastSpikes(FLAG, 2, 1)])), "Bull flag");
  assert.deepEqual([fl.side, fl.state], ["bull", "confirmed"]);
  assert.ok(fl.geometry.pole_pct >= 20);
  const BF = [[125, 1], [125, 60], [100, 8], [108, 10], [97, 3]];
  const bf = find(draw(BF, new Set([...pole, ...lastSpikes(BF, 2, 1)])), "Bear flag");
  assert.deepEqual([bf.side, bf.state], ["bear", "confirmed"]);
  assert.equal(find(draw([[100, 1], [100, 60], [108, 20], [104, 10]], pole), "Bull flag"), null, "a gentle drift is not a pole");
});

/* ---- geometry is consistent with the bars it came from ---------------------------------------------------- */

test("every point is a session of the series at that session's extreme, every date is on or before the last bar", () => {
  let checked = 0;
  for (const d of Object.values(F.symbols)) {
    for (const run of d.runs) {
    const rows = rowsOf(d).slice(0, run.cut + 1).slice(-520);
    const byDate = new Map(rows.map((r) => [r.d, r]));
    for (const r of TA.detectPatterns(rows)) {
      for (const pt of r.geometry.points) {
        const bar = byDate.get(pt.d);
        assert.ok(bar, `${r.name}: ${pt.d} is not a session`);
        assert.ok([bar.h, bar.l, bar.c].some((x) => Math.abs(x - pt.p) < 0.0051), `${r.name} ${pt.role}: ${pt.p} is not that session's high or low`);
        assert.ok(pt.d <= rows[rows.length - 1].d);
        checked++;
      }
      assert.ok(r.formedDate <= rows[rows.length - 1].d);
      assert.ok(["forming", "confirmed", "failed"].includes(r.state));
      assert.doesNotThrow(() => JSON.stringify(r.geometry));
    }
    }
  }
  assert.ok(checked > 100);
});

test("NO LOOK-AHEAD: the zigzag of bars cut at t is the whole series' pivots that were confirmed by t", () => {
  for (const sym of ["RELIANCE", "TCS", "ITC", "DLF"]) {
    const rows = rowsOf(F.symbols[sym]);
    const b = TA.chartBars(rows, "daily");
    const full = TA.zigzag(b.h, b.l, b.thr);
    for (const cut of [300, 420, 560]) {
      const part = TA.zigzag(b.h.slice(0, cut), b.l.slice(0, cut), b.thr);
      assert.deepEqual(part, full.filter((x) => x.confirmedAt < cut), `${sym}: pivots changed when later bars arrived (cut ${cut})`);
    }
  }
});

test("short or flat series are not an error", () => {
  assert.deepEqual(TA.detectPatterns([]), []);
  assert.deepEqual(TA.detectPatterns(draw([[100, 1], [101, 30]])), []);
  const flat = Array.from({ length: 300 }, (_, i) => ({ d: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), o: 10, h: 10.01, l: 9.99, c: 10, v: 100 }));
  assert.doesNotThrow(() => TA.detectPatterns(flat));
});
