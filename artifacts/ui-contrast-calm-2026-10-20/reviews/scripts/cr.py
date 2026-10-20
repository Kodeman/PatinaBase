from operator import gt, lt, le, ge
def h(x):
    x=x.lstrip('#'); return tuple(int(x[i:i+2],16) for i in (0,2,4))
def comp(fg,a,bg):
    f,b=h(fg),h(bg); return '#%02X%02X%02X'%tuple(round(f[i]*a+b[i]*(1-a)) for i in range(3))
def lin(c):
    c/=255; return c/12.92 if le(c,0.04045) else ((c+0.055)/1.055)**2.4
def L(x):
    r,g,b=[lin(v) for v in h(x)]; return .2126*r+.7152*g+.0722*b
def cr(a,b):
    la,lb=sorted([L(a),L(b)],reverse=True); return (la+.05)/(lb+.05)
def ys(x):
    r,g,b=[(v/255)**2.4 for v in h(x)]; y=.2126729*r+.7151522*g+.0721750*b
    return y+(0.022-y)**1.414 if lt(y,0.022) else y
def apca(t,bg):
    yt,yb=ys(t),ys(bg)
    if lt(abs(yb-yt),0.0005): return 0
    if gt(yb,yt):
        s=(yb**.56-yt**.57)*1.14; return 0 if lt(s,.1) else (s-.027)*100
    s=(yb**.65-yt**.62)*1.14; return 0 if gt(s,-.1) else (s+.027)*100
P,D,R,W='#FAF7F2','#FCFAF6','#E8E3DB','#FFFFFF'
rows=[]
def t(n,fg,bg,req,a=None):
    if a is not None: fg=comp(fg,a,bg)
    rows.append((n,fg,bg,cr(fg,bg),req,apca(fg,bg)))
for nm,c in [('ink','#2C2926'),('mocha','#5C4A3C'),('text-muted','#4E4339'),('text-subtle','#5A4E43'),('quiet-ink','#65594E'),('clay-ink','#7C5E30'),('terracotta-ink','#9C5340'),('golden-ink','#79651E'),('sage-ink','#5F6B57'),('dusty-blue-ink','#556B82')]:
    for bn,b in [('paper',P),('doc',D),('rail',R)]:
        t(f'{nm} on {bn}',c,b,4.5)
t('clay-ink@.70 on doc','#7C5E30',D,4.5,a=.7)
t('charcoal@.60 held row on doc','#2C2926',D,4.5,a=.6)
t('off-white on charcoal','#FAF7F2','#2C2926',4.5)
t('off-white on mocha (inked hover)','#FAF7F2','#5C4A3C',4.5)
nt=[('oak on paper','#8B7355',P),('oak on doc','#8B7355',D),('oak on rail','#8B7355',R),
('charcoal score on paper','#2C2926',P),('clay on paper','#C4A57B',P),
('clay-ink ring on paper','#7C5E30',P),('clay-ink ring on rail','#7C5E30',R),('clay-ink ring on charcoal','#7C5E30','#2C2926'),
('pearl disabled rule on paper','#E5E2DD',P),
('rail-as-hairline on paper','#E8E3DB',P),('hairline-strong D8CCB8 on paper','#D8CCB8',P),('hairline-strong on doc','#D8CCB8',D),
('rule-hair .10 on paper',comp('#2C2926',.10,P),P),('doc-ink-border .18 on paper',comp('#2C2926',.18,P),P),('border-warm on paper','#DDD4C8',P),
('card-edge on paper','#8F8C88',P),('card-edge on doc','#8F8C88',D),('card-edge on rail','#8F8C88',R),
('disabled terminal rail vs paper','#E8E3DB',P),('doc vs paper',D,P),('rail vs paper',R,P)]
for n,a,b in nt: rows.append((n,a,b,cr(a,b),3.0,apca(a,b)))
si=[('SI mutedInk on surface','#65594E','#FCFAF6',4.5),('SI placeholder on white','#7A6A5B',W,4.5),
('SI off-white on 1A1816','#FAF7F2','#1A1816',4.5),('SI E5E2DD on dark','#E5E2DD','#1A1816',4.5),('SI B8A999 on dark','#B8A999','#1A1816',4.5),
('SI eyebrow C4A265 on dark','#C4A265','#1A1816',4.5),('SI h1 C4A57B on dark','#C4A57B','#1A1816',3.0)]
for n,a,b,q in si: rows.append((n,a,b,cr(a,b),q,apca(a,b)))
for n,a,b in [('SI oak border vs white','#8B7355',W),('SI focus mocha vs surface','#5C4A3C','#FCFAF6'),('SI dark focus C4A57B','#C4A57B','#1A1816'),('SI fill 1A1816 vs surface','#1A1816','#FCFAF6')]:
    rows.append((n,a,b,cr(a,b),3.0,apca(a,b)))
DP,DD,DR='#2A2622','#26221E','#3A3530'
for nm,c in [('ink','#F2EDE6'),('ink-muted','#D6CEC4'),('ink-subtle','#C7BEB3'),('ink-faint','#B8AEA2'),('clay-ink','#D8B98A'),('golden-ink','#E0C963'),('terracotta-ink','#E2A895'),('sage-ink','#AFC0A6')]:
    for bn,b in [('dP',DP),('dD',DD),('dR',DR)]:
        rows.append((f'DK {nm} on {bn}',c,b,cr(c,b),4.5,apca(c,b)))
for n,a,b in [('DK oak on dP','#B39572',DP),('DK oak on dR','#B39572',DR),('DK card-edge dP','#77736E',DP),('DK card-edge dD','#77736E',DD),('DK hairline .14',comp('#F2EDE6',.14,DP),DP),('DK clay','#C4A57B',DP),('DK clay-ink ring','#D8B98A',DP),('DK light clay-ink ring unswapped','#7C5E30',DP),('DK charcoal(light) inked pool on dP','#2C2926',DP)]:
    rows.append((n,a,b,cr(a,b),3.0,apca(a,b)))
rows.append(('DK terminal label','#2A2622','#F2EDE6',cr('#2A2622','#F2EDE6'),4.5,apca('#2A2622','#F2EDE6')))
for n,f,b,r,q,lc in rows:
    print(f"{n:34s} {f}/{b} {r:5.2f} req{q} {'PASS' if ge(r,q) else 'FAIL'} Lc{lc:6.1f}")
