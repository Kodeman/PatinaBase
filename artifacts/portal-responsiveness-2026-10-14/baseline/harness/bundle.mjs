// SQ-952 bundle reader: parses webpack-bundle-analyzer's static report and the
// Next client-reference manifests of a finished `ANALYZE=true next build --webpack`.
//   node bundle.mjs <apps/designer-portal/.next> > ../data/bundle.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const NEXT = path.resolve(process.argv[2]);
const html = fs.readFileSync(path.join(NEXT, 'analyze.html'), 'utf8');
const m = html.match(/window\.chartData\s*=\s*(\[.*?\]);\s*\n/s) || html.match(/chartData\s*=\s*(\[.*?\]);/s);
const chart = JSON.parse(m[1]);
const gz = (f) => { try { return zlib.gzipSync(fs.readFileSync(path.join(NEXT, f))).length; } catch { return null; } };
const kb = (n) => (n == null ? null : Math.round(n / 102.4) / 10);

// Every leaf module path in a chunk.
function leaves(node, acc = []) { if (node.groups && node.groups.length) node.groups.forEach((g) => leaves(g, acc)); else acc.push(node); return acc; }
const pkgOf = (p) => { const i = p.lastIndexOf('node_modules/'); if (i < 0) return p.includes('packages/') ? p.replace(/.*?(packages\/[^/]+).*/, '$1') : p.includes('apps/designer-portal') ? 'apps/designer-portal' : p.split('/').slice(0, 3).join('/'); const rest = p.slice(i + 13).split('/'); return rest[0].startsWith('@') ? rest.slice(0, 2).join('/') : rest[0]; };

const chunks = chart.map((c) => {
  const ls = leaves(c);
  const byPkg = {};
  ls.forEach((l) => { const k = pkgOf(l.path || l.label || ''); byPkg[k] = (byPkg[k] || 0) + (l.parsedSize || 0); });
  const pk = Object.entries(byPkg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, kb(v)]);
  const file = 'static/' + c.label.replace(/^static\//, '');
  return { label: c.label, parsedKB: kb(c.parsedSize), gzipKB: kb(c.gzipSize), gzipFileKB: kb(gz(file)), topPackages: pk, modules: ls.length, _ls: ls };
}).sort((a, b) => (b.gzipKB || 0) - (a.gzipKB || 0));

const find = (re) => chunks.filter((c) => c._ls.some((l) => re.test(l.path || l.label || ''))).map((c) => ({ chunk: c.label, gzipKB: c.gzipKB, parsedKB: c.parsedKB, matching: c._ls.filter((l) => re.test(l.path || l.label || '')).length, topPackages: c.topPackages, sampleOrigins: [...new Set(c._ls.map((l) => pkgOf(l.path || '')))].slice(0, 30) }));

// Per-route client JS: the route's client-reference manifest lists its entry chunks.
const bm = JSON.parse(fs.readFileSync(path.join(NEXT, 'build-manifest.json'), 'utf8'));
const shared = [...(bm.rootMainFiles || []), ...(bm.polyfillFiles || [])];
const routes = {};
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'page_client-reference-manifest.js') {
  const src = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(src.slice(src.indexOf(']=') + 2).trim().replace(/;$/, ''));
  const route = path.relative(path.join(NEXT, 'server/app'), path.dirname(p));
  const files = new Set(shared);
  Object.entries(j.entryJSFiles || {}).forEach(([k, v]) => { if (/\/(page|layout)$/.test(k)) v.forEach((f) => files.add(f)); });
  const list = [...files].map((f) => ({ f, gz: gz(f), raw: (() => { try { return fs.statSync(path.join(NEXT, f)).size; } catch { return null; } })() }));
  routes['/' + route] = { files: list.length, gzipKB: kb(list.reduce((s, x) => s + (x.gz || 0), 0)), rawKB: kb(list.reduce((s, x) => s + (x.raw || 0), 0)), largest: list.sort((a, b) => (b.gz || 0) - (a.gz || 0)).slice(0, 6).map((x) => [x.f.replace('static/chunks/', ''), kb(x.gz)]) };
} } };
walk(path.join(NEXT, 'server/app'));

console.log(JSON.stringify({
  totalChunks: chunks.length,
  totalGzipKB: kb(chunks.reduce((s, c) => s + (c.gzipKB || 0) * 1024, 0)),
  sharedRootFiles: shared,
  topChunks: chunks.slice(0, 20).map(({ _ls, ...c }) => c),
  cryptoBrowserify: find(/crypto-browserify/),
  mime: find(/mime-db|mime-types|\/mime\//),
  designSystem: find(/packages\/patina-design-system|@patina\/design-system/),
  routes: Object.fromEntries(Object.entries(routes).filter(([k]) => /desk|^\/\(document\)\/doc\/\[id\]$|pieces$|people|library$|auth\/signin/.test(k))),
  allRoutesGzipKB: Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, v.gzipKB])),
}, null, 1));
