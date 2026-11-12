/* Candlestick patterns, group G2, ported from TA-Lib 0.7.1 (same averaging rules as candles.js; see candle-kit.js).
   Each returns an array the same length as the bars: 0 where absent, TA-Lib's signed integer where present.
   The sign is the direction of the shape, not advice. */
import { SET, runCandle } from "./candle-kit.js";

export const LOOKBACK_G2 = {
  dojiStar: 11, haramiCross: 11, homingPigeon: 11, inNeck: 11, onNeck: 11, thrusting: 11,
  counterattack: 11, matchingLow: 6, separatingLines: 11, kicking: 11, kickingByLength: 11,
};
const LOOKBACK = LOOKBACK_G2;

/* A long candle, then a doji that gaps beyond its whole body (up after white, down after black). Sign opposes the long candle. */
export function dojiStar(bars) {
  return runCandle(bars, "dojiStar", LOOKBACK.dojiStar, (x, i) => {
    const w = x.white(i - 1);
    if (!(x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body"))) return 0;
    if (!(x.body(i) <= x.avg(SET.BodyDoji, i, "hl"))) return 0;
    const gap = w
      ? x.o[i] > x.o[i - 1] && x.o[i] > x.c[i - 1] && x.c[i] > x.o[i - 1] && x.c[i] > x.c[i - 1]
      : x.o[i] < x.o[i - 1] && x.o[i] < x.c[i - 1] && x.c[i] < x.o[i - 1] && x.c[i] < x.c[i - 1];
    return gap ? -(w ? 1 : -1) * 100 : 0;
  });
}

/* A long candle followed by a doji inside its body. Sign opposes the long candle; +-80 when a body edge touches. */
export function haramiCross(bars) {
  return runCandle(bars, "haramiCross", LOOKBACK.haramiCross, (x, i) => {
    if (!(x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body"))) return 0;
    if (!(x.body(i) <= x.avg(SET.BodyDoji, i, "hl"))) return 0;
    const { o, c } = x, a = -(x.white(i - 1) ? 1 : -1);
    const loose = (c[i] <= c[i - 1] || c[i] <= o[i - 1]) && (o[i] <= c[i - 1] || o[i] <= o[i - 1]) &&
      (c[i] >= c[i - 1] || c[i] >= o[i - 1]) && (o[i] >= c[i - 1] || o[i] >= o[i - 1]);
    const strict = (c[i] < c[i - 1] || c[i] < o[i - 1]) && (o[i] < c[i - 1] || o[i] < o[i - 1]) &&
      (c[i] > c[i - 1] || c[i] > o[i - 1]) && (o[i] > c[i - 1] || o[i] > o[i - 1]);
    return strict ? a * 100 : loose ? a * 80 : 0;
  });
}

/* A long black candle, then a short black candle opening and closing inside it: +100. */
export function homingPigeon(bars) {
  return runCandle(bars, "homingPigeon", LOOKBACK.homingPigeon, (x, i) =>
    !x.white(i - 1) && !x.white(i) && x.c[i] > x.c[i - 1] &&
    x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body") &&
    x.body(i) <= x.avg(SET.BodyShort, i, "body") &&
    x.o[i] < x.o[i - 1] ? 100 : 0);
}

/* Long black, then a white candle opening below its low and closing slightly into its body: -100. */
export function inNeck(bars) {
  return runCandle(bars, "inNeck", LOOKBACK.inNeck, (x, i) =>
    !x.white(i - 1) && x.white(i) && x.o[i] < x.l[i - 1] &&
    x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body") &&
    x.c[i] <= x.c[i - 1] + x.avg(SET.Equal, i - 1, "hl") &&
    x.c[i] >= x.c[i - 1] ? -100 : 0);
}

/* Long black, then a white candle opening below its low and closing at about that low: -100. */
export function onNeck(bars) {
  return runCandle(bars, "onNeck", LOOKBACK.onNeck, (x, i) => {
    if (!(!x.white(i - 1) && x.white(i) && x.o[i] < x.l[i - 1])) return 0;
    const e = x.avg(SET.Equal, i - 1, "hl");
    return x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body") &&
      x.c[i] <= x.l[i - 1] + e && x.c[i] >= x.l[i - 1] - e ? -100 : 0;
  });
}

/* Long black, then a white candle opening below its low and closing into its body, but under the midpoint: -100. */
export function thrusting(bars) {
  return runCandle(bars, "thrusting", LOOKBACK.thrusting, (x, i) =>
    !x.white(i - 1) && x.white(i) && x.o[i] < x.l[i - 1] &&
    x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body") &&
    x.c[i] > x.c[i - 1] + x.avg(SET.Equal, i - 1, "hl") &&
    x.c[i] <= x.body(i - 1) * 0.5 + x.c[i - 1] ? -100 : 0);
}

/* Two long candles of opposite colour that close at about the same level. Sign is the second candle's colour. */
export function counterattack(bars) {
  return runCandle(bars, "counterattack", LOOKBACK.counterattack, (x, i) => {
    if (x.white(i - 1) === x.white(i)) return 0;
    if (!(x.body(i - 1) > x.avg(SET.BodyLong, i - 1, "body"))) return 0;
    if (!(x.body(i) > x.avg(SET.BodyLong, i, "body"))) return 0;
    const e = x.avg(SET.Equal, i - 1, "hl");
    return x.c[i] <= x.c[i - 1] + e && x.c[i] >= x.c[i - 1] - e ? (x.white(i) ? 100 : -100) : 0;
  });
}

/* Two black candles closing at about the same level: +100. */
export function matchingLow(bars) {
  return runCandle(bars, "matchingLow", LOOKBACK.matchingLow, (x, i) => {
    if (x.white(i - 1) || x.white(i)) return 0;
    const e = x.avg(SET.Equal, i - 1, "hl");
    return x.c[i] <= x.c[i - 1] + e && x.c[i] >= x.c[i - 1] - e ? 100 : 0;
  });
}

/* Opposite-colour candles with the same open, the second a long belt-hold (no shadow on the open side). Sign is the second's colour. */
export function separatingLines(bars) {
  return runCandle(bars, "separatingLines", LOOKBACK.separatingLines, (x, i) => {
    if (x.white(i - 1) === x.white(i)) return 0;
    const e = x.avg(SET.Equal, i - 1, "hl");
    if (!(x.o[i] <= x.o[i - 1] + e && x.o[i] >= x.o[i - 1] - e)) return 0;
    if (!(x.body(i) > x.avg(SET.BodyLong, i, "body"))) return 0;
    const vs = x.avg(SET.ShadowVeryShort, i, "hl");
    const ok = x.white(i) ? x.lower(i) < vs : x.upper(i) < vs;
    return ok ? (x.white(i) ? 100 : -100) : 0;
  });
}

/* Shared test: two opposite-colour marubozu with a candle gap between them. */
function kickShape(x, i) {
  if (x.white(i - 1) === x.white(i)) return false;
  const gap = !x.white(i - 1) ? x.l[i] > x.h[i - 1] : x.h[i] < x.l[i - 1];
  if (!gap) return false;
  const marubozu = (k) =>
    x.body(k) > x.avg(SET.BodyLong, k, "body") &&
    x.upper(k) < x.avg(SET.ShadowVeryShort, k, "hl") &&
    x.lower(k) < x.avg(SET.ShadowVeryShort, k, "hl");
  return marubozu(i - 1) && marubozu(i);
}

/* A marubozu, then an opposite-colour marubozu gapping away from it. Sign is the second candle's colour. */
export function kicking(bars) {
  return runCandle(bars, "kicking", LOOKBACK.kicking, (x, i) =>
    kickShape(x, i) ? (x.white(i) ? 100 : -100) : 0);
}

/* The same shape as kicking, signed by the colour of the LONGER of the two marubozu. */
export function kickingByLength(bars) {
  return runCandle(bars, "kickingByLength", LOOKBACK.kickingByLength, (x, i) => {
    if (!kickShape(x, i)) return 0;
    const k = x.body(i) > x.body(i - 1) ? i : i - 1;
    return x.white(k) ? 100 : -100;
  });
}
