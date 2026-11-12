/* Classic chart patterns, WITH THE GEOMETRY a chart needs to draw them.

       import { detectPatterns } from "indicato";
       const found = detectPatterns(bars);       // daily bars: [{ d, o, h, l, c, v }], oldest first
       found[0];
       // { name: "Head and shoulders", side: "bear", state: "confirmed", tf: "daily", conf: 3,
       //   formedIndex: 106, formedDate: "2025-07-14",
       //   geometry: { v: 1, tf: "daily", state: "confirmed",
       //     points: [{ role: "left_shoulder", d: "2025-04-28", p: 130.78 }, ...],
       //     lines:  [{ role: "neckline", from: { d, p }, to: { d, p } }],
       //     event:  { d: "2025-07-14", p: 108.1, vol: 2.4 } } }

   Found on swing pivots (a zigzag scaled to each stock's own volatility), never on a fixed window of bars, so a pattern
   is found at the size it was drawn at. Head and shoulders (and inverse), double top / bottom, ascending / descending /
   symmetrical triangles, rising / falling wedges, bull / bear flags and pennants, and cup and handle, on the daily bars
   AND on weekly bars built from them (a weekly point carries the DAILY date its extreme happened on, so it draws on the
   daily chart).

   EVERY detection has a STATE:
     forming    the structure is complete and price has not left it
     confirmed  a close beyond the neckline / trendline / rim, on volume at least 1.25 x the 20-session mean on the break
                bar or one of the next two
     failed     the structure was invalidated: price took out the head or second top, a triangle broke against its usual
                direction, or a close came back through the line within ten sessions of a confirmed break
   A break with no volume behind it is not reported at all (quality over count). A break in the last two sessions whose
   volume is not yet known stays "forming".

   CAUSAL: a detection uses bars up to the last one only, and truncating the series at t gives the detections an
   as-of-t run would give (test/patterns.test.js). The state of a pattern is a function of the bars so far.

   The rules below are the same ones eqdoc's nightly scan runs in Python; the test requires the two to agree on real
   companies, point for point. The names are the patterns' proper names and describe past price behaviour. */

import { requireBars } from "./guard.js";

const VOL_BREAK = 1.25;
const FAIL_WINDOW = 10;
const EMIT_WINDOW = 20;

const TF = {
  daily: { span: [20, 160], triSpan: [20, 130], age: 40, thrK: 2.4, thrMin: 0.045, cup: [35, 200], dbl: [20, 90], flagPole: 15, flagLen: [6, 25], handle: [4, 30], emit: EMIT_WINDOW, advanceBars: 120 },
  weekly: { span: [10, 60], triSpan: [10, 60], age: 16, thrK: 2.0, thrMin: 0.08, cup: [14, 70], dbl: [0, 0], flagPole: 0, flagLen: [0, 0], handle: [2, 10], emit: 6, advanceBars: 40 },
};

const round = (x, dp) => Number(Number(x).toFixed(dp));
const mean = (a, i0, i1) => { let s = 0; for (let i = i0; i < i1; i++) s += a[i]; return s / (i1 - i0); };
const maxOf = (a, i0, i1) => { let m = -Infinity; for (let i = i0; i < i1; i++) if (a[i] > m) m = a[i]; return m; };
const minOf = (a, i0, i1) => { let m = Infinity; for (let i = i0; i < i1; i++) if (a[i] < m) m = a[i]; return m; };
const argmin = (a, i0, i1) => { let k = i0; for (let i = i0 + 1; i < i1; i++) if (a[i] < a[k]) k = i; return k; };
const argmax = (a, i0, i1) => { let k = i0; for (let i = i0 + 1; i < i1; i++) if (a[i] > a[k]) k = i; return k; };

/* Least-squares straight line through (xs, ys): { slope, intercept }. */
function polyfit1(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

/* Least-squares parabola y = a2 x^2 + a1 x + a0 (x centred for stability); returns { a2, fitted }. */
function polyfit2(xs, ys) {
  const n = xs.length;
  let mx = 0;
  for (const x of xs) mx += x;
  mx /= n;
  const t = xs.map((x) => x - mx);
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const x = t[i], y = ys[i], x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; b0 += y; b1 += x * y; b2 += x2 * y;
  }
  /* Normal equations [s4 s3 s2; s3 s2 s1; s2 s1 s0] [a b c] = [b2 b1 b0], solved by Cramer's rule. */
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]];
  const D = det3(M);
  if (D === 0) return { a2: 0, fitted: ys.slice() };
  const col = (k, rhs) => M.map((row, r) => row.map((v, c) => (c === k ? rhs[r] : v)));
  const rhs = [b2, b1, b0];
  const a = det3(col(0, rhs)) / D, bb = det3(col(1, rhs)) / D, c0 = det3(col(2, rhs)) / D;
  return { a2: a, fitted: t.map((x) => a * x * x + bb * x + c0) };
}

