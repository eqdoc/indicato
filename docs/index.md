# indicato

Technical analysis indicators for JavaScript. 89 functions, no dependencies, no build
step. Works in Node and the browser.

```
npm install indicato
```

```js
import { rsi, macd, bollinger } from "indicato";

const bars = [{ o: 100, h: 102, l: 99, c: 101, v: 10000 }, /* ... */];

rsi(bars, 14);          // [null, null, ..., 62.4, 61.8]
macd(bars);             // { line, signal, hist }
bollinger(bars, 20, 2); // { mid, upper, lower }
```

Arrays come back the same length as the input, `null` until enough bars exist. Indices
line up with your bars — there is no offset to track.

## Documentation

- **[Reference](./reference.md)** — every function, its parameters, defaults and return
  shape.
- **[Accuracy notes](./accuracy.md)** — how each indicator is pinned down, where
  conventions differ between implementations, and the one that is genuinely ambiguous.

## Using it from an AI assistant

[**indicato-mcp**](https://github.com/eqdoc/indicato-mcp) is an MCP server that hands
these functions to Claude, ChatGPT or any MCP client. The assistant asks for an RSI and
gets one computed, rather than a plausible-looking number.

```
claude mcp add indicato -- npx -y indicato-mcp
```

It has no network access and no market data of its own. You pass bars inline or point it
at a CSV on your machine.

## Licence

MIT. Use it commercially, no strings.

[Source on GitHub](https://github.com/eqdoc/indicato)
