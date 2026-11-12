/* Candlestick patterns, defined the way TA-Lib defines them.

   Twenty patterns: the reversal and continuation shapes that traders actually name. Every one returns an
   array the same length as the bars, with 0 where the pattern is absent and a signed integer where it is
   present: +100 / -100 for a bullish / bearish shape, +-80 for the weaker "equal edge" variants TA-Lib marks on
   Engulfing and Harami. The sign is the DIRECTION of the shape, not advice.

   WHY THIS MATCHES TA-LIB AND OTHER LIBRARIES DO NOT. A candle pattern is a handful of words ("long body",
   "very short shadow", "near the prior low") and every library turns them into numbers differently. TA-Lib's
   numbers are the de-facto reference, and they are not fixed thresholds: "long" is measured against the average
   body of the ten candles BEFORE the one being judged, "near" against a fifth of the average high-low range of the
   five before it, and so on (the table below). Those averages are what this file reproduces, so the output is
   integer-for-integer TA-Lib's. Measured against TA-Lib 0.7.1 over 10 companies x 600 sessions:
   docs/accuracy.md, and test/candles-talib-parity.test.js, which fails on any bar that differs.

   CAUSAL. The value at bar i reads bars i-4 .. i and the averages over the bars before those, never a later bar.
   The first `lookback` bars are 0 (TA-Lib's own lookback, exposed as `candleLookback`), because the averages do
   not exist yet.

   The averaging table (TA-Lib's defaults): setting, what is measured, bars averaged, factor.
     BodyLong        real body        10  1.0      ShadowVeryShort  high-low   10  0.1
     BodyShort       real body        10  1.0      Near             high-low    5  0.2
     BodyDoji        high-low         10  0.1      Far              high-low    5  0.6
     ShadowLong      real body         0  1.0      (period 0: the candle's own measure, not an average)
   "Real body" is |close - open|; "high-low" is high - low. */

import { requireBars } from "./guard.js";

const SETTINGS = {
  BodyLong: { range: "body", period: 10, factor: 1.0 },
  BodyShort: { range: "body", period: 10, factor: 1.0 },
  BodyDoji: { range: "hl", period: 10, factor: 0.1 },
  ShadowLong: { range: "body", period: 0, factor: 1.0 },
  ShadowVeryShort: { range: "hl", period: 10, factor: 0.1 },
  Near: { range: "hl", period: 5, factor: 0.2 },
  Far: { range: "hl", period: 5, factor: 0.6 },
};

function context(bars) {
  const n = bars.length;
  const o = new Array(n), h = new Array(n), l = new Array(n), c = new Array(n);
  for (let i = 0; i < n; i++) { o[i] = bars[i].o; h[i] = bars[i].h; l[i] = bars[i].l; c[i] = bars[i].c; }
  const body = (i) => Math.abs(c[i] - o[i]);
  const hl = (i) => h[i] - l[i];
  const rng = (kind, i) => (kind === "body" ? body(i) : hl(i));
  /* The averaged measure for candle p: factor x (sum of the measure over the `period` candles BEFORE p) / period.
     With period 0 it is the candle's own measure. */
  const avg = (s, p) => {
    if (s.period === 0) return s.factor * rng(s.range, p);
    let sum = 0;
    for (let k = p - s.period; k < p; k++) sum += rng(s.range, k);
    return s.factor * (sum / s.period);
  };
  const white = (i) => c[i] >= o[i];
  const upper = (i) => h[i] - Math.max(c[i], o[i]);
  const lower = (i) => Math.min(c[i], o[i]) - l[i];
  return { n, o, h, l, c, body, hl, avg, white, upper, lower };
}

function run(bars, lookback, test, name = "candlestick pattern") {
  requireBars(bars, name);
  const x = context(bars);
  const out = new Array(x.n).fill(0);
  for (let i = lookback; i < x.n; i++) out[i] = test(x, i) || 0;
  return out;
}

const LOOKBACK = {
  engulfing: 2, hammer: 11, invertedHammer: 11, hangingMan: 11, shootingStar: 11, piercing: 11, darkCloudCover: 11,
  morningStar: 12, morningDojiStar: 12, eveningStar: 12, eveningDojiStar: 12, harami: 11, threeWhiteSoldiers: 12,
  threeBlackCrows: 13, threeInside: 12, threeOutside: 3, abandonedBaby: 12, matHold: 14, ladderBottom: 14, marubozu: 10,
};

