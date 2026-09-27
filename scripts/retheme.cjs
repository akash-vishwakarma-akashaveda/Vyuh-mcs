// One-time palette swap to the "navy + kesari" theme (Astro status colours, kesari brand).
// Keys are the old dark hex values, values the new ones. The map is one-to-one, so
// `node scripts/retheme.cjs --reverse` restores the old palette.
const fs = require('fs'), path = require('path');
const MAP = {
  // surfaces, darkest to lightest
  '050506': '05090E', '08090B': '070C12', '0C0D10': '0A1018', '101216': '0E151F', '13151A': '101823', '14161B': '111A25',
  '161A20': '142030', '171A20': '152131', '181B21': '16222F', '1A1D24': '172434', '1B1F26': '1A2738', '1F2530': '1D2B3C',
  '22262F': '1F2D40', '23272F': '213044', '2B303B': '2A3B52', '2B3140': '2C3E55', '2E3440': '30435B', '3B4250': '3A4E68', '3D4452': '3E5370',
  // text
  'F3F4F6': 'E6EDF3', 'D1D5DB': 'C9D4E0', 'D4D8E0': 'CCD6E2', 'C3CADB': 'BCC8D8', 'A1A7B3': 'A3B1C2', '99A3BC': '97A6BA',
  '8B92A0': '8496AB', '6B7280': '6E7F95', '5E6572': '5F7087',
  // accent: teal becomes sky blue; the teal fill becomes kesari (primary action only)
  '3CB992': '4DACFF', '1A8A6E': 'D9731A', '0B5443': '9A480A',
  // status (Astro): normal, caution, critical, info/standby
  '4CAF81': '56F000', 'E8943A': 'FCE83A', 'FF6B6B': 'FF3838', 'C62828': 'D42C2C', '4A9EFF': '2DCCFF',
};
const TINT_FROM = '0F6E56', TINT_TO = '2E6FD8', FILL_TO = 'B8570C'; // teal: tints -> selection blue, solid -> kesari
const RGB = [['15, ?110, ?86', '46, 111, 216'], ['60, ?185, ?146', '77, 172, 255']];

const reverse = process.argv.includes('--reverse');
const pairs = Object.entries(MAP).map(([a, b]) => (reverse ? [b, a] : [a, b]));
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f.name) && f.name !== 'light.generated.css') files.push(p);
  }
})('src');

let changed = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let s = src;
  const lut = new Map(pairs.map(([a, b]) => [a.toUpperCase(), b]));
  s = s.replace(/#([0-9A-Fa-f]{6})\b/g, (m, h) => (lut.has(h.toUpperCase()) ? '#' + lut.get(h.toUpperCase()) : m));
  if (!reverse) {
    s = s.replace(new RegExp(String.raw`#${TINT_FROM}\]/`, 'gi'), `#${TINT_TO}]/`).replace(new RegExp(`#${TINT_FROM}(?![0-9A-Fa-f])`, 'gi'), `#${FILL_TO}`);
    for (const [a, b] of RGB) s = s.replace(new RegExp(a, 'g'), b);
  }
  if (s !== src) { fs.writeFileSync(f, s); changed++; }
}
console.log(`${reverse ? 'restored' : 'rethemed'} ${changed} files`);
