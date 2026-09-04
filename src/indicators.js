/* indicato — technical indicators for JavaScript.
 *
 * Pure functions over price bars. No imports, no network, no state. Every function
 * returns an array the same length as its input, null until it has enough history.
 *
 * The formulas are their authors' — Wilder, Hull, Kaufman, Legoux, Tillson, Ehlers,
 * Lambert, Chande, Connors, Fosback and others — and are nobody's copyright. This
 * implementation is MIT.
 *
 * What each one was verified against is recorded in VERIFICATION.md. Read it before
 * trusting a number: 68 of these match a reference implementation exactly, 18 have no
 * reference in existence and rest on their published definitions and property tests.
 */

/* The indicators the scanner uses, recomputed from the same daily candles the
   chart draws.

   WHY THESE LIVE IN THE BROWSER. The warehouse stores which pattern fired, not
   the series that produced it, so the alternative was fifteen more SQL queries —
   one per indicator family — each a separate chance to drift from what the
   scanner saw. Here the line and the candles under it come from one array that
   was fetched once, so a reader looking at a Supertrend flip is looking at the
   flip in the same prices.

   THESE ARE NOT SIGNALS AND THEY ARE NOT ADVICE. Every function below is
   arithmetic over past closes. Nothing here predicts, ranks, or recommends; the
   page draws what the scanner looked at and stops there.

   THE STANDARD PERIODS, NOT TUNED ONES. 12/26/9 MACD, 14-period RSI and MFI,
   20-period Donchian and Bollinger. A reader who checks this against any other
   charting tool should get the same shape; a "better" period we chose ourselves
   would silently disagree with every other chart they own. */

/* Wilder's smoothing, which is what RSI, MFI, ATR and DMI actually use. An EMA
   with alpha 2/(n+1) here reads close enough to look right and is wrong by a few
   percent everywhere — the classic way an indicator ends up nearly matching. */
function rma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    if (i < n) { sum += v; if (i === n - 1) out[i] = sum / n; continue; }
    out[i] = (out[i - 1] * (n - 1) + v) / n;
  }
  return out;
}

export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= n) sum -= values[i - n] ?? 0;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    if (i < n - 1) { seed += v; continue; }
    if (i === n - 1) { seed += v; out[i] = seed / n; continue; }
    out[i] = v * k + out[i - 1] * (1 - k);
  }
  return out;
}

/* Weighted moving average: the newest bar counts n times as much as the oldest,
   weights 1..n over the window. Between SMA (every bar equal) and EMA (weights
   decay forever), which is the whole reason people ask for it by name. */
export function wma(values, n) {
  const out = new Array(values.length).fill(null);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < values.length; i++) {
    let acc = 0, ok = true;
    for (let k = 0; k < n; k++) {
      const v = values[i - n + 1 + k];
      if (v === null || v === undefined) { ok = false; break; }
      acc += v * (k + 1);
    }
    out[i] = ok ? acc / denom : null;
  }
  return out;
}

/* ATR is further down the file: trueRange() plus rma(), Wilder's own smoothing.
   A second copy written here was deleted rather than kept — two average-true-range
   functions in one module is how the chart and the scanner start disagreeing about
   what a typical session is. It is exported at its definition instead. */

/* Keltner channel: an EMA with ATR-width rails. Bollinger's bands widen with
   standard deviation, Keltner's with true range — which is why traders watch the
   pair together, and why shipping one without the other was a gap. */
export function keltner(bars, n = 20, mult = 2) {
  const mid = ema(bars.map((b) => b.c), n);
  const a = atr(bars, n);
  return {
    mid,
    upper: mid.map((m, i) => (m === null || a[i] === null ? null : m + mult * a[i])),
    lower: mid.map((m, i) => (m === null || a[i] === null ? null : m - mult * a[i])),
  };
}

/* The plain stochastic — where the close sits inside the recent high-low range.
   Not the same thing as the Stochastic RSI already in this file, which runs the
   same formula over RSI instead of over price; the file had the derivative and
   not the original. */
export function stochastic(bars, n = 14, k = 3, d = 3) {
  /* Hoisted, and the reason matters: the first version called bars.map() for the
     highs and again for the lows INSIDE the per-bar callback, rebuilding two
     2,600-element arrays on every one of 2,600 iterations. Measured at 60ms for
     this one study against 1.5ms for a full eight-study stack — quadratic work
     hiding behind a one-line map. */
  const highs = bars.map((x) => x.h);
  const lows = bars.map((x) => x.l);
  const raw = bars.map((b, i) => {
    if (i < n - 1) return null;
    const hi = highest(highs, i, n);
    const lo = lowest(lows, i, n);
    return hi === lo ? 50 : ((b.c - lo) / (hi - lo)) * 100;
  });
  const kLine = sma(raw, k);
  return { k: kLine, d: sma(kLine, d) };
}

const highest = (arr, i, n) => {
  let m = -Infinity;
  for (let j = Math.max(0, i - n + 1); j <= i; j++) if (arr[j] > m) m = arr[j];
  return m === -Infinity ? null : m;
};
const lowest = (arr, i, n) => {
  let m = Infinity;
  for (let j = Math.max(0, i - n + 1); j <= i; j++) if (arr[j] < m) m = arr[j];
  return m === Infinity ? null : m;
};

function trueRange(bars) {
  return bars.map((b, i) => {
    if (i === 0) return b.h - b.l;
    const pc = bars[i - 1].c;
    return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  });
}

/* Exported since Keltner needs it and a reader may want it on its own: the size
   of a typical session, in rupees. TRUE range, not high minus low — a share that
   gapped 100 to 130 overnight then traded 130-132 had a 2-rupee day by high minus
   low and a 32-rupee day in truth. */
export const atr = (bars, n = 14) => rma(trueRange(bars), n);


/* ── the moving-average family ────────────────────────────────────────────────
   Twelve of these, and they exist because every one is a different answer to the
   same complaint: a simple average lags. Each trades lag against smoothness
   differently, and none of them wins — which is worth knowing before adding a
   thirteenth. Implemented from the published definitions, not transcribed from
   any library: the formulas are their authors' (Hull, Kaufman, Arnaud Legoux,
   Tillson, Ehlers), the code is ours.

   Every one returns an array aligned to bars, null until it has enough history —
   the same contract sma/ema already keep, so specForStudy and the engine's series
   resolver need no special cases. */

/* Double and triple exponential — Patrick Mulloy, 1994. Subtracting the lag of an
   EMA of an EMA is the whole trick. */
export function dema(src, n) {
  const e1 = ema(src, n), e2 = ema(e1.map((v) => (v == null ? 0 : v)), n);
  return src.map((_, i) => (e1[i] == null || e2[i] == null || i < 2 * n - 2 ? null : 2 * e1[i] - e2[i]));
}
export function tema(src, n) {
  const e1 = ema(src, n);
  const e2 = ema(e1.map((v) => (v == null ? 0 : v)), n);
  const e3 = ema(e2.map((v) => (v == null ? 0 : v)), n);
  return src.map((_, i) => (i < 3 * n - 3 || e3[i] == null ? null : 3 * e1[i] - 3 * e2[i] + e3[i]));
}

/* Hull — Alan Hull. WMA(2*WMA(n/2) - WMA(n), sqrt(n)). Fast and smooth at once,
   at the cost of overshooting turns. */