/* Daily bars object from rows [{ d, o, h, l, c, v }] (a row may carry dh / dl: the dates of its high / low). */
export function chartBars(rows, tf = "daily") {
  const n = rows.length;
  const b = {
    tf, n,
    o: rows.map((r) => r.o), h: rows.map((r) => r.h), l: rows.map((r) => r.l), c: rows.map((r) => r.c), v: rows.map((r) => r.v ?? 0),
    d: rows.map((r) => r.d), dh: rows.map((r) => r.dh ?? r.d), dl: rows.map((r) => r.dl ?? r.d),
  };
  const p = TF[tf];
  const tr = new Array(n);
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0 ? b.h[0] - b.l[0] : Math.max(b.h[i] - b.l[i], Math.abs(b.h[i] - b.c[i - 1]), Math.abs(b.l[i] - b.c[i - 1]));
  }
  b.atrPct = tr.map((_, i) => (b.c[i] > 0 ? mean(tr, Math.max(0, i - 13), i + 1) / b.c[i] : 0));
  let med = 0.02;
  if (n > 15) {
    const s = b.atrPct.slice(Math.min(n - 1, 14)).sort((x, y) => x - y);
    const m = s.length;
    med = m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  }
  b.thr = Math.max(p.thrMin, p.thrK * med);
  b.vr = new Array(n).fill(NaN);
  for (let i = 20; i < n; i++) {
    const m = mean(b.v, i - 20, i);
    b.vr[i] = m > 0 ? b.v[i] / m : NaN;
  }
  return b;
}

/* ISO-week bars from daily rows. A weekly bar's dh / dl are the DAILY dates the week's high / low happened. */
export function weeklyBars(rows) {
  const isoWeek = (iso) => {
    const dt = new Date(iso + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3);   // the Thursday of this ISO week names its year
    const jan1 = Date.UTC(dt.getUTCFullYear(), 0, 1);
    return `${dt.getUTCFullYear()}-${1 + Math.floor((dt.getTime() - jan1) / 86400000 / 7)}`;
  };
  const groups = new Map();
  for (const r of rows) {
    const k = isoWeek(r.d);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const g of groups.values()) {
    let hi = g[0], lo = g[0], vol = 0;
    for (const r of g) { if (r.h > hi.h) hi = r; if (r.l < lo.l) lo = r; vol += r.v ?? 0; }
    out.push({ d: g[g.length - 1].d, o: g[0].o, h: hi.h, l: lo.l, c: g[g.length - 1].c, v: vol, dh: hi.d, dl: lo.d });
  }
  return chartBars(out, "weekly");
}

/* Swing pivots. A swing high is confirmed once price falls `thr` (a fraction) from it; a swing low once price rises
   `thr` from it. Returns confirmed pivots only: [{ i, price, kind (+1 high / -1 low), confirmedAt }], oldest first. */
export function zigzag(h, l, thr) {
  const n = h.length;
  const piv = [];
  if (n < 3) return piv;
  let hi = 0, lo = 0, direction = 0, cand = 0;
  for (let i = 1; i < n; i++) {
    if (direction === 0) {
      if (h[i] > h[hi]) hi = i;
      if (l[i] < l[lo]) lo = i;
      if (hi > lo && h[hi] >= l[lo] * (1 + thr)) { piv.push({ i: lo, price: l[lo], kind: -1, confirmedAt: hi }); direction = 1; cand = hi; }
      else if (lo > hi && l[lo] <= h[hi] * (1 - thr)) { piv.push({ i: hi, price: h[hi], kind: 1, confirmedAt: lo }); direction = -1; cand = lo; }
    } else if (direction === 1) {
      if (h[i] > h[cand]) cand = i;
      else if (l[i] <= h[cand] * (1 - thr)) { piv.push({ i: cand, price: h[cand], kind: 1, confirmedAt: i }); direction = -1; cand = i; }
    } else if (l[i] < l[cand]) cand = i;
    else if (h[i] >= l[cand] * (1 + thr)) { piv.push({ i: cand, price: l[cand], kind: -1, confirmedAt: i }); direction = 1; cand = i; }
  }
  return piv;
}

