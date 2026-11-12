/* Indicator EVENTS: something that happened on one bar, never a state a stock sits in.

   A line crossed another, a band was left, a level broke, a gap opened. Each definition below is exact and
   deterministic, and the same ones run in eqdoc's nightly scan (Python, TA-Lib) and in the Desk. They describe past
   price behaviour and nothing else; none is a prediction.

       import { indicatorEvents, EVENT_SIGNALS } from "indicato";
       const ev = indicatorEvents(bars);          // { stoch: [{ i, side, geometry }], cci: [...], ... }

   `i` is a bar index, `side` is "bull" or "bear" (the direction of the price move the event describes), `geometry` is
   null except for divergences, where it names the two pivots joined.

   CAUSAL, like every function in the library: an event at bar i is computed from bars 0..i only. A divergence is dated
   the bar its second pivot is CONFIRMED (the pivot bar plus PIVOT_K), never the pivot's own bar, because the pivot is
   not known until K later bars have closed lower (higher). The test cuts the series at several points and requires
   the same events up to the cut.

   NOISE CONTROL. A signal that fires on a quarter of stocks every day is noise. Each crossing has a cooldown per side
   (a stock that stays in a zone and re-crosses every other day is one event, not six), and the noisiest ones carry a
   stronger zone test. Measured over 901 symbols and the last 250 sessions the share of stock-days each fires on is
   0.3% to 5.9% (docs/accuracy.md).

   WHAT USES WHICH INDICATOR (all verified against TA-Lib in docs/accuracy.md): stochastic(14,3,3), cci(20),
   williamsR(14), aroon(25), EMA(20) and ATR(10) for the channel, rsi(14), macd(12,26,9), sma(200), atr(14). */
import { aroon, atr, cci, ema, macd, rsi, sma, stochastic, williamsR } from "./indicators.js";
import { requireBars } from "./guard.js";

export const WARMUP = 60;           // no event on the first 60 bars: every indicator used has settled by then
export const PIVOT_K = 5;           // bars either side a fractal pivot needs; the pivot is known K bars late
export const DIV_MIN = 8, DIV_MAX = 60; // sessions between the two pivots a divergence joins

/* signal key -> { type, names: { side -> the name a reader sees } }. The words describe what happened. */
export const EVENT_SIGNALS = {
  stoch: { type: "stochcross", names: { bull: "Stochastic crossed up from oversold", bear: "Stochastic crossed down from overbought" } },
  cci: { type: "ccicross", names: { bull: "CCI crossed above +100", bear: "CCI crossed below -100" } },
  willr: { type: "willr", names: { bull: "Williams %R rose back above -80", bear: "Williams %R fell back below -20" } },
  aroon: { type: "aroon", names: { bull: "Aroon Up crossed above Aroon Down", bear: "Aroon Down crossed above Aroon Up" } },
  keltner: { type: "keltner", names: { bull: "Closed above the Keltner channel", bear: "Closed below the Keltner channel" } },
  rsidiv: { type: "divergence", names: { bull: "Bullish RSI divergence", bear: "Bearish RSI divergence" } },
  macddiv: { type: "divergence", names: { bull: "Bullish MACD divergence", bear: "Bearish MACD divergence" } },
  vol52: { type: "breakout52", names: { bull: "52-week high on heavy volume", bear: "52-week low on heavy volume" } },
  dma200: { type: "dma200", names: { bull: "Closed back above the 200-day average", bear: "Closed back below the 200-day average" } },
  nr7: { type: "nr7", names: { bull: "NR7 inside day broken upward", bear: "NR7 inside day broken downward" } },
  gap: { type: "gaphold", names: { bull: "Gap up held all day", bear: "Gap down held all day" } },
};

/* null -> NaN, so every comparison against a warmup value is false (as it is in NumPy). */
const nan = (a) => a.map((v) => (v == null ? NaN : v));

/* a crosses above b on bar i: a[i-1] <= b[i-1] and a[i] > b[i]. */
function crossUp(a, b) {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) out[i] = a[i - 1] <= b[i - 1] && a[i] > b[i];
  return out;
}

/* v[i] over the mean of the 20 sessions BEFORE i; NaN until there are 20 or when that mean is 0. */
export function volumeRatio(v, n = 20) {
  const r = new Array(v.length).fill(NaN);
  for (let i = n; i < v.length; i++) {
    let s = 0;
    for (let k = i - n; k < i; k++) s += v[k];
    const m = s / n;
    r[i] = m > 0 ? v[i] / m : NaN;
  }
  return r;
}

/* Strict fractal pivots: x[i] is the unique extreme of x[i-k .. i+k]. The last k bars cannot hold one yet. */
export function fractalPivots(x, kind, k = PIVOT_K) {
  const out = [];
  for (let i = k; i < x.length - k; i++) {
    let ext = x[i], count = 0;
    for (let j = i - k; j <= i + k; j++) {
      if (kind === "low" ? x[j] < ext : x[j] > ext) ext = x[j];
    }
    if (ext !== x[i]) continue;
    for (let j = i - k; j <= i + k; j++) if (x[j] === ext) count++;
    if (count === 1) out.push(i);
  }
  return out;
}