export function hma(src, n) {
  const half = Math.max(1, Math.round(n / 2)), root = Math.max(1, Math.round(Math.sqrt(n)));
  const a = wma(src, half), b = wma(src, n);
  const raw = src.map((_, i) => (a[i] == null || b[i] == null ? null : 2 * a[i] - b[i]));
  const firstReal = raw.findIndex((v) => v != null);
  if (firstReal < 0) return raw.map(() => null);
  const tail = wma(raw.slice(firstReal).map((v) => (v == null ? 0 : v)), root);
  const out = new Array(src.length).fill(null);
  for (let i = 0; i < tail.length; i++) out[firstReal + i] = tail[i];
  return out;
}

/* Volume-weighted: each bar counts for what traded on it. */
export function vwma(bars, n) {
  return bars.map((_, i) => {
    if (i < n - 1) return null;
    let pv = 0, v = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const vol = bars[k].v;
      if (vol == null) return null;
      pv += bars[k].c * vol; v += vol;
    }
    return v === 0 ? null : pv / v;
  });
}

/* Arnaud Legoux — a gaussian window offset toward the recent end. */
export function alma(src, n, offset = 0.85, sigma = 6) {
  const m = offset * (n - 1), s = n / sigma;
  const w = Array.from({ length: n }, (_, k) => Math.exp(-((k - m) ** 2) / (2 * s * s)));
  const norm = w.reduce((a, b) => a + b, 0);
  return src.map((_, i) => {
    if (i < n - 1) return null;
    let acc = 0;
    for (let k = 0; k < n; k++) {
      const v = src[i - n + 1 + k];
      if (v == null) return null;
      acc += v * w[k];
    }
    return acc / norm;
  });
}

/* Kaufman's adaptive — speeds up in a trend, slows in chop, via an efficiency
   ratio of net travel over total travel. */
export function kama(src, n = 10, fast = 2, slow = 30) {
  const fc = 2 / (fast + 1), sc = 2 / (slow + 1);
  const out = new Array(src.length).fill(null);
  for (let i = 0; i < src.length; i++) {
    if (i < n) continue;
    if (out[i - 1] == null) { out[i] = src[i]; continue; }
    let vol = 0;
    for (let k = i - n + 1; k <= i; k++) vol += Math.abs(src[k] - src[k - 1]);
    const er = vol === 0 ? 0 : Math.abs(src[i] - src[i - n]) / vol;
    const a = (er * (fc - sc) + sc) ** 2;
    out[i] = out[i - 1] + a * (src[i] - out[i - 1]);
  }
  return out;
}

/* Zero-lag — Ehlers. An EMA fed price plus its own recent change. */
export function zlema(src, n) {
  const lag = Math.floor((n - 1) / 2);
  const de = src.map((v, i) => (i < lag || v == null || src[i - lag] == null ? null : 2 * v - src[i - lag]));
  const first = de.findIndex((v) => v != null);
  if (first < 0) return de;
  const tail = ema(de.slice(first).map((v) => (v == null ? 0 : v)), n);
  const out = new Array(src.length).fill(null);
  for (let i = 0; i < tail.length; i++) out[first + i] = tail[i];
  return out;
}

/* Tillson T3 — six chained EMAs with a volume-factor weighting. */
export function t3(src, n = 5, v = 0.7) {
  const E = (x) => ema(x.map((y) => (y == null ? 0 : y)), n);
  const e1 = ema(src, n), e2 = E(e1), e3 = E(e2), e4 = E(e3), e5 = E(e4), e6 = E(e5);
  const c1 = -(v ** 3), c2 = 3 * v * v + 3 * v ** 3, c3 = -6 * v * v - 3 * v - 3 * v ** 3, c4 = 1 + 3 * v + v ** 3 + 3 * v * v;
  return src.map((_, i) => (i < 6 * (n - 1) || e6[i] == null ? null : c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i]));
}

/* Triangular — a simple average of a simple average, weighting the middle. */
export function trima(src, n) {
  /* THE SPLIT IS n/2 THEN n/2+1 FOR AN EVEN PERIOD, not ceil((n+1)/2) as this first had.
     Measured against TA-Lib on 6,126 bars: the wrong split was 7.87 out on a price near
     1,310 — small enough to look like rounding, large enough to move a signal. Odd
     periods happened to agree already, which is exactly how a bug like this survives.
     With the right split the two agree to 0.000000001. */
  const first = n % 2 ? Math.floor(n / 2) + 1 : Math.floor(n / 2);
  const second = Math.floor(n / 2) + 1;
  const s1 = sma(src, first);
  const s2 = sma(s1.map((v) => (v == null ? 0 : v)), second);
  return src.map((_, i) => (i < first + second - 2 ? null : s2[i]));
}

/* McGinley Dynamic — John McGinley. Divides the step by a speed factor so the
   line tracks price instead of trailing it through a fast move. */
export function mcginley(src, n = 14) {
  const out = new Array(src.length).fill(null);
  const seed = sma(src, n);
  for (let i = 0; i < src.length; i++) {
    if (out[i - 1] == null) { out[i] = seed[i]; continue; }
    const prev = out[i - 1], r = prev === 0 ? 1 : src[i] / prev;
    out[i] = prev + (src[i] - prev) / (n * (r ** 4) || 1);
  }
  return out;
}

/* Chande's VIDYA — an EMA whose smoothing scales with the CMO, so it moves when
   direction is one-sided and stalls when it is not. */
export function vidya(src, n = 14, smooth = 20) {
  const alpha = 2 / (smooth + 1);
  const out = new Array(src.length).fill(null);
  for (let i = 0; i < src.length; i++) {
    if (i < n) continue;
    let up = 0, dn = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const d = src[k] - src[k - 1];
      if (d > 0) up += d; else dn -= d;
    }
    const cmo = up + dn === 0 ? 0 : Math.abs((up - dn) / (up + dn));
    const prev = out[i - 1] ?? src[i - 1];
    out[i] = prev + alpha * cmo * (src[i] - prev);
  }
  return out;
}

/* Ehlers' fractal-adaptive — measures the price path's fractal dimension over the
   window and lets that set the EMA's alpha. A straight run gives D near 1 and a
   fast average; a jagged one gives D near 2 and a slow one. */
export function frama(bars, n = 16) {
  const N = n % 2 === 0 ? n : n + 1, h = N / 2;
  const out = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < N) continue;
    const seg = (a, b) => {
      let hi = -Infinity, lo = Infinity;
      for (let k = a; k <= b; k++) { hi = Math.max(hi, bars[k].h); lo = Math.min(lo, bars[k].l); }
      return (hi - lo) / (b - a + 1);
    };
    const n1 = seg(i - N + 1, i - h), n2 = seg(i - h + 1, i), n3 = seg(i - N + 1, i);
    let d = 1;
    if (n1 > 0 && n2 > 0 && n3 > 0) d = (Math.log(n1 + n2) - Math.log(n3)) / Math.log(2);
    const alpha = Math.min(1, Math.max(0.01, Math.exp(-4.6 * (d - 1))));
    const prev = out[i - 1] ?? bars[i - 1].c;
    out[i] = prev + alpha * (bars[i].c - prev);
  }
  return out;
}


