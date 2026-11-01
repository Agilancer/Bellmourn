# Weapon & shield re-skin pack (for ChatGPT)

Everything ChatGPT needs to repaint every weapon, staff and shield in the game, and the
importer that puts its paintings back. 52 models: 17 one-handed, 15 two-handed, 10 staffs,
5 round and 5 kite shields. That's every model the player, loot, uniques, the dread knights and
the Sworn use (wands are out of the game, so they're not in it).

## Hand it to ChatGPT

1. Attach `templates/packs/bellmourn_reskin_weapons.zip` to a ChatGPT chat (one with images
   and Python, i.e. any current model with tools on).
2. Paste:

   > Attached is bellmourn_reskin_weapons.zip, a locked template pack for re-skinning every
   > weapon and shield in my game Bellmourn. Unzip it with Python, read START_HERE.md and
   > STYLE_LOCK.md in full, and follow START_HERE.md exactly, step by step. Call this set
   > "velscour". Do Step 0 and Step 1 (the material board), then stop and show me the board.

3. Approve the material board (it's the style lock every model copies), then let it paint
   the 4-model pilot. It hands you `bellmourn_reskin__velscour__pilot.zip`: bring that to
   Claude to import and check in the game before ChatGPT paints the other 48.
4. Every 6 models it gives you a checkpoint zip (keep the latest: if ChatGPT's sandbox resets,
   it resumes from it). At the end: `bellmourn_reskin__velscour.zip`.

If ChatGPT can't move images between its image tool and Python, START_HERE.md tells it to ask
you to drag them in and out. If it all goes sideways you can also just download its painted
images (any names), zip them and import that: the importer recognises each model by the shape
of its pieces.

## Import

```
python tools/models/import_reskin.py bellmourn_reskin__velscour.zip
python tools/models/import_reskin.py X.zip --dry-run       # skins + review sheets only
python tools/models/import_reskin.py pilot.zip part12.zip  # several: later ones win
```

Per model it lines the painting up with its template (ChatGPT shifts, rescales and drifts
pieces; it's corrected per piece), carries every piece back onto the model's UVs, snaps to the
locked palette, writes `<id>_texture.png` and embeds it in the `.glb` (512 x 512), remakes the
six rarity finishes from the new skin (worn, bright, gilded, ancient bronze, bloodforged,
frostbound: what `src/fps/gear.js` shows for Common to Mythic), and rewrites
`templates/models/manifest.json`. Staffs and shields gain finishes they didn't have. A review
sheet per model (the painting, the skin, the model in every finish) goes to
`templates/reskin/imports/<set>/`.

Round shields: the models unroll a dished front or boss ring by ring into a strip only 4
texels tall, which turns planks, stripes and hammering into a mosaic. The importer gives each
one a flat disc in the atlas's free space instead (as large as fits: 200-290 px across in the
512 skin) and moves the `.glb`'s UVs onto it, so the painted disc goes on as painted. The
placement comes from the pack's data alone, so it is the same every import, and a second
import finds the discs where the first one put them.

Bloodforged and frostbound keep gold, brass and bronze as the accent on the recoloured parts.
A model that is mostly one noble part (the sun shield's bronze board, the crosier's gold
shaft) has that part recoloured instead, so its Epic and Mythic finishes still show.

## The templates

Each model's UV islands are laid out on a 1536 x 1024 canvas (the largest size ChatGPT
paints) by `tools/models/reskin_pack.py`, not as the UV atlas has them:

- weapons and staffs lie tip-right, shields stand upright, every face reads the right way
  round from outside (so a sigil comes out unmirrored);
- a round shield's dished front (unrolled ring by ring in its UVs) is drawn as the disc an
  enemy sees, and mapped back triangle by triangle;
- small pieces are enlarged and every piece has a magenta gutter, so shifted paintings still
  land.

| File (in the zip) | What |
|---|---|
| `START_HERE.md` | ChatGPT's step-by-step instructions |
| `STYLE_LOCK.md` | the locked look for these textures (technique, palette ramps, the 21 materials) |
| `style/material_board__paint.png` | the material board ChatGPT paints first: the visual style lock |
| `templates/NN__<id>__paint.png` | per model: the canvas ChatGPT edits |
| `templates/NN__<id>__card.png` | per model: pieces numbered, the model from 4 sides, the key |
| `templates/NN__<id>__islands.png` | per model: piece map for the checks |
| `manifest.json` | every job: parts, materials, notes, each piece's move onto the canvas |
| `reskin_tool.py` | ChatGPT runs it: files, checks and zips the paintings under the exact names |

What comes back: `painted/NN__<id>.png`, `style/material_board.png`, `RESKIN.json`.

`templates/reskin/pack/` is the importer's copy of the pack's data (manifest, templates,
island and layout maps). Rebuild both it and the zip with:

```
python tools/models/reskin_pack.py
python tools/models/reskin_pack.py --preview arming_sword ironbound   # look at a few
```

Per-model design notes (e.g. Velscour's sigil on the Knight's Kite) are `NOTES` in
`reskin_pack.py`; materials come from each part's colour in `tools/models/kit.py`.
