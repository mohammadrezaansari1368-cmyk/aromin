"""Deterministic reference-only segmentation; never modifies source WebPs.
Run with the isolated requirements.txt environment. Outputs stay outside public/.
"""
import argparse, hashlib, json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

FRAMES=[18,28,35,46,53,70,76,121]
# Loose observed engine bounds (not a synthesized silhouette), native 720x401 pixels.
BOUNDS={18:(72,100,667,340),28:(85,100,667,340),35:(119,100,667,340),46:(135,100,662,340),53:(139,100,658,338),70:(140,102,651,334),76:(140,102,644,332),121:(142,103,636,330)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--iteration',type=int,choices=[1,2,3],required=True);args=ap.parse_args()
 if args.out.resolve().is_relative_to(args.source.resolve().parents[1]):raise ValueError('Reference outputs must remain outside production public assets')
 args.out.mkdir(parents=True,exist_ok=True);cv2.setNumThreads(1)
 sequence=np.stack([np.asarray(Image.open(p).convert('RGB')) for p in sorted(args.source.glob('frame-*.webp'))])
 temporal=np.std(sequence.astype(np.float32),axis=0).mean(axis=2)
 summary=[]
 for n in FRAMES:
  src=args.source/f'frame-{n:03}.webp';rgb=np.asarray(Image.open(src).convert('RGB'));bgr=cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR);h,w=rgb.shape[:2]
  assert (w,h)==(720,401),'Observed bounds apply only to the supplied 720x401 frames'
  x1,y1,x2,y2=BOUNDS[n];mask=np.zeros((h,w),np.uint8);mask[y1:y2,x1:x2]=cv2.GC_PR_FGD
  gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
  if args.iteration>=2:
   # Temporal change plus local structure provides evidence; static dark cores remain probable FG.
   detail=np.abs(gray.astype(float)-cv2.GaussianBlur(gray,(0,0),5))
   seeds=(temporal>12)&(detail>14)&(gray>65)
   seeds[:y1+18]=False;seeds[y2-22:]=False;seeds[:,:x1+15]=False;seeds[:,x2-15:]=False
   mask[seeds]=cv2.GC_FGD
  if args.iteration>=2:
   # Visually inspected dark rear rotor cores; these seeds are existing metal pixels.
   rear={18:(638,210),28:(637,208),35:(636,207),46:(633,205),53:(627,202),70:(607,201),76:(592,197),121:(552,190)}[n]
   cv2.ellipse(mask,rear,(4,37),0,0,360,int(cv2.GC_FGD),-1)
   if n==121:
    # Exclude the lower orbit/reflection identified in the original final frame.
    floor=np.array([[142,324],[220,321],[320,313],[400,296],[485,273],[590,262],[719,262],[719,400],[0,400],[0,324]],np.int32)
    cv2.fillPoly(mask,[floor],int(cv2.GC_BGD))
  if args.iteration==3:
   # Recover measured dark fin edges, not arbitrary white-filled geometry.
   edges=cv2.Canny(gray,20,50)>0
   rx,ry=rear
   region=np.zeros((h,w),np.uint8)
   cv2.ellipse(region,(rx-2,ry-4),(17,70),0,0,360,1,-1)
   edge_seeds=edges & (region>0) & (gray>24) & (mask!=cv2.GC_BGD)
   mask[edge_seeds]=cv2.GC_FGD
  cv2.setRNGSeed(1729)
  cv2.grabCut(bgr,mask,None,np.zeros((1,65)),np.zeros((1,65)),6,cv2.GC_INIT_WITH_MASK)
  fg=np.isin(mask,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
  # Preserve all classified components; avoid dropping genuine thin hardware as 'noise'.
  if args.iteration==3:
   # Reject disconnected glow specks; main assembly is connected via the visible axle.
   count,labels,stats,_=cv2.connectedComponentsWithStats(fg,8)
   largest=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
   fg=(labels==largest).astype(np.uint8)
  alpha=fg*255
  rgba=np.dstack((rgb,alpha));ys,xs=np.nonzero(fg);pad=20
  crop=(max(0,int(xs.min())-pad),max(0,int(ys.min())-pad),min(w,int(xs.max())+pad+1),min(h,int(ys.max())+pad+1))
  Image.fromarray(alpha).save(args.out/f'mask-{n:03}.png')
  Image.fromarray(rgba).crop(crop).save(args.out/f'prepared-{n:03}.png')
  neutral=np.where(fg[...,None]>0,rgb,235).astype(np.uint8)
  Image.fromarray(neutral).crop(crop).save(args.out/f'neutral-{n:03}.png')
  # Reference comparison: exact original RGB, binary mask, alpha composite, padded reference.
  sheet=Image.new('RGB',(w*2,(h+24)*2),'#ddd');d=ImageDraw.Draw(sheet)
  views=[('original',Image.fromarray(rgb)),('mask',Image.fromarray(alpha).convert('RGB')),('isolated on neutral',Image.fromarray(neutral)),('prepared (padding)',Image.open(args.out/f'prepared-{n:03}.png'))]
  for i,(label,im) in enumerate(views):
   im.thumbnail((w,h));x=(i%2)*w;y=(i//2)*(h+24);sheet.paste(im,(x,y),im if im.mode=='RGBA' else None);d.text((x+5,y+h+3),f'{n:03} {label}',fill='black')
  sheet.save(args.out/f'comparison-{n:03}.jpg',quality=85)
  assert np.array_equal(rgba[:,:,:3],rgb),'RGB pixels must not be repainted'
  summary.append({'frame':n,'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'maskSha256':hashlib.sha256(alpha.tobytes()).hexdigest(),'bounds':BOUNDS[n],'crop':crop,'coverage':float(fg.mean()),'iteration':args.iteration})
 (args.out/'manifest.json').write_text(json.dumps(summary,indent=2))
 print(json.dumps({'frames':len(summary),'iteration':args.iteration,'out':str(args.out)}))
if __name__=='__main__':main()
