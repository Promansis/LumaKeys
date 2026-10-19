# Lane E (RT-010): simulated colour-vision-deficiency distance between judged-note and pending-note colours.
# Machado 2009 matrices at severity 1.0, CIE76 delta E. A numeric screen, not a calibrated colour-vision review.
# Usage: python3 palette-cvd-distance.py
import itertools, math
def hex2(c): c=c.lstrip('#'); return [int(c[i:i+2],16)/255 for i in (0,2,4)]
def lin(v): return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
def gam(v): v=max(0,min(1,v)); return 12.92*v if v<=0.0031308 else 1.055*v**(1/2.4)-0.055
M={'protan':[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
'deutan':[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
'tritan':[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
'normal':[[1,0,0],[0,1,0],[0,0,1]]}
def sim(rgb,k):
    l=[lin(x) for x in rgb]; m=M[k]; return [gam(sum(m[i][j]*l[j] for j in range(3))) for i in range(3)]
def lab(rgb):
    l=[lin(x) for x in rgb]
    X=0.4124*l[0]+0.3576*l[1]+0.1805*l[2]; Y=0.2126*l[0]+0.7152*l[1]+0.0722*l[2]; Z=0.0193*l[0]+0.1192*l[1]+0.9505*l[2]
    X/=0.95047; Z/=1.08883
    f=lambda t: t**(1/3) if t>0.008856 else 7.787*t+16/116
    return (116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z)))
def de(a,b): return math.dist(lab(a),lab(b))
pals={'default':{'perfect':'#f5c542','good':'#40b56a','ok':'#4a90d9','miss':'#bf5b44','pending-left':'#7c6aff','pending-right':'#ff6b9d'},
'colour-blind mode':{'perfect':'#f5c542','good':'#4477AA','ok':'#66CCEE','miss':'#EE6677','pending-left':'#4477AA','pending-right':'#EE6677'}}
for pn,p in pals.items():
    print('==',pn)
    for k in ['normal','protan','deutan','tritan']:
        close=[]
        for a,b in itertools.combinations(p,2):
            d=de(sim(hex2(p[a]),k),sim(hex2(p[b]),k))
            if d<20: close.append(f'{a} vs {b} dE={d:.1f}')
        print(f'  {k}: pairs with dE76 < 20: {close if close else "none"}')
