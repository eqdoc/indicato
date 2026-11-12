/* Candlestick patterns, group 3: eleven three-candle shapes, defined the way TA-Lib 0.7.1 defines them.

   Same conventions as candles.js: the array returned has the bars' length, 0 where the shape is absent and TA-Lib's
   signed integer where it is present (the sign is the direction of the shape, not advice). The first `lookback` bars
   are 0. Causal: the value at bar i reads bars i-2 .. i and the averages over the bars before them.
   The averaging words ("long", "near", "equal"...) come from candle-kit.js; where TA-Lib averages a setting over a
   different measure than the setting's own, the measure is passed as the third argument of x.avg. The batch loops
   for stickSandwich, triStar and tasukiGap that TA-Lib runs with its DEFAULT settings use the setting's own measure
   (high-low for Equal, BodyDoji and Near), so those three pass no measure. */

import { SET, runCandle } from "./candle-kit.js";

const BODY = "body", HL = "hl", SHADOWS = "shadows";

export const LOOKBACK_G3 = {
  twoCrows: 12, upsideGapTwoCrows: 12, threeStarsInSouth: 12, identicalThreeCrows: 12, stickSandwich: 7,
  uniqueThreeRiver: 12, triStar: 12, tasukiGap: 7, advanceBlock: 12, stalledPattern: 12, gapSideSideWhite: 7,
};
const LB = LOOKBACK_G3;

/* Long white candle, a black candle gapping above it, then a black candle opening inside the second body and closing
   inside the first body. -100. */
export function twoCrows(bars) {
  return runCandle(bars, "twoCrows", LB.twoCrows, (x, i) => {
    if (!(x.white(i - 2) && !x.white(i - 1) &&
      x.o[i - 1] > x.o[i - 2] && x.o[i - 1] > x.c[i - 2] && x.c[i - 1] > x.o[i - 2] && x.c[i - 1] > x.c[i - 2])) return 0;
    return x.body(i - 2) > x.avg(SET.BodyLong, i - 2, BODY) &&
      !x.white(i) &&
      x.o[i] < x.o[i - 1] && x.o[i] > x.c[i - 1] &&
      x.c[i] > x.o[i - 2] && x.c[i] < x.c[i - 2] ? -100 : 0;
  });
}

/* Long white candle, a small black candle gapping above it, then a black candle that engulfs the small one yet still
   closes above the first close. -100. */
export function upsideGapTwoCrows(bars) {
  return runCandle(bars, "upsideGapTwoCrows", LB.upsideGapTwoCrows, (x, i) => {
    if (!(x.white(i - 2) && !x.white(i - 1) &&
      x.o[i - 1] > x.o[i - 2] && x.o[i - 1] > x.c[i - 2] && x.c[i - 1] > x.o[i - 2] && x.c[i - 1] > x.c[i - 2])) return 0;
    return x.body(i - 2) > x.avg(SET.BodyLong, i - 2) &&
      x.body(i - 1) <= x.avg(SET.BodyShort, i - 1) &&
      !x.white(i) &&
      x.o[i] > x.o[i - 1] && x.c[i] < x.c[i - 1] &&
      x.c[i] > x.c[i - 2] ? -100 : 0;
  });
}

/* Three black candles: a long one with a long lower shadow, a smaller one that trades lower with a lower shadow of its
   own but holds above the first low, then a small black marubozu inside the second candle's range. +100. */
export function threeStarsInSouth(bars) {
  return runCandle(bars, "threeStarsInSouth", LB.threeStarsInSouth, (x, i) => {
    if (!(!x.white(i - 2) && !x.white(i - 1) && !x.white(i))) return 0;
    return x.body(i - 2) > x.avg(SET.BodyLong, i - 2, BODY) &&
      x.lower(i - 2) > x.avg(SET.ShadowLong, i - 2, BODY) &&
      x.body(i - 1) < x.body(i - 2) &&
      x.o[i - 1] > x.c[i - 2] && x.o[i - 1] <= x.h[i - 2] &&
      x.l[i - 1] < x.c[i - 2] &&
      x.l[i - 1] >= x.l[i - 2] &&
      x.lower(i - 1) > x.avg(SET.ShadowVeryShort, i - 1, HL) &&
      x.body(i) < x.avg(SET.BodyShort, i, BODY) &&
      x.lower(i) < x.avg(SET.ShadowVeryShort, i, HL) &&
      x.upper(i) < x.avg(SET.ShadowVeryShort, i, HL) &&
      x.l[i] > x.l[i - 1] && x.h[i] < x.h[i - 1] ? 100 : 0;
  });
}

/* Three black candles, each with a very short lower shadow, closing lower each time, each opening at the previous
   close (within the Equal tolerance). -100. */