/* The number of leading bars each pattern leaves at 0 (TA-Lib's lookback for it). */
export function candleLookback(name) {
  if (!(name in LOOKBACK)) throw new Error(`candleLookback: unknown pattern "${name}"`);
  return LOOKBACK[name];
}

/* ---- single candle ------------------------------------------------------------------------------------ */

/* Small real body, long lower shadow, very short upper shadow, body at or below the prior candle's low (+ Near). */
export function hammer(bars) {
  return run(bars, LOOKBACK.hammer, (x, i) =>
    x.body(i) < x.avg(SETTINGS.BodyShort, i) &&
    x.lower(i) > x.avg(SETTINGS.ShadowLong, i) &&
    x.upper(i) < x.avg(SETTINGS.ShadowVeryShort, i) &&
    Math.min(x.c[i], x.o[i]) <= x.l[i - 1] + x.avg(SETTINGS.Near, i - 1) ? 100 : 0);
}

/* The hammer's shape, body near the prior candle's HIGH: -100. */
export function hangingMan(bars) {
  return run(bars, LOOKBACK.hangingMan, (x, i) =>
    x.body(i) < x.avg(SETTINGS.BodyShort, i) &&
    x.lower(i) > x.avg(SETTINGS.ShadowLong, i) &&
    x.upper(i) < x.avg(SETTINGS.ShadowVeryShort, i) &&
    Math.min(x.c[i], x.o[i]) >= x.h[i - 1] - x.avg(SETTINGS.Near, i - 1) ? -100 : 0);
}

/* Gap down (whole body below the prior body), small body, long upper shadow, very short lower shadow. */
export function invertedHammer(bars) {
  return run(bars, LOOKBACK.invertedHammer, (x, i) =>
    Math.max(x.o[i], x.c[i]) < Math.min(x.o[i - 1], x.c[i - 1]) &&
    x.body(i) < x.avg(SETTINGS.BodyShort, i) &&
    x.upper(i) > x.avg(SETTINGS.ShadowLong, i) &&
    x.lower(i) < x.avg(SETTINGS.ShadowVeryShort, i) ? 100 : 0);
}

/* Gap up, small body, long upper shadow, very short lower shadow: -100. */
export function shootingStar(bars) {
  return run(bars, LOOKBACK.shootingStar, (x, i) =>
    Math.min(x.o[i], x.c[i]) > Math.max(x.o[i - 1], x.c[i - 1]) &&
    x.body(i) < x.avg(SETTINGS.BodyShort, i) &&
    x.upper(i) > x.avg(SETTINGS.ShadowLong, i) &&
    x.lower(i) < x.avg(SETTINGS.ShadowVeryShort, i) ? -100 : 0);
}

/* A long body with very short shadows both ends. +100 white, -100 black. */
export function marubozu(bars) {
  return run(bars, LOOKBACK.marubozu, (x, i) =>
    x.body(i) > x.avg(SETTINGS.BodyLong, i) &&
    x.upper(i) < x.avg(SETTINGS.ShadowVeryShort, i) &&
    x.lower(i) < x.avg(SETTINGS.ShadowVeryShort, i) ? (x.white(i) ? 100 : -100) : 0);
}

/* ---- two candles -------------------------------------------------------------------------------------- */

/* The second body engulfs the first and has the opposite colour. +-100; +-80 when an edge of the bodies touches. */
export function engulfing(bars) {
  return run(bars, LOOKBACK.engulfing, (x, i) => {
    const w = x.white(i), p = x.white(i - 1);
    const hit = (w && !p && ((x.c[i] >= x.o[i - 1] && x.o[i] < x.c[i - 1]) || (x.c[i] > x.o[i - 1] && x.o[i] <= x.c[i - 1]))) ||
      (!w && p && ((x.o[i] >= x.c[i - 1] && x.c[i] < x.o[i - 1]) || (x.o[i] > x.c[i - 1] && x.c[i] <= x.o[i - 1])));
    if (!hit) return 0;
    const full = x.o[i] !== x.c[i - 1] && x.c[i] !== x.o[i - 1];
    return (w ? 1 : -1) * (full ? 100 : 80);
  });
}