/* ── momentum and oscillators ─────────────────────────────────────────────────
   Written from the published definitions. Where an author fixed a constant — Lambert's
   0.015 in CCI, Coppock's 11/14/10 — it is kept, because a "CCI" with a different
   constant is a different number wearing the same name, and a reader comparing ours to
   their broker's would be right to call it wrong. */

/* Commodity Channel Index — Donald Lambert. The 0.015 scales it so roughly 70-80%
   of readings fall within ±100; it is his, not a tuning knob. */
export function cci(bars, n = 20) {
  const tp = bars.map((b) => (b.h + b.l + b.c) / 3);
  const ma = sma(tp, n);
  return bars.map((_, i) => {
    if (ma[i] == null) return null;
    let dev = 0;
    for (let k = i - n + 1; k <= i; k++) dev += Math.abs(tp[k] - ma[i]);
    const md = dev / n;
    return md === 0 ? 0 : (tp[i] - ma[i]) / (0.015 * md);
  });
}

/* Williams %R — where the close sits in the range, as a negative percentage. */
export function williamsR(bars, n = 14) {
  const hs = bars.map((b) => b.h), ls = bars.map((b) => b.l);
  return bars.map((b, i) => {
    if (i < n - 1) return null;
    const hi = highest(hs, i, n), lo = lowest(ls, i, n);
    return hi === lo ? -50 : ((hi - b.c) / (hi - lo)) * -100;
  });
}

/* Rate of change, and momentum's plain difference. */
export function roc(src, n = 12) {
  return src.map((v, i) => (i < n || src[i - n] === 0 ? null : ((v - src[i - n]) / src[i - n]) * 100));
}
export function momentum(src, n = 10) {
  return src.map((v, i) => (i < n ? null : v - src[i - n]));
}

/* Chande Momentum Oscillator — RSI keeping its sign, so it swings -100..100.

   WILDER-SMOOTHED, not a plain window sum. The first version here summed raw up and
   down moves over n bars, which is a fair reading of Chande's description and is not
   what anyone else computes: TA-Lib smooths them the way RSI does, which makes
   CMO exactly 2*RSI - 100. Verified against TA-Lib to 0.000000000 on 6,126 bars.
   A CMO that disagrees with every chart a reader has ever seen is a wrong CMO,
   whatever the book says. */
export function cmo(src, n = 14) {
  const up = src.map((v, i) => (i ? Math.max(v - src[i - 1], 0) : 0));
  const dn = src.map((v, i) => (i ? Math.max(src[i - 1] - v, 0) : 0));
  const ru = rma(up, n), rd = rma(dn, n);
  return src.map((_, i) => (ru[i] == null || rd[i] == null ? null
    : ru[i] + rd[i] === 0 ? 0 : ((ru[i] - rd[i]) / (ru[i] + rd[i])) * 100));
}

/* TRIX — the percentage change of a triple-smoothed EMA. */
export function trix(src, n = 15) {
  const E = (x) => ema(x.map((v) => (v == null ? 0 : v)), n);
  const e3 = E(E(ema(src, n)));
  return e3.map((v, i) => (i < 3 * n || e3[i - 1] == null || e3[i - 1] === 0 ? null : ((v - e3[i - 1]) / e3[i - 1]) * 100));
}

/* Percentage Price Oscillator, and its absolute-difference sibling. */
export function ppo(src, fast = 12, slow = 26) {
  const f = ema(src, fast), s = ema(src, slow);
  return src.map((_, i) => (f[i] == null || s[i] == null || s[i] === 0 ? null : ((f[i] - s[i]) / s[i]) * 100));
}
export function po(src, fast = 12, slow = 26) {
  const f = ema(src, fast), s = ema(src, slow);
  return src.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
}

/* Detrended Price Oscillator — price against an average displaced back by half the
   period, which removes the trend rather than measuring it. */
export function dpo(src, n = 20) {
  const shift = Math.floor(n / 2) + 1;
  const ma = sma(src, n);
  return src.map((v, i) => (i < n + shift || ma[i - shift] == null ? null : v - ma[i - shift]));
}

/* Awesome and Accelerator — Bill Williams, on the bar's midpoint. */
export function ao(bars) {
  const mid = bars.map((b) => (b.h + b.l) / 2);
  const f = sma(mid, 5), s = sma(mid, 34);
  return bars.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
}
export function ac(bars) {
  const a = ao(bars);
  const m = sma(a.map((v) => (v == null ? 0 : v)), 5);
  return a.map((v, i) => (i < 38 || v == null || m[i] == null ? null : v - m[i]));
}

/* True Strength Index — Blau. Double-smoothed momentum over double-smoothed
   absolute momentum. */
export function tsi(src, long = 25, short = 13) {
  const mom = src.map((v, i) => (i ? v - src[i - 1] : 0));
  const abs = mom.map(Math.abs);
  const E = (x, n) => ema(x.map((v) => (v == null ? 0 : v)), n);
  const m2 = E(E(mom, long), short), a2 = E(E(abs, long), short);
  return src.map((_, i) => (i < long + short || a2[i] == null || a2[i] === 0 ? null : (m2[i] / a2[i]) * 100));
}

/* Know Sure Thing — Pring. Four smoothed rates of change, weighted 1..4. */
export function kst(src) {
  const parts = [[10, 10, 1], [15, 10, 2], [20, 10, 3], [30, 15, 4]]
    .map(([r, s, w]) => ({ vals: sma(roc(src, r).map((v) => (v == null ? 0 : v)), s), w }));
  return src.map((_, i) => (i < 45 ? null : parts.reduce((acc, p) => acc + (p.vals[i] ?? 0) * p.w, 0)));
}

/* Coppock Curve — a 10-period WMA of two rates of change. Built for monthly bars. */
export function coppock(src, a = 14, b = 11, n = 10) {
  const r = roc(src, a).map((v, i) => { const q = roc(src, b)[i]; return v == null || q == null ? null : v + q; });
  return wma(r.map((v) => (v == null ? 0 : v)), n).map((v, i) => (i < a + n ? null : v));
}

/* Ultimate Oscillator — Williams. Three horizons weighted 4:2:1, so a single
   timeframe cannot dominate it. */
export function ultosc(bars, s = 7, m = 14, l = 28) {
  const bp = [], tr = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { bp.push(0); tr.push(bars[0].h - bars[0].l); continue; }
    const pc = bars[i - 1].c;
    const low = Math.min(bars[i].l, pc), high = Math.max(bars[i].h, pc);
    bp.push(bars[i].c - low); tr.push(high - low);
  }
  const win = (arr, i, n) => { let t = 0; for (let k = i - n + 1; k <= i; k++) t += arr[k]; return t; };
  return bars.map((_, i) => {
    if (i < l) return null;
    const a = win(tr, i, s) === 0 ? 0 : win(bp, i, s) / win(tr, i, s);
    const b = win(tr, i, m) === 0 ? 0 : win(bp, i, m) / win(tr, i, m);
    const c = win(tr, i, l) === 0 ? 0 : win(bp, i, l) / win(tr, i, l);
    return ((4 * a + 2 * b + c) / 7) * 100;
  });
}

/* Balance of Power — where the close finished relative to the open, scaled by range. */
export function bop(bars) {
  return bars.map((b) => (b.h === b.l ? 0 : (b.c - b.o) / (b.h - b.l)));
}

