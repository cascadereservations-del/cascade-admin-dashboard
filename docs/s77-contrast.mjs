// s77 dark palette contrast check (WCAG 2.x). Run: node docs/s77-contrast.mjs
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const L = h => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const T = {
  old: { bg:'#130E09', card:'#1D1611', muted:'#28201A', fg:'#F5EFE4', fg2:'#C3B5A3', fg3:'#9A8C7B', primary:'#D7B377', primaryFg:'#2A1E0E', primarySoft:'#3A2C18', accentText:'#E4C98F', accentSoft:'#33291A',
    ok:'#84C79A', okSoft:'#1E3527', warn:'#F0A05A', warnSoft:'#3E2414', danger:'#F28B82', dangerSoft:'#44201D', dangerBtnFg:'#44201D', info:'#8FB7F5', infoSoft:'#1D2C44' },
  neu: { bg:'#12100D', card:'#1D1A16', muted:'#28241F', fg:'#ECE4D7', fg2:'#BBB0A1', fg3:'#968B7D', primary:'#D2B788', primaryFg:'#231A0E', primarySoft:'#362C1D', accentText:'#DCC69C', accentSoft:'#2A241A',
    ok:'#93C2A0', okSoft:'#1A2820', warn:'#E3AA7C', warnSoft:'#2A2018', danger:'#E8A097', dangerSoft:'#311D1A', dangerBtnFg:'#2A1512', info:'#A3BCE2', infoSoft:'#1C2330' },
};
const pairs = [['fg','bg'],['fg','card'],['fg','muted'],['fg2','bg'],['fg2','card'],['fg2','muted'],['fg3','bg'],['fg3','card'],['fg3','muted'],
  ['primaryFg','primary'],['primary','card'],['primary','bg'],['primary','primarySoft'],['primary','muted'],['accentText','card'],['accentText','accentSoft'],
  ['ok','okSoft'],['ok','card'],['warn','warnSoft'],['warn','card'],['fg','warnSoft'],['danger','dangerSoft'],['danger','card'],['dangerBtnFg','danger'],['info','infoSoft'],['info','card'],
  ['card','bg'],['muted','card'],['primarySoft','card'],['primarySoft','muted']];
const rows = pairs.map(([a, b]) => { const o = cr(T.old[a], T.old[b]), n = cr(T.neu[a], T.neu[b]);
  const surf = ['card','muted','primarySoft'].includes(a); const need = surf ? 0 : 4.5;
  return `| ${a} on ${b} | ${o.toFixed(2)} | ${n.toFixed(2)} | ${surf ? 'surface step' : n >= 7 ? 'AAA' : n >= 4.5 ? 'AA' : 'FAIL'} |`; });
console.log('| Pair | Old dark | New dark | New verdict |\n|---|---|---|---|\n' + rows.join('\n'));
const fails = pairs.filter(([a, b]) => !['card','muted','primarySoft'].includes(a) && cr(T.neu[a], T.neu[b]) < 4.5);
if (fails.length) { console.error('FAIL', fails); process.exit(1); }