export function identicalThreeCrows(bars) {
  return runCandle(bars, "identicalThreeCrows", LB.identicalThreeCrows, (x, i) => {
    if (!(!x.white(i - 2) && !x.white(i - 1) && !x.white(i))) return 0;
    const e2 = x.avg(SET.Equal, i - 2, HL), e1 = x.avg(SET.Equal, i - 1, HL);
    return x.lower(i - 2) < x.avg(SET.ShadowVeryShort, i - 2, HL) &&
      x.lower(i - 1) < x.avg(SET.ShadowVeryShort, i - 1, HL) &&
      x.lower(i) < x.avg(SET.ShadowVeryShort, i, HL) &&
      x.c[i - 2] > x.c[i - 1] &&
      x.c[i - 1] > x.c[i] &&
      x.o[i - 1] <= x.c[i - 2] + e2 && x.o[i - 1] >= x.c[i - 2] - e2 &&
      x.o[i] <= x.c[i - 1] + e1 && x.o[i] >= x.c[i - 1] - e1 ? -100 : 0;
  });
}

/* Black, white, black, with the second candle's low above the first close and the third close equal to the first
   close (within the Equal tolerance measured on the first body). +100. */
export function stickSandwich(bars) {
  return runCandle(bars, "stickSandwich", LB.stickSandwich, (x, i) => {
    if (!(!x.white(i - 2) && x.white(i - 1) && !x.white(i))) return 0;
    const e = x.avg(SET.Equal, i - 2);
    return x.l[i - 1] > x.c[i - 2] &&
      x.c[i] <= x.c[i - 2] + e &&
      x.c[i] >= x.c[i - 2] - e ? 100 : 0;
  });
}

/* Long black candle, a black harami candle with a lower low, then a short white candle opening above the second low. +100. */
export function uniqueThreeRiver(bars) {
  return runCandle(bars, "uniqueThreeRiver", LB.uniqueThreeRiver, (x, i) => {
    if (!(!x.white(i - 2) && !x.white(i - 1) && x.white(i))) return 0;
    return x.c[i - 1] > x.c[i - 2] && x.o[i - 1] <= x.o[i - 2] &&
      x.l[i - 1] < x.l[i - 2] &&
      x.o[i] > x.l[i - 1] &&
      x.body(i - 2) > x.avg(SET.BodyLong, i - 2) &&
      x.body(i) < x.avg(SET.BodyShort, i) ? 100 : 0;
  });
}

/* Three doji in a row where the middle one gaps away from the first and the third does not go further: gap up with
   the third not higher is -100, gap down with the third not lower is +100. */
export function triStar(bars) {
  return runCandle(bars, "triStar", LB.triStar, (x, i) => {
    const d = x.avg(SET.BodyDoji, i - 2);
    if (!(x.body(i - 2) <= d && x.body(i - 1) <= d && x.body(i) <= d)) return 0;
    let out = 0;
    const hi1 = Math.max(x.o[i - 1], x.c[i - 1]), lo1 = Math.min(x.o[i - 1], x.c[i - 1]);
    if (Math.min(x.o[i - 1], x.c[i - 1]) > Math.max(x.o[i - 2], x.c[i - 2]) && Math.max(x.o[i], x.c[i]) < hi1) out = -100;
    if (Math.max(x.o[i - 1], x.c[i - 1]) < Math.min(x.o[i - 2], x.c[i - 2]) && Math.min(x.o[i], x.c[i]) > lo1) out = 100;
    return out;
  });
}

/* A gap between two candles, then a candle of the opposite colour opening inside the second body and closing inside
   the gap, with bodies of about the same size. Upside gap (white then black) is +100, downside gap (black then white) is -100. */
export function tasukiGap(bars) {
  return runCandle(bars, "tasukiGap", LB.tasukiGap, (x, i) => {
    const near = () => x.avg(SET.Near, i - 1);
    if (x.o[i - 1] > x.o[i - 2] && x.o[i - 1] > x.c[i - 2] && x.c[i - 1] > x.o[i - 2] && x.c[i - 1] > x.c[i - 2] &&
      x.white(i - 1) && !x.white(i)) {
      return x.o[i] < x.c[i - 1] && x.o[i] > x.o[i - 1] &&
        x.c[i] < x.o[i - 1] &&
        x.c[i] > x.c[i - 2] && x.c[i] > x.o[i - 2] &&
        Math.abs(x.body(i - 1) - x.body(i)) < near() ? 100 : 0;
    }
    if (x.o[i - 1] < x.o[i - 2] && x.o[i - 1] < x.c[i - 2] && x.c[i - 1] < x.o[i - 2] && x.c[i - 1] < x.c[i - 2] &&
      !x.white(i - 1) && x.white(i)) {
      return (x.o[i] < x.o[i - 1] && x.o[i] > x.c[i - 1] &&
        x.c[i] > x.o[i - 1] &&
        x.c[i] < x.c[i - 2] && x.c[i] < x.o[i - 2] &&
        Math.abs(x.body(i - 1) - x.body(i)) < near()) ? -100 : 0;
    }
    return 0;
  });
}