/* A drawable point: the date the extreme happened and its price. which: "h" high, "l" low. */
const pt = (b, i, price, which) => ({ d: which === "h" ? b.dh[i] : b.dl[i], p: round(price, 2) });

const lineThrough = (i0, p0, i1, p1) => {
  const slope = i1 !== i0 ? (p1 - p0) / (i1 - i0) : 0;
  return (x) => p0 + slope * (x - i0);
};

/* Walk the bars after `start` and say what happened to a structure.
   broke(j): +1 close beyond in the up direction, -1 down, 0 nothing. lineOk(j): false once the structure is invalidated
   without a break. bias: +1 / -1 / 0, the direction the pattern is expected to break.
   Returns { state, at, dir, vol } or null for "not reportable". */
function resolve(b, start, lineOk, broke, bias, limit = null) {
  const n = b.n;
  const end = limit === null ? n : Math.min(n, limit);
  for (let j = start + 1; j < end; j++) {
    if (!lineOk(j)) return { state: "failed", at: j, dir: 0, vol: null };
    const d = broke(j);
    if (!d) continue;
    let vr = NaN;
    for (let k = j; k < Math.min(n, j + 3); k++) if (b.vr[k] === b.vr[k] && !(vr >= b.vr[k])) vr = b.vr[k];
    const vol = vr === vr ? vr : null;
    const volOk = vol !== null && vol >= VOL_BREAK;
    if (bias !== 0 && d !== bias) return { state: "failed", at: j, dir: d, vol };
    if (!volOk) {
      if (j + 2 >= n) return { state: "forming", at: start, dir: 0, vol };
      return null;
    }
    for (let k = j + 1; k < Math.min(n, j + 1 + FAIL_WINDOW); k++) {
      if (broke(k) === -d) return { state: "failed", at: k, dir: d, vol };
    }
    return { state: "confirmed", at: j, dir: d, vol };
  }
  return { state: "forming", at: start, dir: 0, vol: null };
}

function row(name, side, st, formedI, b, geom, quality, tf) {
  const state = st.state;
  const di = state !== "forming" ? st.at : formedI;
  const conf = 1 + (state === "confirmed" ? 1 : 0) + (quality ? 1 : 0);
  const geometry = { ...geom, v: 1, tf, state };
  if (state !== "forming") geometry.event = { d: b.d[st.at], p: round(b.c[st.at], 2), vol: st.vol ? round(st.vol, 2) : null };
  return { name: name + (tf === "weekly" ? " (weekly)" : ""), side, state, tf, formedIndex: di, formedDate: b.d[di], conf: Math.min(conf, 3), geometry };
}

const recent = (b, st, p) => st.state === "forming" || b.n - 1 - st.at <= p.emit;

/* ---- head and shoulders ------------------------------------------------------------------------------- */

/* Five alternating pivots S1 N1 H N2 S2.
   - head beyond both shoulders by >= 30% of (head - neckline); shoulders within 25% of that height of each other
   - both shoulders >= 30% of that height clear of their neck points; neck points within 20% of it
   - time either side of the head within 0.4-2.5x of the other; whole span inside the timeframe's span
   - a run of >= 15% into the left shoulder over the preceding bars (a fall, for the inverse)
   Neckline through the two neck points. Break: a close 0.5% beyond it. */
