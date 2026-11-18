from pathlib import Path
from collections import Counter,defaultdict
import ezdxf,json,math,sys
OUT=Path(__file__).resolve().parents[1]/'exports'/'lld-review'
for site in sys.argv[1:]:
    doc=ezdxf.readfile(OUT/(site+'.dxf'))
    model=doc.modelspace()
    result={'site':site,'header':{k:doc.header.get(k) for k in ['$INSUNITS','$MEASUREMENT','$LUNITS','$LUPREC','$EXTMIN','$EXTMAX','$INSBASE']},'layer_count':len(doc.layers),'block_definition_count':len(doc.blocks),'model_entity_count':len(model)}
    result['entity_types']=dict(Counter(e.dxftype() for e in model))
    layers=defaultdict(Counter); blocks=Counter(); examples=defaultdict(list); text=[]; routes=[]
    for e in model:
        typ=e.dxftype(); layer=e.dxf.layer; layers[layer][typ]+=1
        if typ=='INSERT':
            blocks[e.dxf.name]+=1
            if len(examples[e.dxf.name])<4:
                examples[e.dxf.name].append({'layer':layer,'insert':list(e.dxf.insert),'rotation':e.dxf.get('rotation',0),'scale':[e.dxf.get(k,1) for k in ('xscale','yscale','zscale')],'attributes':{a.dxf.tag:a.dxf.text for a in e.attribs}})
        if typ in ('TEXT','MTEXT'):
            val=e.plain_text() if typ=='MTEXT' else e.dxf.text
            text.append({'layer':layer,'text':val,'insert':list(e.dxf.insert),'height':e.dxf.get('char_height' if typ=='MTEXT' else 'height',0),'rotation':e.dxf.get('rotation',0)})
        if typ in ('LWPOLYLINE','POLYLINE','LINE') and any(k in layer.upper() for k in ('FOC','CABLE','SPAN')):
            try:
                pts=list(e.get_points('xy')) if typ=='LWPOLYLINE' else list(e.points()) if typ=='POLYLINE' else [e.dxf.start,e.dxf.end]
                length=sum(math.dist(a[:2],b[:2]) for a,b in zip(pts,pts[1:]))
                routes.append({'type':typ,'layer':layer,'vertices':len(pts),'chord_length':length,'start':list(pts[0])[:2] if pts else [],'end':list(pts[-1])[:2] if pts else []})
            except Exception: pass
    result['layers']=[{'name':l.dxf.name,'color':l.color,'linetype':l.dxf.linetype,'lineweight':l.dxf.lineweight,'off':l.is_off(),'frozen':l.is_frozen(),'model_counts':dict(layers[l.dxf.name])} for l in doc.layers]
    result['model_blocks']=dict(blocks.most_common()); result['block_examples']=dict(examples)
    result['layouts']=[]
    for layout in doc.layouts:
        if layout.name=='Model':continue
        vps=[]
        for e in layout.query('VIEWPORT'):
            vps.append({k:e.dxf.get(k) for k in ('id','status','width','height','view_height','view_twist_angle','view_center_point','view_target_point')})
        result['layouts'].append({'name':layout.name,'entities':len(layout),'types':dict(Counter(e.dxftype() for e in layout)),'viewports':vps,'paper_size':[layout.dxf_layout.dxf.get('paper_width'),layout.dxf_layout.dxf.get('paper_height')],'plot_device':layout.dxf_layout.dxf.get('plot_configuration_file'),'plot_style':layout.dxf_layout.dxf.get('current_style_sheet')})
    result['text_count']=len(text);result['texts']=text;result['routes']=routes
    result['xref_blocks']=[{'name':b.name,'path':b.block.dxf.get('xref_path','')} for b in doc.blocks if b.block.dxf.get('xref_path','')]
    result['image_paths']=[e.dxf.filename for e in doc.objects if e.dxftype()=='IMAGEDEF']
    (OUT/(site+'-structure.json')).write_text(json.dumps(result,indent=2,default=lambda v:list(v)),encoding='utf8')
    print(json.dumps({k:result[k] for k in ('site','header','layer_count','block_definition_count','model_entity_count','entity_types','model_blocks')},default=lambda v:list(v)),flush=True)
    print('LAYOUTS',[(l['name'],l['entities']) for l in result['layouts']],flush=True)
