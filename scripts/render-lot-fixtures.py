"""Render deterministic planner fixtures for visual QA; source data is not modified."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'exports' / 'lot-layout-review'
fixtures = json.loads((out / 'fixtures.json').read_text())
names = ['Crowded site', 'Local street ownership', 'Neighboring row layouts', 'Acute triangular island', 'Curved road', 'Narrow road island', 'Curved road island', 'Tight rounded end']
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 13)
board = Image.new('RGB', (1600, 1920), '#e2e8f0')
colors = ['#0f766e', '#2563eb', '#9333ea', '#b45309']
for index, name in enumerate(names):
    case = next(f for f in fixtures if f['name'] == name)
    im = Image.new('RGB', (780, 460), 'white')
    draw = ImageDraw.Draw(im)
    parts = [part for group in case['placements'] for part in group.get('parts', [group])]
    points = [p for placement in parts for p in placement['polygon']] + [t['point'] for t in case['targets']]
    if not case['placements']:
        points += [p for curb in case['curbs'] for p in curb['points']]
    minx, maxx = min(p['x'] for p in points)-20, max(p['x'] for p in points)+20
    miny, maxy = min(p['y'] for p in points)-25, max(p['y'] for p in points)+25
    scale = min(730 / max(maxx-minx, 1), 340 / max(maxy-miny, 1))
    xy = lambda p: (25+(p['x']-minx)*scale, 405-(p['y']-miny)*scale)
    draw.text((20, 12), name, fill='#0f172a', font=font)
    draw.text((20, 39), f"{len(case['placements'])} groups placed | {len(case['warnings'])} need review", fill='#475569', font=small)
    for curb in case['curbs']:
        draw.line([xy(p) for p in curb['points']], fill='#94a3b8', width=3)
    for i, placement in enumerate(parts):
        color = colors[i % len(colors)]
        draw.polygon([xy(p) for p in placement['polygon']], fill='#ecfdf5', outline=color)
        for rail in placement['rails']:
            draw.line([xy(p) for p in rail], fill=color, width=2)
        for divider in placement['dividers']:
            draw.line([xy(p) for p in divider], fill=color, width=2)
        for cell in placement['cells']:
            x,y = xy(cell['center'])
            size = max(4, round(cell['textHeight'] * scale))
            label_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', size)
            label = Image.new('RGBA', (size*5,size*3), (0,0,0,0))
            ImageDraw.Draw(label).text((size*2.5,size*1.5), 'RES', fill='#475569', font=label_font, anchor='mm')
            import math
            direction = cell['direction']
            angle = math.degrees(math.atan2(direction['y'],direction['x']))
            if angle > 90: angle -= 180
            if angle < -90: angle += 180
            label = label.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
            im.paste(label, (round(x-label.width/2),round(y-label.height/2)), label)
    for target in case['targets']:
        x, y = xy(target['point'])
        draw.ellipse((x-4, y-4, x+4, y+4), fill='#dc2626')
        draw.text((x+6, y-18), target['name'], fill='#991b1b', font=small)
    draw.text((20, 435), 'Red: HLD NAP anchor   Gray: road edges   Colored: residential lot groups', fill='#475569', font=small)
    im.save(out / (name.lower().replace(' ', '-') + '.png'))
    board.paste(im, (10+(index % 2)*800, 10+(index//2)*480))
board.save(out / 'lot-layout-checks.png')
print(out / 'lot-layout-checks.png')
