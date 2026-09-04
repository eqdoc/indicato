# What each indicator was checked against

Written 4 September 2026, against **TA-Lib 0.7.1**, the **OpenAlgo SDK 2.0.3** and
**pandas-ta 0.4.71b0**, over
6,126 bars of Reliance daily history. Regenerate with the scripts in the PR that added
this file.

The point of this document is that a reader should never have to *discover* a
difference. Where we match the reference, we say so. Where we do not, the reason is here
before anyone files an issue about it.

## Verified identical to a reference — 73 of 86

Agreeing to floating-point equality past their warmup:

**Against TA-Lib** — SMA, EMA, WMA, DEMA, TEMA, TRIMA, KAMA, T3, RSI, ATR, NATR, CCI,
Williams %R, ROC, momentum, TRIX, PPO/APO, Ultimate Oscillator, Balance of Power, OBV,
A/D line, Chaikin Oscillator, MFI, Aroon up/down/oscillator, linear regression, its
slope, time-series forecast, variance, MACD and signal, Bollinger upper/lower,
+DI, −DI, ADX, Stochastic %K and %D, median/typical/weighted/average price.

**Against the OpenAlgo SDK** (indicators TA-Lib does not implement) — HMA, ZLEMA, VWMA,
ALMA, McGinley, Mass Index, Choppiness, Schaff Trend Cycle, RVI, TSI, Coppock,
Accelerator, Elder Ray, Bollinger %B, DPO, Supertrend, CMF, Force Index, PVT, VROC.

**Against pandas-ta** (indicators neither of the above implements) — Ulcer Index,
Vortex (+VI and −VI), Awesome Oscillator, Mass Index.

## Deliberate differences

Each is a choice, and each is here so it is not "fixed" by accident.

| indicator | difference | why |
|---|---|---|
| **RSI** | emits one bar earlier than TA-Lib | We seed Wilder's average at bar *n−1*, TA-Lib at *n*. Difference decays: 0.65 at bar 26, 0.002 by bar 100, **exactly 0 from bar 300**. No backtest trades inside its warmup. |
| **Stochastic RSI** | returns smoothed %K | TA-Lib's `STOCHRSI` returns the raw fastk. Computed the same way the two are identical to 0.000000. Ours is the pair a chart draws. |
| **PSAR** | differs on 24 bars of 5,826 | Median difference 0.0000. All at a reversal, where a new leg's starting direction is an implementation choice, not a fact. |
| **Bollinger bandwidth** | ×100 vs the SDK | We report a percentage, they report a fraction. Percentage matches the TradingView convention readers know. |
| **NVI / PVI** | seed at 1000 | Fosback's original. The SDK seeds at 0 and 100. Only the level differs for PVI; NVI also accumulates differently (correlation 0.94). |
| **Ease of Movement** | ×10⁴ vs the SDK | Both scale an arbitrary ratio; neither scaling is canonical. |
| **Random Walk Index** | two lines, unsigned | We expose the high and low legs separately; the SDK returns one signed line. Ours can express "RWI high > 1" directly. |
| **Fisher Transform** | correlation 0.944 | Ehlers published 0.66/0.67 smoothing constants; the SDK uses different ones. Same shape, same turns. |
| **Connors RSI** | 1.3% apart | The rank component's window edge. Same shape, correlation 1.0000. |

## Matched in shape, with a known scaling or parameter difference — 4

| indicator | against | difference |
|---|---|---|
| VIDYA | pandas-ta | ratio 0.9981, correlation 0.9999 — their alpha default differs from Chande's CMO-driven one |
| KST | pandas-ta | ×0.01 — they report a fraction where we report Pring's scaled value |
| Chandelier Exit | pandas-ta | ratio 0.976 — ATR variant inside the stop |
| Alligator | pandas-ta | ratio 0.9966, correlation 0.9995 — smoothed-average variant |

## Unresolved — 1

**Klinger Volume Oscillator.** Correlation 0.92 against pandas-ta and a ratio of 47, and
it does not match their signal line either. Klinger's original description is ambiguous
about the cumulative-measurement logic, and implementations genuinely diverge. We cannot
say ours is right; we can only say it is one reading. **Treat it as unverified.**

## Not comparable — 1

**Volume oscillator.** Ours is the classic SMA-based oscillator. pandas-ta ships the
*Percentage* Volume Oscillator, which is EMA-based — a different indicator, not a
different answer to the same one.

## Checked only by property — 9

No second implementation exists to compare against: **FRAMA, STARC, Chande Kroll stop,
historical volatility, Gator, moving-average envelopes, pivot points, Williams Fractals,
rolling mode.**

These rest on their published definitions plus the property suite: causality (a value
never changes when later bars arrive), warmup (nothing is emitted before its window is
full), range (bounded oscillators stay bounded), and identity (on a flat series an
average returns that value).

**That is a weaker guarantee than the 68 above have.** Anyone depending on one of these
for money should check it themselves.

## Bugs this found

- **CMO** summed raw moves over a window; TA-Lib smooths them like RSI, making CMO exactly
  `2×RSI − 100`. Fixed.
- **ATR** in the signal path used a simple average of true range where everything else on
  earth uses Wilder's — up to **57.4% apart**. Fixed, and it moved published numbers.
- **TRIMA** split its window wrongly on **even** periods only, so odd periods agreed by
  accident and hid it. 7.87 out on a price near 1,310. Fixed.
- **OBV** started from zero where TA-Lib starts from the first bar's volume. Fixed.

## Timeframes

Eighty-four of the eighty-six count **bars**, not days. RSI 14 on hourly bars is RSI over
fourteen hours and that is correct — feed the library whatever bar size you have.

Two carry a calibration that must match your bars, and getting it wrong does not error:

| function | parameter | daily | weekly | monthly | hourly (6.25h session) |
|---|---|--:|--:|--:|--:|
| `historicalVolatility(bars, n, barsPerYear)` | `barsPerYear` | 252 | 52 | 12 | ~1575 |
| `yearBand(bars, n)` | `n` — the window **in bars** | 252 | 52 | 12 | ~1575 |

Measured on Reliance: annualised volatility comes out **18.5%** on daily bars and
**19.7%** on weekly bars calibrated correctly — but **43.4%** on weekly bars left at the
daily default. Same stock, same period, wrong by √(252/52). The defaults are the daily
values, so daily callers need do nothing.

One more, which is a convention rather than a parameter: **`vwap` is cumulative from the
first bar.** Intraday VWAP conventionally resets each session; on daily bars there is no
session to reset on, so cumulative is the only sensible reading. Feed it minute bars
expecting a session reset and you will get something different from your broker.
