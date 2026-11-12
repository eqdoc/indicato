# indicato

[![npm](https://img.shields.io/npm/v/indicato)](https://www.npmjs.com/package/indicato)
[![licence](https://img.shields.io/npm/l/indicato)](./LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](./package.json)

Technical analysis indicators for JavaScript. 89 functions, no dependencies, no build step.
Works in Node and the browser.

```bash
npm install indicato
```

```js
import { rsi, atr, macd } from "indicato";

const bars = [
  { o: 100, h: 103, l: 99,  c: 102, v: 1200000 },
  { o: 102, h: 106, l: 101, c: 105, v: 1450000 },
  // ...
];

rsi(bars, 14);        // [null, null, ..., 58.11]
atr(bars, 14);        // [null, null, ..., 19.50]
macd(bars);           // { line, signal, hist }
```

Functions needing only closing prices take a plain array:

```js
const close = bars.map(b => b.c);
sma(close, 50);
ema(close, 200);
```

Full signatures: [docs/reference.md](./docs/reference.md).

## Input

A bar is `{ o, h, l, c, v }`, oldest first. Volume may be omitted where unused.

The close-based indicators — `rsi`, `bollinger`, `macd`, `stochRsi`, `crsi`, `bbWidth`,
`bbPercent`, `envelopes`, `ulcerIndex`, `historicalVolatility` — also take a plain array
of numbers, since the close is all they read:

```js
rsi([44.34, 44.09, 44.15, /* ... */], 14);   // same answer as bars
```

Anything that reads the high, low or volume refuses a bare series rather than treating
each number as a flat bar. An ATR whose high, low and close are one number is not a
rougher ATR; it is zero.

The library computes. It does not fetch, sort, validate or cache.

## Output

Arrays are always the same length as the input, `null` until enough bars exist.

```js
rsi(bars, 14).length === bars.length;      // true
rsi(bars, 14).findIndex(v => v !== null);  // 13
```

Indices line up with your bars. There is no offset to track.

Multi-line indicators return an object of equal-length arrays:

```js
macd(bars);                  // { line, signal, hist }
bollinger(bars, 20, 2);      // { mid, upper, lower }
supertrend(bars, 10, 3);     // { line, up }
dmi(bars, 14);               // { pdi, mdi, adx }
ichimoku(bars);              // { tenkan, kijun, spanA, spanB }
```

Nothing is shifted forward. Indicators conventionally plotted ahead of price — the
Ichimoku cloud, the Alligator, Williams Fractals — are aligned to the bar on which they
can be computed.

## Timeframes

Functions count bars, not days. `rsi(hourly, 14)` is RSI over fourteen hours.

Two need to be told what a bar represents. Passing the wrong value gives a plausible
wrong answer, not an error:

```js
historicalVolatility(daily,  20);        // 18.5%   default: 252 bars per year
historicalVolatility(weekly, 20, 52);    // 19.7%
yearBand(weekly, 52);                    // window is in bars
```

`vwap` accumulates from the first bar supplied; it has no session reset.

## TA-Lib compatibility mode

indicato's defaults are Wilder's and Appel's definitions written the plainest way. TA-Lib writes the same indicators with a
different seed and a different first bar, so the two agree to many digits, not all of them, and a rule that fires on a cross
or a threshold can fire a bar apart. If you need TA-Lib's numbers (a scan held to a TA-Lib scan's rows, a backtest that must
reproduce one), ask for them:

```js
rsi(bars, 14, { compat: "talib" });                  // TA-Lib 0.7.1's RSI, first value at bar 14 (the default: bar 13)
macd(bars, 12, 26, 9, { compat: "talib" });          // line, signal and hist all start at bar 33
stochRsi(bars, 14, 5, 3, { compat: "talib" });       // TA-Lib's STOCHRSI(14, 5, 3): raw fastk, not the smoothed %K
```

The options object is always the last argument. It takes the same shapes as the default (bars, or a plain series of closes
where only the close is read), returns the same shapes (`null` before the first value) and equals TA-Lib 0.7.1 to 1e-12 on
every bar, the first value included. The default, with no options, is the 0.2.0 output to the last bit.

| function | what differs by default | in `compat: "talib"` |
|---|---|---|
| `rsi` | Wilder's average seeded one bar earlier (first value at bar n-1); the seed's weight decays by (n-1)/n a bar | first n changes averaged, first value at bar n |
| `atr` | bar 0's true range is in the first average | bar 1..n, first value at bar n |
| `dmi` | seeded as `atr` is; ADX smooths twice, so the gap is larger | TA-Lib's PLUS_DI, MINUS_DI and ADX: +DI/-DI from bar n, ADX from bar 2n-1 |
| `macd` | the fast EMA is seeded at bar fast-1 | both EMAs seeded at bar slow-1; line, signal and hist start together at slow+signal-2 (33) |
| `bollinger` | squared deviations from the mean | mean of squares less square of the mean, and a variance under 1e-8 is 0 |
| `sma` | add the new, take off the oldest, divide | divide, then take off the oldest (TA-Lib's order) |
| `psar` | the first leg follows the second close against the first | the first leg is decided by the first bar's minus-DM |
| `stochRsi` | returns the smoothed %K and its mean | the raw fastk over the last `k` RSI values and its `d`-bar mean; `k` is TA-Lib's `fastk_period` (its default is 5) |
| `supertrend` | ATR from bar n-1; opens in the direction of the close against the midpoint | TA-Lib's ATR (bar n), and the first leg is a downtrend |

`supertrend` is the one with no TA-Lib function: its mode is the Supertrend a Python scan writes on `talib.ATR`, which is the
combination most TA-Lib users mean. Why each default differs, and how big the gap is, is in
[docs/accuracy.md](./docs/accuracy.md#ta-lib-compatibility-mode). An unknown `compat` value throws.

## Indicators

### Overlap studies
```
sma          simple moving average          ema          exponential moving average
wma          weighted moving average        dema         double exponential
tema         triple exponential             trima        triangular
hma          Hull                           vwma         volume weighted
alma         Arnaud Legoux                  kama         Kaufman adaptive
zlema        zero lag                       t3           Tillson T3
mcginley     McGinley dynamic               vidya        Chande variable index
frama        fractal adaptive               envelopes    percentage bands
bollinger    Bollinger Bands                keltner      Keltner channel
donchian     Donchian channel               starc        STARC bands
yearBand     rolling high and low           pivotPoints  floor trader pivots
```

### Momentum
```
rsi          relative strength              macd         moving average convergence
stochastic   stochastic oscillator          stochRsi     stochastic of RSI
cci          commodity channel index        williamsR    Williams %R
roc          rate of change                 momentum     price difference
cmo          Chande momentum                trix         triple smoothed ROC
ppo          percentage price osc           po           price oscillator
dpo          detrended price osc            tsi          true strength index
ao           awesome oscillator             ac           accelerator oscillator
kst          know sure thing                coppock      Coppock curve
ultosc       ultimate oscillator            bop          balance of power
elderRay     bull and bear power            fisher       Fisher transform
crsi         Connors RSI                    rvi          relative vigor index
```

### Volatility
```
atr          average true range             natr         normalised ATR
bbPercent    Bollinger %B                   bbWidth      Bollinger bandwidth
chandelierExit  ATR trailing stop           chandeKrollStop  Chande Kroll stop
historicalVolatility  annualised sigma      ulcerIndex   drawdown depth
massIndex    range expansion                chop         choppiness index
```

### Volume
```
obv          on balance volume              vwap         volume weighted average price
adl          accumulation/distribution      cmf          Chaikin money flow
chaikinOsc   Chaikin oscillator             mfi          money flow index
emv          ease of movement               forceIndex   Elder force index
nvi          negative volume index          pvi          positive volume index
pvt          price volume trend             volumeOsc    volume oscillator
vroc         volume rate of change          klinger      Klinger volume osc
```

### Trend and structure
```
supertrend   ATR trend with direction       psar         parabolic SAR
dmi          +DI, -DI and ADX               ichimoku     Ichimoku cloud
aroon        time since high and low        vortex       vortex indicator
rwi          random walk index              stc          Schaff trend cycle
alligator    three displaced averages       gator        alligator convergence
williamsFractals  confirmed pivots
```

### Statistics
```
linreg       linear regression              linregSlope  regression slope
tsf          time series forecast           correlation  rolling correlation
beta         rolling beta                   variance     rolling variance
stdev        standard deviation             median       rolling median
mode         rolling mode
```

## Candlestick patterns

All sixty-one of TA-Lib's, defined the way TA-Lib defines them, integer for integer.

```js
import { engulfing, hammer, morningStar, doji, CANDLE_PATTERNS, CURATED_CANDLES } from "indicato";

engulfing(bars);            // [0, 0, 100, 0, -80, ...]   same length as bars
hammer(bars);               // [0, 0, 0, 100, ...]
morningStar(bars, 0.3);     // the star patterns take TA-Lib's penetration
Object.keys(CANDLE_PATTERNS);   // all sixty-one
CURATED_CANDLES;            // the twenty named reversal / continuation shapes
```

A value is +100 or -100 for a bullish or bearish shape, +-80 for the weaker "equal edge" variants TA-Lib marks on Engulfing
and Harami, +-200 for a confirmed Hikkake, 0 where there is none. "Long body" and "very short shadow" are measured against the
candles before, exactly as TA-Lib measures them, which is why these agree with it on every bar of a million (see
[accuracy notes](./docs/accuracy.md)). The first `candleLookback(name)` bars are 0.

```
engulfing  hammer  invertedHammer  hangingMan  shootingStar  piercing  darkCloudCover  morningStar  morningDojiStar
eveningStar  eveningDojiStar  harami  threeWhiteSoldiers  threeBlackCrows  threeInside  threeOutside  abandonedBaby
matHold  ladderBottom  marubozu                                                         the twenty in CURATED_CANDLES

twoCrows  threeLineStrike  threeStarsInSouth  advanceBlock  beltHold  breakaway  closingMarubozu  concealingBabySwallow
counterattack  doji  dojiStar  dragonflyDoji  gapSideSideWhite  gravestoneDoji  haramiCross  highWave  hikkake  hikkakeMod
homingPigeon  identicalThreeCrows  inNeck  kicking  kickingByLength  longLeggedDoji  longLine  matchingLow  onNeck
rickshawMan  riseFallThreeMethods  separatingLines  shortLine  spinningTop  stalledPattern  stickSandwich  takuri
tasukiGap  thrusting  triStar  uniqueThreeRiver  upsideGapTwoCrows  xSideGapThreeMethods
```

**Some of them fire on a large share of all candles, and that is TA-Lib's definition, not a bug.** Over a million daily bars
(1,053 Indian symbols x 5 years): `spinningTop` 23%, `longLine` 19%, `beltHold` 18%, `shortLine` 16%, `doji` 15%,
`longLeggedDoji` 15%, `hikkake` 14%, `highWave` 14%, `rickshawMan` 11%, `closingMarubozu` 6%. They describe candle
SHAPES (indecision, a long or short body), not events. They are in the library because they are TA-Lib's and because a
reader comparing with TA-Lib should find every pattern; a screen, an alert or a list that surfaces candle patterns to
people should choose which to show (eqdoc's nightly scan uses the twenty in `CURATED_CANDLES` and leaves the indecision
shapes out). Nothing here says what a pattern means for the price.

## Indicator events

Something that happened on one bar, never a state a stock sits in: a stochastic crossing out of oversold, a close
through the Keltner channel, a price low with a higher RSI low.

```js
import { indicatorEvents, EVENT_SIGNALS } from "indicato";

const ev = indicatorEvents(bars);
ev.stoch;                   // [{ i: 133, side: "bull", geometry: null }, ...]
ev.rsidiv[0].geometry;      // { p1: [bar, price, rsi], p2: [bar, price, rsi] } the two pivots joined
EVENT_SIGNALS.keltner.names.bull;   // "Closed above the Keltner channel"
```

Eleven signals: `stoch cci willr aroon keltner rsidiv macddiv vol52 dma200 nr7 gap`. Each is exact and written next to
its code. Crossings carry a cooldown so a stock that stays in a zone is one event, not six; none fires on more than
6% of stock-days. Divergences are dated the bar their second pivot is confirmed, never the pivot itself.

## Chart patterns

Head and shoulders (and inverse), double top and bottom, ascending / descending / symmetrical triangles, rising and
falling wedges, flags and pennants, cup and handle, on daily bars and on the weekly bars built from them, with the
points and lines a chart needs to draw them.

```js
import { detectPatterns } from "indicato";

const found = detectPatterns(bars);       // bars carry a date: { d, o, h, l, c, v }
found[0].name;                            // "Head and shoulders"
found[0].state;                           // "forming" | "confirmed" | "failed"
found[0].geometry.points;                 // [{ role: "head", d: "2026-05-30", p: 150.9 }, ...]
found[0].geometry.lines;                  // [{ role: "neckline", from: { d, p }, to: { d, p } }]
```

Found on swing pivots scaled to each stock's own volatility. A pattern is `confirmed` only by a close through its line on
volume at least 1.25 x the 20-session mean; a break with no volume is not reported. They describe past price behaviour;
none predicts anything.

## Using it from an AI assistant

[indicato-mcp](https://github.com/eqdoc/indicato-mcp) is a Model Context Protocol server
that exposes these functions to Claude, ChatGPT or any MCP client. It has no network
access — you pass bars inline or point it at a CSV on your machine.

```
claude mcp add indicato -- npx -y indicato-mcp
```

## Documentation

[Reference](./docs/reference.md) — every function, its parameters and return shape.
[Accuracy notes](./docs/accuracy.md) — how each one is pinned down, and where conventions
differ between implementations.

## Tests

```bash
npm test
```

Every indicator is tested for causality, warmup, output length and range bounds. Accuracy
notes for individual functions are in [docs/reference.md](./docs/reference.md). The candle, event
and chart-pattern modules are tested against golden fixtures made by TA-Lib and by eqdoc's Python
scan (`scripts/make-*-fixture.py`), and each is checked not to read a later bar.

## Versioning

Semantic versioning. Any change to numerical output is a major version, including a
correction — reproducing an old backtest means pinning the version that produced it.

**0.3.0** adds one thing: the `{ compat: "talib" }` option on `sma`, `rsi`, `atr`, `dmi`, `macd`, `bollinger`, `stochRsi`, `psar` and
`supertrend` (see above), so a scan held to TA-Lib can use indicato alone. No default output changed: `test/defaults-pinned.test.js`
holds a hash of every indicator's 0.2.0 output on the committed fixtures and fails if a digit moves.

## Licence

MIT.
