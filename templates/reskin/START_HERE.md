# START HERE: re-skin Bellmourn's weapons and shields

You (ChatGPT) are painting new textures for every weapon, staff and shield in **Bellmourn**,
a 1990s-style first-person dark-fantasy game: 52 models. This zip is a locked template pack.
Your paintings go straight back into the game through an automatic importer that reads only
what this pack's tool (`reskin_tool.py`) writes, so follow these steps exactly and in order.
Never invent file names, sizes, layouts or zip structures.

## What's in this pack

| File | What it is |
|---|---|
| `START_HERE.md` | These instructions. |
| `STYLE_LOCK.md` | The locked look for these textures: technique, palette ramps, materials, how to read the templates. **Read it fully before painting.** |
| `STYLE_GUIDE.md` | The game's general locked style guide (palette, magenta key, the never-list). |
| `bellmourn_palette.png/.json/.gpl` | The locked 256-colour palette (16 ramps x 16 shades). Use only these colours. |
| `style/material_board__paint.png` | The material board template: you paint it FIRST; it becomes the visual style lock for every model. |
| `style/velscour_sigil.png` | Lord Velscour's sigil, for the models whose notes ask for it. |
| `templates/NN__<id>__paint.png` | Per model: the 1536 x 1024 image you EDIT. Pieces of the model's surface, unfolded, on magenta. |
| `templates/NN__<id>__card.png` | Per model: the same layout, every piece numbered, the model from four sides, a key. Read it, don't paint it. |
| `templates/NN__<id>__islands.png` | Per model: a map the tool uses to check your painting. Ignore it. |
| `manifest.json` | Every job: id, name, description, notes, parts and their materials, file names. |
| `reskin_tool.py` | Files your paintings under their exact names, checks them, and zips the result. |

`NN` is the job number (01–52): the painting order. `<id>` is the model's id (`arming_sword`).

## Rules that never bend

1. One image per model, **1536 x 1024**, made by EDITING that model's `__paint.png`: every
   shape stays exactly where it is, the same size and outline; the background stays flat
   magenta `#FF00FF`.
2. Paint only inside the shapes, edge to edge, in the material each piece is listed as.
3. Every model matches the material board you painted in Step 1 and `STYLE_LOCK.md`.
4. No text, numbers, labels, borders or shadows anywhere.
5. Every painting goes into the work folder with `rt.file(...)`, never by hand; the zip is made
   only with `rt.pack(...)`. Don't rename, crop or resize anything yourself.

## Step 0: set up (Python)

Ask the user for a one-word name for this set of skins if they haven't given one (for example
`velscour`). Then run:

```python
import zipfile, sys, glob
pack = sorted(glob.glob("/mnt/data/bellmourn_reskin_weapons*.zip"))[-1]
zipfile.ZipFile(pack).extractall("/mnt/data/bellmourn_reskin")
sys.path.insert(0, "/mnt/data/bellmourn_reskin")
import reskin_tool as rt
rt.setup("velscour")        # the set's name
```

Read `STYLE_LOCK.md` and `STYLE_GUIDE.md` in full (print them). Look at the palette.

## Step 1: the material board (the style lock you paint)

```python
rt.show("material_board")
print(rt.prompt("material_board"))
```

1. With your image tool, EDIT `style/material_board__paint.png` using that prompt word for
   word, with `bellmourn_palette.png` as a reference.
2. Get the result into the sandbox (see "Getting images in and out" below), then
   `rt.file(path, "material_board")`.
3. Show the board to the user and **STOP. Wait for their approval.** Repaint it if they ask.
   Every model after this must use the same steel, iron, gold, leather, wood and light as the
   approved board.

## Step 2: the pilot (4 models), then stop

The first jobs `rt.next_job()` gives are the pilot: `arming_sword`, `ironbound`,
`knights_kite`, `gnarled_staff` (a sword, a round shield, a kite shield, a staff). Paint each
with the loop in Step 3, then:

```python
rt.pack("pilot")
```

