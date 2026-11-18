"""Render actual local-site geometry and independent CAD road boundaries."""
from pathlib import Path
import json, math, re, sys
from PIL import Image, ImageDraw, ImageFont

out=Path(sys.argv[1] if len(sys.argv)>1 else 'exports/min188-review')
data=json.loads((out/'geometry.json').read_text())
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12)
parts=[part for p in data['placements'] for part in p.get('parts',[p])]
def render(center,radius,name):
    w,h=1100,900
    image=Image.new('RGB',(w,h),'#20292f');draw=ImageDraw.Draw(image)
    scale=min((w-50)/(radius*2),(h-70)/(radius*2))
    xy=lambda p:(w/2+(p['x']-center['x'])*scale,h/2-(p['y']-center['y'])*scale)
    for part in parts:
        box=[xy(p) for p in part['polygon']]
        if max(x for x,y in box)<0 or min(x for x,y in box)>w or max(y for x,y in box)<0 or min(y for x,y in box)>h:continue
        draw.polygon(box,fill='#26353c',outline='#4679ff',width=2)
        for rail in part['rails']:draw.line([xy(p) for p in rail],fill='#66757a',width=1)
        for divider in part['dividers']:draw.line([xy(p) for p in divider],fill='#66757a',width=1)
        for cell in part['cells']:
            x,y=xy(cell['center'])
            draw.text((x,y),'RES',fill='#a2adb0',font=small,anchor='mm')
    for curb in data['curbs']:draw.line([xy(p) for p in curb['points']],fill='#d6dcdd',width=2)
    for p in data.get('poles',[]):
        x,y=xy(p)
        if 0<x<w and 0<y<h:draw.ellipse((x-2,y-2,x+2,y+2),outline='#6c8ca0')
    unresolved={t['id'] for t in data.get('unresolved',[])}
    for target in data['targets']:
        x,y=xy(target['point'])
        if not(-10<x<w+10 and -10<y<h+10):continue
        color='#ff665d' if target['id'] in unresolved else '#79df88'
        draw.ellipse((x-4,y-4,x+4,y+4),fill=color)
        label=re.sub(r'^DIG_005_','',target['name']).replace('_16_LINES','').replace('_8_LINES','')
        draw.text((x+7,y-17),label,fill=color,font=font)
    draw.rectangle((0,0,w,34),fill='#142027');draw.text((15,7),name,fill='white',font=font)
    draw.text((15,h-25),'Actual MIN188 CAD roads | Green: allocated NAP | Red: unresolved NAP',fill='#d6dcdd',font=small)
    image.save(out/(name+'.png'))

targets=data.get('unresolved',[]) or data['targets']
for t in targets:render(t['point'],100,'site-'+re.sub(r'[^A-Za-z0-9_-]','-',t['name']))
xs=[t['point']['x'] for t in data['targets']];ys=[t['point']['y'] for t in data['targets']]
render({'x':(min(xs)+max(xs))/2,'y':(min(ys)+max(ys))/2},max(max(xs)-min(xs),max(ys)-min(ys))/2+90,'site-overview')
print(out/'site-overview.png')