/* Elder Ray — how far buyers and sellers pushed past the trend. */
export function elderRay(bars, n = 13) {
  const e = ema(bars.map((b) => b.c), n);
  return {
    bull: bars.map((b, i) => (e[i] == null ? null : b.h - e[i])),
    bear: bars.map((b, i) => (e[i] == null ? null : b.l - e[i])),
  };
}

/* Fisher Transform — Ehlers. Forces a bounded series toward a gaussian shape so
   turns become sharp rather than gradual. */
export function fisher(bars, n = 9) {
  const hs = bars.map((b) => b.h), ls = bars.map((b) => b.l);
  const out = new Array(bars.length).fill(null), sig = new Array(bars.length).fill(null);
  let v = 0, f = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < n - 1) continue;
    const hi = highest(hs, i, n), lo = lowest(ls, i, n);
    const mid = (bars[i].h + bars[i].l) / 2;
    const raw = hi === lo ? 0 : ((mid - lo) / (hi - lo)) - 0.5;
    v = 0.66 * 2 * raw + 0.67 * v;
    v = Math.max(-0.999, Math.min(0.999, v));
    const prev = f;
    f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * f;
    out[i] = f; sig[i] = prev;
  }
  return { fisher: out, signal: sig };
}


/* ── volatility ───────────────────────────────────────────────────────────────
   Note which ATR each of these uses. Ours is a simple average of true range and the
   industry's is Wilder's — a difference measured against three implementations today.
   Anything below that an author defined on Wilder's ATR uses rma(), not our sma-based
   atr(), so the number matches what a reader's broker shows. */

/* Normalised ATR — volatility as a percentage of price, so it compares across stocks. */
export function natr(bars, n = 14) {
  const a = rma(trueRange(bars), n);
  return bars.map((b, i) => (a[i] == null || b.c === 0 ? null : (a[i] / b.c) * 100));
}

/* Bollinger %B and bandwidth — where price sits in the band, and how wide it is. */
export function bbPercent(bars, n = 20, mult = 2) {
  const b = bollinger(bars, n, mult);
  return bars.map((x, i) => {
    if (b.upper[i] == null || b.upper[i] === b.lower[i]) return null;
    return (x.c - b.lower[i]) / (b.upper[i] - b.lower[i]);
  });
}
export function bbWidth(bars, n = 20, mult = 2) {
  const b = bollinger(bars, n, mult);
  return bars.map((_, i) => (b.mid[i] == null || b.mid[i] === 0 ? null : ((b.upper[i] - b.lower[i]) / b.mid[i]) * 100));
}

/* STARC bands — Stoller. A simple average with Wilder ATR either side. */
export function starc(bars, n = 15, atrLen = 15, mult = 2) {
  const ma = sma(bars.map((b) => b.c), n), a = rma(trueRange(bars), atrLen);
  return {
    mid: ma,
    upper: ma.map((v, i) => (v == null || a[i] == null ? null : v + mult * a[i])),
    lower: ma.map((v, i) => (v == null || a[i] == null ? null : v - mult * a[i])),
  };
}

/* Chandelier Exit — Le Beau. A stop hung from the highest high since entry. */
export function chandelierExit(bars, n = 22, mult = 3) {
  const hs = bars.map((b) => b.h), ls = bars.map((b) => b.l), a = rma(trueRange(bars), n);
  return {
    long: bars.map((_, i) => (i < n - 1 || a[i] == null ? null : highest(hs, i, n) - mult * a[i])),
    short: bars.map((_, i) => (i < n - 1 || a[i] == null ? null : lowest(ls, i, n) + mult * a[i])),
  };
}

/* Chande Kroll stop — the same idea with a two-stage lookback. */
export function chandeKrollStop(bars, p = 10, x = 1, q = 9) {
  const a = rma(trueRange(bars), p);
  const hs = bars.map((b) => b.h), ls = bars.map((b) => b.l);
  const hiStop = bars.map((_, i) => (i < p - 1 || a[i] == null ? null : highest(hs, i, p) - x * a[i]));
  const loStop = bars.map((_, i) => (i < p - 1 || a[i] == null ? null : lowest(ls, i, p) + x * a[i]));
  return {
    long: hiStop.map((_, i) => (i < p + q ? null : highest(hiStop.map((v) => v ?? -Infinity), i, q))),
    short: loStop.map((_, i) => (i < p + q ? null : lowest(loStop.map((v) => v ?? Infinity), i, q))),
  };
}

/* Historical volatility — the annualised standard deviation of log returns.

   THE ANNUALISATION DEPENDS ON YOUR BAR SIZE and this is the one place a timeframe
   assumption can be silently wrong. 252 is the count of trading DAYS in a year, so the
   default is right for daily bars and wrong for every other size: pass 52 for weekly, 12
   for monthly, or roughly 1,575 for hourly bars on a 6.25-hour Indian session. Getting
   this wrong does not error — it scales the answer by the square root of the ratio. */
export function historicalVolatility(bars, n = 20, barsPerYear = 252) {
  const lr = bars.map((b, i) => (i === 0 || bars[i - 1].c <= 0 ? 0 : Math.log(b.c / bars[i - 1].c)));
  return bars.map((_, i) => {
    if (i < n) return null;
    let m = 0; for (let k = i - n + 1; k <= i; k++) m += lr[k];
    m /= n;
    let v = 0; for (let k = i - n + 1; k <= i; k++) v += (lr[k] - m) ** 2;
    return Math.sqrt(v / (n - 1)) * Math.sqrt(barsPerYear) * 100;
  });
}

/* Ulcer Index — Martin. Depth and duration of drawdown, which is closer to what
   holding something actually feels like than standard deviation is. */
export function ulcerIndex(bars, n = 14) {
  const cs = bars.map((b) => b.c);
  return bars.map((_, i) => {
    if (i < n - 1) return null;
    let sq = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const peak = highest(cs, k, Math.min(n, k + 1));
      const dd = peak === 0 ? 0 : ((cs[k] - peak) / peak) * 100;
      sq += dd * dd;
    }
    return Math.sqrt(sq / n);
  });
}

/* Mass Index — Dorsey. Range expansion as a reversal warning. */
export function massIndex(bars, n = 25, e = 9) {
  const range = bars.map((b) => b.h - b.l);
  const e1 = ema(range, e);
  const e2 = ema(e1.map((v) => (v == null ? 0 : v)), e);
  const ratio = e1.map((v, i) => (v == null || e2[i] == null || e2[i] === 0 ? null : v / e2[i]));
  return bars.map((_, i) => {
    if (i < n + 2 * e) return null;
    let t = 0; for (let k = i - n + 1; k <= i; k++) t += ratio[k] ?? 0;
    return t;
  });
}

/* Choppiness — Dreiss. 100 means directionless, 0 means a clean trend. */
export function chop(bars, n = 14) {
  const a = trueRange(bars);
  const hs = bars.map((b) => b.h), ls = bars.map((b) => b.l);
  return bars.map((_, i) => {
    if (i < n) return null;
    let sum = 0; for (let k = i - n + 1; k <= i; k++) sum += a[k];
    const rng = highest(hs, i, n) - lowest(ls, i, n);
    return rng <= 0 || sum <= 0 ? null : (100 * Math.log10(sum / rng)) / Math.log10(n);
  });
}

