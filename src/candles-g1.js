/* Candlestick patterns, group G1: the single-candle doji family and the long / short / belt-hold shapes, defined the
   way TA-Lib defines them (same averaging table and conventions as candles.js). Each returns an array the same length
   as the bars, 0 where absent and +-100 where present (the sign is the colour of the candle, not advice). */

import { SET, runCandle } from "./candle-kit.js";

export const LOOKBACK_G1 = {
  doji: 10, dragonflyDoji: 10, gravestoneDoji: 10, longLeggedDoji: 10, rickshawMan: 10, highWave: 10,
  spinningTop: 10, shortLine: 10, longLine: 10, beltHold: 10, closingMarubozu: 10, takuri: 10,
};

const sgn = (x, i) => (x.c[i] >= x.o[i] ? 100 : -100);
const hi = (x, i) => Math.max(x.c[i], x.o[i]);
const lo = (x, i) => Math.min(x.c[i], x.o[i]);

/* A candle whose real body is tiny against the recent average high-low range (a tenth of it). +100. */
export function doji(bars) {
  return runCandle(bars, "doji", LOOKBACK_G1.doji, (x, i) =>
    x.body(i) <= x.avg(SET.BodyDoji, i) ? 100 : 0);
}

/* A doji with a very short upper shadow and a long lower shadow, shaped like a T. +100. */
export function dragonflyDoji(bars) {
  return runCandle(bars, "dragonflyDoji", LOOKBACK_G1.dragonflyDoji, (x, i) =>
    x.body(i) <= x.avg(SET.BodyDoji, i, "hl") &&
    x.h[i] - hi(x, i) < x.avg(SET.ShadowVeryShort, i) &&
    lo(x, i) - x.l[i] > x.avg(SET.ShadowVeryShort, i) ? 100 : 0);
}

/* A doji with a very short lower shadow and a long upper shadow, shaped like an upside-down T. +100. */
export function gravestoneDoji(bars) {
  return runCandle(bars, "gravestoneDoji", LOOKBACK_G1.gravestoneDoji, (x, i) =>
    x.body(i) <= x.avg(SET.BodyDoji, i, "hl") &&
    lo(x, i) - x.l[i] < x.avg(SET.ShadowVeryShort, i) &&
    x.h[i] - hi(x, i) > x.avg(SET.ShadowVeryShort, i) ? 100 : 0);
}

/* A doji with at least one shadow longer than the candle's own real body. +100. */
export function longLeggedDoji(bars) {
  return runCandle(bars, "longLeggedDoji", LOOKBACK_G1.longLeggedDoji, (x, i) =>
    x.body(i) <= x.avg(SET.BodyDoji, i, "hl") &&
    (lo(x, i) - x.l[i] > x.avg(SET.ShadowLong, i) || x.h[i] - hi(x, i) > x.avg(SET.ShadowLong, i)) ? 100 : 0);
}

/* A doji with two long shadows whose body sits near the middle of the high-low range. +100. */
export function rickshawMan(bars) {
  return runCandle(bars, "rickshawMan", LOOKBACK_G1.rickshawMan, (x, i) => {
    if (!(x.body(i) <= x.avg(SET.BodyDoji, i, "hl"))) return 0;
    const near = x.avg(SET.Near, i);
    const mid = x.l[i] + (x.h[i] - x.l[i]) / 2;
    return lo(x, i) - x.l[i] > x.avg(SET.ShadowLong, i) &&
      x.h[i] - hi(x, i) > x.avg(SET.ShadowLong, i) &&
      (x.o[i] <= mid + near || x.c[i] <= mid + near) &&
      (x.o[i] >= mid - near || x.c[i] >= mid - near) ? 100 : 0;
  });
}

/* A short body with both shadows more than twice the body. +100 white, -100 black. */
export function highWave(bars) {
  return runCandle(bars, "highWave", LOOKBACK_G1.highWave, (x, i) =>
    x.body(i) < x.avg(SET.BodyShort, i) &&
    x.h[i] - hi(x, i) > x.avg(SET.ShadowVeryLong, i) &&
    lo(x, i) - x.l[i] > x.avg(SET.ShadowVeryLong, i) ? sgn(x, i) : 0);
}

/* A short body with both shadows longer than the body. +100 white, -100 black. */
export function spinningTop(bars) {
  return runCandle(bars, "spinningTop", LOOKBACK_G1.spinningTop, (x, i) =>
    x.h[i] - hi(x, i) > x.body(i) &&
    lo(x, i) - x.l[i] > x.body(i) &&
    x.body(i) < x.avg(SET.BodyShort, i) ? sgn(x, i) : 0);
}

/* A short body with short shadows both ends. +100 white, -100 black. */
export function shortLine(bars) {
  return runCandle(bars, "shortLine", LOOKBACK_G1.shortLine, (x, i) =>
    x.body(i) < x.avg(SET.BodyShort, i) &&
    x.h[i] - hi(x, i) < x.avg(SET.ShadowShort, i) &&
    lo(x, i) - x.l[i] < x.avg(SET.ShadowShort, i) ? sgn(x, i) : 0);
}

/* A long body with short shadows both ends. +100 white, -100 black. */
export function longLine(bars) {
  return runCandle(bars, "longLine", LOOKBACK_G1.longLine, (x, i) =>
    x.body(i) > x.avg(SET.BodyLong, i) &&
    x.h[i] - hi(x, i) < x.avg(SET.ShadowShort, i) &&
    lo(x, i) - x.l[i] < x.avg(SET.ShadowShort, i) ? sgn(x, i) : 0);
}

/* A long body that opens at its extreme: white with a very short lower shadow, black with a very short upper shadow. */
export function beltHold(bars) {
  return runCandle(bars, "beltHold", LOOKBACK_G1.beltHold, (x, i) =>
    x.body(i) > x.avg(SET.BodyLong, i) &&
    ((x.c[i] >= x.o[i] && lo(x, i) - x.l[i] < x.avg(SET.ShadowVeryShort, i)) ||
      (!(x.c[i] >= x.o[i]) && x.h[i] - hi(x, i) < x.avg(SET.ShadowVeryShort, i))) ? sgn(x, i) : 0);
}

/* A long body that closes at its extreme: white with a very short upper shadow, black with a very short lower shadow. */
export function closingMarubozu(bars) {
  return runCandle(bars, "closingMarubozu", LOOKBACK_G1.closingMarubozu, (x, i) =>
    x.body(i) > x.avg(SET.BodyLong, i) &&
    ((x.c[i] >= x.o[i] && x.h[i] - hi(x, i) < x.avg(SET.ShadowVeryShort, i)) ||
      (!(x.c[i] >= x.o[i]) && lo(x, i) - x.l[i] < x.avg(SET.ShadowVeryShort, i))) ? sgn(x, i) : 0);
}

/* A doji with a very short upper shadow and a very long lower shadow (more than twice the body scale). +100. */
export function takuri(bars) {
  return runCandle(bars, "takuri", LOOKBACK_G1.takuri, (x, i) =>
    x.body(i) <= x.avg(SET.BodyDoji, i, "hl") &&
    x.h[i] - hi(x, i) < x.avg(SET.ShadowVeryShort, i) &&
    lo(x, i) - x.l[i] > x.avg(SET.ShadowVeryLong, i) ? 100 : 0);
}
