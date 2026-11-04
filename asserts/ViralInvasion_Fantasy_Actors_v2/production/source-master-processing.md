# Assigned source masters: transparency and registration QA

`source-masters` are source inputs only. The 10 entries in `sources.fragment.json` carry zero runtime frame credit. Parent acceptance and transform locking remain pending. This work writes only inside the new Actors_v2 `production/` directory.

- Canonical proposed source PNGs: `processed/masters/{id}.png`.
- Per-source black, white, combined, alpha, actual 24/32 px body-height and exact 5x nearest previews: `qa/masters/`.
- Incremental processing fragment: `sources.fragment.json`.
- Source specs: `source-processing.wave1.spec.json`, `source-processing.wave2-body.spec.json`, `source-processing.weapon.spec.json`, `source-processing.statics.spec.json`.
- Repeat an inspected spec with `node process-source-masters.mjs process <spec.json>`; inspect decoded RGBA with `node process-source-masters.mjs inspect <image>`.
- In-memory validation: `node process-source-masters.selftest.mjs` (no test image files written).

Every source was actually viewed before choosing cutout parameters. Near-white removal is edge connected; closed white voids require explicit seeds. Cream bodies, light crystal faces and teeth have preservation probes. No global white deletion is used. Initial identity registration resamples the complete source canvas uniformly and applies an explicit anchor translation; alpha bounding boxes are for clipping checks and QA only. Animation work must reuse the approved transform instead of independently fitting individual frames.

Mimic revision 2 removes the baked pale-gray material outside the left rear cloak contour using a reviewed local row contour ROI. It preserves the mint membrane flap. Beacon revision 2 explicitly opens the enclosed middle/right leaf gap and clears only the pixels below the last dark root contour in an inspected local ROI.

The spore source generator incorrectly included a complete face/body. Its reviewed polygon mask retains only the purple rear sac and short branches; body/eye clear probes pass. The elite source retains only the two horns and a narrow crown arc. `addon-registration.contact.png` shows spore behind the approved basic source and horns on its forehead. The elite group keeps logical foot `[256,435.2]` and pivot `[.5,.85]`, while its independently measured crown attachment maps to `[256,212]`.

The emitter raw source was angled down-right. The full cutout is rigidly rotated by `-23.005155125977073` degrees before uniform registration; it is never anisotropically deformed or cropped to its alpha bounds. `source.derivedSource` records the raw path/hash, source-to-derived matrix, source landmarks and alpha removal report. `transform.matrixOriginalSourceToRegistered` composes that matrix with final registration. Final grip is `[256,256]`, muzzle is `[342.6985755384527,201.25045325140576]`, and rear barrel center is `[196.7405243077269,201.25045325140576]`. Thus the barrel, independently of the grip-to-muzzle offset, points along positive X. The emitter pivot is its actual grip `[.5,.5]` rather than an invented foot anchor.

Mother uses a 1024-square logical canvas with foot `[512,870.4]`. The registered concentrated core center is `[515,429.9]`. Its 11 runtime layers/poses and breathing sequence are parent-owned production work.