Give the user the download link and **STOP**. The user tests the pilot in the game (with
Claude) and tells you what to change before you paint the other 48.

## Step 3: the loop, once per model

```python
jid = rt.next_job()   # prints the exact image prompt for the next model
rt.show(jid)          # displays its paint template, its card and your material board
```

1. Generate ONE image with your image tool: EDIT that model's `__paint.png` (it must be the
   image you edit, not a new picture), with its `__card.png` and the approved material board
   as references, using the printed prompt word for word.
2. Get it into the sandbox, then `rt.file(path, jid)` (or `rt.file(None, jid)` to take the
   newest image in `/mnt/data`: see "Getting images in and out").
3. Read the verdict it prints:
   - **PASS**: next model.
   - **WARN**: open the review picture it names (pieces boxed green / yellow / red). Fine
     unless a piece is clearly wrong; then repaint.
   - **FAIL**: repaint, telling the image tool what went wrong (the printed reasons, e.g.
     "keep every shape exactly where it is; the background must stay flat magenta").
     `rt.next_job()` gives the same model back for up to 3 tries, then moves on. If an
     earlier try was better than the last, file that one again; tell the user which models
     still failed.
4. After every 6 models: `rt.pack("checkpoint")` and give the user the link (the sandbox can
   be reset; a checkpoint lets you carry on, see "If the sandbox is reset").

Paint as many models per reply as your tools allow. When you have to stop, say which job is
next and how many are done (`rt.status()`).

## Step 4: finish

```python
rt.status()          # every job and its check
rt.pack("final")     # bellmourn_reskin__<set>.zip
```

Repaint any FAIL you can before packing. Give the user the download link and tell them to
hand the zip to Claude for importing. That's the whole job.

## Getting images in and out

Your Python sandbox can't always see the images your image tool makes, and your image tool
can't always open files from the sandbox. Use whichever of these works, and tell the user
early which one you need:

- **Your painting into the sandbox.** First try `rt.file(None, jid)`: it takes the newest image
  in `/mnt/data`. If your painting isn't there, ask the user to download the painted image(s)
  and upload them back into this chat (several at once is fine), then file each upload with
  `rt.file("/mnt/data/<upload>")`. Names don't matter: the tool recognises which model a
  painting is by the shape of its pieces.
- **A template into the image tool.** If your image tool can't take a file from the sandbox as
  the image to edit, `rt.show(jid)` usually puts it in front of you. If that doesn't work, ask
  the user to upload the next few models' `__paint.png` and `__card.png` from the zip's
  `templates/` folder (they're numbered in painting order, so they can drag several at once).

## Exact names (written by the tool, for reference)

| What | Name in the work folder and the zip |
|---|---|
| A painted model | `painted/NN__<id>.png` (1536 x 1024 PNG, e.g. `painted/01__arming_sword.png`) |
| The material board | `style/material_board.png` |
| The record of every check | `RESKIN.json` |
| The pilot zip | `bellmourn_reskin__<set>__pilot.zip` |
| A checkpoint zip | `bellmourn_reskin__<set>__partNN.zip` (NN = models inside) |
| The final zip | `bellmourn_reskin__<set>.zip` |

## If something goes wrong

- **The sandbox was reset** (files gone): ask the user to upload this pack and the latest
  checkpoint zip again, then run Step 0 with `rt.setup("velscour", resume=["/mnt/data/<checkpoint>.zip"])`.
  Everything filed in the checkpoint comes back.
- **The image came back square or another size:** `rt.file` resizes it; if the shapes were
  squashed or cropped it FAILs; repaint at 1536 x 1024.
- **The image tool drew a new picture** (a sword on a background, a shield scene) instead of
  painting the template: it FAILs. Repaint, saying "edit the attached image; keep every
  coloured shape exactly where it is and paint inside it".
- **The image tool won't keep the magenta:** say "the background is flat #FF00FF and must stay
  exactly that colour".
- **A model is refused or keeps failing:** skip it (`rt.status()` shows it as to-do), carry
  on, and tell the user at the end.