/* A short body inside a long body. The sign is OPPOSITE the long candle's colour. +-100; +-80 when an edge touches. */
export function harami(bars) {
  return run(bars, LOOKBACK.harami, (x, i) => {
    if (!(x.body(i - 1) > x.avg(SETTINGS.BodyLong, i - 1))) return 0;
    if (!(x.body(i) <= x.avg(SETTINGS.BodyShort, i))) return 0;
    const hi = Math.max(x.c[i], x.o[i]), lo = Math.min(x.c[i], x.o[i]);
    const phi = Math.max(x.c[i - 1], x.o[i - 1]), plo = Math.min(x.c[i - 1], x.o[i - 1]);
    const sign = -(x.white(i - 1) ? 1 : -1);
    if (hi < phi && lo > plo) return sign * 100;
    if (hi <= phi && lo >= plo) return sign * 80;
    return 0;
  });
}

/* Long black, then a white candle opening below its low and closing above the midpoint of its body, inside it. */
export function piercing(bars) {
  return run(bars, LOOKBACK.piercing, (x, i) =>
    !x.white(i - 1) && x.white(i) && x.o[i] < x.l[i - 1] &&
    x.body(i - 1) > x.avg(SETTINGS.BodyLong, i - 1) &&
    x.body(i) > x.avg(SETTINGS.BodyLong, i) &&
    x.c[i] < x.o[i - 1] &&
    x.c[i] > x.c[i - 1] + x.body(i - 1) * 0.5 ? 100 : 0);
}

/* Long white, then a black candle opening above its high and closing inside its body past `penetration`. */
export function darkCloudCover(bars, penetration = 0.5) {
  return run(bars, LOOKBACK.darkCloudCover, (x, i) =>
    x.white(i - 1) && !x.white(i) && x.o[i] > x.h[i - 1] &&
    x.body(i - 1) > x.avg(SETTINGS.BodyLong, i - 1) &&
    x.c[i] > x.o[i - 1] &&
    x.c[i] < x.c[i - 1] - x.body(i - 1) * penetration ? -100 : 0);
}

/* ---- three candles ------------------------------------------------------------------------------------ */

function star(bars, name, bull, doji, penetration) {
  return run(bars, LOOKBACK[name], (x, i) => {
    const gap = bull
      ? x.o[i - 1] < x.o[i - 2] && x.o[i - 1] < x.c[i - 2] && x.c[i - 1] < x.o[i - 2] && x.c[i - 1] < x.c[i - 2]
      : x.o[i - 1] > x.o[i - 2] && x.o[i - 1] > x.c[i - 2] && x.c[i - 1] > x.o[i - 2] && x.c[i - 1] > x.c[i - 2];
    if (bull ? !(!x.white(i - 2) && x.white(i) && gap) : !(x.white(i - 2) && !x.white(i) && gap)) return 0;
    const within = bull ? x.c[i] > x.c[i - 2] + x.body(i - 2) * penetration : x.c[i] < x.c[i - 2] - x.body(i - 2) * penetration;
    const middle = doji ? x.body(i - 1) <= x.avg(SETTINGS.BodyDoji, i - 1) : x.body(i - 1) <= x.avg(SETTINGS.BodyShort, i - 1);
    const third = x.body(i) > x.avg(SETTINGS.BodyShort, i);
    return within && x.body(i - 2) > x.avg(SETTINGS.BodyLong, i - 2) && middle && third ? (bull ? 100 : -100) : 0;
  });
}

/* Long black, a short body gapping down, a white candle closing well into the first body. */
export const morningStar = (bars, penetration = 0.3) => star(bars, "morningStar", true, false, penetration);
/* The same with a doji for the middle candle. */
export const morningDojiStar = (bars, penetration = 0.3) => star(bars, "morningDojiStar", true, true, penetration);
/* Long white, a short body gapping up, a black candle closing well into the first body: -100. */
export const eveningStar = (bars, penetration = 0.3) => star(bars, "eveningStar", false, false, penetration);
export const eveningDojiStar = (bars, penetration = 0.3) => star(bars, "eveningDojiStar", false, true, penetration);

