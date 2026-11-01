/* Three checks, in the order that catches problems earliest:
   1. does the script parse at all
   2. does every $('id') and getElementById actually exist in the markup
   3. is every class used in the HTML/JS actually styled           */
const fs = require('fs');
const path = require('path');
const CANDIDATES = [process.env.JOBBOOK, 'public/index.html', 'index.html', '../public/index.html'];
const TARGET = CANDIDATES.filter(Boolean).find(p => fs.existsSync(p));
if (!TARGET) { console.error('Could not find index.html. Run from the repo root, or set JOBBOOK=path/to/index.html'); process.exit(1); }
const html = fs.readFileSync(TARGET, 'utf8');
console.log('checking ' + TARGET);

let fail = 0;
const bad = m => { console.log('  FAIL  ' + m); fail++; };
const ok  = m => console.log('  ok    ' + m);

/* ---------- 1. syntax ---------- */
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
try { new Function(script); ok('script parses'); }
catch (e) { bad('script does not parse: ' + e.message); process.exit(1); }

const styleBlock = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
const markup = html.slice(html.indexOf('<body>'), html.indexOf('<script>'));

/* ---------- 2. element ids ---------- */
const declared = new Set();
for (const m of markup.matchAll(/\bid="([^"]+)"/g)) declared.add(m[1]);

/* ids created at runtime by template literals */
const runtime = new Set(['fUnit', 'bSearch', 'bResults', 'sugg']);
for (const m of script.matchAll(/id="([a-zA-Z][\w-]*)"/g)) runtime.add(m[1]);
for (const m of script.matchAll(/id="([a-zA-Z]*)\$\{/g)) if (m[1]) runtime.add(m[1] + '*');

const looked = new Set();
for (const m of script.matchAll(/\$\('([^']+)'\)/g)) looked.add(m[1]);
for (const m of script.matchAll(/getElementById\('([^']+)'\)/g)) looked.add(m[1]);

const missing = [...looked].filter(id =>
  !declared.has(id) && !runtime.has(id) &&
  ![...runtime].some(r => r.endsWith('*') && id.startsWith(r.slice(0, -1))));
if (missing.length) bad('ids looked up but never created: ' + missing.join(', '));
else ok(looked.size + ' element ids all resolve');

/* ---------- 3. css coverage ---------- */
const styled = new Set();
for (const m of styleBlock.matchAll(/\.([A-Za-z][\w-]*)/g)) styled.add(m[1]);

const used = new Set();
const collect = src => {
  for (const m of src.matchAll(/class="([^"$]*)"/g))
    m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c));
  /* class="a ${x} b" — take the literal words either side of the holes */
  for (const m of src.matchAll(/class="([^"]*\$\{[^"]*)"/g)) {
    m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).forEach(c => used.add(c));
    /* ...and any quoted names chosen inside the holes */
    for (const s of m[1].matchAll(/'([a-z][\w-]*)'/g)) used.add(s[1]);
  }
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) used.add(m[1]);
};
collect(markup); collect(script);
/* className='on bad' style assignments */
/* class lists assembled first and dropped in by variable:
   [a, b?'x':'', c].join(' ')  and  const KIND_STYLE={fit:'k-fit', ...} */
for (const m of script.matchAll(/\[((?:[^\[\]]|\[[^\[\]]*\])*)\]\.join\(' '\)/g))
  for (const s of m[1].matchAll(/'([a-z][\w-]*)'/g)) used.add(s[1]);
for (const m of script.matchAll(/const \w*STYLE\s*=\s*\{([^}]*)\}/g))
  for (const s of m[1].matchAll(/:\s*'([a-z][\w-]*)'/g)) used.add(s[1]);
for (const m of script.matchAll(/className\s*=\s*['"]([^'"]*)['"]/g))
  m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c));
for (const m of script.matchAll(/\?\s*'([a-z][\w ]*)'\s*:\s*'([a-z][\w ]*)'/g)) {
  m[1].split(/\s+/).forEach(c => used.add(c));
  m[2].split(/\s+/).forEach(c => used.add(c));
}

const unstyled = [...used].filter(c => !styled.has(c)).sort();
if (unstyled.length) console.log('  note  classes with no rule: ' + unstyled.join(', '));

const NEW = ['invtick', 'invstate', 'tag-inv', 'istamp', 'undobar', 'undobtn', 'dismiss', 'ub', 'xtrawrap', 'xtrahead', 'xtra', 'xtrahint', 'spec',
             'specmiss', 'miss', 'dnote', 'hasnote', 'pnote', 'pspec', 'payrow', 'amt', 'payacts',
             'owing', 'clear', 'urgent', 'unote', 'miniact', 'picks', 'pick', 'pk', 'pkr',
             'pks', 'pickbar', 'phgrid', 'ph', 'phwait', 'phsend', 'phdel', 'phadd', 'phcount',
             'jobphotos', 'dots', 'dot', 'railwrap', 'atend', 'tel', 'maplink', 'src-quoted', 'jobgrid',
             'pnadd', 'pnwrap', 'pnhint', 'inote', 'dayhd', 'rel', 'daynav', 'daysum', 'dayacts',
             'dayalert', 'tl', 'stop', 'stime', 't0', 't1', 'to', 'scard', 'shead',
             'jn', 'kind', 'sbody', 'saddr', 'sreach', 'sready', 'sgoing', 'sline', 'sz',
             'sd', 'sphotos', 'sfoot', 'smoney', 'gapline', 'gt', 'gf', 'clash', 'notime',
             'dayempty', 'waitrow', 'notready', 'k-fit', 'k-deliver', 'k-measure', 'prun', 'pt', 'pwarn',
             'mstamp', 'kdone', 'sdonewhen', 'movelist', 'mv', 'mvl', 'mvd', 'mvnow', 'mvh',
             'attnchip', 'attntick', 'attnwrap', 'attn', 'attnwhen',
             'subtabs', 'subtab', 'ordpick', 'ordlab', 'ordnote', 'sposrow', 'spos',
             'seqpick', 'retime', 'rtrow', 'rtacts',
             'cardhint', 'wrow', 'wname', 'wd', 'sw', 'ltick', 'lstate', 'hacts', 'evbtn', 'ev-evt', 'evday', 'evrow',
             'evt', 'evw', 'evd', 'evacts', 'evrem', 'evnote', 'evtick', 'remind', 'rmlist', 'rmrow', 'rmacts', 'lrow'];
const unstyledNew = NEW.filter(c => !styled.has(c));
if (unstyledNew.length) bad('new classes with no CSS rule: ' + unstyledNew.join(', '));
else ok('all ' + NEW.length + ' new classes are styled');

const unusedNew = NEW.filter(c => !used.has(c));
if (unusedNew.length) bad('new classes styled but never used: ' + unusedNew.join(', '));
else ok('all new classes are actually used');

console.log(fail ? '\nFAILED (' + fail + ')' : '\nall checks passed');
process.exit(fail ? 1 : 0);
