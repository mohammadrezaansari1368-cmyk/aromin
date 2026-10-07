"""Frame 070 prompt benchmark. Uses source RGB unchanged; CPU SAM 2.1."""
import argparse, json, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import torch
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--checkpoint',required=True);p.add_argument('--out',required=True);p.add_argument('--iteration',type=int,default=1);a=p.parse_args()
out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
torch.set_num_threads(4)
rgb=np.array(Image.open(a.source).convert('RGB'))
predictor=SAM2ImagePredictor(build_sam2('configs/sam2.1/sam2.1_hiera_s.yaml',a.checkpoint,device='cpu',apply_postprocessing=False))
pos=[[205,220],[310,210],[418,195],[503,199],[586,183],[593,239],[571,257],[374,298]]
neg=[[370,350],[521,369],[340,74],[650,209],[111,206],[548,303],[110,279]]
if a.iteration>=2:
 pos += [[574,248],[586,251],[598,243],[601,223],[576,264],[560,244],[411,281]]
 neg += [[616,270],[593,287],[544,279],[443,329],[145,318]]
start=time.time()
with torch.inference_mode():
 predictor.set_image(rgb)
 masks,scores,_=predictor.predict(point_coords=np.array(pos+neg),point_labels=np.array([1]*len(pos)+[0]*len(neg)),box=np.array([150,108,631,318]),multimask_output=True)
 idx=int(np.argmax(scores));mask=masks[idx]
 if a.iteration==3:
  # Separate rear rotor query, preserving only source pixels, no generated RGB.
  rotor,rs,_=predictor.predict(point_coords=np.array([[583,158],[600,204],[580,250],[569,261],[630,270],[554,293]]),point_labels=np.array([1,1,1,1,0,0]),box=np.array([544,114,635,278]),multimask_output=True)
  mask=np.logical_or(mask,rotor[int(np.argmax(rs))])
alpha=(mask*255).astype('uint8');Image.fromarray(alpha).save(out/'mask.png')
rgba=Image.fromarray(rgb).convert('RGBA');rgba.putalpha(Image.fromarray(alpha));rgba.save(out/'prepared.png')
neutral=Image.new('RGB',rgba.size,'#ddd');neutral.paste(rgba,mask=rgba.getchannel('A'))
sheet=Image.new('RGB',(1440,425),'#ddd');sheet.paste(Image.fromarray(rgb),(0,24));sheet.paste(neutral,(720,24));ImageDraw.Draw(sheet).text((5,5),f'SAM2 iteration {a.iteration} | original / isolated',fill='black');sheet.save(out/'comparison.jpg')
(out/'result.json').write_text(json.dumps({'iteration':a.iteration,'scores':scores.tolist(),'selected':idx,'seconds':time.time()-start,'positive':pos,'negative':neg,'coverage':float(mask.mean()),'visualGate':'PENDING'},indent=2))
print(out, scores.tolist(),flush=True)
