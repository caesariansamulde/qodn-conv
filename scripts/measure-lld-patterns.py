from pathlib import Path
from collections import Counter
import ezdxf,json,re,math,statistics
OUT=Path(__file__).resolve().parents[1]/'exports'/'lld-review'
rows=[]
for site in ['MIN3792','MIN1227','MIN1284','MIN851','MIN4026','MIN5']:
 doc=ezdxf.readfile(OUT/(site+'.dxf'));m=doc.modelspace(); poles=[]; naps=[]
 for e in m.query('INSERT'):
  a={x.dxf.tag:x.dxf.text for x in e.attribs}
  coord=a.get('DA',a.get('COORDINATES',''))
  match=re.fullmatch(r'\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*',coord)
  if match and e.dxf.name in ['EPOLE','PTPOLE','P-POLE']:
   lat,lon=map(float,match.groups());phi=math.radians(lat);ec=0.08181919084262149
   xy=(6378137*math.radians(lon),6378137*math.log(math.tan(math.pi/4+phi/2)*((1-ec*math.sin(phi))/(1+ec*math.sin(phi)))**(ec/2)))
   w=e.ocs().to_wcs(e.dxf.insert)
   poles.append({'block':e.dxf.name,'layer':e.dxf.layer,'attrs':a,'offset_m':math.dist(xy,(w.x,w.y)),'mirror':e.dxf.get('xscale',1)<0,'rotation':e.dxf.get('rotation',0)})
  if e.dxf.name.startswith('GLOBE NAP'):
   naps.append({'block':e.dxf.name,'layer':e.dxf.layer,'attrs':a,'mirror':e.dxf.get('xscale',1)<0,'rotation':e.dxf.get('rotation',0)})
 spans=[e.dxf.text for e in m.query('TEXT') if e.dxf.layer=='SPAN']
 vals=[float(x[:-1]) for x in spans if re.fullmatch(r'\d+(?:\.\d+)?m',x.strip())]
 grids=[]
 for e in m.query('LWPOLYLINE'):
  if e.dxf.layer=='GRID':
   pts=list(e.get_points('xy'));grids.append([round(max(p[0] for p in pts)-min(p[0] for p in pts),3),round(max(p[1] for p in pts)-min(p[1] for p in pts),3)])
 offsets=sorted(p['offset_m'] for p in poles)
 row={'site':site,'coordinate_tagged_poles':len(poles),'pole_layers':dict(Counter(p['layer'] for p in poles)),'mirrored_poles':sum(p['mirror'] for p in poles),'rotated_poles':sum(abs(p['rotation'])>0.01 for p in poles),'pole_offset_m':{'min':min(offsets) if offsets else None,'median':statistics.median(offsets) if offsets else None,'max':max(offsets) if offsets else None},'nap_blocks':dict(Counter(n['block'] for n in naps)),'nap_ids':[n['attrs'].get('MHTYPE') for n in naps],'mirrored_naps':sum(n['mirror'] for n in naps),'rotated_naps':sum(abs(n['rotation'])>0.01 for n in naps),'span_count':len(vals),'span_label_sum':round(sum(vals),1),'span_range':[min(vals),max(vals)] if vals else [],'grid_dimensions':dict(Counter(str(x) for x in grids))}
 rows.append(row)
 print(json.dumps(row),flush=True)
(OUT/'measured-patterns.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