/* ── volume ───────────────────────────────────────────────────────────────── */

/* VWAP — running, from the first bar. Intraday VWAP resets daily; on daily bars
   there is no session to reset on, so this is the cumulative one and is labelled so. */
export function vwap(bars) {
  let pv = 0, vv = 0;
  return bars.map((b) => {
    const v = vol(b);
    if (v == null) return null;
    pv += ((b.h + b.l + b.c) / 3) * v; vv += v;
    return vv === 0 ? null : pv / vv;
  });
}

/* Accumulation/Distribution — Chaikin's money flow multiplier, accumulated. */
export function adl(bars) {
  let run = 0;
  return bars.map((b) => {
    const v = vol(b);
    if (v == null) return null;
    const mult = b.h === b.l ? 0 : ((b.c - b.l) - (b.h - b.c)) / (b.h - b.l);
    run += mult * v;
    return run;
  });
}

/* Chaikin Money Flow, and the Chaikin Oscillator over the A/D line. */
export function cmf(bars, n = 20) {
  return bars.map((_, i) => {
    if (i < n - 1) return null;
    let mfv = 0, vv = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const b = bars[k], v = vol(b);
      if (v == null) return null;
      mfv += (b.h === b.l ? 0 : ((b.c - b.l) - (b.h - b.c)) / (b.h - b.l)) * v;
      vv += v;
    }
    return vv === 0 ? null : mfv / vv;
  });
}
export function chaikinOsc(bars, fast = 3, slow = 10) {
  const a = adl(bars).map((v) => (v == null ? 0 : v));
  const f = ema(a, fast), s = ema(a, slow);
  return bars.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
}

/* Ease of Movement — Arms. How far price moved per unit of volume. */
export function emv(bars, n = 14) {
  const raw = bars.map((b, i) => {
    if (i === 0) return 0;
    const v = vol(b);
    if (v == null || v === 0 || b.h === b.l) return 0;
    const move = (b.h + b.l) / 2 - (bars[i - 1].h + bars[i - 1].l) / 2;
    return move / ((v / 1e8) / (b.h - b.l));
  });
  return sma(raw, n);
}

/* Force Index — Elder. Price change times volume. */
export function forceIndex(bars, n = 13) {
  const raw = bars.map((b, i) => (i === 0 ? 0 : (b.c - bars[i - 1].c) * (vol(b) ?? 0)));
  return ema(raw, n);
}

/* Negative and Positive Volume Index — Fosback. Track price only on days when
   volume fell (NVI) or rose (PVI). */
function volIndex(bars, wantRise) {
  let idx = 1000;
  return bars.map((b, i) => {
    if (i === 0) return idx;
    const v = vol(b), pv = vol(bars[i - 1]);
    if (v != null && pv != null && (wantRise ? v > pv : v < pv) && bars[i - 1].c !== 0) {
      idx += ((b.c - bars[i - 1].c) / bars[i - 1].c) * idx;
    }
    return idx;
  });
}
export const nvi = (bars) => volIndex(bars, false);
export const pvi = (bars) => volIndex(bars, true);

/* Volume oscillator and volume rate of change. */
export function volumeOsc(bars, fast = 5, slow = 10) {
  const v = bars.map((b) => vol(b) ?? 0);
  const f = sma(v, fast), s = sma(v, slow);
  return bars.map((_, i) => (f[i] == null || s[i] == null || s[i] === 0 ? null : ((f[i] - s[i]) / s[i]) * 100));
}
export function vroc(bars, n = 14) {
  const v = bars.map((b) => vol(b) ?? 0);
  return v.map((x, i) => (i < n || v[i - n] === 0 ? null : ((x - v[i - n]) / v[i - n]) * 100));
}

/* Klinger — Kroll's volume force, and Price Volume Trend. */
export function klinger(bars, fast = 34, slow = 55, sig = 13) {
  let trend = 1, cm = 0, prevHLC = null;
  const vf = bars.map((b, i) => {
    const v = vol(b) ?? 0;
    const hlc = b.h + b.l + b.c;
    const dm = b.h - b.l;
    if (i === 0) { prevHLC = hlc; cm = dm; return 0; }
    const newTrend = hlc > prevHLC ? 1 : -1;
    cm = newTrend === trend ? cm + dm : dm;
    trend = newTrend; prevHLC = hlc;
    return cm === 0 ? 0 : v * Math.abs(2 * (dm / cm) - 1) * trend * 100;
  });
  const kvo = ema(vf, fast).map((v, i) => { const s = ema(vf, slow)[i]; return v == null || s == null ? null : v - s; });
  return { kvo, signal: ema(kvo.map((v) => (v == null ? 0 : v)), sig) };
}
export function pvt(bars) {
  let run = 0;
  return bars.map((b, i) => {
    if (i === 0) return 0;
    const prev = bars[i - 1].c;
    if (prev !== 0) run += ((b.c - prev) / prev) * (vol(b) ?? 0);
    return run;
  });
}


/* ── trend, structure and statistics ──────────────────────────────────────────
   The last group, and the least alike: two of them measure a trend, three draw
   structure a reader would otherwise draw by hand, and the rest are ordinary
   statistics applied to price. */

/* Aroon — Chande. How long since the window's high and low, as a percentage.
   Both at 100 means the extreme is today. */
export function aroon(bars, n = 25) {
  const up = [], down = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < n) { up.push(null); down.push(null); continue; }
    let hi = -Infinity, lo = Infinity, hIdx = i, lIdx = i;
    for (let k = i - n; k <= i; k++) {
      if (bars[k].h >= hi) { hi = bars[k].h; hIdx = k; }
      if (bars[k].l <= lo) { lo = bars[k].l; lIdx = k; }
    }
    up.push(((n - (i - hIdx)) / n) * 100);
    down.push(((n - (i - lIdx)) / n) * 100);
  }
  return { up, down, osc: up.map((v, i) => (v == null ? null : v - down[i])) };
}

/* Vortex — Botes and Siepman. Two lines crossing marks a trend change. */
export function vortex(bars, n = 14) {
  const tr = trueRange(bars);
  const vmP = bars.map((b, i) => (i ? Math.abs(b.h - bars[i - 1].l) : 0));
  const vmN = bars.map((b, i) => (i ? Math.abs(b.l - bars[i - 1].h) : 0));
  const win = (a, i) => { let t = 0; for (let k = i - n + 1; k <= i; k++) t += a[k]; return t; };
  const plus = [], minus = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < n) { plus.push(null); minus.push(null); continue; }
    const t = win(tr, i);
    plus.push(t === 0 ? null : win(vmP, i) / t);
    minus.push(t === 0 ? null : win(vmN, i) / t);
  }
  return { plus, minus };
}

/* Random Walk Index — Poulos. How far price travelled against how far a random
   walk of the same volatility would be expected to. */
export function rwi(bars, n = 14) {
  const a = rma(trueRange(bars), n);
  const hi = [], lo = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < n || a[i] == null || a[i] === 0) { hi.push(null); lo.push(null); continue; }
    let bh = 0, bl = 0;
    for (let k = 2; k <= n; k++) {
      const d = Math.sqrt(k);
      bh = Math.max(bh, (bars[i].h - bars[i - k + 1].l) / (a[i] * d));
      bl = Math.max(bl, (bars[i - k + 1].h - bars[i].l) / (a[i] * d));
    }
    hi.push(bh); lo.push(bl);
  }
  return { high: hi, low: lo };
}

