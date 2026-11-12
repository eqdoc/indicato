/* TA-Lib's own arithmetic, for the functions where indicato's defaults and TA-Lib 0.7.1 differ in the last digits.

   This is the "compat" mode: rsi(bars, 14, { compat: "talib" }) and eight more (README, "TA-Lib compatibility mode").
   Each function here is written the way TA-Lib's C writes it, in TA-Lib's order of operations, because that is the only way two
   floating-point programs agree to the last bit: same seed, same first bar, same running sums. The defaults are not touched; the
   reasons they differ are in docs/accuracy.md. Nothing is imported and nothing here is exported from the package root.

   Inside this file a bar with no value is NaN (the arithmetic is on Float64 arrays); the public functions turn NaN into null,
   which is what indicato returns everywhere else, so the first non-null index is TA-Lib's first output index. */

const nan = (n) => new Array(n).fill(NaN);
const isZero = (v) => v < 0.00000001 && v > -0.00000001;   // TA_IS_ZERO

/* The options argument, last on every function that takes it. Anything that is not an object is ignored, exactly as before 0.3
   (an extra argument has never been an error), so a caller who never passes options sees no change. */
export function wantsTalib(opts, name) {
  if (opts === null || typeof opts !== "object") return false;
  const c = opts.compat;
  if (c === undefined || c === null || c === false || c === "default") return false;
  if (c === "talib") return true;
  throw new RangeError(`${name}: unknown compat mode ${JSON.stringify(c)}; use "talib", or leave it out for indicato's own`);
}

export const toNull = (a) => a.map((v) => (v !== v ? null : v));

/** TA_SMA: the running total. The new value is added, the quotient taken, and only then does the oldest leave the total. */
export function sma(a, n) {
  const out = nan(a.length);
  if (a.length < n) return out;
  let total = 0;
  for (let i = 0; i < n - 1; i++) total += a[i];
  for (let i = n - 1; i < a.length; i++) {
    const t = total + a[i];
    total = t - a[i - n + 1];
    out[i] = t / n;
  }
  return out;
}

/** TA_RSI, unstable period 0: the first n changes are averaged (bar n), then Wilder's smoothing. A window with no movement reads 0. */
export function rsi(c, n = 14) {
  const out = nan(c.length);
  if (c.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d < 0) loss -= d; else gain += d; }
  loss /= n; gain /= n;
  let t = gain + loss;
  out[n] = t !== 0 ? 100 * (gain / t) : 0;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    loss *= n - 1; gain *= n - 1;
    if (d < 0) loss -= d; else gain += d;
    loss /= n; gain /= n;
    t = gain + loss;
    out[i] = t !== 0 ? 100 * (gain / t) : 0;
  }
  return out;
}

const trueRange = (h, l, pc, i) => { let g = h[i] - l[i]; const a = Math.abs(pc - h[i]); if (a > g) g = a; const b = Math.abs(pc - l[i]); if (b > g) g = b; return g; };

/** TA_ATR: the mean of the true ranges of bars 1..n at bar n (bar 0's range is not used), then Wilder's smoothing. */
export function atr(h, l, c, n = 14) {
  const out = nan(c.length);
  if (c.length <= n) return out;
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += trueRange(h, l, c[i - 1], i);
  let prev = sum / n;
  out[n] = prev;
  for (let i = n + 1; i < c.length; i++) {
    prev *= n - 1;
    prev += trueRange(h, l, c[i - 1], i);
    prev /= n;
    out[i] = prev;
  }
  return out;
}

