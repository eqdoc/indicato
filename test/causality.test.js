/* NO INDICATOR MAY READ THE FUTURE.

   This is the library's central claim and the reason to prefer it over the alternatives.
   A study that peeks one bar ahead makes every backtest downstream of it a fiction, and
   it does so silently and flatteringly — results improve, nothing errors.

   The test: a series computed from the first N bars must equal the same series computed
   from all of them, at every index below N. If knowing the future changes the past, the
   indicator is not causal.

   Ichimoku is the standing risk, because its spans are conventionally PLOTTED twenty-six
   bars forward; a library that shifts them and an engine that reads them as signals is
   exactly how this bug arrives. Ours are returned aligned to the bar they can be computed
   on. The Alligator and Williams Fractals carry the same hazard and the same answer. */
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import * as ta from "../src/index.js";

const all = JSON.parse(readFileSync(new URL("./fixtures/RELIANCE.json", import.meta.url), "utf8"))
  .map(([d, o, h, l, c, v]) => ({ d, o, h, l, c, v })).slice(0, 900);
const closeOf = (b) => b.map((x) => x.c);

/* Every public series, and how to call it. A new export with no entry here fails the
   coverage test below — which is the point: an untested indicator is an unproven claim. */
const CALLS = {
  sma: (b) => ta.sma(closeOf(b), 20), ema: (b) => ta.ema(closeOf(b), 20),
  wma: (b) => ta.wma(closeOf(b), 20), dema: (b) => ta.dema(closeOf(b), 20),
  tema: (b) => ta.tema(closeOf(b), 20), hma: (b) => ta.hma(closeOf(b), 20),
  vwma: (b) => ta.vwma(b, 20), alma: (b) => ta.alma(closeOf(b), 20),
  kama: (b) => ta.kama(closeOf(b), 10), zlema: (b) => ta.zlema(closeOf(b), 20),
  t3: (b) => ta.t3(closeOf(b), 5), trima: (b) => ta.trima(closeOf(b), 20),
  mcginley: (b) => ta.mcginley(closeOf(b), 14), vidya: (b) => ta.vidya(closeOf(b), 14),
  frama: (b) => ta.frama(b, 16),
  rsi: (b) => ta.rsi(b, 14), atr: (b) => ta.atr(b, 14), natr: (b) => ta.natr(b, 14),
  cci: (b) => ta.cci(b, 20), williamsR: (b) => ta.williamsR(b, 14),
  roc: (b) => ta.roc(closeOf(b), 12), momentum: (b) => ta.momentum(closeOf(b), 10),
  cmo: (b) => ta.cmo(closeOf(b), 14), trix: (b) => ta.trix(closeOf(b), 15),
  ppo: (b) => ta.ppo(closeOf(b)), po: (b) => ta.po(closeOf(b)), dpo: (b) => ta.dpo(closeOf(b), 20),
  ao: (b) => ta.ao(b), ac: (b) => ta.ac(b), tsi: (b) => ta.tsi(closeOf(b)),
  kst: (b) => ta.kst(closeOf(b)), coppock: (b) => ta.coppock(closeOf(b)),
  ultosc: (b) => ta.ultosc(b), bop: (b) => ta.bop(b), crsi: (b) => ta.crsi(b, 3),
  obv: (b) => ta.obv(b), vwap: (b) => ta.vwap(b), adl: (b) => ta.adl(b),
  cmf: (b) => ta.cmf(b, 20), chaikinOsc: (b) => ta.chaikinOsc(b), emv: (b) => ta.emv(b, 14),
  forceIndex: (b) => ta.forceIndex(b, 13), nvi: (b) => ta.nvi(b), pvi: (b) => ta.pvi(b),
  pvt: (b) => ta.pvt(b), volumeOsc: (b) => ta.volumeOsc(b), vroc: (b) => ta.vroc(b, 14),
  mfi: (b) => ta.mfi(b, 14), ulcerIndex: (b) => ta.ulcerIndex(b, 14),
  massIndex: (b) => ta.massIndex(b, 25), chop: (b) => ta.chop(b, 14),
  bbPercent: (b) => ta.bbPercent(b, 20), bbWidth: (b) => ta.bbWidth(b, 20),
  historicalVolatility: (b) => ta.historicalVolatility(b, 20),
  stc: (b) => ta.stc(closeOf(b), 23), linreg: (b) => ta.linreg(closeOf(b), 14),
  linregSlope: (b) => ta.linregSlope(closeOf(b), 14), tsf: (b) => ta.tsf(closeOf(b), 14),
  median: (b) => ta.median(closeOf(b), 14), variance: (b) => ta.variance(closeOf(b), 14),
  mode: (b) => ta.mode(closeOf(b), 20),
  psar: (b) => ta.psar(b), pivotPoints: (b) => ta.pivotPoints(b).r1,
  williamsFractals: (b) => ta.williamsFractals(b).up,
  supertrend: (b) => ta.supertrend(b).line, ichimoku: (b) => ta.ichimoku(b).spanA,
  alligator: (b) => ta.alligator(b).jaw, gator: (b) => ta.gator(b).upper,
  aroon: (b) => ta.aroon(b, 25).up, vortex: (b) => ta.vortex(b, 14).plus,
  rwi: (b) => ta.rwi(b, 14).high, dmi: (b) => ta.dmi(b, 14).adx,
  stochastic: (b) => ta.stochastic(b, 14).k, stochRsi: (b) => ta.stochRsi(b, 14).k,
  rvi: (b) => ta.rvi(b, 10).line, fisher: (b) => ta.fisher(b, 9).fisher,
  elderRay: (b) => ta.elderRay(b, 13).bull, macd: (b) => ta.macd(b).line,
  bollinger: (b) => ta.bollinger(b, 20).upper, keltner: (b) => ta.keltner(b, 20).upper,
  donchian: (b) => ta.donchian(b, 20).upper, starc: (b) => ta.starc(b).upper,
  chandelierExit: (b) => ta.chandelierExit(b).long,
  chandeKrollStop: (b) => ta.chandeKrollStop(b).long,
  envelopes: (b) => ta.envelopes(b, 20).upper, yearBand: (b) => ta.yearBand(b).upper,
  klinger: (b) => ta.klinger(b).kvo,
  /* Two-series functions: compared against a lagged copy of the close, because the
     library carries no benchmark of its own. */
  correlation: (b) => ta.correlation(closeOf(b), closeOf(b).map((_, i, a) => a[Math.max(0, i - 1)]), 20),
  beta: (b) => ta.beta(closeOf(b), closeOf(b).map((_, i, a) => a[Math.max(0, i - 1)]), 20),
};