/* Schaff Trend Cycle — Schaff. A stochastic applied twice to the MACD line, which
   makes a slow trend indicator turn like a fast one. */
export function stc(src, fast = 23, slow = 50, cycle = 10) {
  const macdLine = src.map((_, i) => { const f = ema(src, fast)[i], s = ema(src, slow)[i];
    return f == null || s == null ? null : f - s; });
  const stoch = (arr, n) => arr.map((v, i) => {
    if (i < n - 1 || v == null) return null;
    let hi = -Infinity, lo = Infinity;
    for (let k = i - n + 1; k <= i; k++) { if (arr[k] == null) return null; hi = Math.max(hi, arr[k]); lo = Math.min(lo, arr[k]); }
    return hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
  });
  const k1 = stoch(macdLine, cycle);
  const d1 = ema(k1.map((v) => (v == null ? 0 : v)), 3);
  const k2 = stoch(d1, cycle);
  return ema(k2.map((v) => (v == null ? 0 : v)), 3)
    .map((v, i) => (i < slow + 2 * cycle ? null : v));
}

/* Williams Fractals — a high with two lower highs either side. Confirmed only two
   bars later, which is the whole point: it cannot be known sooner. */
export function williamsFractals(bars, w = 2) {
  const up = new Array(bars.length).fill(null), down = new Array(bars.length).fill(null);
  for (let i = w; i < bars.length - w; i++) {
    let isHigh = true, isLow = true;
    for (let k = 1; k <= w; k++) {
      if (bars[i].h <= bars[i - k].h || bars[i].h <= bars[i + k].h) isHigh = false;
      if (bars[i].l >= bars[i - k].l || bars[i].l >= bars[i + k].l) isLow = false;
    }
    /* Recorded at the bar it is CONFIRMED on, not the bar it happened on. Placing it
       on the pivot itself would let a rule read it w bars before it could be known. */
    if (isHigh) up[i + w] = bars[i].h;
    if (isLow) down[i + w] = bars[i].l;
  }
  return { up, down };
}

/* Classic floor-trader pivots from the previous bar. */
export function pivotPoints(bars) {
  const p = [], r1 = [], r2 = [], s1 = [], s2 = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { p.push(null); r1.push(null); r2.push(null); s1.push(null); s2.push(null); continue; }
    const b = bars[i - 1], pp = (b.h + b.l + b.c) / 3;
    p.push(pp);
    r1.push(2 * pp - b.l); s1.push(2 * pp - b.h);
    r2.push(pp + (b.h - b.l)); s2.push(pp - (b.h - b.l));
  }
  return { p, r1, r2, s1, s2 };
}

/* Bill Williams' Alligator: three displaced smoothed averages. The displacement is
   FORWARD, which on a chart is a line drawn ahead of price — so for a signal each is
   read from its own past, never from a bar that has not happened. */
export function alligator(bars) {
  const med = bars.map((b) => (b.h + b.l) / 2);
  const shift = (arr, by) => arr.map((_, i) => (i - by < 0 ? null : arr[i - by]));
  const smma = (src, n) => rma(src, n);
  return {
    jaw: shift(smma(med, 13), 8),
    teeth: shift(smma(med, 8), 5),
    lips: shift(smma(med, 5), 3),
  };
}
export function gator(bars) {
  const a = alligator(bars);
  return {
    upper: a.jaw.map((v, i) => (v == null || a.teeth[i] == null ? null : Math.abs(v - a.teeth[i]))),
    lower: a.teeth.map((v, i) => (v == null || a.lips[i] == null ? null : -Math.abs(v - a.lips[i]))),
  };
}

/* Moving-average envelopes — a fixed percentage either side. */
export function envelopes(bars, n = 20, pct = 2.5) {
  const ma = sma(bars.map((b) => b.c), n);
  return {
    mid: ma,
    upper: ma.map((v) => (v == null ? null : v * (1 + pct / 100))),
    lower: ma.map((v) => (v == null ? null : v * (1 - pct / 100))),
  };
}

/* ── statistics over price ─────────────────────────────────────────────────── */

/* Least-squares fit over the window: the line's value at the last bar, its slope,
   and the same line projected one bar forward. */
function fit(src, n, i) {
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let k = 0; k < n; k++) {
    const y = src[i - n + 1 + k];
    if (y == null) return null;
    sx += k; sy += y; sxy += k * y; sxx += k * k;
  }
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  const slope = (n * sxy - sx * sy) / d;
  return { slope, intercept: (sy - slope * sx) / n };
}
export function linreg(src, n = 14) {
  return src.map((_, i) => { if (i < n - 1) return null;
    const f = fit(src, n, i); return f ? f.intercept + f.slope * (n - 1) : null; });
}
export function linregSlope(src, n = 14) {
  return src.map((_, i) => (i < n - 1 ? null : fit(src, n, i)?.slope ?? null));
}
export function tsf(src, n = 14) {
  return src.map((_, i) => { if (i < n - 1) return null;
    const f = fit(src, n, i); return f ? f.intercept + f.slope * n : null; });
}

/* Rolling median and variance of the close. */
export function median(src, n = 14) {
  return src.map((_, i) => {
    if (i < n - 1) return null;
    const w = src.slice(i - n + 1, i + 1).filter((v) => v != null).sort((a, b) => a - b);
    if (w.length < n) return null;
    const h = Math.floor(w.length / 2);
    return w.length % 2 ? w[h] : (w[h - 1] + w[h]) / 2;
  });
}
export function variance(src, n = 14) {
  return src.map((_, i) => {
    if (i < n - 1) return null;
    let m = 0; for (let k = i - n + 1; k <= i; k++) m += src[k];
    m /= n;
    let v = 0; for (let k = i - n + 1; k <= i; k++) v += (src[k] - m) ** 2;
    return v / n;
  });
}

/* Rolling correlation and beta of the close against its own lagged self — the
   two-series versions need a benchmark the chart does not carry. */
export function correlation(a, b, n = 20) {
  return a.map((_, i) => {
    if (i < n - 1) return null;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let k = i - n + 1; k <= i; k++) {
      if (a[k] == null || b[k] == null) return null;
      sa += a[k]; sb += b[k]; saa += a[k] * a[k]; sbb += b[k] * b[k]; sab += a[k] * b[k];
    }
    const num = n * sab - sa * sb;
    const den = Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
    return den === 0 ? null : num / den;
  });
}
export function beta(a, b, n = 20) {
  return a.map((_, i) => {
    if (i < n - 1) return null;
    let sa = 0, sb = 0, sbb = 0, sab = 0;
    for (let k = i - n + 1; k <= i; k++) {
      if (a[k] == null || b[k] == null) return null;
      sa += a[k]; sb += b[k]; sbb += b[k] * b[k]; sab += a[k] * b[k];
    }
    const den = n * sbb - sb * sb;
    return den === 0 ? null : (n * sab - sa * sb) / den;
  });
}

/* Connors RSI — Connors and Alvarez. Three ideas averaged: a very short RSI, an RSI
   of the streak of consecutive up or down closes, and where today's return ranks
   against the last hundred. Built for mean reversion over two or three days. */
