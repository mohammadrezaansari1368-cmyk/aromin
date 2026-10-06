# C4 Three.js reference intake experiment

**Status: BLOCKED_BY_REFERENCE_INTAKE.** Numeric admission passes on the derived alpha images, but required visual preparation acceptance fails. No geometry was generated; the reconstruction/model quality gate was not evaluated. The verified WebP C4 and all production images remain unchanged. No merge/deploy.

## Installed skill and exact original failure

The documented Codex symlink `/home/agent/.codex/skills/img2threejs` resolves to `/workspace/tools/img2threejs`, pinned at `fe2d0d2d1263cd8203f486bf6f4526110da42f9c`. CLI execution verified; its 23 workflow-state tests passed during installation.

The official `extract_pbr_evidence.py:build_foreground_mask` opaque-input fallback includes any pixel with saturation >0.16 and luma <0.94, independently of corner-background distance. The dark purple cinematic backdrop, vignette, floor reflection and glow satisfy this rule: original foreground coverage was 0.9993–0.9998, above the unchanged admission ceiling 0.97. This is a segmentation limitation, not evidence that the engine itself is unusable.

Inspected source frames: 018, 028, 035, 046, 053, 070, 076, 121. All 104 source frames contribute temporal variance evidence. Their shared camera helps locate moving structured pixels; temporal evidence alone cannot identify static engine regions and is not treated as an exact matte.

## Three preparation attempts

All attempts operate on decoded original RGB, edit alpha only, crop with 20px padding, and export transparent PNG plus a neutral-background counterpart. Original source coordinates are retained in the manifests. No generator, redrawing, texture synthesis or hidden-geometry inference is used. Loose observed boxes constrain the search, not the final silhouette.

1. Deterministic GrabCut with observed object bounds. **Visual reject:** missing dark rear rotor, attached floor/orbit contamination at 121.
2. Add multi-frame variance/local-contrast seeds, observed rear-metal seeds, and observed floor exclusion at 121. **Visual reject:** incomplete rear contour and residual light specks.
3. Add actual Canny-edge seeds at rear fin regions and retain the connected main assembly to remove detached glow specks. **Visual reject:** frame 070 still loses dark lower rotor teeth (see the enlarged original-versus-result evidence). Connected filtering also cannot certify whether every faint detached pixel was decorative light rather than thin hardware.

The unchanged official intake was rerun **diagnostically** on each derived reference: **8/8 numeric admissions in each attempt** (24 results in `intake-results.json`). These numeric results do not authorize reconstruction: the user's pre-intake visual gate explicitly rejects cut-off engine parts. The terminal status is blocked by reference preparation, not an assertion that the official numeric checker rejected the prepared PNGs. No prepared mask is represented as ground truth. There is no fourth preparation attempt; the extra run is a byte-for-byte reproducibility check of attempt 3.

## Reproduce without changing production files

```bash
python -m venv /workspace/c4-reference-venv
/workspace/c4-reference-venv/bin/pip install -r tools/c4-reference/requirements.txt
for iteration in 1 2 3; do
  /workspace/c4-reference-venv/bin/python tools/c4-reference/prepare.py \
    --source frontend/public/assets/engine-assembly \
    --out /workspace/scratch/c4-reference/iteration-$iteration --iteration "$iteration"
done
/workspace/c4-reference-venv/bin/python tools/c4-reference/check_intake.py \
  --skill /workspace/tools/img2threejs --prepared /workspace/scratch/c4-reference \
  --out /workspace/scratch/c4-reference/intake-results.json
```

The pinned isolated dependencies are preparation tooling only; application dependencies are untouched. GrabCut uses a fixed seed and one thread. Each output directory contains original/mask/isolated/prepared comparison sheets for all eight frames. Production-public output paths are refused. Only scripts, metadata and two small review images are committed; temporary PNGs, masks and the original ZIP are omitted.

## What resolves the remaining blocker

Prefer engine-only transparent PNG renders with an **original renderer alpha/object-ID matte**, especially for exploded 018, rear-separated 070 and assembled 121. Clean neutral-background renders without the lower orbit/floor reflection are another option. An original GLB/GLTF/3D model can provide trustworthy silhouettes and clean viewpoints. Merely changing background brightness does not recover already lost dark teeth or establish which faint arcs are geometry.

## Verification

Preparation RGB preservation and crop/alpha integrity are checked against the original frames. Attempt 3 is rerun independently to verify deterministic masks. SHA-256 checks compare all 104 WebPs with the verified branch. Official skill files and thresholds are unchanged. No application code changed, so frontend builds/FPS/model polygon counts are not applicable to this reference-only experiment.