/** TA_PLUS_DI, TA_MINUS_DI and TA_ADX in one pass (they share every running sum). DI starts at bar n, ADX at bar 2n-1. */
export function directional(h, l, c, n = 14) {
  const len = c.length;
  const pdi = nan(len), mdi = nan(len), adx = nan(len);
  if (len <= n) return { pdi, mdi, adx };
  let pdm = 0, mdm = 0, tr = 0;
  // the first n-1 changes are summed (bars 1..n-1) ...
  for (let i = 1; i < n; i++) {
    const dp = h[i] - h[i - 1], dm = l[i - 1] - l[i];
    if (dm > 0 && dp < dm) mdm += dm; else if (dp > 0 && dp > dm) pdm += dp;
    tr += trueRange(h, l, c[i - 1], i);
  }
  // ... and from bar n each is folded in as Wilder's  sum - sum/n + x
  let sumDx = 0, prevAdx = 0;
  for (let i = n; i < len; i++) {
    const dp = h[i] - h[i - 1], dm = l[i - 1] - l[i];
    if (dm > 0 && dp < dm) { mdm = mdm - mdm / n + dm; pdm = pdm - pdm / n; }
    else if (dp > 0 && dp > dm) { pdm = pdm - pdm / n + dp; mdm = mdm - mdm / n; }
    else { pdm = pdm - pdm / n; mdm = mdm - mdm / n; }
    tr = tr - tr / n + trueRange(h, l, c[i - 1], i);
    if (!isZero(tr)) { pdi[i] = 100 * (pdm / tr); mdi[i] = 100 * (mdm / tr); } else { pdi[i] = 0; mdi[i] = 0; }
    let dx = null;
    if (!isZero(tr)) {
      const p = 100 * (pdm / tr), m = 100 * (mdm / tr), s = m + p;
      if (!isZero(s)) dx = 100 * (Math.abs(m - p) / s);
    }
    if (i < 2 * n - 1) { if (dx !== null) sumDx += dx; }
    else if (i === 2 * n - 1) {
      if (dx !== null) sumDx += dx;
      prevAdx = sumDx / n;
      adx[i] = prevAdx;
    } else {
      if (dx !== null) prevAdx = (prevAdx * (n - 1) + dx) / n;
      adx[i] = prevAdx;
    }
  }
  return { pdi, mdi, adx };
}

/** TA_SAR. The first bar's minus-DM decides the starting direction (down when the low fell by more than the high rose, otherwise up);
 *  the series starts at bar 1. */
export function sar(h, l, step = 0.02, max = 0.2) {
  const len = h.length;
  const out = nan(len);
  if (len < 2) return out;
  const dp = h[1] - h[0], dm = l[0] - l[1];
  const minusDm = dm > 0 && dp < dm ? dm : 0;     // TA_MINUS_DM(1, 1, high, low, period 1)
  let isLong = minusDm > 0 ? false : true;
  let newHigh = h[0], newLow = l[0];
  let ep, s;
  if (isLong) { ep = h[1]; s = newLow; } else { ep = l[1]; s = newHigh; }
  newLow = l[1]; newHigh = h[1];
  let af = step;
  for (let t = 1; t < len; t++) {
    const prevLow = newLow, prevHigh = newHigh;
    newLow = l[t]; newHigh = h[t];
    if (isLong) {
      if (newLow <= s) {
        isLong = false; s = ep;
        if (s < prevHigh) s = prevHigh;
        if (s < newHigh) s = newHigh;
        out[t] = s;
        af = step; ep = newLow;
        s = s + af * (ep - s);
        if (s < prevHigh) s = prevHigh;
        if (s < newHigh) s = newHigh;
      } else {
        out[t] = s;
        if (newHigh > ep) { ep = newHigh; af += step; if (af > max) af = max; }
        s = s + af * (ep - s);
        if (s > prevLow) s = prevLow;
        if (s > newLow) s = newLow;
      }
    } else if (newHigh >= s) {
      isLong = true; s = ep;
      if (s > prevLow) s = prevLow;
      if (s > newLow) s = newLow;
      out[t] = s;
      af = step; ep = newHigh;
      s = s + af * (ep - s);
      if (s > prevLow) s = prevLow;
      if (s > newLow) s = newLow;
    } else {
      out[t] = s;
      if (newLow < ep) { ep = newLow; af += step; if (af > max) af = max; }
      s = s + af * (ep - s);
      if (s < prevHigh) s = prevHigh;
      if (s < newHigh) s = newHigh;
    }
  }
  return out;
}

/** TA_STOCHRSI(n, fastK, fastD, SMA): STOCHF over the RSI series (a window of fastK values), then its mean. Returns the RAW fastk,
 *  which is what TA-Lib returns; indicato's default %K is that line after a further 3-period mean. Both start at bar n + fastK + fastD - 2. */