export function crsi(bars, rsiLen = 3, streakLen = 2, rankLen = 100) {
  const close = bars.map((b) => b.c);
  const r1 = rsi(bars, rsiLen);
  const streak = close.map((_, i) => 0);
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    streak[i] = d > 0 ? Math.max(0, streak[i - 1]) + 1
              : d < 0 ? Math.min(0, streak[i - 1]) - 1 : 0;
  }
  const r2 = rsi(streak.map((v) => ({ c: v })), streakLen);
  const ret = close.map((v, i) => (i === 0 || close[i - 1] === 0 ? 0 : (v - close[i - 1]) / close[i - 1]));
  const rank = ret.map((v, i) => {
    if (i < rankLen) return null;
    let below = 0;
    for (let k = i - rankLen; k < i; k++) if (ret[k] < v) below++;
    return (below / rankLen) * 100;
  });
  return close.map((_, i) => (r1[i] == null || r2[i] == null || rank[i] == null
    ? null : (r1[i] + r2[i] + rank[i]) / 3));
}

/* Relative Vigor Index — Dorsey. Where the close finished within the bar, smoothed,
   on the theory that a rising market closes above its open. */
export function rvi(bars, n = 10) {
  const num = bars.map((b, i) => {
    if (i < 3) return 0;
    const w = (x) => bars[x].c - bars[x].o;
    return (w(i) + 2 * w(i - 1) + 2 * w(i - 2) + w(i - 3)) / 6;
  });
  const den = bars.map((b, i) => {
    if (i < 3) return 0;
    const w = (x) => bars[x].h - bars[x].l;
    return (w(i) + 2 * w(i - 1) + 2 * w(i - 2) + w(i - 3)) / 6;
  });
  const sn = sma(num, n), sd = sma(den, n);
  const line = bars.map((_, i) => (sn[i] == null || sd[i] == null || sd[i] === 0 ? null : sn[i] / sd[i]));
  const signal = line.map((_, i) => {
    if (i < 3 || line[i] == null || line[i - 3] == null) return null;
    return (line[i] + 2 * line[i - 1] + 2 * line[i - 2] + line[i - 3]) / 6;
  });
  return { line, signal };
}

/* Rolling mode, to one decimal. Genuinely rare in trading and included for
   completeness: on continuous prices almost every value is unique, so it reports the
   most common ROUNDED price in the window — which is a crude support/resistance read
   and nothing more. */
export function mode(src, n = 20, dp = 1) {
  const f = 10 ** dp;
  return src.map((_, i) => {
    if (i < n - 1) return null;
    const counts = new Map();
    let best = null, bestN = 0;
    for (let k = i - n + 1; k <= i; k++) {
      const key = Math.round(src[k] * f) / f;
      const c = (counts.get(key) || 0) + 1;
      counts.set(key, c);
      if (c > bestN) { bestN = c; best = key; }
    }
    return best;
  });
}

/* ---- the families ---- */

export function macd(bars, fast = 12, slow = 26, signal = 9) {
  const close = bars.map((b) => b.c);
  const f = ema(close, fast);
  const s = ema(close, slow);
  const line = close.map((_, i) => (f[i] === null || s[i] === null ? null : f[i] - s[i]));
  /* The signal line is an EMA of the MACD line, and it may only start once the
     MACD line exists — seeding it from the nulls would shift it left by 25 bars. */
  const start = line.findIndex((v) => v !== null);
  const sig = new Array(line.length).fill(null);
  if (start >= 0) {
    const tail = ema(line.slice(start), signal);
    for (let i = 0; i < tail.length; i++) sig[start + i] = tail[i];
  }
  const hist = line.map((v, i) => (v === null || sig[i] === null ? null : v - sig[i]));
  return { line, signal: sig, hist };
}

/* A NULL VOLUME IS UNKNOWN, NOT ZERO. `bars[i].v || 0` treated a session we hold
   no volume for as one where nothing changed hands: OBV flatlined across it and
   money flow read no flow at all. Measured on prices_daily, 0.16% of the last two
   years is null — rare, wrong, and invisible, which is the worst combination. The
   running total now carries the gap forward instead of pretending it was a quiet
   day, and the output is null there so the line breaks rather than lying. */
const vol = (b) => (b.v === null || b.v === undefined || !isFinite(b.v) ? null : b.v);

export function obv(bars) {
  const out = new Array(bars.length).fill(null);
  /* Seeded with the first bar's volume, matching TA-Lib. Starting at zero left every
     value a constant offset below the reference — harmless to a crossover, wrong to
     anyone comparing the number itself. */
  let run = vol(bars[0]) ?? 0;
  for (let i = 0; i < bars.length; i++) {
    const v = vol(bars[i]);
    if (v === null) { out[i] = null; continue; }
    if (i > 0) run += bars[i].c > bars[i - 1].c ? v : bars[i].c < bars[i - 1].c ? -v : 0;
    out[i] = run;
  }
  return out;
}

/* WILDER'S RSI, seeded one bar earlier than TA-Lib.

   Measured against TA-Lib 0.7.1 on 6,126 bars: we emit a first value at bar n-1 where it
   emits at bar n, and Wilder's smoothing carries that seed forward — 0.65 apart at bar
   26, 0.08 by bar 50, 0.002 by bar 100, and EXACTLY zero from bar 300 on. No backtest
   here is affected, because none of them trades inside the warmup. It is written down
   because a library that is silently a hair different from the reference for its first
   fifty bars is a library somebody will file an issue about, and they would be right. */
