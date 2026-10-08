#!/usr/bin/env python3
"""darkstr 0047: generate branding/darkstr/content/firefox-wordmark.svg (lowercase 'darkstr',
outlined paths, no text nodes) from IBM Plex Sans Condensed SemiBold (OFL-1.1,
IBM/plex@763c36ef9117782905ae010056dfbe8fd2653a25). Light scheme #1C1E28, dark #E8E9F0.
Sized for the existing newtab .wordmark box (200x64, background-size 200px)."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
font, out = sys.argv[1], sys.argv[2]
f=TTFont(font); gs=f.getGlyphSet(); cmap=f.getBestCmap()
x=0; paths=[]; bp=BoundsPen(gs)
for ch in "darkstr":
    g=cmap[ord(ch)]; pen=SVGPathPen(gs)
    gs[g].draw(TransformPen(pen,(1,0,0,-1,x,0))); gs[g].draw(TransformPen(bp,(1,0,0,-1,x,0)))
    paths.append(pen.getCommands()); x+=gs[g].width
xmin,ymin,xmax,ymax=bp.bounds; th=ymax-ymin
s=30.0/th; W=200/s; H=64/s; vx=xmin; vy=ymin-(H-th)/2
open(out,"w").write(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.1f} {vy:.1f} {W:.1f} {H:.1f}" width="200" height="64">
<style>path{{fill:#1C1E28}}@media (prefers-color-scheme:dark){{path{{fill:#E8E9F0}}}}</style>
<path d="{" ".join(paths)}"/>
</svg>
''')
