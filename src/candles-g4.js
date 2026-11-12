/* Candlestick patterns, group 4: multi-candle continuation / reversal shapes and the two stateful "hikkake" patterns.
   Defined the way TA-Lib defines them (same averaging table as candles.js, see candle-kit.js). Output is 0 where the
   pattern is absent and TA-Lib's signed integer where present; the sign is the direction of the shape, not advice. */

import { SET, runCandle } from "./candle-kit.js";

export const LOOKBACK_G4 = {
  threeLineStrike: 8, breakaway: 14, concealingBabySwallow: 13, riseFallThreeMethods: 14,
  xSideGapThreeMethods: 2, hikkake: 5, hikkakeMod: 10,
};
const LB = LOOKBACK_G4;

/* Three candles of one colour with higher (lower) closes, each opening within or near the prior body, then a fourth
   of the opposite colour that opens beyond the third's close and closes beyond the first's open. +-100 by the third's colour. */
export function threeLineStrike(bars) {
  return runCandle(bars, "threeLineStrike", LB.threeLineStrike, (x, i) => {
    const w1 = x.white(i - 3), w2 = x.white(i - 2), w3 = x.white(i - 1), w4 = x.white(i);
    if (!(w1 === w2 && w2 === w3 && w4 !== w3)) return 0;
    const n3 = x.avg(SET.Near, i - 3), n2 = x.avg(SET.Near, i - 2);
    const o1 = x.o[i - 3], c1 = x.c[i - 3], o2 = x.o[i - 2], c2 = x.c[i - 2], o3 = x.o[i - 1], c3 = x.c[i - 1];
    const ok =
      o2 >= Math.min(o1, c1) - n3 && o2 <= Math.max(o1, c1) + n3 &&
      o3 >= Math.min(o2, c2) - n2 && o3 <= Math.max(o2, c2) + n2 &&
      ((w3 && c3 > c2 && c2 > c1 && x.o[i] > c3 && x.c[i] < o1) ||
       (!w3 && c3 < c2 && c2 < c1 && x.o[i] < c3 && x.c[i] > o1));
    return ok ? (w3 ? 100 : -100) : 0;
  });
}

/* Long first candle, a second whose body gaps in its direction, third and fourth stepping further the same way
   (higher/lower high and low), and a fifth of the opposite colour closing back inside the gap. +-100 by the fifth's colour. */
export function breakaway(bars) {
  return runCandle(bars, "breakaway", LB.breakaway, (x, i) => {
    const w = (k) => x.white(k);
    if (!((w(i - 4) === w(i - 3)) + (w(i - 3) === w(i - 1)) + (w(i - 1) !== w(i)) === 3)) return 0;
    const { o, c, h, l } = x;
    const long1 = Math.abs(c[i - 4] - o[i - 4]) > x.avg(SET.BodyLong, i - 4);
    const down = !w(i - 4) &&
      o[i - 3] < o[i - 4] && o[i - 3] < c[i - 4] && c[i - 3] < o[i - 4] && c[i - 3] < c[i - 4] &&
      h[i - 2] < h[i - 3] && l[i - 2] < l[i - 3] && h[i - 1] < h[i - 2] && l[i - 1] < l[i - 2] &&
      c[i] > o[i - 3] && c[i] < c[i - 4];
    const up = w(i - 4) &&
      o[i - 3] > o[i - 4] && o[i - 3] > c[i - 4] && c[i - 3] > o[i - 4] && c[i - 3] > c[i - 4] &&
      h[i - 2] > h[i - 3] && l[i - 2] > l[i - 3] && h[i - 1] > h[i - 2] && l[i - 1] > l[i - 2] &&
      c[i] < o[i - 3] && c[i] > c[i - 4];
    return long1 && (down || up) ? (w(i) ? 100 : -100) : 0;
  });
}

/* Two black marubozu, a black candle that gaps down yet has an upper shadow reaching into the prior body, and a black
   candle that engulfs that third candle including its shadows: +100. */
export function concealingBabySwallow(bars) {
  return runCandle(bars, "concealingBabySwallow", LB.concealingBabySwallow, (x, i) => {
    const { o, c, h, l } = x;
    if (x.white(i - 3) || x.white(i - 2) || x.white(i - 1) || x.white(i)) return 0;
    const s3 = x.avg(SET.ShadowVeryShort, i - 3), s2 = x.avg(SET.ShadowVeryShort, i - 2), s1 = x.avg(SET.ShadowVeryShort, i - 1);
    return Math.min(c[i - 3], o[i - 3]) - l[i - 3] < s3 &&
      h[i - 3] - Math.max(c[i - 3], o[i - 3]) < s3 &&
      Math.min(c[i - 2], o[i - 2]) - l[i - 2] < s2 &&
      h[i - 2] - Math.max(c[i - 2], o[i - 2]) < s2 &&
      o[i - 1] < o[i - 2] && o[i - 1] < c[i - 2] && c[i - 1] < o[i - 2] && c[i - 1] < c[i - 2] &&
      h[i - 1] - Math.max(c[i - 1], o[i - 1]) > s1 &&
      h[i - 1] > c[i - 2] &&
      h[i] > h[i - 1] && l[i] < l[i - 1] ? 100 : 0;
  });
}

/* Long candle, three small candles of the opposite colour drifting against it yet inside its range, then a long candle of
   the first colour opening beyond the last small close and closing beyond the first close. +-100 by the first candle's colour. */