function headShoulders(b, piv) {
  const p = TF[b.tf], out = [];
  const { h, l, c } = b;
  for (const [sgn, name, side] of [[1, "Head and shoulders", "bear"], [-1, "Inverse head and shoulders", "bull"]]) {
    for (let k = 0; k + 4 < piv.length; k++) {
      const w = piv.slice(k, k + 5);
      if (!w.every((x, idx) => x.kind === (idx % 2 === 0 ? sgn : -sgn))) continue;
      const [A, N1, H, N2, S] = w;
      const i1 = A.i, s1 = A.price, i2 = N1.i, n1 = N1.price, i3 = H.i, hd = H.price, i4 = N2.i, n2 = N2.price, i5 = S.i, s2 = S.price;
      const height = sgn * (hd - (n1 + n2) / 2);
      if (height <= 0) continue;
      if (sgn * (hd - s1) < 0.30 * height || sgn * (hd - s2) < 0.30 * height) continue;
      if (Math.abs(s1 - s2) > 0.25 * height || Math.abs(n1 - n2) > 0.20 * height) continue;
      if (sgn * (s1 - n1) < 0.30 * height || sgn * (s2 - n2) < 0.30 * height) continue;
      const a = i3 - i1, bb = i5 - i3;
      if (!(a / Math.max(bb, 1) >= 0.4 && a / Math.max(bb, 1) <= 2.5) || !(i5 - i1 >= p.span[0] && i5 - i1 <= p.span[1])) continue;
      const lo0 = Math.max(0, i1 - p.advanceBars);
      if (i1 - lo0 < 5) continue;
      if (sgn === 1 ? s1 < minOf(l, lo0, i1) * 1.15 : s1 > maxOf(h, lo0, i1) / 1.15) continue;
      if (b.n - 1 - i5 > p.age + 20) continue;
      const neck = lineThrough(i2, n1, i4, n2);
      const st = resolve(b, i5, sgn === 1 ? (j) => h[j] <= hd : (j) => l[j] >= hd,
        (j) => (sgn === 1 ? (c[j] < neck(j) * 0.995 ? -1 : 0) : (c[j] > neck(j) * 1.005 ? 1 : 0)), -sgn);
      if (st === null || !recent(b, st, p)) continue;
      if (st.state === "forming" && b.n - 1 - i5 > p.age) continue;
      const wh = sgn === 1 ? "h" : "l", wl = sgn === 1 ? "l" : "h";
      const geom = {
        points: [{ role: "left_shoulder", ...pt(b, i1, s1, wh) }, { role: "neck_left", ...pt(b, i2, n1, wl) }, { role: "head", ...pt(b, i3, hd, wh) },
          { role: "neck_right", ...pt(b, i4, n2, wl) }, { role: "right_shoulder", ...pt(b, i5, s2, wh) }],
        lines: [{ role: "neckline", from: pt(b, i2, n1, wl), to: pt(b, i4, n2, wl) }],
      };
      out.push(row(name, side, st, i5, b, geom, Math.abs(s1 - s2) <= 0.15 * height, b.tf));
    }
  }
  return out;
}

/* ---- double top / bottom ------------------------------------------------------------------------------ */

/* Pivots A B C = extreme, opposite, extreme. The two extremes within 2.5% of each other; the move between them >= 12% of
   the extreme and >= 4x their gap; 20-90 sessions apart (daily only); a run of >= 15% into the first extreme.
   Neckline: horizontal through the middle pivot. Break: a close 0.5% beyond it. */
function doubleTops(b, piv) {
  const p = TF[b.tf], out = [];
  const { h, l, c } = b;
  for (const [sgn, name, side] of [[1, "Double top", "bear"], [-1, "Double bottom", "bull"]]) {
    for (let k = 0; k + 2 < piv.length; k++) {
      const w = piv.slice(k, k + 3);
      if (!(w[0].kind === sgn && w[1].kind === -sgn && w[2].kind === sgn)) continue;
      const i1 = w[0].i, e1 = w[0].price, i2 = w[1].i, m = w[1].price, i3 = w[2].i, e2 = w[2].price;
      if (p.dbl[1] === 0 || Math.abs(e1 - e2) > 0.025 * e1) continue;
      const depth = sgn === 1 ? Math.min(e1, e2) - m : sgn * (Math.max(e1, e2) - m);
      if (depth < 0.12 * e1 || depth < 4 * Math.abs(e1 - e2)) continue;
      if (!(i3 - i1 >= p.dbl[0] && i3 - i1 <= p.dbl[1])) continue;
      const lo0 = Math.max(0, i1 - p.advanceBars);
      if (i1 - lo0 < 5) continue;
      if (sgn === 1 && e1 < minOf(l, lo0, i1) * 1.15) continue;
      if (sgn === -1 && e1 > maxOf(h, lo0, i1) / 1.15) continue;
      if (b.n - 1 - i3 > p.age + 20) continue;
      const top = sgn === 1 ? Math.max(e1, e2) : Math.min(e1, e2);
      const st = resolve(b, i3, sgn === 1 ? (j) => h[j] <= top * 1.015 : (j) => l[j] >= top / 1.015,
        (j) => (sgn === 1 ? (c[j] < m * 0.995 ? -1 : 0) : (c[j] > m * 1.005 ? 1 : 0)), -sgn);
      if (st === null || !recent(b, st, p)) continue;
      if (st.state === "forming" && b.n - 1 - i3 > p.age) continue;
      const wh = sgn === 1 ? "h" : "l", wl = sgn === 1 ? "l" : "h";
      const endIdx = Math.min(b.n - 1, Math.max(i3, st.state !== "forming" ? st.at : b.n - 1));
      const geom = {
        points: [{ role: sgn === 1 ? "first_top" : "first_bottom", ...pt(b, i1, e1, wh) }, { role: sgn === 1 ? "trough" : "peak", ...pt(b, i2, m, wl) },
          { role: sgn === 1 ? "second_top" : "second_bottom", ...pt(b, i3, e2, wh) }],
        lines: [{ role: "neckline", from: pt(b, i2, m, wl), to: { d: b.d[endIdx], p: round(m, 2) } }],
      };
      out.push(row(name, side, st, i3, b, geom, Math.abs(e1 - e2) <= 0.01 * e1, b.tf));
    }
  }
  return out;
}

