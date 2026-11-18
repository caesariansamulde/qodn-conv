"""Read-only source survey; all derived files go into workspace exports/lld-review."""
from pathlib import Path
import json, zipfile, xml.etree.ElementTree as ET
import fitz

ROOT = Path(r'D:\KASBEL\HORIs\LLDs')
OUT = Path(__file__).resolve().parents[1] / 'exports' / 'lld-review'
OUT.mkdir(parents=True, exist_ok=True)
inventory=[]
for folder in sorted(ROOT.iterdir()):
    if not folder.is_dir(): continue
    row={'site':folder.name,'files':[]}
    for f in sorted(folder.glob('*')):
        if not f.is_file(): continue
        row['files'].append({'name':f.name,'bytes':f.stat().st_size})
        if f.name.endswith('_IEP.pdf'):
            doc=fitz.open(f)
            row['pdf_pages']=len(doc)
            row['page_sizes']=[list(p.rect)[2:] for p in doc]
            texts=[p.get_text() for p in doc]
            (OUT/(folder.name+'-pdf-text.txt')).write_text('\n\n'.join(f'=== PAGE {i+1} ===\n{t}' for i,t in enumerate(texts)),encoding='utf-8')
            row['page_text_heads']=[t[:200] for t in texts]
        if f.suffix.lower()=='.dwg':
            with f.open('rb') as stream: row['dwg_version']=stream.read(6).decode('ascii','replace')
        if f.suffix.lower()=='.kmz':
            entries=[]
            with zipfile.ZipFile(f) as z:
                for name in z.namelist():
                    if name.lower().endswith('.kml'):
                        tree=ET.fromstring(z.read(name))
                        for pm in tree.iter():
                            if pm.tag.split('}')[-1]!='Placemark': continue
                            vals={}
                            for child in pm.iter():
                                tag=child.tag.split('}')[-1]
                                if tag in ('name','coordinates','description') and child.text: vals.setdefault(tag,child.text.strip())
                            entries.append(vals)
            row['hld_placemarks']=len(entries)
            (OUT/(folder.name+'-hld.json')).write_text(json.dumps(entries,indent=2),encoding='utf-8')
    inventory.append(row)
(OUT/'inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
print(json.dumps([{k:r.get(k) for k in ('site','pdf_pages','hld_placemarks','dwg_version')} for r in inventory],indent=2))
