// Palette swap from "navy + kesari" to the modern graphite console (design canvas, Oct 2026).
// Many-to-one on purpose: several old surface and line shades collapse into one token each.
const fs = require('fs'), path = require('path');
const MAP = {
  // surfaces
  '05090E': '07090D', '070C12': '090B10', '0A1018': '090B10', '0E151F': '0D1016', '101823': '0F1218',
  '111A25': '11141B', '142030': '161A22', '16222F': '161A22', '152131': '161A22', '1A2738': '161A22', '172434': '171B24',
  // lines
  '1D2B3C': '1A1E27', '1F2D40': '1A1E27', '213044': '1A1E27', '2A3B52': '232936', '2C3E55': '2A303D', '30435B': '2A303D', '3A4E68': '343B4A', '3E5370': '343B4A',
  // text
  'E6EDF3': 'E9ECF1', 'C9D4E0': 'C9CED6', 'CCD6E2': 'C9CED6', 'BCC8D8': 'C9CED6', 'A3B1C2': '9AA3B2', '97A6BA': '9AA3B2', '8496AB': '7C8594', '6E7F95': '7C8594', '5F7087': '6B7383',
  // data and selection
  '4DACFF': '6CB8FF', '2DCCFF': '6CB8FF', '2E6FD8': '2F3A4F', '1B5FC1': '2F3A4F', '5B8DEF': '6CB8FF',
  '9C9AEC': '9B8CFF', '8B7CF6': '9B8CFF', 'A78BFA': '9B8CFF', '22D3EE': '3DD9C1',
  // status
  '56F000': '4ADE9A', 'FCE83A': 'F5C451', 'FACC15': 'F5C451', 'FF3838': 'FF6B6B', 'D42C2C': 'E5484D', 'C8102E': 'E5484D',
  // action
  'D9731A': 'F59A45', '9A480A': 'C46F1C',
};
const RGB = [['46, ?111, ?216', '108, 184, 255'], ['77, ?172, ?255', '108, 184, 255']];
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f.name) && f.name !== 'light.generated.css') files.push(p);
  }
})('src');
const lut = new Map(Object.entries(MAP).map(([a, b]) => [a.toUpperCase(), b]));
let changed = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let s = src.replace(/#([0-9A-Fa-f]{6})\b/g, (m, h) => (lut.has(h.toUpperCase()) ? '#' + lut.get(h.toUpperCase()) : m));
  for (const [a, b] of RGB) s = s.replace(new RegExp(a, 'g'), b);
  s = s
    .replace(/'IBM Plex Sans'/g, "'Geist'").replace(/"IBM Plex Sans"/g, '"Geist"')
    .replace(/'IBM Plex Mono'/g, "'Geist Mono'").replace(/"IBM Plex Mono"/g, '"Geist Mono"')
    .replace(/'JetBrains Mono'/g, "'Geist Mono'").replace(/'Archivo'/g, "'Geist'").replace(/'Space Grotesk'/g, "'Geist'")
    .replace(/'Inter'/g, "'Geist'");
  if (s !== src) { fs.writeFileSync(f, s); changed++; }
}
console.log(`retheme-modern: ${changed} files changed`);