export function riseFallThreeMethods(bars) {
  return runCandle(bars, "riseFallThreeMethods", LB.riseFallThreeMethods, (x, i) => {
    const { o, c, h, l } = x;
    const w = (k) => x.white(k);
    if (!((w(i - 4) !== w(i - 3)) + (w(i - 3) === w(i - 2)) + (w(i - 2) === w(i - 1)) === 3)) return 0;
    const white = w(i - 4);
    const inside = (k) => (o[k] < h[i - 4] || c[k] < h[i - 4]) && (o[k] > l[i - 4] || c[k] > l[i - 4]);
    return w(i - 1) !== w(i) &&
      inside(i - 3) && inside(i - 2) && inside(i - 1) &&
      ((white && c[i - 2] < c[i - 3]) || (!white && c[i - 3] < c[i - 2])) &&
      ((white && c[i - 1] < c[i - 2]) || (!white && c[i - 2] < c[i - 1])) &&
      ((white && o[i] > c[i - 1]) || (!white && c[i - 1] > o[i])) &&
      ((white && c[i] > c[i - 4]) || (!white && c[i - 4] > c[i])) &&
      Math.abs(c[i - 4] - o[i - 4]) > x.avg(SET.BodyLong, i - 4) &&
      Math.abs(c[i - 3] - o[i - 3]) < x.avg(SET.BodyShort, i - 3) &&
      Math.abs(c[i - 2] - o[i - 2]) < x.avg(SET.BodyShort, i - 2) &&
      Math.abs(c[i - 1] - o[i - 1]) < x.avg(SET.BodyShort, i - 1) &&
      Math.abs(c[i] - o[i]) > x.avg(SET.BodyLong, i) ? (white ? 100 : -100) : 0;
  });
}

/* Two candles of one colour with a gap between their bodies, then a candle of the opposite colour opening and closing
   inside those two bodies (the gap stays open). +-100 by the first candle's colour. */
export function xSideGapThreeMethods(bars) {
  return runCandle(bars, "xSideGapThreeMethods", LB.xSideGapThreeMethods, (x, i) => {
    const { o, c } = x;
    const white = x.white(i - 2);
    const ok =
      white === x.white(i - 1) && x.white(i - 1) !== x.white(i) &&
      (o[i] < c[i - 1] || o[i] < o[i - 1]) && (o[i] > c[i - 1] || o[i] > o[i - 1]) &&
      (c[i] < c[i - 2] || c[i] < o[i - 2]) && (c[i] > c[i - 2] || c[i] > o[i - 2]) &&
      ((white && o[i - 1] > o[i - 2] && o[i - 1] > c[i - 2] && c[i - 1] > o[i - 2] && c[i - 1] > c[i - 2]) ||
       (!white && o[i - 1] < o[i - 2] && o[i - 1] < c[i - 2] && c[i - 1] < o[i - 2] && c[i - 1] < c[i - 2]));
    return ok ? (white ? 100 : -100) : 0;
  });
}

/* Hikkake: an inside bar followed by a bar that breaks out of it (lower high and low: +100, higher high and low: -100).
   The breakout is remembered; a close beyond the inside bar's far edge within the next 3 bars confirms it, marked +-200
   on the confirming bar. Stateful, run from three bars before the first output exactly as TA-Lib warms up. */
export function hikkake(bars) {
  let cd = 0, res = 0, sh = 0, sl = 0;
  const step = (x, i) => {
    const { h, l, c } = x;
    let out = 0;
    if (h[i - 1] < h[i - 2] && l[i - 1] > l[i - 2] &&
        ((h[i] < h[i - 1] && l[i] < l[i - 1]) || (h[i] > h[i - 1] && l[i] > l[i - 1]))) {
      res = 100 * (h[i] < h[i - 1] ? 1 : -1);
      sh = h[i - 1]; sl = l[i - 1]; cd = 4;
      out = res;
    } else if (cd > 0 && ((res > 0 && c[i] > sh) || (res < 0 && c[i] < sl))) {
      out = res + 100 * (res > 0 ? 1 : -1);
      cd = 0;
    }
    if (cd > 0) cd -= 1;
    return out;
  };
  return runCandle(bars, "hikkake", LB.hikkake, (x, i) => {
    if (i === LB.hikkake) for (let k = i - 3; k < i; k++) step(x, k);
    return step(x, i);
  });
}

/* Modified hikkake: first candle, a second inside it that closes near its low (high), a third inside the second, and a
   fourth that breaks out (lower high and low: +100; higher high and low: -100); a close beyond the third's far edge
   within the next 3 bars confirms it, marked +-200. Stateful, warmed up three bars back like TA-Lib. */
export function hikkakeMod(bars) {
  let cnt = 0, res = 0, ph = 0, pl = 0;
  const step = (x, i) => {
    const { h, l, c } = x;
    let out = 0;
    if (h[i - 2] < h[i - 3] && l[i - 2] > l[i - 3] && h[i - 1] < h[i - 2] && l[i - 1] > l[i - 2] &&
        ((h[i] < h[i - 1] && l[i] < l[i - 1] && c[i - 2] <= l[i - 2] + x.avg(SET.Near, i - 2)) ||
         (h[i] > h[i - 1] && l[i] > l[i - 1] && c[i - 2] >= h[i - 2] - x.avg(SET.Near, i - 2)))) {
      res = 100 * (h[i] < h[i - 1] ? 1 : -1);
      ph = h[i - 1]; pl = l[i - 1]; cnt = 4;
      out = res;
    } else if (cnt > 0 && ((res > 0 && c[i] > ph) || (res < 0 && c[i] < pl))) {
      out = res + 100 * (res > 0 ? 1 : -1);
      cnt = 0;
    }
    if (cnt > 0) cnt -= 1;
    return out;
  };
  return runCandle(bars, "hikkakeMod", LB.hikkakeMod, (x, i) => {
    if (i === LB.hikkakeMod) for (let k = i - 3; k < i; k++) step(x, k);
    return step(x, i);
  });
}