/* A doji that gaps clear of both neighbours, between a long candle and an opposite one closing well into it. */
export function abandonedBaby(bars, penetration = 0.3) {
  return run(bars, LOOKBACK.abandonedBaby, (x, i) => {
    if (!(x.body(i - 2) > x.avg(SETTINGS.BodyLong, i - 2) && x.body(i - 1) <= x.avg(SETTINGS.BodyDoji, i - 1) &&
      x.body(i) > x.avg(SETTINGS.BodyShort, i))) return 0;
    const bear = x.white(i - 2) && !x.white(i) && x.c[i] < x.c[i - 2] - x.body(i - 2) * penetration &&
      x.l[i - 1] > x.h[i - 2] && x.h[i] < x.l[i - 1];
    const bull = !x.white(i - 2) && x.white(i) && x.c[i] > x.c[i - 2] + x.body(i - 2) * penetration &&
      x.h[i - 1] < x.l[i - 2] && x.l[i] > x.h[i - 1];
    return bear || bull ? (x.white(i) ? 100 : -100) : 0;
  });
}

/* Three white candles, each opening inside the one before and closing higher, short upper shadows, bodies not shrinking. */
export function threeWhiteSoldiers(bars) {
  return run(bars, LOOKBACK.threeWhiteSoldiers, (x, i) =>
    x.white(i - 2) && x.white(i - 1) && x.white(i) &&
    x.upper(i - 2) < x.avg(SETTINGS.ShadowVeryShort, i - 2) &&
    x.upper(i - 1) < x.avg(SETTINGS.ShadowVeryShort, i - 1) &&
    x.upper(i) < x.avg(SETTINGS.ShadowVeryShort, i) &&
    x.c[i] > x.c[i - 1] && x.c[i - 1] > x.c[i - 2] &&
    x.o[i - 1] > x.o[i - 2] && x.o[i - 1] <= x.c[i - 2] + x.avg(SETTINGS.Near, i - 2) &&
    x.o[i] > x.o[i - 1] && x.o[i] <= x.c[i - 1] + x.avg(SETTINGS.Near, i - 1) &&
    x.body(i - 1) > x.body(i - 2) - x.avg(SETTINGS.Far, i - 2) &&
    x.body(i) > x.body(i - 1) - x.avg(SETTINGS.Far, i - 1) &&
    x.body(i) > x.avg(SETTINGS.BodyShort, i) ? 100 : 0);
}

/* A white candle then three black ones, each opening inside the one before and closing lower, short lower shadows. */
export function threeBlackCrows(bars) {
  return run(bars, LOOKBACK.threeBlackCrows, (x, i) =>
    x.white(i - 3) && !x.white(i - 2) && !x.white(i - 1) && !x.white(i) &&
    x.o[i - 1] < x.o[i - 2] && x.o[i - 1] > x.c[i - 2] &&
    x.o[i] < x.o[i - 1] && x.o[i] > x.c[i - 1] &&
    x.h[i - 3] > x.c[i - 2] &&
    x.c[i - 2] > x.c[i - 1] && x.c[i - 1] > x.c[i] &&
    x.lower(i - 2) < x.avg(SETTINGS.ShadowVeryShort, i - 2) && x.lower(i - 1) < x.avg(SETTINGS.ShadowVeryShort, i - 1) && x.lower(i) < x.avg(SETTINGS.ShadowVeryShort, i) ? -100 : 0);
}

/* A harami, then a third candle closing beyond the first candle's body. The sign is OPPOSITE the first candle's colour... */
export function threeInside(bars) {
  return run(bars, LOOKBACK.threeInside, (x, i) => {
    const down = ((x.c[i - 1] < x.c[i - 2] || x.c[i - 1] < x.o[i - 2]) && (x.o[i - 1] < x.c[i - 2] || x.o[i - 1] < x.o[i - 2]));
    const up = ((x.c[i - 1] > x.c[i - 2] || x.c[i - 1] > x.o[i - 2]) && (x.o[i - 1] > x.c[i - 2] || x.o[i - 1] > x.o[i - 2]));
    const third = (x.white(i - 2) && !x.white(i) && x.c[i] < x.o[i - 2]) || (!x.white(i - 2) && x.white(i) && x.c[i] > x.o[i - 2]);
    if (!((down ? 1 : 0) + (up ? 1 : 0) + (third ? 1 : 0) === 3)) return 0;
    return x.body(i - 2) > x.avg(SETTINGS.BodyLong, i - 2) && x.body(i - 1) <= x.avg(SETTINGS.BodyShort, i - 1)
      ? -(x.white(i - 2) ? 1 : -1) * 100 : 0;
  });
}