/* ---- triangles and wedges ----------------------------------------------------------------------------- */

function fitLine(idx, prices) {
  const { slope, intercept } = polyfit1(idx, prices);
  let dev = 0;
  for (let i = 0; i < idx.length; i++) dev = Math.max(dev, Math.abs(prices[i] - (slope * idx[i] + intercept)) / prices[i]);
  return { slope, intercept, dev };
}

/* Least-squares lines through the last 2-3 swing highs and 2-3 swing lows (five touches at least), each side's pivots
   within 1.2% of its line, no close inside the structure more than 1% outside either line, lines CONVERGING (end width
   <= 70% of the start's). Slopes are the line's rise over the structure's span as a fraction of price:
     ascending     upper flat (<= 1.5%), lower rising >= 5%           bias up
     descending    lower flat, upper falling >= 5%                    bias down
     symmetrical   upper falling >= 4%, lower rising >= 4%            either way
     rising wedge  both rising >= 4%, slopes within 0.4-1x           bias down
     falling wedge both falling >= 4%, same                           bias up
   Break: a close 0.5% beyond a line; a break against the bias is "failed". */
function trianglesWedges(b, piv) {
  const p = TF[b.tf], out = [];
  const { n, c } = b;
  const seen = new Set();
  for (let e = piv.length - 1; e > Math.max(-1, piv.length - 5); e--) {
    const win = piv.slice(0, e + 1).filter((x) => piv[e].i - x.i <= p.triSpan[1]);
    const highs = win.filter((x) => x.kind === 1).slice(-3), lows = win.filter((x) => x.kind === -1).slice(-3);
    for (const nh of [3, 2]) {
      for (const nl of [3, 2]) {
        const H = highs.slice(-nh), L = lows.slice(-nl);
        if (H.length < 2 || L.length < 2 || H.length + L.length < 5) continue;
        const i0 = Math.min(H[0].i, L[0].i), i1 = Math.max(H[H.length - 1].i, L[L.length - 1].i);
        if (!(i1 - i0 >= p.triSpan[0] && i1 - i0 <= p.triSpan[1])) continue;
        const fu = fitLine(H.map((x) => x.i), H.map((x) => x.price)), fl = fitLine(L.map((x) => x.i), L.map((x) => x.price));
        if (fu.dev > 0.012 || fl.dev > 0.012) continue;
        const U = (x) => fu.slope * x + fu.intercept, Lo = (x) => fl.slope * x + fl.intercept;
        const w0 = U(i0) - Lo(i0), w1 = U(i1) - Lo(i1);
        if (w0 <= 0 || w1 <= 0 || w1 > 0.70 * w0) continue;
        const ref = c[i1];
        const uTot = fu.slope * (i1 - i0) / ref, lTot = fl.slope * (i1 - i0) / ref;
        const loRatio = Math.min(Math.abs(uTot), Math.abs(lTot)) / Math.max(Math.abs(uTot), Math.abs(lTot), 1e-9);
        let name, side, bias;
        if (Math.abs(uTot) <= 0.015 && lTot >= 0.05) [name, side, bias] = ["Ascending triangle", "bull", 1];
        else if (Math.abs(lTot) <= 0.015 && uTot <= -0.05) [name, side, bias] = ["Descending triangle", "bear", -1];
        else if (uTot <= -0.04 && lTot >= 0.04) [name, side, bias] = ["Symmetrical triangle", "neutral", 0];
        else if (uTot >= 0.04 && lTot >= 0.04 && loRatio >= 0.4) [name, side, bias] = ["Rising wedge", "bear", -1];
        else if (uTot <= -0.04 && lTot <= -0.04 && loRatio >= 0.4) [name, side, bias] = ["Falling wedge", "bull", 1];
        else continue;
        let inside = true;
        for (let j = i0; j <= i1; j++) if (c[j] > U(j) * 1.01 || c[j] < Lo(j) * 0.99) { inside = false; break; }
        if (!inside) continue;
        const apex = fl.slope !== fu.slope ? (fu.intercept - fl.intercept) / (fl.slope - fu.slope) : 1e9;
        const key = `${name}|${i0}`;
        if (seen.has(key)) continue;
        const st = resolve(b, i1, () => true, (j) => (c[j] > U(j) * 1.005 ? 1 : c[j] < Lo(j) * 0.995 ? -1 : 0), bias,
          Math.trunc(Math.min(n, Math.max(i1 + 2, apex + 1))));
        if (st === null || !recent(b, st, p)) continue;
        if (st.state === "forming" && (n - 1 - i1 > p.age || n - 1 > apex)) continue;
        seen.add(key);
        const sd = bias === 0 && st.state === "confirmed" ? (st.dir > 0 ? "bull" : "bear") : side;
        let xEnd = st.state !== "forming" ? Math.min(n - 1, st.at) : n - 1;
        xEnd = Math.max(xEnd, i1);
        const geom = {
          points: [...H.map((x) => ({ role: "upper", ...pt(b, x.i, x.price, "h") })), ...L.map((x) => ({ role: "lower", ...pt(b, x.i, x.price, "l") }))],
          lines: [{ role: "upper", from: { d: b.d[H[0].i], p: round(U(H[0].i), 2) }, to: { d: b.d[xEnd], p: round(U(xEnd), 2) } },
            { role: "lower", from: { d: b.d[L[0].i], p: round(Lo(L[0].i), 2) }, to: { d: b.d[xEnd], p: round(Lo(xEnd), 2) } }],
          touches: H.length + L.length,
        };
        out.push(row(name, sd, st, i1, b, geom, H.length + L.length >= 5, b.tf));
      }
    }
  }
  return out;
}