export function rsi(bars, n = 14) {
  const gains = [], losses = [];
  for (let i = 0; i < bars.length; i++) {
    const d = i === 0 ? 0 : bars[i].c - bars[i - 1].c;
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const g = rma(gains, n), l = rma(losses, n);
  return bars.map((_, i) => {
    if (g[i] === null || l[i] === null) return null;
    if (l[i] === 0) return 100;
    const rs = g[i] / l[i];
    return 100 - 100 / (1 + rs);
  });
}

/* Stochastic RSI: the RSI's own position in its recent range, which is why it
   swings to the rails so much harder than the RSI it is built on. */
/* STOCHASTIC RSI. This returns the SMOOTHED %K and its %D — the pair a chart draws.
   TA-Lib's STOCHRSI returns the raw, unsmoothed fastk, which is our %K before its
   3-period average; computed that way the two are identical to 0.000000. Both are
   right and they are different outputs, so the difference is named here rather than
   found by someone comparing one against the other. */
export function stochRsi(bars, n = 14, k = 3, d = 3) {
  const r = rsi(bars, n);
  const raw = r.map((v, i) => {
    if (v === null || i < n * 2 - 2) return null;
    const win = r.slice(Math.max(0, i - n + 1), i + 1).filter((x) => x !== null);
    if (win.length < n) return null;
    const hi = Math.max(...win), lo = Math.min(...win);
    return hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100;
  });
  const kLine = sma(raw.map((v) => (v === null ? 0 : v)), k).map((v, i) => (raw[i] === null ? null : v));
  const dLine = sma(kLine.map((v) => (v === null ? 0 : v)), d).map((v, i) => (kLine[i] === null ? null : v));
  return { k: kLine, d: dLine };
}

export function mfi(bars, n = 14) {
  const tp = bars.map((b) => (b.h + b.l + b.c) / 3);
  const pos = [], neg = [];
  const gap = new Array(bars.length).fill(false);
  for (let i = 0; i < bars.length; i++) {
    const v = vol(bars[i]);
    if (v === null) { gap[i] = true; pos.push(0); neg.push(0); continue; }
    const flow = tp[i] * v;
    if (i === 0) { pos.push(0); neg.push(0); continue; }
    pos.push(tp[i] > tp[i - 1] ? flow : 0);
    neg.push(tp[i] < tp[i - 1] ? flow : 0);
  }
  const p = sma(pos, n), q = sma(neg, n);
  return bars.map((_, i) => {
    if (p[i] === null || q[i] === null) return null;
    /* A window containing a session we have no volume for cannot produce an
       honest money-flow reading, so it produces none. */
    for (let k = Math.max(0, i - n + 1); k <= i; k++) if (gap[k]) return null;
    if (q[i] === 0) return 100;
    return 100 - 100 / (1 + p[i] / q[i]);
  });
}

export function donchian(bars, n = 20) {
  const h = bars.map((b) => b.h), l = bars.map((b) => b.l);
  const upper = bars.map((_, i) => (i < n - 1 ? null : highest(h, i, n)));
  const lower = bars.map((_, i) => (i < n - 1 ? null : lowest(l, i, n)));
  return { upper, lower };
}

export function bollinger(bars, n = 20, mult = 2) {
  const close = bars.map((b) => b.c);
  const mid = sma(close, n);
  const dev = close.map((_, i) => {
    if (mid[i] === null) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (close[j] - mid[i]) ** 2;
    return Math.sqrt(s / n);
  });
  return {
    mid,
    upper: mid.map((m, i) => (m === null ? null : m + mult * dev[i])),
    lower: mid.map((m, i) => (m === null ? null : m - mult * dev[i])),
  };
}

/* The rolling high and low over a window of BARS, defaulting to 252 — a trading year of
   daily sessions. On weekly bars 252 is five years, not one, so pass the window you mean.
   The name says "year" because that is what it is used for; the maths counts bars.

   Excludes the current bar, deliberately: a level computed including today is a level
   today cannot exceed, so "makes a new 52-week high" would be false on every bar of every
   stock, for ever, and silently.
   days, so a calendar year would quietly be a fourteen-month high. */
export function yearBand(bars, n = 252) {
  const h = bars.map((b) => b.h), l = bars.map((b) => b.l);
  const span = Math.min(n, bars.length);
  return {
    upper: bars.map((_, i) => (i < 20 ? null : highest(h, i, span))),
    lower: bars.map((_, i) => (i < 20 ? null : lowest(l, i, span))),
  };
}

export function dmi(bars, n = 14) {
  const plus = [], minus = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { plus.push(0); minus.push(0); continue; }
    const up = bars[i].h - bars[i - 1].h;
    const dn = bars[i - 1].l - bars[i].l;
    plus.push(up > dn && up > 0 ? up : 0);
    minus.push(dn > up && dn > 0 ? dn : 0);
  }
  const tr = rma(trueRange(bars), n);
  const p = rma(plus, n), m = rma(minus, n);
  const pdi = bars.map((_, i) => (tr[i] ? (p[i] / tr[i]) * 100 : null));
  const mdi = bars.map((_, i) => (tr[i] ? (m[i] / tr[i]) * 100 : null));
  const dx = bars.map((_, i) => {
    if (pdi[i] === null || mdi[i] === null) return null;
    const sum = pdi[i] + mdi[i];
    return sum === 0 ? 0 : (Math.abs(pdi[i] - mdi[i]) / sum) * 100;
  });
  const start = dx.findIndex((v) => v !== null);
  const adx = new Array(dx.length).fill(null);
  if (start >= 0) {
    const tail = rma(dx.slice(start).map((v) => v ?? 0), n);
    for (let i = 0; i < tail.length; i++) adx[start + i] = tail[i];
  }
  return { pdi, mdi, adx };
}

/* Wilder's Parabolic SAR, acceleration 0.02 stepping to 0.20. Written out in
   full rather than approximated: the whole content of the indicator is where it
   flips, and a flip one bar early is the only thing a reader would check. */
export function psar(bars, step = 0.02, max = 0.2) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < 3) return out;
  let up = bars[1].c >= bars[0].c;
  let sar = up ? bars[0].l : bars[0].h;
  let ep = up ? bars[1].h : bars[1].l;
  let af = step;
  out[1] = sar;
  for (let i = 2; i < bars.length; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, bars[i - 1].l, bars[i - 2].l);
      if (bars[i].l < sar) { up = false; sar = ep; ep = bars[i].l; af = step; }
      else if (bars[i].h > ep) { ep = bars[i].h; af = Math.min(af + step, max); }
    } else {
      sar = Math.max(sar, bars[i - 1].h, bars[i - 2].h);
      if (bars[i].h > sar) { up = true; sar = ep; ep = bars[i].h; af = step; }
      else if (bars[i].l < ep) { ep = bars[i].l; af = Math.min(af + step, max); }
    }
    out[i] = sar;
  }
  return out;
}

export function supertrend(bars, n = 10, mult = 3) {
  const a = atr(bars, n);
  const line = new Array(bars.length).fill(null);
  const dir = new Array(bars.length).fill(null);
  let upper = null, lower = null, trendUp = true;
  for (let i = 0; i < bars.length; i++) {
    if (a[i] === null) continue;
    const mid = (bars[i].h + bars[i].l) / 2;
    const bu = mid + mult * a[i];
    const bl = mid - mult * a[i];
    upper = upper === null || bu < upper || bars[i - 1].c > upper ? bu : upper;
    lower = lower === null || bl > lower || bars[i - 1].c < lower ? bl : lower;
    if (line[i - 1] === null) trendUp = bars[i].c >= mid;
    else if (trendUp && bars[i].c < lower) trendUp = false;
    else if (!trendUp && bars[i].c > upper) trendUp = true;
    line[i] = trendUp ? lower : upper;
    dir[i] = trendUp;
  }
  return { line, up: dir };
}

/* Ichimoku, drawn without the forward shift. The cloud is normally plotted 26
   sessions into the future, and a chart that ends today would then end 26 bars
   of empty space to the right of the last candle. The two spans are drawn at the
   bar they were computed on, which is the honest version of the same lines. */
export function ichimoku(bars, conv = 9, base = 26, spanB = 52) {
  const h = bars.map((b) => b.h), l = bars.map((b) => b.l);
  const mid = (n) => bars.map((_, i) => {
    if (i < n - 1) return null;
    const hi = highest(h, i, n), lo = lowest(l, i, n);
    return hi === null || lo === null ? null : (hi + lo) / 2;
  });
  const tenkan = mid(conv), kijun = mid(base), b2 = mid(spanB);
  const spanA = tenkan.map((t, i) => (t === null || kijun[i] === null ? null : (t + kijun[i]) / 2));
  return { tenkan, kijun, spanA, spanB: b2 };
}

/* THE MAP FROM THE SCANNER'S `type` TO WHAT THE CHART DRAWS. Every family the
   warehouse actually contains is here; a type we have not met draws candles
   alone rather than guessing at an overlay. `pane` lines go under the price,
   `over` lines go on it. */
