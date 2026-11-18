"""Independently audit a local planner result against the original CAD drawing.

Requires ezdxf, pyproj and Shapely. Optional task-local dependencies live in
<review directory>/deps. No network access or changes to source drawings.
"""
import argparse
import json
import math
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
parser.add_argument('--write-corrected', action='store_true')
args = parser.parse_args()
out = args.directory.resolve()
sys.path.insert(0, str(out / 'deps'))
import ezdxf
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

data = json.loads((out / 'geometry.json').read_text())
source = ezdxf.readfile(out / 'source-latest.dxf')
project = Transformer.from_crs(3395, 32600 + data['zone'] if data['center']['lat'] >= 0 else 32700 + data['zone'], always_xy=True).transform
xy = lambda points: [(p['x'], p['y']) for p in points]

def cad_points(entity):
    if entity.dxftype() == 'POLYLINE':
        coords = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]
    elif entity.dxftype() == 'LWPOLYLINE':
        coords = [(v[0], v[1]) for v in entity.get_points()]
    elif entity.dxftype() == 'LINE':
        coords = [(entity.dxf.start.x, entity.dxf.start.y), (entity.dxf.end.x, entity.dxf.end.y)]
    else:
        return []
    return [project(x, y) for x, y in coords]

roads, road_labels, old_footprints = [], [], []
for entity in source.modelspace():
    if entity.dxf.layer == 'ROAD_BOUNDARIES':
        points = cad_points(entity)
        if len(points) >= 2:
            roads.append(LineString(points))
    elif entity.dxf.layer == 'ROAD_LABELS' and entity.dxftype() in ('TEXT', 'MTEXT'):
        p = entity.dxf.insert
        road_labels.append(Point(project(p.x, p.y)))
    elif entity.dxf.layer == 'NAP BOUNDARY':
        points = cad_points(entity)
        if len(points) >= 3:
            old_footprints.append(Polygon(points))
assert roads, 'No actual CAD road boundaries were found'
white_lines = unary_union(roads)
parts = [(group['target']['name'], part, Polygon(xy(part['polygon'])))
         for group in data['placements'] for part in group.get('parts', [group])]
errors = []
assert {p['target']['id'] for p in data['placements']} == {p['id'] for p in data['targets']}, 'Missing or duplicated NAPs'
assert len(data['placements']) == len(data['targets']), 'Every NAP needs one complete group'
for group in data['placements']:
    assert len(group['cells']) == (16 if group['target']['lines'] == 16 else 10), group['target']['name']
for name, part, poly in parts:
    if not poly.is_valid:
        errors.append(f'{name}: invalid polygon')
        continue
    if poly.buffer(-.03).intersection(white_lines).length > .1:
        errors.append(f'{name}: crosses a CAD road boundary')
    if any(poly.buffer(-.03).contains(p) for p in road_labels):
        errors.append(f'{name}: contains a road label anchor')
    front = LineString(xy(part['frontage']))
    if front.difference(white_lines.buffer(.025)).length > .01:
        errors.append(f'{name}: detached frontage')
    target = next(t for t in data['targets'] if t['name'] == name)
    if front.distance(Point(target['point']['x'], target['point']['y'])) > 55.001:
        errors.append(f'{name}: too far from owning NAP')
    cell_polys = []
    for cell in part['cells']:
        cell_poly = Polygon(xy(cell['polygon']))
        cell_polys.append(cell_poly)
        if not cell_poly.is_valid or cell_poly.difference(poly.buffer(.0001)).area > .001:
            errors.append(f'{name}: invalid cell')
        center = Point(cell['center']['x'], cell['center']['y'])
        if cell_poly.centroid.within(cell_poly) and center.distance(cell_poly.centroid) > .0001:
            errors.append(f'{name}: off-center RES label')
        dx, dy = cell['direction']['x'], cell['direction']['y']
        length = math.hypot(dx, dy)
        dx, dy = dx / length, dy / length
        h = cell['textHeight']
        label_box = Polygon([(center.x + (dx*x*1.6 - dy*y*.7)*h,
                              center.y + (dy*x*1.6 + dx*y*.7)*h)
                             for x, y in [(-1,-1),(1,-1),(1,1),(-1,1)]])
        if label_box.difference(cell_poly).area > .0001:
            errors.append(f'{name}: RES text does not fit')
        if cell['frontage'] < 9.999 or cell['depth'] < 6.499 or cell['depth']/cell['frontage'] > 2.001:
            errors.append(f'{name}: unusable cell dimensions')
    combined = unary_union(cell_polys)
    if combined.symmetric_difference(poly).area > .001 or sum(c.area for c in cell_polys)-combined.area > .001:
        errors.append(f'{name}: cells overlap or leave gaps')
overlaps = [(a[0], b[0]) for i, a in enumerate(parts) for b in parts[i+1:]
            if a[2].intersection(b[2]).area > .01]
errors += [f'{a} overlaps {b}' for a, b in overlaps]
areas = [Polygon(xy(c['polygon'])).area for _, part, _ in parts for c in part['cells']]
if max(areas)/min(areas) > 1.1:
    errors.append('Inconsistent cell areas across the site')
baseline = {
    'groups': len(old_footprints),
    'overlapPairs': sum(a.intersection(b).area > .01 for i, a in enumerate(old_footprints) for b in old_footprints[i+1:]),
    'roadCrossingGroups': sum(p.buffer(-.03).intersection(white_lines).length > .1 for p in old_footprints),
}
report = {'baseline': baseline, 'corrected': {
    'groups': len(data['placements']), 'cells': len(areas), 'footprints': len(parts),
    'overlapPairs': len(overlaps), 'roadBoundaryCrossings': sum(p.buffer(-.03).intersection(white_lines).length > .1 for _, _, p in parts),
    'areaRangeSquareMetres': [min(areas), max(areas)],
    'minimumFrontageMetres': min(c['frontage'] for _, p, _ in parts for c in p['cells']),
    'minimumDepthMetres': min(c['depth'] for _, p, _ in parts for c in p['cells']),
    'errors': errors,
}}
(out / 'verified-audit.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
assert not errors, 'Independent audit failed; no corrected drawing was written'
if args.write_corrected:
    lots = ezdxf.readfile(out / 'new-lot-entities.dxf')
    generated = [e for e in lots.modelspace() if e.dxf.layer in ('landmk', 'NAP BOUNDARY')]
    labels = [e for e in generated if e.dxftype() == 'TEXT' and e.dxf.text == 'RES']
    assert len(labels) == len(areas), 'Rendered DXF lost RES cells'
    model = source.modelspace()
    preserved = [e for e in model if e.dxf.layer not in ('landmk', 'NAP BOUNDARY')]
    for entity in list(model):
        if entity.dxf.layer in ('landmk', 'NAP BOUNDARY'):
            model.delete_entity(entity)
    for entity in generated:
        model.add_entity(entity.copy())
    assert all(e.is_alive for e in preserved), 'Non-lot drawing content changed'
    target_file = out / 'MIN188-residential-lots-corrected.dxf'
    source.saveas(target_file)
    checked = ezdxf.readfile(target_file)
    assert len(list(checked.modelspace())) == len(preserved) + len(generated)
    assert sum(e.dxftype() == 'TEXT' and e.dxf.layer == 'landmk' and e.dxf.text == 'RES' for e in checked.modelspace()) == len(areas)
    print(target_file)
