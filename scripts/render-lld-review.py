from pathlib import Path
import subprocess,shutil
from PIL import Image,ImageDraw
OUT=Path(__file__).resolve().parents[1]/'exports'/'lld-review'
samples={'MIN3792':[6,8,9,11,12,13],'MIN1227':[1,9,20,35,36,37],'MIN1284':[9,15],'MIN851':[9,50,89,90,91],'MIN4026':[27,28,47,56]}
for site,pages in samples.items():
    thumbs=[]
    for page in pages:
        dest=OUT/f'{site}-p{page}'
        subprocess.run([shutil.which('pdftoppm'),'-f',str(page),'-l',str(page),'-singlefile','-scale-to','1800','-png',str(Path(r'D:\KASBEL\HORIs\LLDs')/site/(site+'_IEP.pdf')),str(dest)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        im=Image.open(str(dest)+'.png').convert('RGB');im.thumbnail((800,580))
        thumb=Image.new('RGB',(820,620),'#e5e7eb');thumb.paste(im,((820-im.width)//2,30));ImageDraw.Draw(thumb).text((12,9),f'{site} | PDF page {page}',fill='black');thumbs.append(thumb)
    board=Image.new('RGB',(1640,620*((len(thumbs)+1)//2)),'white')
    for i,im in enumerate(thumbs):board.paste(im,((i%2)*820,(i//2)*620))
    board.save(OUT/(site+'-contact.png'))
    print(site,'rendered',flush=True)
