#!/usr/bin/env python3
"""darkstr 0047: rasterize PM's darkstr-jet-mark.svg (outline only, #9AAEFF, no tile) onto a
square transparent canvas (6% margin) -> about-logo.png (192) / about-logo@2x.png (384).
Same PNGs are used for about-logo-private*.png. Needs cairosvg + Pillow."""
import sys, io, re, cairosvg
from PIL import Image
src=open(sys.argv[1]).read(); outdir=sys.argv[2]; m=0.06*700
sq=re.sub(r'viewBox="[^"]*"', f'viewBox="{220-(700-584)/2-m:.1f} {150-m:.1f} {700+2*m:.1f} {700+2*m:.1f}"', src, count=1)
sq=re.sub(r'(<svg[^>]*?)\swidth="[^"]*"', r'\1', sq, count=1); sq=re.sub(r'(<svg[^>]*?)\sheight="[^"]*"', r'\1', sq, count=1)
open(f"{outdir}/jet-mark-square.svg","w").write(sq)
for size,name in ((192,"about-logo.png"),(384,"about-logo@2x.png")):
    im=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=sq.encode(), output_width=size, output_height=size))).convert("RGBA")
    im.save(f"{outdir}/{name}", optimize=True)
