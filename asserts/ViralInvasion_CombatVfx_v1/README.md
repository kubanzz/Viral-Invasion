# Combat VFX · native Effekseer bake v1

This pack contains seven reusable short effects and 92 selected transparent frames.
The effects are authored as native Effekseer node recipes. Their texture masks are
original SVG brush, flash, membrane, and lightning primitives made for this game.
No sample artwork or AI-generated animation is represented as Effekseer output.

`source/*.efkproj` uses the supported 1.43 XML serialization so the current tool
performs its legacy color migration. The actual official **Effekseer 1.80.8** tool
loads these sources and saves modern `source/*.efkefc` projects. The latter are the
files that the native runtime bakes and that the desktop editor opens.

Production frames were rendered by the official **EffekseerForWebGL 1.80.8 WASM
runtime**, at a fixed seed of 58261, with deterministic 60 Hz simulation and a
sample every two simulation frames. This is a production-only dependency; the
game receives PNG frames through its existing Phaser atlas pipeline.

The separate `qa/hit-heavy-editor-recorder.png` is a real desktop editor Recorder
export of the same source project: 256×256 cells, frames 1–36, frequency 2, six
columns, Generate Alpha, and the editor's 2D orthographic view. It is independent
proof, not the source of all seven production sequences. Its framing and random
stream differ from the production bake.

## Reproduce

1. Keep the official portable tool under
   `artifacts/tools/effekseer-1.80.8/Effekseer1.80.8Win/` and official WebGL files
   under `artifacts/tools/effekseer-web-1.80.8/`. Archive URLs and SHA-256 are in
   `delivery.json` and `production/web-runtime-provenance.json`.
2. `node scripts/build-combat-vfx-assets.mjs prepare` writes the native sources
   and original texture masks and uses the real tool's supported `-cui -in -o`
   project-save path. It does **not** claim CLI Recorder support.
3. `node scripts/combat-vfx-web-bake.mjs` loads those actual projects in the
   official WASM runtime and captures 18 native samples per group. It records the
   seed, camera, source hashes, and method in `production/recording-receipts.json`.
4. `node scripts/build-combat-vfx-assets.mjs ingest` removes only leading/trailing
   empty frames, applies one common affine registration to every frame in a
   sequence, and updates the selected PNG entries and the runtime catalog.
5. `node scripts/art-sync.mjs` produces the game's embedded PNG atlases. VFX
   groups each fit into one compact atlas page; no page is padded to 2048².

Inspect new native output before ingesting it. The ingestion rejects clipped
border pixels, fully transparent interior frames, missing native receipts, or
unexpected dimensions. Source originals and complete recordings remain intact.

## Playback contract

Use `runtime-catalog.json` for group-to-frame IDs, FPS, duration, default world
size, blend, and contact pivot. The selected assets expose matching `animation`
and `vfx` metadata. Prefer the final atlas asset's `pivot` for exact pixel
registration; integer atlas padding can differ slightly from the logical pivot.

All groups use additive blending. A native black-frame additive render is
factored into straight RGB and max-channel soft alpha, preserving its additive
RGB contribution against the game's ground. This technical alpha conversion
does not create, interpolate, or paint animation frames. Render the texture with
ADD; do not treat it as an opaque sprite with a dark matte.

`startOffsetSeconds` records the removed prefix relative to the recording's
first frame. The source recording itself starts at simulation frame 1. Normal
hit feedback should play the first visible frame immediately on its accepted
cue; this provenance offset does not require delaying the game's hit response.

| Group | Selected frames | FPS | Duration |
| --- | ---: | ---: | ---: |
| hit-light | 9 | 30 | 0.30 s |
| hit-heavy | 13 | 30 | 0.433 s |
| kill | 17 | 30 | 0.567 s |
| cleanse | 17 | 30 | 0.567 s |
| slash | 9 | 30 | 0.30 s |
| thunder-pillar | 12 | 30 | 0.40 s |
| ground-ring | 15 | 30 | 0.50 s |

The full slash sequence is an optional presentation layer. Moving sword traces
and wall clipping remain owned by the native Phaser path renderer. This sequence
must not visually reconnect a path that gameplay collision has stopped.

The art-runtime budget is now 32 MiB as selected for this overhaul. The measured
new atlas pages add about 16.74 MiB of decoded RGBA texture data, with about
0.99 MiB of compressed PNG data. Neither number is a claim about physical phone
performance; actual dense combat and device checks remain separate.
