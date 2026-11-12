#!/usr/bin/env node
/* Bar-for-bar parity of candle patterns against TA-Lib's output, over a whole universe.

     node scripts/candle-parity.mjs <universe.json> <module.js> [name ...]

   <universe.json>: { symbol: { bars: [[o,h,l,c,v], ...], exp: { patternName: [[barIndex, taLibValue], ...] } } } (sparse: non-zero
   outputs only). <module.js>: an ES module exporting a function per pattern name. With no names, every name in the file's
   `exp` that the module exports. Prints per pattern: TA-Lib hits, our hits, equal, missing, extra, different value, and the
   first few mismatches. Exit 1 if any pattern differs anywhere. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [, , uniPath, modPath, ...want] = process.argv;
const U = JSON.parse(readFileSync(uniPath, "utf8"));
const M = await import(pathToFileURL(resolve(modPath)).href);
const first = Object.values(U)[0];
const names = (want.length ? want : Object.keys(first.exp)).filter((n) => typeof M[n] === "function");
let bad = 0, nbars = 0;
const rows = [];
for (const n of names) {
  const r = { t: 0, o: 0, eq: 0, miss: 0, extra: 0, vd: 0, ex: [] };
  nbars = 0;
  for (const [sym, d] of Object.entries(U)) {
    const bars = d.bars.map(([o, h, l, c, v]) => ({ o, h, l, c, v }));
    nbars += bars.length;
    const got = M[n](bars);
    if (got.length !== bars.length) throw new Error(`${n}: wrong length`);
    const exp = new Map(d.exp[n]);
    for (let i = 0; i < got.length; i++) {
      const g = got[i], e = exp.get(i) || 0;
      if (g) r.o++;
      if (e) r.t++;
      if (g === e) { if (g) r.eq++; continue; }
      if (g && e) r.vd++; else if (e) r.miss++; else r.extra++;
      if (r.ex.length < 4) r.ex.push(`${sym}@${i}: ours ${g}, TA-Lib ${e}`);
    }
  }
  if (r.miss || r.extra || r.vd) bad++;
  rows.push([n, r]);
}
console.log(`${Object.keys(U).length} symbols, ${nbars} bars`);
console.log("pattern".padEnd(24), "talib".padStart(8), "ours".padStart(8), "equal".padStart(8), "missing".padStart(8), "extra".padStart(7), "valdiff".padStart(8));
for (const [n, r] of rows) {
  console.log(n.padEnd(24), String(r.t).padStart(8), String(r.o).padStart(8), String(r.eq).padStart(8), String(r.miss).padStart(8), String(r.extra).padStart(7), String(r.vd).padStart(8), r.ex.length ? "  e.g. " + r.ex.join("; ") : "");
}
process.exit(bad ? 1 : 0);
