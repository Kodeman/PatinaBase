import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(`<style>
.wrap{width:200px;background:#eee}
.act{position:relative;display:inline-block;padding:4px 2px 9px;font:11px monospace}
.pool{position:absolute;inset:2px -5px 5px;background:red}
.c0{overflow:clip;overflow-clip-margin:0}
.c6{overflow:clip;overflow-clip-margin:6px}
.ct{contain:paint}
</style>
<div class="wrap" id="w0"><span class="act"><span class="pool"></span>ABCD</span></div>
<div class="wrap" id="w1"><span class="act c0"><span class="pool"></span>ABCD</span></div>
<div class="wrap" id="w2"><span class="act c6"><span class="pool"></span>ABCD</span></div>
<div class="wrap" id="w3"><span class="act ct"><span class="pool"></span>ABCD</span></div>`);
console.log(await p.evaluate(() => {
  const o = {};
  ['w0','w1','w2','w3'].forEach(id => {
    const w = document.getElementById(id), a = w.querySelector('.act');
    o[id] = { act: a.scrollWidth + '/' + a.clientWidth, wrap: w.scrollWidth + '/' + w.clientWidth };
  });
  return o;
}));
await b.close();
