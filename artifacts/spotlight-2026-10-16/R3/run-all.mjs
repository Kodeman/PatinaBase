// SQ-1055: node run-all.mjs <site,site|all> [modes=desk,phone,desk:kbd] — sequential walks, one compact line each.
import { spawnSync } from 'node:child_process';
import { SITES } from './sites.mjs';
const [list = 'all', modes = 'desk,phone,desk:kbd'] = process.argv.slice(2);
const sites = list === 'all' ? Object.keys(SITES) : list.split(',');
for (const site of sites) for (const m of modes.split(',')) {
  const [vp, k] = m.split(':');
  const res = spawnSync('node', ['walk.mjs', site, vp, ...(k ? [k] : [])], { cwd: new URL('.', import.meta.url).pathname, encoding: 'utf8', timeout: 420000 });
  const last = (res.stdout || '').trim().split('\n').pop();
  try {
    const d = JSON.parse(last);
    console.log(JSON.stringify({ tag: d.tag, fails: d.fails, notes: d.notes, axe: (d.axe || []).map((a) => `${a.what}:${a.count}${a.ids.length ? '[' + a.ids.join(',') + ']' : ''}`), win: d.windows.map((w) => `${w[0]}=${(w[1] || []).join('+')}@${w[2]}`), status: d.windows[0]?.[4], error: d.error?.slice(0, 160) }));
  } catch { console.log(JSON.stringify({ site, m, raw: (res.stdout || '').slice(-300), err: (res.stderr || '').slice(-300) })); }
}
