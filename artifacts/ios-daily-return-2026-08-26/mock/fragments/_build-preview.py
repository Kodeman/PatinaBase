frs = ['s-M%d' % i for i in range(1, 10)]
caps = {
 's-M1':'s-M1 · Piece detail, repaired — SP-01/10/13/14/19',
 's-M2':'s-M2 · Saved · All items — SP-12/14',
 's-M3':'s-M3 · Saved · Boards — SP-12',
 's-M4':'s-M4 · The permission moment — SP-08',
 's-M5':'s-M5 · The system prompt, after the primer — SP-08',
 's-M6':'s-M6 · What the partner receives — SP-03',
 's-M7':'s-M7 · Lock Screen push + widget (dark)',
 's-M8':'s-M8 · Home Screen widgets, small + medium (dark)',
 's-M9':'s-M9 · Live Activity, a delivery (dark)',
}
sprite = open('_sprite.html').read()
parts = ['<div class="cell"><p class="cap">%s</p>%s<div class="sheetbox">%s</div></div>'
         % (caps[f], open(f + '.html').read(), open(f + '.sheet.html').read()) for f in frs]
html = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<base href="../">
<title>s-M preview</title>
<link rel="stylesheet" href="kit.css">
<style>
  body { background:var(--pat-bg); padding:40px; font-family:var(--pat-sans); }
  .sheetgrid { display:flex; flex-wrap:wrap; gap:56px 40px; align-items:flex-start; }
  .cell { display:flex; flex-direction:column; gap:14px; width:428px; }
  .sheetbox { width:428px; }
  .cap { font:400 11px/1.4 var(--pat-mono); text-transform:uppercase; letter-spacing:.5px;
         color:var(--pat-text-muted); margin:0; }
</style>
</head><body>
%s
<div class="sheetgrid">
%s
</div>
</body></html>""" % (sprite, "\n".join(parts))
open('_preview-s.html', 'w').write(html)
print('preview rebuilt')
