// Writes six labelled test PNGs to the evidence dir (images/).
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/kody/Code/patina-merged/.claude/worktrees/us37-release-b/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright');
const { OUT } = require('./lib.cjs');
const dir = path.join(OUT, 'images');
fs.mkdirSync(dir, { recursive: true });
const specs = [
  ['lib-1', '#7a8b6f', 'LIBRARY 1'], ['lib-2', '#a35d3d', 'LIBRARY 2'], ['lib-3', '#3d5a80', 'LIBRARY 3'],
  ['up-A', '#c9a227', 'UPLOAD A'], ['up-B', '#5c4b8a', 'UPLOAD B'], ['logo', '#222222', 'LDS'],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 600, height: 600 } });
  for (const [name, color, label] of specs) {
    await p.setContent(`<body style="margin:0;background:${color};display:flex;align-items:center;justify-content:center;height:600px;font:bold 64px sans-serif;color:#fff">${label}</body>`);
    await p.screenshot({ path: path.join(dir, `${name}.png`) });
  }
  await b.close();
  console.log(fs.readdirSync(dir).join(' '));
})();
