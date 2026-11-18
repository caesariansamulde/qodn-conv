from pathlib import Path
import subprocess, shutil, sys, time, json
OUT=Path(__file__).resolve().parents[1]/'exports'/'lld-review'
OUT.mkdir(parents=True,exist_ok=True)
exe=r'D:\AutoCAD 2027\accoreconsole.exe'
for site in sys.argv[1:]:
    src=Path(r'D:\KASBEL\HORIs\LLDs')/site/(site+'_IEP.dwg')
    dest=OUT/(site+'.dwg')
    dxf=OUT/(site+'.dxf')
    if dxf.exists():
        print(site,'existing DXF',flush=True); continue
    shutil.copy2(src,dest)
    scr=OUT/(site+'.scr')
    scr.write_text('(setvar "FILEDIA" 0)\n(setvar "CMDDIA" 0)\n(command "_.DXFOUT" "'+dxf.as_posix()+'" "16")\n(command "_.QUIT" "_N")\n',encoding='ascii')
    start=time.time()
    try:
        result=subprocess.run([exe,'/i',str(dest),'/s',str(scr)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=100,creationflags=subprocess.CREATE_NO_WINDOW)
        raw=result.stdout
        code=result.returncode
    except subprocess.TimeoutExpired as e:
        raw=e.stdout or b''; code='timeout'
    log=raw.decode('utf-16-le',errors='replace') if b'\x00' in raw[:200] else raw.decode('utf-8',errors='replace')
    (OUT/(site+'-console.txt')).write_text(log,encoding='utf-8')
    print(json.dumps({'site':site,'returncode':code,'seconds':round(time.time()-start,1),'dxf_bytes':dxf.stat().st_size if dxf.exists() else 0,'tail':log[-1800:]}),flush=True)