/* An engulfing pair, then a third candle continuing the engulfing candle's direction. Signed by the engulfing candle. */
export function threeOutside(bars) {
  return run(bars, LOOKBACK.threeOutside, (x, i) => {
    const up = x.white(i - 1) && !x.white(i - 2) && x.c[i - 1] > x.o[i - 2] && x.o[i - 1] < x.c[i - 2] && x.c[i] > x.c[i - 1];
    const dn = !x.white(i - 1) && x.white(i - 2) && x.o[i - 1] > x.c[i - 2] && x.c[i - 1] < x.o[i - 2] && x.c[i] < x.c[i - 1];
    return up || dn ? (x.white(i - 1) ? 100 : -100) : 0;
  });
}

/* ---- five candles ------------------------------------------------------------------------------------- */

/* Three black candles with lower opens and closes, a fourth black one with an upper shadow, then a white candle
   opening above the fourth's body and closing above its high. */
export function ladderBottom(bars) {
  return run(bars, LOOKBACK.ladderBottom, (x, i) =>
    !x.white(i - 4) && !x.white(i - 3) && !x.white(i - 2) &&
    x.o[i - 4] > x.o[i - 3] && x.o[i - 3] > x.o[i - 2] &&
    x.c[i - 4] > x.c[i - 3] && x.c[i - 3] > x.c[i - 2] &&
    !x.white(i - 1) && x.upper(i - 1) > x.avg(SETTINGS.ShadowVeryShort, i - 1) &&
    x.white(i) && x.o[i] > x.o[i - 1] && x.c[i] > x.h[i - 1] ? 100 : 0);
}

/* A long white candle, a gap up to a short black one, three short reaction candles that stay above the first
   body's `penetration` level, then a white candle closing above the reaction highs. */
export function matHold(bars, penetration = 0.5) {
  return run(bars, LOOKBACK.matHold, (x, i) => {
    if (!(x.white(i - 4) && !x.white(i - 3) && x.white(i))) return 0;
    const base = x.c[i - 4] - x.body(i - 4) * penetration;
    return (
      x.o[i - 3] > x.o[i - 4] && x.o[i - 3] > x.c[i - 4] && x.c[i - 3] > x.o[i - 4] && x.c[i - 3] > x.c[i - 4] &&
      (x.o[i - 2] < x.c[i - 4] || x.c[i - 2] < x.c[i - 4]) &&
      (x.o[i - 1] < x.c[i - 4] || x.c[i - 1] < x.c[i - 4]) &&
      x.o[i - 2] > base && x.c[i - 2] > base &&
      x.o[i - 1] > base && x.c[i - 1] > base &&
      x.c[i - 2] < x.o[i - 3] && x.o[i - 2] < x.o[i - 3] &&
      (x.c[i - 1] < x.c[i - 2] || x.c[i - 1] < x.o[i - 2]) && (x.o[i - 1] < x.c[i - 2] || x.o[i - 1] < x.o[i - 2]) &&
      x.o[i] > x.c[i - 1] &&
      x.c[i] > x.h[i - 3] && x.c[i] > x.h[i - 2] && x.c[i] > x.h[i - 1] &&
      x.body(i - 4) > x.avg(SETTINGS.BodyLong, i - 4) &&
      x.body(i - 3) < x.avg(SETTINGS.BodyShort, i - 3) &&
      x.body(i - 2) < x.avg(SETTINGS.BodyShort, i - 2) &&
      x.body(i - 1) < x.avg(SETTINGS.BodyShort, i - 1)
    ) ? 100 : 0;
  });
}

/* name -> function. The twenty, in the order a reader meets them. */
export const CANDLE_PATTERNS = {
  engulfing, hammer, invertedHammer, hangingMan, shootingStar, piercing, darkCloudCover, morningStar, morningDojiStar,
  eveningStar, eveningDojiStar, harami, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, abandonedBaby,
  matHold, ladderBottom, marubozu,
};

/* Every pattern that fires on bar `i`, as [{ name, value }]. value is the signed integer above. */
export function candlesAt(bars, i, patterns = CANDLE_PATTERNS) {
  requireBars(bars, "candlesAt");
  const out = [];
  for (const [name, fn] of Object.entries(patterns)) {
    const v = fn(bars)[i];
    if (v) out.push({ name, value: v });
  }
  return out;
}