export function stochRsi(c, n = 14, fastK = 5, fastD = 3) {
  const r = rsi(c, n);
  const len = c.length, first = n + fastK - 1 + fastD - 1;
  const k = nan(len), d = nan(len);
  if (len <= first) return { k, d };
  const rawK = nan(len);
  for (let i = n + fastK - 1; i < len; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - fastK + 1; j <= i; j++) { if (r[j] > hi) hi = r[j]; if (r[j] < lo) lo = r[j]; }
    const diff = (hi - lo) / 100;
    rawK[i] = diff !== 0 ? (r[i] - lo) / diff : 0;
  }
  // %D is the running-total mean over the %K series from its first value, so it carries the rounding TA-Lib's does (a %K pinned at 100
  // reads 100.00000000000006 there, and whether %K is above %D at 100 is decided by that last bit)
  const k0 = n + fastK - 1;
  const mean = sma(rawK.slice(k0), fastD);
  for (let i = first; i < len; i++) { k[i] = rawK[i]; d[i] = mean[i - k0]; }
  return { k, d };
}

/** TA_BBANDS(n, dev, dev, SMA): the middle band is the running-total mean; the deviation is sqrt(mean of squares - square of the mean)
 *  from running totals, and a variance under 1e-8 (TA_IS_ZERO) is a deviation of 0. That subtraction is the point: on a series that barely
 *  moves (a liquid fund at 1,100 with a variance of 1e-6) it cancels to a different number than a direct sum of squared deviations. */
export function bbands(c, n = 20, dev = 2) {
  const len = c.length;
  const mid = sma(c, n), upper = nan(len), lower = nan(len);
  if (len < n) return { upper, mid, lower };
  let total2 = 0;
  for (let i = 0; i < n - 1; i++) total2 += c[i] * c[i];
  for (let i = n - 1, startSum = 0; i < len; i++, startSum++) {
    total2 += c[i] * c[i];
    let mean2 = total2 / n;
    total2 -= c[startSum] * c[startSum];
    mean2 -= mid[i] * mid[i];
    const sd = !isZero(mean2) ? Math.sqrt(mean2) : 0;
    const w = sd * dev;
    upper[i] = mid[i] + w;
    lower[i] = mid[i] - w;
  }
  return { upper, mid, lower };
}

/** TA_MACD(fast, slow, signal): both EMAs are seeded at bar slow-1 with the mean of their own last `period` closes (the fast one from bar
 *  slow-fast, not from bar fast-1), the signal line with the mean of the first `signal` MACD values. All three series start at bar slow + signal - 2. */
export function macd(c, fast = 12, slow = 26, signal = 9) {
  if (slow < fast) [fast, slow] = [slow, fast];      // TA_MACD swaps a "slow" period that is faster than the "fast" one
  const len = c.length, start = slow - 1, first = start + signal - 1;
  const line = nan(len), sig = nan(len), hist = nan(len);
  if (len <= first) return { line, signal: sig, hist };
  const ema = (period, from, out) => {
    const k = 2.0 / (period + 1);
    let t = 0;
    for (let i = from; i < from + period; i++) t += c[i];
    let prev = t / period;
    out[from + period - 1] = prev;
    for (let i = from + period; i < len; i++) { prev = ((c[i] - prev) * k) + prev; out[i] = prev; }
  };
  const f = nan(len), sl = nan(len);
  ema(fast, start - fast + 1, f);
  ema(slow, 0, sl);
  const diff = nan(len);
  for (let i = start; i < len; i++) diff[i] = f[i] - sl[i];
  let t = 0;
  for (let i = start; i < start + signal; i++) t += diff[i];
  let prev = t / signal;
  sig[first] = prev;
  const k = 2.0 / (signal + 1);
  for (let i = first + 1; i < len; i++) { prev = ((diff[i] - prev) * k) + prev; sig[i] = prev; }
  for (let i = first; i < len; i++) { line[i] = diff[i]; hist[i] = line[i] - sig[i]; }
  return { line, signal: sig, hist };
}
