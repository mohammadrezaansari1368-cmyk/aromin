"""Temporal evidence and conservative union candidates; not asserted ground truth."""
import argparse,json
from pathlib import Path
import numpy as np,cv2
from PIL import Image,ImageDraw
from prepare import FRAMES,BOUNDS
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--models',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--baseline',type=Path,required=True);a=p.parse_args()
if a.out.resolve().is_relative_to(a.source.resolve().parents[1]):raise ValueError('No experimental artifacts in public assets')
a.out.mkdir(parents=True,exist_ok=True)
seq=np.stack([np.asarray(Image.open(f).convert('RGB')) for f in sorted(a.source.glob('*.webp'))]);median=np.median(seq,axis=0)
edges=np.stack([cv2.Canny(cv2.cvtColor(im,cv2.COLOR_RGB2GRAY),20,50)>0 for im in seq]);recurrence=edges.mean(axis=0)
Image.fromarray((recurrence*255).astype('uint8')).save(a.out/'edge-recurrence.png')
records=[]
for n in FRAMES:
 rgb=np.asarray(Image.open(a.source/f'frame-{n:03}.webp').convert('RGB'));gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
 x1,y1,x2,y2=BOUNDS[n];roi=np.zeros(gray.shape,np.uint8);roi[y1:y2,x1:x2]=1
 delta=np.abs(rgb.astype(float)-median).mean(axis=2)
 support=(((delta>12)&(recurrence>.04))|((recurrence>.3)&(gray>30)))&roi.astype(bool)
 support=cv2.morphologyEx(support.astype('uint8'),cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
 contours,_=cv2.findContours(support,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 temporal=np.zeros_like(gray);cv2.drawContours(temporal,[c for c in contours if cv2.contourArea(c)>30],-1,255,-1)
 u2=np.asarray(Image.open(a.models/'u2net-plain'/f'mask-{n:03}.png'))
 bright=np.asarray(Image.open(a.models/'isnet-general-use-bright'/f'mask-{n:03}.png'))
 baseline=np.asarray(Image.open(a.baseline/f'mask-{n:03}.png'))
 # Union favors retaining true dark edges. It can retain background and must be reviewed.
 near=cv2.dilate((np.maximum(u2,bright)>24).astype('uint8'),np.ones((5,5),np.uint8))
 hybrid=np.maximum.reduce([u2,bright,baseline,np.where((near>0)&(temporal>0),255,0).astype('uint8')])
 for method,alpha in [('temporal',temporal),('hybrid',hybrid)]:
  out=a.out/method;out.mkdir(exist_ok=True);im=Image.fromarray(rgb).convert('RGBA');im.putalpha(Image.fromarray(alpha));im.save(out/f'prepared-{n:03}.png');Image.fromarray(alpha).save(out/f'mask-{n:03}.png')
  records.append({'method':method,'frame':n,'coverage':float((alpha>24).mean())})
(a.out/'temporal-results.json').write_text(json.dumps({'sourceFrames':len(seq),'note':'Temporal recurrence is evidence, not proof of material identity. No hidden geometry inferred.','results':records},indent=2))
# Common six-panel evidence for every baseline/model/temporal candidate.
methods=[a.baseline]+[q for q in sorted(a.models.iterdir()) if q.is_dir()]+[a.out/'temporal',a.out/'hybrid']
for folder in methods:
 for n in FRAMES:
  mask=folder/f'mask-{n:03}.png'
  if not mask.exists():continue
  rgb=np.asarray(Image.open(a.source/f'frame-{n:03}.webp').convert('RGB'));alpha=np.asarray(Image.open(mask));h,w=alpha.shape
  cut=np.concatenate([rgb,alpha[:,:,None]],axis=2);neutral=np.round(rgb*(alpha[:,:,None]/255)+235*(1-alpha[:,:,None]/255)).astype('uint8')
  original_edges=cv2.Canny(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),20,50)>0
  contour=cv2.Canny(alpha,20,50)>0;edge_view=rgb.copy();edge_view[contour]=[0,255,80]
  difference=rgb.copy();difference[(alpha<128)&original_edges]=[255,40,30]
  sheet=Image.new('RGB',(w*3,(h+24)*2),'#ddd');draw=ImageDraw.Draw(sheet)
  panels=[('original',Image.fromarray(rgb)),('mask',Image.fromarray(alpha).convert('RGB')),('alpha isolated',Image.fromarray(cut)),('neutral',Image.fromarray(neutral)),('mask boundary / green',Image.fromarray(edge_view)),('excluded source edges / red',Image.fromarray(difference))]
  for i,(name,im) in enumerate(panels):
   x=i%3*w;y=i//3*(h+24);sheet.paste(im,(x,y),im if im.mode=='RGBA' else None);draw.text((x+3,y+h+4),f'{n:03} {name}',fill='black')
  out=a.out/'sheets'/folder.name;out.mkdir(parents=True,exist_ok=True);sheet.save(out/f'{n:03}.jpg',quality=85)
print('Temporal and hybrid candidates plus six-panel evidence complete')