/* Three white candles with rising closes and rising opens, a long first body with a short upper shadow, then growing
   weakness (smaller bodies and/or longer upper shadows). -100. */
export function advanceBlock(bars) {
  return runCandle(bars, "advanceBlock", LB.advanceBlock, (x, i) => {
    if (!(x.white(i - 2) && x.white(i - 1) && x.white(i))) return 0;
    const b2 = x.body(i - 2), b1 = x.body(i - 1), b0 = x.body(i);
    const near2 = x.avg(SET.Near, i - 2, HL), near1 = x.avg(SET.Near, i - 1, HL);
    const far2 = x.avg(SET.Far, i - 2, HL), far1 = x.avg(SET.Far, i - 1, HL);
    if (!(x.c[i] > x.c[i - 1] && x.c[i - 1] > x.c[i - 2] &&
      x.o[i - 1] > x.o[i - 2] &&
      x.o[i - 1] <= x.c[i - 2] + near2 && x.o[i] > x.o[i - 1] &&
      x.o[i] <= x.c[i - 1] + near1 && b2 > x.avg(SET.BodyLong, i - 2, BODY) &&
      x.upper(i - 2) < x.avg(SET.ShadowShort, i - 2, SHADOWS))) return 0;
    return ((b1 < b2 - far2 && b0 < b1 + near1) ||
      b0 < b1 - far1 ||
      (b0 < b1 && b1 < b2 &&
        (x.upper(i) > x.avg(SET.ShadowShort, i, SHADOWS) || x.upper(i - 1) > x.avg(SET.ShadowShort, i - 1, SHADOWS))) ||
      (b0 < b1 && x.upper(i) > x.avg(SET.ShadowLong, i, BODY))) ? -100 : 0;
  });
}

/* Three white candles with rising closes, two long bodies, the second with a very short upper shadow, then a small
   third body that opens near the second close (it "rides on the shoulder"). -100. */
export function stalledPattern(bars) {
  return runCandle(bars, "stalledPattern", LB.stalledPattern, (x, i) => {
    if (!(x.white(i - 2) && x.white(i - 1) && x.white(i))) return 0;
    return x.c[i] > x.c[i - 1] && x.c[i - 1] > x.c[i - 2] &&
      x.body(i - 2) > x.avg(SET.BodyLong, i - 2, BODY) &&
      x.body(i - 1) > x.avg(SET.BodyLong, i - 1, BODY) &&
      x.upper(i - 1) < x.avg(SET.ShadowVeryShort, i - 1, HL) &&
      x.o[i - 1] > x.o[i - 2] &&
      x.o[i - 1] <= x.c[i - 2] + x.avg(SET.Near, i - 2, HL) &&
      x.body(i) < x.avg(SET.BodyShort, i, BODY) &&
      x.o[i] >= x.c[i - 1] - x.body(i) - x.avg(SET.Near, i - 1, HL) ? -100 : 0;
  });
}

/* A gap between the first candle and two white candles of about the same size that open at about the same level.
   +100 when the gap is up, -100 when it is down. */
export function gapSideSideWhite(bars) {
  return runCandle(bars, "gapSideSideWhite", LB.gapSideSideWhite, (x, i) => {
    if (!(x.white(i - 1) && x.white(i))) return 0;
    const up = x.o[i - 1] > x.o[i - 2] && x.o[i - 1] > x.c[i - 2] && x.c[i - 1] > x.o[i - 2] && x.c[i - 1] > x.c[i - 2] &&
      x.o[i] > x.o[i - 2] && x.o[i] > x.c[i - 2] && x.c[i] > x.o[i - 2] && x.c[i] > x.c[i - 2];
    const down = x.o[i - 1] < x.o[i - 2] && x.o[i - 1] < x.c[i - 2] && x.c[i - 1] < x.o[i - 2] && x.c[i - 1] < x.c[i - 2] &&
      x.o[i] < x.o[i - 2] && x.o[i] < x.c[i - 2] && x.c[i] < x.o[i - 2] && x.c[i] < x.c[i - 2];
    const near = x.avg(SET.Near, i - 1, HL), eq = x.avg(SET.Equal, i - 1, HL);
    if (!((up || down) &&
      x.body(i) >= x.body(i - 1) - near &&
      x.body(i) <= x.body(i - 1) + near &&
      x.o[i] >= x.o[i - 1] - eq &&
      x.o[i] <= x.o[i - 1] + eq)) return 0;
    return Math.min(x.o[i - 1], x.c[i - 1]) > Math.max(x.o[i - 2], x.c[i - 2]) ? 100 : -100;
  });
}
