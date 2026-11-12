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
  /* The candle, event and chart-pattern functions do not return one number per bar, so they are held by their own
     causality tests: candles-talib-parity.test.js, events.test.js, patterns.test.js. */
  for (const n of ["CANDLE_PATTERNS", "CURATED_CANDLES", "advanceBlock", "beltHold", "breakaway", "closingMarubozu", "concealingBabySwallow", "counterattack", "doji", "dojiStar", "dragonflyDoji", "gapSideSideWhite", "gravestoneDoji", "haramiCross", "highWave", "hikkake", "hikkakeMod", "homingPigeon", "identicalThreeCrows", "inNeck", "kicking", "kickingByLength", "longLeggedDoji", "longLine", "matchingLow", "onNeck", "rickshawMan", "riseFallThreeMethods", "separatingLines", "shortLine", "spinningTop", "stalledPattern", "stickSandwich", "takuri", "tasukiGap", "threeLineStrike", "threeStarsInSouth", "thrusting", "triStar", "twoCrows", "uniqueThreeRiver", "upsideGapTwoCrows", "xSideGapThreeMethods", "abandonedBaby", "candleLookback", "candlesAt", "darkCloudCover", "engulfing", "eveningDojiStar",
    "eveningStar", "hammer", "hangingMan", "harami", "invertedHammer", "ladderBottom", "marubozu", "matHold", "morningDojiStar",
    "morningStar", "piercing", "shootingStar", "threeBlackCrows", "threeInside", "threeOutside", "threeWhiteSoldiers",
    "DIV_MAX", "DIV_MIN", "PIVOT_K", "WARMUP", "EVENT_SIGNALS", "eventConfirmations", "fractalPivots", "indicatorEvents", "volumeRatio",
    "chartBars", "detectPatterns", "weeklyBars", "zigzag"]) helpers.add(n);
  const uncovered = exported.filter((n) => !(n in CALLS) && !helpers.has(n));
  assert.deepEqual(uncovered, [], "exported but never checked for causality");
});

/* THE SAME PROMISE IN TA-LIB MODE. { compat: "talib" } is a second implementation of nine functions, so it gets its own proof.
   The bar is higher than above: the same operations in the same order, so a series computed from the first 800 bars must equal,
   exactly, the same series computed from all 900 -- at every index, warm-up included (no 300-bar grace, no tolerance). */
const T = { compat: "talib" };
const TALIB_CALLS = {
  sma: (b) => ta.sma(closeOf(b), 20, T), rsi: (b) => ta.rsi(b, 14, T), atr: (b) => ta.atr(b, 14, T),
  macd: (b) => ta.macd(b, 12, 26, 9, T).line, macdSignal: (b) => ta.macd(b, 12, 26, 9, T).signal, macdHist: (b) => ta.macd(b, 12, 26, 9, T).hist,
  bollinger: (b) => ta.bollinger(b, 20, 2, T).upper, bollingerLower: (b) => ta.bollinger(b, 20, 2, T).lower,
  dmi: (b) => ta.dmi(b, 14, T).adx, pdi: (b) => ta.dmi(b, 14, T).pdi, mdi: (b) => ta.dmi(b, 14, T).mdi,
  psar: (b) => ta.psar(b, 0.02, 0.2, T), stochRsiK: (b) => ta.stochRsi(b, 14, 5, 3, T).k, stochRsiD: (b) => ta.stochRsi(b, 14, 5, 3, T).d,
  supertrend: (b) => ta.supertrend(b, 10, 3, T).line, supertrendUp: (b) => ta.supertrend(b, 10, 3, T).up,
};

test("TA-Lib mode: no series changes its past when the future arrives, at any index", () => {
  const guilty = [];
  for (const [name, call] of Object.entries(TALIB_CALLS)) {
    const full = call(all), part = call(all.slice(0, 800));
    if (full.length !== all.length || part.length !== 800) { guilty.push(`${name} length`); continue; }
    for (let i = 0; i < 800; i++) if (full[i] !== part[i]) { guilty.push(`${name} @${i}`); break; }
  }
  assert.deepEqual(guilty, [], "these read the future in TA-Lib mode");
});

test("TA-Lib mode: nothing is emitted before TA-Lib's first bar, and every bar after it has a value", () => {
  const first = { sma: 19, rsi: 14, atr: 14, macd: 33, macdSignal: 33, macdHist: 33, bollinger: 19, bollingerLower: 19, dmi: 27, pdi: 14, mdi: 14, psar: 1, stochRsiK: 20, stochRsiD: 20, supertrend: 10, supertrendUp: 10 };
  for (const [name, at] of Object.entries(first)) {
    const out = TALIB_CALLS[name](all);
    assert.equal(out.findIndex((v) => v !== null), at, `${name}: first value`);
    assert.ok(out.slice(at).every((v) => v !== null && (typeof v === "boolean" || Number.isFinite(v))), `${name}: a gap or a non-finite value after the first`);
  }
});
