"""Run unchanged official intake diagnostically; numeric admission is not visual approval."""
import argparse,json,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--skill',type=Path,required=True);p.add_argument('--prepared',type=Path,required=True);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
results=[]
for iteration in [1,2,3]:
 for frame in [18,28,35,46,53,70,76,121]:
  image=args.prepared/f'iteration-{iteration}'/f'prepared-{frame:03}.png'
  result=subprocess.run([sys.executable,str(args.skill/'forge/stage1_intake/check_reference_admission.py'),str(image),'--viewpoint','dashboard','--json'],capture_output=True,text=True)
  if result.returncode not in [0,1]:raise RuntimeError(result.stderr or result.stdout)
  verdict=json.loads(result.stdout)
  results.append({'iteration':iteration,'frame':frame,'exitCode':result.returncode,'admitted':verdict['admitted'],'reasons':verdict['reasons'],'provenance':verdict['provenance']})
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(results,indent=2))
for iteration in [1,2,3]:
 rows=[r for r in results if r['iteration']==iteration]
 print(f"Iteration {iteration}: official numeric intake {sum(r['admitted'] for r in rows)}/8 admitted; visual approval remains a separate required gate")
