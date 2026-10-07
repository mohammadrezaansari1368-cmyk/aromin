# C4 reference recovery — 2026-10-07

Status: **BLOCKED_BY_REFERENCE_INTAKE**. Work continues from fb516fa on
`feature/c4-threejs-engine`; the production WebP C4 remains unchanged.

## Verified tools

Exact repository revisions and model SHA256 hashes are in `provenance.json`.
img2threejs and media2threejs were already installed and inspected. The latter's
104-reference manifest routes to image-object, but neither reconstruction pipeline
was advanced past reference admission. remove-background and OpenGHz/rembg-bg-removal
were inspected and installed; OpenGHz's wrapper produced a transparent PNG of 070
with U²-Net. SAM2 was installed from facebookresearch/sam2 (Apache-2.0), with the
official SAM 2.1 hiera-small checkpoint, torch 2.5.1 CPU and torchvision 0.20.1.
Ultralytics was not needed: the official SAM2 API provides box, point and video
predictors directly. Heavy dependencies/models live outside the frontend.

## Benchmark and visual gate

The previous GrabCut result is retained, not rerun. Five rembg configurations
were evaluated on 018/028/035/046/053/070/076/121 (40 outputs): U²-Net, IS-Net,
IS-Net alpha matting, IS-Net on brightness ×2.2 with alpha applied to original RGB,
and BiRefNet-general-lite. The lite model is explicitly not the full BiRefNet.
Temporal edge recurrence/median evidence used all 104 originals, producing eight
anchor masks and eight conservative hybrid masks. Temporal evidence alone is not
material identity or a 104-frame segmentation pass.

| Method | Frame 070 visual finding | Gate |
|---|---|---|
| Existing GrabCut | Lower rotor geometry clipped | FAIL |
| U²-Net | Retains more rotor, but halo and light arc remain | FAIL |
| IS-Net | Rear rotor becomes partly transparent | FAIL |
| IS-Net bright | Similar transparency/halo around rear rotor | FAIL |
| IS-Net matting | Ragged, blocky alpha damages rotor | FAIL |
| BiRefNet lite | Solid rotor retained, but merged background skirt and detached light patch | FAIL |
| Temporal | Coarse/jagged edges and retained orbit light | FAIL |
| Conservative hybrid | Retains geometry plus background/light halo | FAIL |
| SAM2 1: engine box + positive/negative points | Better silhouette; rear lower light arc and fragments retained | FAIL |
| SAM2 2: extra rotor positives/background negatives | Attached light arc at upper-right, lower contour still unreliable | FAIL |
| SAM2 3: separate rotor query unioned with engine | Does not resolve arc contamination or lower tooth separation | FAIL |

See `rotor-benchmark.jpg` and `sam2-rotor.jpg` at enlarged scale. These are visual
reviews, not ground-truth IoU measurements. Confidence scores are recorded only as
model diagnostics, never as visual gate passes. Source RGB is unchanged; there is
no generated fill. Third-run mask union initially hit a float/bool type error;
using logical_or fixed it and the complete experiment then ran successfully.

The required three meaningful SAM2 prompt refinements are exhausted. Frame 070
has NOT passed. Per the user's hard gate, SAM2 propagation across 104 frames and
SAM2 temporal hybrids are **NOT RUN**. Existing temporal evidence covers 104 input
frames, but is not claimed as a successful segmentation of them. New img2threejs
intake, procedural geometry, 7 groups and Three.js integration are **NOT RUN**.
The previous numeric GrabCut intake passes remain historical, visually rejected.

## Validation and outcome

- All 104 WebPs byte-identical to verified commit 00bb746cf243f458ffda4caf308c7df1b47e5a81.
- All 40 rembg and all three SAM2 RGBA outputs retain source RGB exactly.
- `npm run build`: PASS (TypeScript and both Vite builds).
- `npm run lint`: PASS with existing warnings.
- `npx vitest run`: 79 PASS, 1 SKIP, 12 files.
- Existing browser engine test: PASS; 0/50/85/100, gap-stop, two bounded loops,
  final hold/reset, pause/visibility, reduced motion, zero API writes.
- Browser initially failed because Vite was stopped; restarted on 5183 and reran successfully.
- Existing browser suite widths: 320/390/768/1440. Additional run at 320/375/768/1024/1440: PASS.
- Three.js FPS/triangles/draw calls/materials: NOT APPLICABLE, no model created.
- Production bundle/dependency/source change: none. No production assets added.
- Winner: existing WebP by retention; no completed Three.js exists for comparison.
- No merge, deployment or main modification.

## Reproduce SAM2 probes

Use a dedicated environment, install torch==2.5.1 and torchvision==0.20.1 from
https://download.pytorch.org/whl/cpu, then install the pinned SAM2 checkout with
`SAM2_BUILD_CUDA=0 pip install --no-build-isolation -e /path/to/sam2`.
Download `sam2.1_hiera_small.pt` from the official README URL and verify its SHA256
against provenance.json. Run from outside the SAM2 checkout:

```sh
python tools/c4-reference/sam2_probe.py \
  --source frontend/public/assets/engine-assembly/frame-070.webp \
  --checkpoint /path/to/sam2.1_hiera_small.pt \
  --out /tmp/c4-sam2-1 --iteration 1
```

Repeat with iterations 2 and 3 and separate output paths. `benchmark.py` and
`temporal_benchmark.py` capture the earlier isolated experiments. Model weights,
104-frame scratch data and full comparison sheets are intentionally not committed.