/* ---- flags and pennants (daily) ------------------------------------------------------------------------ */

/* A pole: a move of >= max(15%, 5 x ATR%) over 4-15 sessions to an extreme at bar p, no single close-to-close step more
   than half of it, at least 55% of its closes in the pole's direction. Then a 6-25 session consolidation that retraces
   <= 50% of the pole, never trades beyond the pole's extreme, averages less volume than the pole did, and is fitted by
   a line through its highs and one through its lows. FLAG: both lines slope against the pole and keep a width within
   0.7-1.3x from start to end. PENNANT: the lines converge (end width <= 60% of start). Break: a close 0.4% beyond the
   line the pole points through; failed: a close beyond the opposite one. */
function flags(b) {
  const p = TF[b.tf];
  if (b.tf !== "daily") return [];
  const out = [];
  const { n, h, l, c, v } = b;
  for (const [sgn, nm, side] of [[1, "Bull", "bull"], [-1, "Bear", "bear"]]) {
    let best = null;
    for (let pi = Math.max(20, n - 60); pi < n - 5; pi++) {
      const ext = sgn === 1 ? h[pi] : l[pi];
      const s0 = Math.max(0, pi - 12);
      if (sgn === 1 ? h[pi] < maxOf(h, s0, pi + 1) : l[pi] > minOf(l, s0, pi + 1)) continue;
      const lo0 = Math.max(0, pi - p.flagPole);
      let si, start, move;
      if (sgn === 1) { si = argmin(l, lo0, pi + 1); start = l[si]; move = (ext - start) / start; }
      else { si = argmax(h, lo0, pi + 1); start = h[si]; move = (start - ext) / start; }
      if (pi - si < 4 || move < Math.max(0.15, 5 * b.atrPct[pi])) continue;
      const pc = c.slice(si, pi + 1);
      let maxStep = 0, ups = 0;
      for (let k = 1; k < pc.length; k++) { maxStep = Math.max(maxStep, Math.abs(pc[k] - pc[k - 1])); if ((pc[k] - pc[k - 1]) * sgn > 0) ups++; }
      if (maxStep > 0.5 * Math.abs(pc[pc.length - 1] - pc[0])) continue;
      if (ups / (pc.length - 1) < 0.55) continue;
      const poleH = Math.abs(ext - start);
      const poleVol = mean(v, si, pi + 1);
      let found = null;
      for (let e = pi + p.flagLen[0]; e < Math.min(n, pi + p.flagLen[1] + 1); e++) {
        const xs = [];
        for (let x = pi + 1; x <= e; x++) xs.push(x);
        const hh = h.slice(pi + 1, e + 1), ll = l.slice(pi + 1, e + 1);
        const hMax = Math.max(...hh), lMin = Math.min(...ll);
        if (sgn === 1 && (hMax > ext * 1.001 || ext - lMin > 0.5 * poleH)) break;
        if (sgn === -1 && (lMin < ext * 0.999 || hMax - ext > 0.5 * poleH)) break;
        const fu = polyfit1(xs, hh), fl = polyfit1(xs, ll);
        const U = (x) => fu.slope * x + fu.intercept, Lo = (x) => fl.slope * x + fl.intercept;
        const w0 = U(pi + 1) - Lo(pi + 1), w1 = U(e) - Lo(e);
        if (w0 <= 0 || w1 <= 0) continue;
        const ratio = w1 / w0;
        const against = sgn === 1 ? fu.slope < 0 && fl.slope < 0 : fu.slope > 0 && fl.slope > 0;
        const conv = ratio <= 0.60;
        const para = ratio >= 0.7 && ratio <= 1.3 && against;
        if (!(conv || para)) continue;
        if (mean(v, pi + 1, e + 1) >= poleVol) continue;
        let ok = true;
        for (let j = pi + 1; j <= e; j++) if (c[j] > U(j) * 1.015 || c[j] < Lo(j) * 0.985) { ok = false; break; }
        if (!ok) continue;
        found = { e, U, Lo, kind: conv ? "pennant" : "flag" };
      }
      if (!found) continue;
      const { e, U, Lo, kind } = found;
      const lim = sgn === 1 ? (j) => c[j] > U(j) * 1.004 : (j) => c[j] < Lo(j) * 0.996;
      const opp = sgn === 1 ? (j) => c[j] < Lo(j) * 0.996 : (j) => c[j] > U(j) * 1.004;
      const st = resolve(b, e, () => true, (j) => (lim(j) ? sgn : opp(j) ? -sgn : 0), sgn);
      if (st === null || !recent(b, st, p)) continue;
      if (st.state === "forming" && n - 1 - e > 3) continue;
      const xEnd = st.state !== "forming" ? Math.max(e, Math.min(n - 1, st.at)) : e;
      const wp = sgn === 1 ? "h" : "l", ws = sgn === 1 ? "l" : "h";
      const geom = {
        points: [{ role: "pole_start", ...pt(b, si, start, ws) }, { role: "pole_end", ...pt(b, pi, ext, wp) }],
        lines: [{ role: "upper", from: { d: b.d[pi + 1], p: round(U(pi + 1), 2) }, to: { d: b.d[xEnd], p: round(U(xEnd), 2) } },
          { role: "lower", from: { d: b.d[pi + 1], p: round(Lo(pi + 1), 2) }, to: { d: b.d[xEnd], p: round(Lo(xEnd), 2) } }],
        pole_pct: round(100 * move, 1),
      };
      const r = row(`${nm} ${kind}`, side, st, e, b, geom, move >= 0.2, "daily");
      if (best === null || r.formedIndex > best.formedIndex) best = r;
    }
    if (best) out.push(best);
  }
  return out;
}

