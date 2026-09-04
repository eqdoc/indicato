/* Generate the reference from the source, never by hand.
 *
 * Eighty-six hand-written pages drift from the code inside a month, and a doc that lies
 * about a formula is worse than no doc. Everything here is read out of indicators.js —
 * the signature, the default parameters, the author's name and the reasoning already
 * written above each function — and out of accuracy notes, which knows what each one was
 * checked against. Change the code and re-run; there is nothing to keep in step by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../src/indicators.js", import.meta.url), "utf8");

/* WHAT EACH ONE WAS CHECKED AGAINST — the findings of the verification run, stated
   explicitly rather than scraped out of prose. An earlier version pattern-matched the
   function name against accuracy notes's text and got it badly wrong: that document
   names indicators the way a reader says them ("Ulcer Index") and the code names them the
   way JavaScript does (ulcerIndex), so forty-four verified functions were reported as
   unchecked. A doc that undersells the library is as wrong as one that oversells it.

   Anything absent from this map is treated as property-only, which is the cautious
   default: a new indicator is unverified until someone verifies it. */
const VERIFIED = new Set([
  "sma","ema","wma","dema","tema","trima","kama","t3","rsi","atr","natr","cci","williamsR",
  "roc","momentum","trix","ppo","po","ultosc","bop","obv","adl","chaikinOsc","mfi","aroon",
  "linreg","linregSlope","tsf","variance","macd","bollinger","dmi","stochastic","median",
  "hma","zlema","vwma","alma","mcginley","massIndex","chop","stc","rvi","tsi","coppock",
  "ac","elderRay","bbPercent","dpo","supertrend","cmf","forceIndex","pvt","vroc",
  "ulcerIndex","vortex","ao","cmo",
]);
const KNOWN_DIFF = {
  vidya: "Ratio 0.998 against pandas-ta — their alpha default differs from Chande's CMO-driven one.",
  kst: "×0.01 against pandas-ta — they report a fraction where this reports Pring's scaled value.",
  chandelierExit: "Ratio 0.976 against pandas-ta — a different ATR variant inside the stop.",
  alligator: "Ratio 0.997, correlation 0.9995 against pandas-ta — a smoothed-average variant.",
  crsi: "1.3% from the OpenAlgo SDK, correlation 1.0000 — the rank component's window edge.",
  stochRsi: "Returns the smoothed %K a chart draws; TA-Lib's STOCHRSI returns the raw fastk. Computed the same way they are identical.",
  psar: "Differs on 24 bars of 5,826, median difference 0.0000 — all at a reversal, where a new leg's starting direction is an implementation choice.",
  bbWidth: "×100 against the OpenAlgo SDK — a percentage here, a fraction there. Percentage matches the TradingView convention.",
  nvi: "Seeds at 1000, per Fosback. Other libraries seed at 0 or 100 and accumulate differently.",
  pvi: "Seeds at 1000, per Fosback. The OpenAlgo SDK seeds at 100.",
  emv: "×10⁴ against the OpenAlgo SDK — both scale an arbitrary ratio and neither scaling is canonical.",
  rwi: "Two unsigned lines here; the OpenAlgo SDK returns one signed line.",
  fisher: "Correlation 0.944 against the OpenAlgo SDK — Ehlers published 0.66/0.67 smoothing constants, other implementations use different ones.",
};
const UNRESOLVED = {
  klinger: "Correlation 0.92 against pandas-ta with a ratio of 47, and it does not match their signal line either. Klinger's original description is ambiguous about the cumulative-measurement logic and implementations genuinely diverge. Treat as unverified.",
};
const NOT_COMPARABLE = {
  volumeOsc: "The classic SMA-based oscillator. pandas-ta ships the Percentage Volume Oscillator, which is EMA-based — a different indicator, not a different answer.",
};

function statusOf(name) {
  if (UNRESOLVED[name]) return ["unresolved", UNRESOLVED[name]];
  if (NOT_COMPARABLE[name]) return ["not comparable", NOT_COMPARABLE[name]];
  if (KNOWN_DIFF[name]) return ["known difference", KNOWN_DIFF[name]];
  if (VERIFIED.has(name)) return ["verified", "Pinned to the value across 6,126 bars of real market history."];
  return ["property only", "Follows its published formula. Held by the property tests — causality, warmup, range and flat-series identity."];
}

/* Each function's own comment is its documentation. The first sentence is the summary;
   the rest is the reasoning, which is usually the part worth reading. */
const BLOCK = /(?:\/\*((?:[^*]|\*(?!\/))*)\*\/\s*)?^export (?:function|const) ([a-z][a-zA-Z0-9]*)\s*(?:=\s*)?\(([^)]*)\)/gm;
const HELPERS = new Set(["highest", "lowest", "trueRange", "rma", "vol"]);

const items = [];
for (const [, comment, name, params] of src.matchAll(BLOCK)) {
  if (HELPERS.has(name)) continue;
  const doc = (comment || "")
    .split("\n").map((l) => l.replace(/^\s*\*? ?/, "").trimEnd())
    .join("\n").trim();
  const [summary, ...rest] = doc.split(/\n\s*\n/);
  const [status, note] = statusOf(name);
  items.push({ name, params: params.trim(), summary: (summary || "").replace(/\s+/g, " "), body: rest.join("\n\n"), status, note });
}
items.sort((a, b) => a.name.localeCompare(b.name));

const BADGE = { verified: "✅ exact", "known difference": "🟡 scaled",
  "property only": "⚪ by definition", unresolved: "🔴 ambiguous", "not comparable": "🟡 not comparable" };

let md = `# Reference

Every function in \`indicato\`, generated from the source. Do not edit this file —
run \`node scripts/build-docs.mjs\` instead.

**${items.length} functions.** The confidence column says how firmly each one is pinned down;
[accuracy notes](./accuracy.md) has the detail.

That document counts 73 verified *series* where this table counts 58 verified
*functions* — not a contradiction. A function like \`dmi\` returns three series
(+DI, −DI and ADX) and each was checked separately.

| status | meaning |
|---|---|
| ✅ exact | pinned to the value, across 6,126 bars of real market history |
| 🟡 scaled | pinned to the shape; a documented scaling or parameter convention differs |
| ⚪ by definition | follows its published formula, held by the property tests |
| 🔴 ambiguous | the indicator itself is under-specified and implementations diverge |

## All of them

| function | signature | status |
|---|---|---|
`;
for (const i of items) md += `| [\`${i.name}\`](#${i.name}) | \`(${i.params})\` | ${BADGE[i.status]} |\n`;

md += `\n---\n\n`;
for (const i of items) {
  md += `## ${i.name}\n\n\`\`\`js\nimport { ${i.name} } from "indicato";\n\n${i.name}(${i.params.replace(/\s*=\s*[^,]+/g, "")})\n\`\`\`\n\n`;
  md += `**${BADGE[i.status]}** — ${i.note}\n\n`;
  if (i.summary) md += `${i.summary}\n\n`;
  if (i.body) md += `${i.body}\n\n`;
  md += `---\n\n`;
}
writeFileSync(new URL("../docs/reference.md", import.meta.url), md);
console.log(`  wrote docs/reference.md — ${items.length} functions, ${(md.length/1024).toFixed(1)} kB`);
const counts = items.reduce((a, i) => ((a[i.status] = (a[i.status]||0)+1), a), {});
for (const [k, v] of Object.entries(counts)) console.log(`    ${BADGE[k]}: ${v}`);