test("no indicator changes its past when the future arrives", () => {
  const CUT = 800;
  const short = all.slice(0, CUT);
  const guilty = [];
  for (const [name, call] of Object.entries(CALLS)) {
    let full, part;
    try { full = call(all); part = call(short); } catch (e) { guilty.push(`${name} threw: ${e.message}`); continue; }
    if (!Array.isArray(full)) { guilty.push(`${name} did not return an array`); continue; }
    for (let i = 300; i < CUT; i++) {
      const a = full[i], b = part[i];
      if (a == null && b == null) continue;
      if (a == null || b == null || Math.abs(a - b) > 1e-6) { guilty.push(`${name} @${i}`); break; }
    }
  }
  assert.deepEqual(guilty, [], "these indicators read the future");
});

test("every output is the same length as its input", () => {
  for (const [name, call] of Object.entries(CALLS)) {
    const out = call(all);
    assert.equal(out.length, all.length, `${name} returned ${out.length} for ${all.length} bars`);
  }
});

test("every exported function is covered by the causality check", () => {
  /* An export with no entry above is an unproven claim shipped as a fact. */
  const exported = Object.keys(ta).filter((k) => typeof ta[k] === "function");
  const helpers = new Set(["highest", "lowest", "trueRange", "rma", "stdev", "vol"]);
  const uncovered = exported.filter((n) => !(n in CALLS) && !helpers.has(n));
  assert.deepEqual(uncovered, [], "exported but never checked for causality");
});
