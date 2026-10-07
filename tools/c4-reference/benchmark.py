"""Local non-generative segmentation benchmark. Outputs never enter public assets."""
import argparse,gc,hashlib,json,os,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageEnhance,ImageDraw
from rembg import new_session,remove

FRAMES=[70,18,28,35,46,53,76,121]
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--models',nargs='+',default=['u2net','isnet-general-use']);args=p.parse_args()
 if args.out.resolve().is_relative_to(args.source.resolve().parents[1]):raise ValueError('No benchmark outputs in production assets')
 args.out.mkdir(parents=True,exist_ok=True)
 result_path=args.out/'model-results.json'
 records=json.loads(result_path.read_text()) if result_path.exists() else []
 for model in args.models:
  session=new_session(model,providers=['CPUExecutionProvider'])
  modes=['plain','matting','bright'] if model=='isnet-general-use' else ['plain']
  for mode in modes:
   target=args.out/f'{model}-{mode}';target.mkdir(exist_ok=True)
   for frame in FRAMES:
    src=args.source/f'frame-{frame:03}.webp';orig=Image.open(src).convert('RGB')
    inp=ImageEnhance.Brightness(orig).enhance(2.2) if mode=='bright' else orig
    start=time.perf_counter()
    segmented=remove(inp,session=session,alpha_matting=mode=='matting')
    alpha=segmented.getchannel('A');rgba=orig.convert('RGBA');rgba.putalpha(alpha)
    rgba.save(target/f'prepared-{frame:03}.png');alpha.save(target/f'mask-{frame:03}.png')
    neutral=Image.new('RGB',orig.size,(235,235,235));neutral.paste(orig,(0,0),alpha)
    w,h=orig.size;sheet=Image.new('RGB',(w*2,(h+22)*2),'#ddd');d=ImageDraw.Draw(sheet)
    for i,(label,im) in enumerate([('original',orig),('mask',alpha.convert('RGB')),('isolated / neutral',neutral),('prepared',rgba)]):
     x=i%2*w;y=i//2*(h+22);sheet.paste(im,(x,y),im if im.mode=='RGBA' else None);d.text((x+4,y+h+3),f'{frame:03} {label}',fill='black')
    sheet.save(target/f'comparison-{frame:03}.jpg',quality=85)
    assert np.array_equal(np.asarray(rgba)[:,:,:3],np.asarray(orig))
    record={'model':model,'mode':mode,'frame':frame,'seconds':round(time.perf_counter()-start,3),'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'alphaCoverage':float((np.asarray(alpha)>24).mean())}
    records.append(record);print(json.dumps(record),flush=True)
    (args.out/'model-results.json').write_text(json.dumps(records,indent=2))
  del session;gc.collect()
if __name__=='__main__':main()
