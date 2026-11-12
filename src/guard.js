/* The same refusal indicators.js gives (eqdoc/indicato#2): a function that reads the high, low or volume cannot be
   handed a plain series of numbers. Kept here, not exported from indicators.js, so the generated reference lists only
   indicators. */
export function requireBars(bars, name) {
  if (Array.isArray(bars) && bars.length > 0 && typeof bars[0] === "number") {
    throw new TypeError(
      `${name} needs bars — objects of { o, h, l, c, v } — and was given a series of numbers. ` +
      `This one reads the high, low or volume, which a close alone cannot supply.`
    );
  }
  return bars;
}