/* Pivot-based divergence on an indicator series.
   Bullish: two consecutive price pivot lows, 8-60 sessions apart, the later one at least 1% lower, while the indicator
   printed a HIGHER value at the later one. Bearish: mirrored on highs. RSI: the earlier pivot's RSI in the lower 45
   (upper 55) zone and the indicator at least 3 points apart. MACD: both pivots on the same side of zero (below for
   bullish, above for bearish). */
function divergence(h, l, ind, rsiStyle) {
  const ev = [];
  const n = l.length;
  for (const [kind, x, side] of [["low", l, "bull"], ["high", h, "bear"]]) {
    const piv = fractalPivots(x, kind);
    for (let p = 0; p + 1 < piv.length; p++) {
      const a = piv[p], b = piv[p + 1];
      if (!(b - a >= DIV_MIN && b - a <= DIV_MAX)) continue;
      const ia = ind[a], ib = ind[b];
      if (Number.isNaN(ia) || Number.isNaN(ib)) continue;
      let ok;
      if (side === "bull") {
        ok = x[b] < x[a] * 0.99 && ib > ia + (rsiStyle ? 3 : 0) && (rsiStyle ? ia <= 45 : ia < 0 && ib < 0);
      } else {
        ok = x[b] > x[a] * 1.01 && ib < ia - (rsiStyle ? 3 : 0) && (rsiStyle ? ia >= 55 : ia > 0 && ib > 0);
      }
      const e = b + PIVOT_K;
      if (!ok || e >= n || e < WARMUP) continue;
      ev.push({ i: e, side, geometry: { p1: [a, x[a], ia], p2: [b, x[b], ib] } });
    }
  }
  ev.sort((u, w) => u.i - w.i);
  return ev;
}

