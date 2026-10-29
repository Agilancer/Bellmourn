# Bellmourn world kit (reworked Quaternius packs)

These are the game's world models, built by `tools/kit` (see its README) from six Quaternius
packs. Every model has been reshaped and repainted for Bellmourn.

**Do not extract or redistribute these files as an asset pack.** They are derived from licensed
packs and exist only as this game's world models.

| File | What it is |
|---|---|
| `<pack>.glb` | One bundle per pack, for `props`, `village`, `nature`, `trees`, `ultimate`, `dungeon`, and `bellmourn` (the recombined pieces). Each model is a node named `pack/Model`, with variants named `~ruin`, `~holed`, `~broken` or `~bare`, and low-detail copies named `~lod`. Materials are named after their atlas; no images are inside. |
| `kit.json` | Per model: pack, source model, variant, category, bounds (three.js Y-up metres), triangle count, atlases, tags, flame points, LOD, and the list of what was done to it (`rework`). |
| `tex/` | The repainted atlases and their colour variants (`<atlas>@<variant>.png`). Also the palette swatch atlas, the grime and wear maps, the terrain tiles (`ground_*.png`), and `textures.json`. |
| `catalog/` | Contact sheets of every bundle. |
| `preview/` | In-game shots of each area. |