/* ---- cup and handle ----------------------------------------------------------------------------------- */

/* Left rim L = a swing high; the cup low B = the lowest low after it; the right rim R = the highest high between B and
   the break (or today); the break is the first close 0.3% above the left rim.
   - cup depth 12-35% of the left rim; R within 93-104% of the left rim; B in the middle half of L..R in time
   - a parabola through the closes L..R opens upward with R^2 >= 0.6 (a U, not a V)
   - a run-up: the price at L at least 10% above the lowest low before it
   - handle: 4-30 sessions after R (weekly 2-10), a pullback of 3% up to half the cup depth, staying in the cup's upper half
   Failed: a close below the handle low before a break, or back below the rim within ten sessions of one. */
function cupHandle(b, piv) {
  const p = TF[b.tf];
  const { n, h, l, c } = b;
  let best = null;
  for (const Lp of piv.filter((x) => x.kind === 1)) {
    const iL = Lp.i, pL = Lp.price;
    if (n - 1 - iL > p.cup[1] + p.handle[1] + 30) continue;
    const lo0 = Math.max(0, iL - p.advanceBars);
    if (iL - lo0 < 5 || pL < minOf(l, lo0, iL) * 1.10) continue;
    let brk = null;
    for (let j = iL + 1; j < n; j++) if (c[j] > pL * 1.003) { brk = j; break; }
    const end = brk !== null ? brk : n;
    if (end - iL < p.cup[0]) continue;
    const iB = argmin(l, iL + 1, end), pB = l[iB];
    const depth = (pL - pB) / pL;
    if (!(depth >= 0.12 && depth <= 0.35)) continue;
    if (end - iB < 5) continue;
    const iR = argmax(h, iB + 1, end), pR = h[iR];
    if (!(pR >= 0.93 * pL && pR <= 1.04 * pL)) continue;
    const span = iR - iL;
    if (!(span >= p.cup[0] && span <= p.cup[1]) || !((iB - iL) / span >= 0.25 && (iB - iL) / span <= 0.75)) continue;
    const xs = [], ys = [];
    for (let x = iL; x <= iR; x++) { xs.push(x); ys.push(c[x]); }
    const { a2, fitted } = polyfit2(xs, ys);
    let ssRes = 0, ssTot = 0;
    const ym = mean(ys, 0, ys.length);
    for (let k = 0; k < ys.length; k++) { ssRes += (ys[k] - fitted[k]) ** 2; ssTot += (ys[k] - ym) ** 2; }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    if (a2 <= 0 || r2 < 0.6) continue;
    const hlEnd = brk !== null ? brk : n;
    const hlen = hlEnd - 1 - iR;
    if (!(hlen >= p.handle[0] && hlen <= p.handle[1])) continue;
    const iH = argmin(l, iR + 1, hlEnd), pH = l[iH];
    const pull = (pR - pH) / pR;
    if (pull < 0.03 || pR - pH > 0.5 * (pL - pB) || pH < pB + 0.5 * (pL - pB)) continue;
    const rim = pL;
    const st = resolve(b, iH, (j) => (brk === null || j < brk ? c[j] >= pH * 0.99 : true),
      (j) => (c[j] > rim * 1.003 ? 1 : c[j] < pH * 0.99 ? -1 : 0), 1);
    if (st === null || !recent(b, st, p)) continue;
    if (st.state === "forming" && brk !== null) continue;
    const endIdx = Math.max(iH, st.state !== "forming" ? Math.min(n - 1, st.at) : n - 1);
    const geom = {
      points: [{ role: "left_rim", ...pt(b, iL, pL, "h") }, { role: "cup_low", ...pt(b, iB, pB, "l") }, { role: "right_rim", ...pt(b, iR, pR, "h") },
        { role: "handle_low", ...pt(b, iH, pH, "l") }],
      lines: [{ role: "rim", from: pt(b, iL, pL, "h"), to: { d: b.d[endIdx], p: round(rim, 2) } }],
      cup_depth_pct: round(100 * depth, 1), r2: round(r2, 2),
    };
    const r = row("Cup and handle", "bull", st, iH, b, geom, r2 >= 0.8, b.tf);
    if (best === null || r.formedIndex > best.formedIndex) best = r;
  }
  return best ? [best] : [];
}

/* ---- all ----------------------------------------------------------------------------------------------- */

function detectTf(b) {
  const piv = zigzag(b.h, b.l, b.thr);
  let res = [];
  if (piv.length >= 3) res = [...headShoulders(b, piv), ...doubleTops(b, piv), ...trianglesWedges(b, piv), ...cupHandle(b, piv)];
  return [...res, ...flags(b)];
}

/* All detections for one symbol, one per (name, side): the most recent event wins.
   rows: daily bars [{ d, o, h, l, c, v }], oldest first. Weekly bars are built from them (set weekly: false to skip). */
export function detectPatterns(rows, { weekly = true } = {}) {
  requireBars(rows, "detectPatterns");
  const daily = chartBars(rows, "daily");
  const all = [];
  if (daily.n >= 80) all.push(...detectTf(daily));
  if (weekly) {
    const w = weeklyBars(rows);
    if (w.n >= 40) all.push(...detectTf(w));
  }
  const best = new Map();
  for (const r of all) {
    const k = `${r.name}|${r.side}`;
    const cur = best.get(k);
    if (!cur || r.formedIndex > cur.formedIndex || (r.formedIndex === cur.formedIndex && r.conf > cur.conf)) best.set(k, r);
  }
  return [...best.values()];
}
