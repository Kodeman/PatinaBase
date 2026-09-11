// Builds the Artifact publish shell around the deck page content.
const fs = require('fs');
const path = require('path');
const SRC = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/deck/src/index.html';
const OUT = path.join(__dirname, '_r3wrapped.html');
const body = fs.readFileSync(SRC, 'utf8');
const shell = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light}
body{margin:0;background:#fbfbfa;color:#1a1a19;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
</style></head><body style="margin:0">
${body}
</body></html>`;
fs.writeFileSync(OUT, shell);
console.log('wrote', OUT, shell.length, 'bytes');
