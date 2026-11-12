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


## Candlesticks, events and chart patterns (0.2)

### Candlesticks: all 61 patterns against TA-Lib 0.7.1

Checked on 1,053 liquid Indian symbols x 5 years of daily bars (1,047,363 bars): the integer at every bar, compared with
TA-Lib's. **All sixty-one agree on every bar: no missing, no extra, no different value** (`node scripts/candle-parity.mjs`
reproduces it from a universe file). The table is TA-Lib's non-zero outputs, which are also ours, and how often each fires.

| pattern | TA-Lib bars | % of bars | pattern | TA-Lib bars | % of bars |
|---|---|---|---|---|---|
| engulfing | 107,129 | 10.23% | dragonflyDoji | 12,026 | 1.15% |
| hammer | 16,753 | 1.60% | gapSideSideWhite | 2,143 | 0.20% |
| invertedHammer | 10,847 | 1.04% | gravestoneDoji | 17,425 | 1.66% |
| hangingMan | 14,138 | 1.35% | haramiCross | 27,202 | 2.60% |
| shootingStar | 13,899 | 1.33% | highWave | 143,071 | 13.66% |
| piercing | 2,093 | 0.20% | hikkake | 144,084 | 13.76% |
| darkCloudCover | 3,812 | 0.36% | hikkakeMod | 2,111 | 0.20% |
| morningStar | 3,742 | 0.36% | homingPigeon | 18,188 | 1.74% |
| morningDojiStar | 1,273 | 0.12% | identicalThreeCrows | 179 | 0.02% |
| eveningStar | 5,621 | 0.54% | inNeck | 824 | 0.08% |
| eveningDojiStar | 2,195 | 0.21% | kicking | 7 | 0.00% |
| harami | 80,559 | 7.69% | kickingByLength | 7 | 0.00% |
| threeWhiteSoldiers | 71 | 0.01% | longLeggedDoji | 155,738 | 14.87% |
| threeBlackCrows | 225 | 0.02% | longLine | 197,679 | 18.87% |
| threeInside | 12,872 | 1.23% | matchingLow | 33,385 | 3.19% |
| threeOutside | 42,426 | 4.05% | onNeck | 1,514 | 0.14% |
| abandonedBaby | 9 | 0.00% | rickshawMan | 116,123 | 11.09% |
| matHold | 38 | 0.00% | riseFallThreeMethods | 288 | 0.03% |
| ladderBottom | 1,698 | 0.16% | separatingLines | 5,003 | 0.48% |
| marubozu | 28,801 | 2.75% | shortLine | 168,744 | 16.11% |
| twoCrows | 1,622 | 0.15% | spinningTop | 242,661 | 23.17% |
| threeLineStrike | 1,454 | 0.14% | stalledPattern | 605 | 0.06% |
| threeStarsInSouth | 11 | 0.00% | stickSandwich | 2,005 | 0.19% |
| advanceBlock | 3,729 | 0.36% | takuri | 12,166 | 1.16% |
| beltHold | 190,056 | 18.15% | tasukiGap | 3,469 | 0.33% |
| breakaway | 129 | 0.01% | thrusting | 4,125 | 0.39% |
| closingMarubozu | 60,957 | 5.82% | triStar | 1,230 | 0.12% |
| concealingBabySwallow | 5 | 0.00% | uniqueThreeRiver | 1,716 | 0.16% |
| counterattack | 1,286 | 0.12% | upsideGapTwoCrows | 643 | 0.06% |
| doji | 157,849 | 15.07% | xSideGapThreeMethods | 5,917 | 0.56% |
| dojiStar | 23,151 | 2.21% |  |  |  |

The committed tests use ten companies (11,088 hits) and 274 windows around the hits of the patterns that are rare on ten
companies (the Three-candle families, Abandoned Baby, Kicking, Concealing Baby Swallow, Breakaway, Mat Hold, the hikkakes...),
so every pattern is exercised on real hits. The averages TA-Lib compares against are reproduced exactly: "long" is the average
real body of the ten candles before, "near" a fifth of the average high-low range of the five before, and so on
(`src/candle-kit.js` lists them). Details worth knowing:

- TA-Lib sometimes averages a setting over a different measure than the setting's own (three-candle patterns that use the
  real body for "near", Three Black Crows and Ladder Bottom averaging the very-short-shadow test over the high-low range);
  and its generated C has two loops for a few patterns, of which only one runs with the default settings. Where a first
  reading of the C source disagreed with the output, the output decided; the full-universe run caught every such case.
- Engulfing and Harami return +-80 when an edge of the bodies touches; the two hikkakes return +-100 on the pattern bar and
  +-200 on the bar that confirms it (within three bars), a state machine that is reproduced exactly, including how it starts.
- Many of the sixty-one are indecision shapes that fire constantly (see the README): they are here because they are
  TA-Lib's. Whether anything built on the library shows them is a separate choice.

### Events against the Python scan

`indicatorEvents` against `pipeline/jobs/signal_events.py` (numpy + TA-Lib): **identical on every event on ten companies
x 600 sessions** (1,664 events, divergence pivots included). Over 222 further symbols (about 5 years each) 50,000+ events
agree except five stochastic crosses on four symbols that moved by a bar: %K and %D are equal to 1e-13 there (one is a
near-flat ETF), and a cross decided by that is decided differently. No event is reported before bar 60 in either
implementation. The MACD line only exists from bar 33 in TA-Lib; here it is masked to match. RSI here is seeded one bar
earlier than TA-Lib's, so a divergence's RSI value at an early pivot differs a little (0.003 at most in the fixtures).

### Chart patterns against the Python scan

`detectPatterns` against `pipeline/jobs/chart_geometry.py` (numpy only): **55 of 55 detections identical, geometry
to the cent**, on ten companies at thirty as-of dates each; **406 of 406** on 70 further symbols x 16 as-of runs. The
least-squares lines and the parabola behind the cup are solved here without a library; they agree with NumPy's to
rounding, which the golden fixtures pin.

Eyeball precision of the detector (one reviewer, 36 detections from a fresh sample): 33 accepted, 30 on a stricter
reading. Pennants and ascending triangles are the weakest classes. See eqdoc-api `docs/signals/library-evaluation.md`.

### Speed

1,054 symbols x 520 bars: 20 candle patterns 0.3 s, 11 event signals 0.7 s, chart patterns on daily and weekly bars 0.3 s
(Node 26 on a laptop); the Python scan does the same work in about 45 s.
