import importlib.util,sys
spec=importlib.util.spec_from_file_location('c','/var/folders/xv/_sfj2yb17jg33fx8nw7d_nf00000gn/T/cr.py')
src=open('/var/folders/xv/_sfj2yb17jg33fx8nw7d_nf00000gn/T/cr.py').read().split('P,D,R,W=')[0]
exec(src)
for n,a,b in [('oak on charcoal','#8B7355','#2C2926'),('oak on 1A1816','#8B7355','#1A1816'),('clay on charcoal','#C4A57B','#2C2926'),('mocha on charcoal','#5C4A3C','#2C2926'),('quiet-ink on charcoal','#65594E','#2C2926'),('pearl on charcoal','#E5E2DD','#2C2926'),('clay-ink on 1A1816','#7C5E30','#1A1816'),('off-white ring on charcoal','#FAF7F2','#2C2926'),('charcoal band vs paper','#2C2926','#FAF7F2'),('mocha on bg-warm (secondary press pool)','#5C4A3C','#EEE6DB'),('clay score on charcoal pool','#C4A57B','#2C2926')]:
    print(f"{n:38s} {cr(a,b):5.2f} Lc{apca(a,b):6.1f}")
