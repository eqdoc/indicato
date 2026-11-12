/* The shared pieces of the candlestick modules: TA-Lib's candle settings and the way it averages them.

   TA-Lib turns words like "long body" or "very short shadow" into numbers by comparing a candle with the AVERAGE of the
   candles before it. Each setting says what is measured (the real body, the high-low range, or the two shadows together),
   over how many candles, and times what factor. Default table (TA-Lib's):

     BodyLong       real body   10  1.0     BodyVeryLong   real body  10  3.0     BodyShort   real body 10  1.0
     BodyDoji       high-low    10  0.1     ShadowLong     real body   0  1.0     ShadowVeryLong real body 0  2.0
     ShadowShort    shadows     10  1.0     ShadowVeryShort high-low  10  0.1     Near        high-low   5  0.2
     Far            high-low     5  0.6     Equal          high-low    5  0.05

   Period 0 means "the candle's own measure, not an average". The average for candle p is
   factor x (sum of the measure over the `period` candles BEFORE p) / period; for the "shadows" measure it is also halved,
   because the measure is the sum of two shadows. A pattern may average a setting over a DIFFERENT measure than the
   setting's own (TA-Lib does in a few places): pass the measure as the third argument of x.avg. */
import { requireBars } from "./guard.js";

export const SET = {
  BodyLong: { kind: "body", period: 10, factor: 1.0 },
  BodyVeryLong: { kind: "body", period: 10, factor: 3.0 },
  BodyShort: { kind: "body", period: 10, factor: 1.0 },
  BodyDoji: { kind: "hl", period: 10, factor: 0.1 },
  ShadowLong: { kind: "body", period: 0, factor: 1.0 },
  ShadowVeryLong: { kind: "body", period: 0, factor: 2.0 },
  ShadowShort: { kind: "shadows", period: 10, factor: 1.0 },
  ShadowVeryShort: { kind: "hl", period: 10, factor: 0.1 },
  Near: { kind: "hl", period: 5, factor: 0.2 },
  Far: { kind: "hl", period: 5, factor: 0.6 },
  Equal: { kind: "hl", period: 5, factor: 0.05 },
};

/* Arrays and per-candle measures for a series of bars. */
export function candleContext(bars) {
  const n = bars.length;
  const o = new Array(n), h = new Array(n), l = new Array(n), c = new Array(n);
  for (let i = 0; i < n; i++) { o[i] = bars[i].o; h[i] = bars[i].h; l[i] = bars[i].l; c[i] = bars[i].c; }
  const body = (i) => Math.abs(c[i] - o[i]);
  const hl = (i) => h[i] - l[i];
  const upper = (i) => h[i] - Math.max(c[i], o[i]);
  const lower = (i) => Math.min(c[i], o[i]) - l[i];
  const measure = (kind, i) => (kind === "body" ? body(i) : kind === "hl" ? hl(i) : upper(i) + lower(i));
  /* factor x average measure of the `period` candles before p (or the candle's own measure when period is 0). */
  const avg = (s, p, kind = s.kind) => {
    const half = kind === "shadows" ? 2 : 1;
    if (s.period === 0) return (s.factor * measure(kind, p)) / half;
    let sum = 0;
    for (let k = p - s.period; k < p; k++) sum += measure(kind, k);
    return (s.factor * (sum / s.period)) / half;
  };
  return { n, o, h, l, c, body, hl, upper, lower, measure, avg, white: (i) => c[i] >= o[i] };
}

/* Run `test(x, i)` for every bar from `lookback` on; the first `lookback` bars are 0. */
export function runCandle(bars, name, lookback, test) {
  requireBars(bars, name);
  const x = candleContext(bars);
  const out = new Array(x.n).fill(0);
  for (let i = lookback; i < x.n; i++) out[i] = test(x, i) || 0;
  return out;
}