/* All indicator events over the whole series. bars: [{ o, h, l, c, v }], oldest first. */
export function indicatorEvents(bars) {
  requireBars(bars, "indicatorEvents");
  const n = bars.length;
  const ev = {};
  for (const k of Object.keys(EVENT_SIGNALS)) ev[k] = [];
  if (n < 60) return ev;
  const h = bars.map((b) => b.h), l = bars.map((b) => b.l), c = bars.map((b) => b.c), v = bars.map((b) => b.v ?? 0);

  /* Record the bars where `mask` is true; `cool` drops an event within that many sessions of the previous kept one on
     the same side. */
  const add = (key, mask, side, cool = 0) => {
    let last = -1e9;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || i < WARMUP || i - last <= cool) continue;
      last = i;
      ev[key].push({ i, side, geometry: null });
    }
  };
  const and = (a, b) => a.map((x, i) => x && b[i]);

  // 1. Stochastic (14,3,3): %K crosses %D with %K at the bar before inside the oversold (<20) / overbought (>80) zone.
  const st = stochastic(bars, 14, 3, 3);
  const k = nan(st.k), d = nan(st.d);
  const prevK = [NaN, ...k.slice(0, -1)];
  add("stoch", and(crossUp(k, d), prevK.map((x) => x < 20)), "bull", 10);
  add("stoch", and(crossUp(d, k), prevK.map((x) => x > 80)), "bear", 10);

  // 2. CCI(20) crosses +100 upward / -100 downward.
  const cc = nan(cci(bars, 20));
  const hundred = new Array(n).fill(100), mhundred = new Array(n).fill(-100);
  add("cci", crossUp(cc, hundred), "bull", 20);
  add("cci", crossUp(mhundred, cc), "bear", 20);

  // 3. Williams %R(14): back above -80 after a reading of -95 or lower in the previous 5 sessions; back below -20 after -5 or higher.
  const wr = nan(williamsR(bars, 14));
  const lo5 = new Array(n).fill(NaN), hi5 = new Array(n).fill(NaN);
  for (let i = 5; i < n; i++) {
    let mn = Infinity, mx = -Infinity, bad = false;
    for (let j = i - 5; j < i; j++) { if (Number.isNaN(wr[j])) bad = true; mn = Math.min(mn, wr[j]); mx = Math.max(mx, wr[j]); }
    if (!bad) { lo5[i] = mn; hi5[i] = mx; }
  }
  add("willr", and(crossUp(wr, new Array(n).fill(-80)), lo5.map((x) => x <= -95)), "bull", 10);
  add("willr", and(crossUp(new Array(n).fill(-20), wr), hi5.map((x) => x >= -5)), "bear", 10);

  // 4. Aroon(25): Up crosses above Down with Up >= 70 (bull); Down above Up with Down >= 70 (bear).
  const ar = aroon(bars, 25);
  const up = nan(ar.up), dn = nan(ar.down);
  add("aroon", and(crossUp(up, dn), up.map((x) => x >= 70)), "bull", 10);
  add("aroon", and(crossUp(dn, up), dn.map((x) => x >= 70)), "bear", 10);

  // 5. Keltner channel EMA(20) +/- 2 x ATR(10): the first close outside it after a close inside.
  const e20 = nan(ema(c, 20)), a10 = nan(atr(bars, 10));
  const upper = e20.map((m, i) => m + 2 * a10[i]), lower = e20.map((m, i) => m - 2 * a10[i]);
  add("keltner", crossUp(c, upper), "bull", 10);
  add("keltner", crossUp(lower, c), "bear", 10);

  // 6/7. Divergences.
  ev.rsidiv = divergence(h, l, nan(rsi(bars, 14)), true);
  /* TA-Lib's MACD line only exists from bar 33 (slow 26 + signal 9 - 2): a pivot before that has no MACD value to compare. */
  ev.macddiv = divergence(h, l, nan(macd(bars, 12, 26, 9).line).map((x, i) => (i < 33 ? NaN : x)), false);

  const vr = volumeRatio(v);
  // 8. First close beyond the prior 252-session high (low), on volume of at least 1.5 x its 20-session mean.
  if (n > 253) {
    const hi252 = new Array(n).fill(NaN), lo252 = new Array(n).fill(NaN);
    for (let i = 252; i < n; i++) {
      let mx = -Infinity, mn = Infinity;
      for (let j = i - 252; j < i; j++) { if (h[j] > mx) mx = h[j]; if (l[j] < mn) mn = l[j]; }
      hi252[i] = mx; lo252[i] = mn;
    }
    const firstUp = c.map((x, i) => x > hi252[i] && !(i > 0 && c[i - 1] > hi252[i - 1]));
    const firstDn = c.map((x, i) => x < lo252[i] && !(i > 0 && c[i - 1] < lo252[i - 1]));
    add("vol52", and(firstUp, vr.map((x) => x >= 1.5)), "bull");
    add("vol52", and(firstDn, vr.map((x) => x >= 1.5)), "bear");
  }

  // 9. 200-day average reclaimed / lost: the close crosses it after at least 10 of the previous 20 closes on the other side.
  const s200 = nan(sma(c, 200));
  const below = c.map((x, i) => (x < s200[i] ? 1 : 0)), above = c.map((x, i) => (x > s200[i] ? 1 : 0));
  const sumPrev = (a, i) => { let s = 0; for (let j = i - 20; j < i; j++) s += a[j]; return s; };
  const nb = c.map((_, i) => (i >= 20 ? sumPrev(below, i) : 0)), na = c.map((_, i) => (i >= 20 ? sumPrev(above, i) : 0));
  add("dma200", and(crossUp(c, s200), nb.map((x) => x >= 10)), "bull");
  add("dma200", and(crossUp(s200, c), na.map((x) => x >= 10)), "bear");

  // 10. NR7 inside day: the previous bar is the narrowest range of 7 sessions AND an inside day; the close beats its high / low.
  const rng = h.map((x, i) => x - l[i]);
  const nr = new Array(n).fill(false);
  for (let i = 6; i < n; i++) {
    let mn = Infinity;
    for (let j = i - 6; j <= i; j++) if (rng[j] < mn) mn = rng[j];
    nr[i] = rng[i] <= mn && rng[i] > 0 && h[i] < h[i - 1] && l[i] > l[i - 1];
  }
  const nrPrev = [false, ...nr.slice(0, -1)];
  add("nr7", nrPrev.map((x, i) => x && c[i] > h[i - 1]), "bull");
  add("nr7", nrPrev.map((x, i) => x && c[i] < l[i - 1]), "bear");

  // 11. Gap held: today's whole range clear of yesterday's, by at least max(1.5%, 0.8 x ATR14 of the prior session).
  const a14 = nan(atr(bars, 14));
  const need = c.map((_, i) => (i > 0 ? Math.max(0.015 * c[i - 1], 0.8 * a14[i - 1]) : NaN));
  add("gap", c.map((_, i) => i > 0 && l[i] - h[i - 1] >= need[i]), "bull");
  add("gap", c.map((_, i) => i > 0 && l[i - 1] - h[i] >= need[i]), "bear");

  for (const key of Object.keys(ev)) ev[key].sort((a, b) => a.i - b.i);
  return ev;
}

/* conf 1-3 for an event at bar i: 1 for the event, +1 if volume was at least 1.5 x its 20-session mean, +1 if the bar
   closed in the outer 30% of its range in the event's direction. Descriptive only: how much agrees on that bar. */
export function eventConfirmations(bars, i, side) {
  requireBars(bars, "eventConfirmations");
  const v = bars.map((b) => b.v ?? 0);
  const vr = i >= 20 ? volumeRatio(v.slice(0, i + 1))[i] : NaN;
  const b = bars[i];
  const range = b.h - b.l;
  const pos = range > 0 ? (b.c - b.l) / range : 0.5;
  const decisive = side === "bull" ? pos >= 0.7 : pos <= 0.3;
  return { conf: 1 + (vr >= 1.5 ? 1 : 0) + (decisive ? 1 : 0), volumeRatio: Number.isNaN(vr) ? null : vr };
}
