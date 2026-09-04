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
notes for individual functions are in [docs/reference.md](./docs/reference.md).

## Versioning

Semantic versioning. Any change to numerical output is a major version, including a
correction — reproducing an old backtest means pinning the version that produced it.

## Licence

MIT.
