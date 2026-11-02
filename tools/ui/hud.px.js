// Bellmourn's HUD art, in pxl (the pixel-art DSL): the damage numbers' digits and tag words, the
// chat log's icons, the afflictions' little marks over a wounded foe, the 9-slice frame the log and
// the windows wear, the life and mana orbs' cradles, the spell slots' frames and the log's gear.
//
//   node <pxl>/bin/pxl.js build tools/ui/hud.px.js
//   cp tools/ui/out/hud.png tools/ui/out/hud.json assets/ui/
//
// Everything lands in one sheet, assets/ui/hud.png + hud.json; hud.js cuts it up at start.
// The digits and tags are drawn in four greys and black (keys 1-4 and 0): the game paints them in
// each kind of damage's colours (fire, frost, ...) by swapping those five exact colours.

pal({
  k: "#07060a",                                   // outline
  b: "#2e1f12", B: "#5a4228", t: "#8a6a3a",       // bronze, dark to light
  g: "#c8a050", G: "#f0d890", w: "#fff6d8",       // gold, pale gold, glint
  s: "#34303a", S: "#6a6470", L: "#c8c0b8",       // bone and iron greys
  P: "#a88a58", p: "#e8d4a0",                     // parchment
  r: "#5a0a10", R: "#c01828", o: "#ff6a3a", y: "#ffd04a",   // blood, flame
  c: "#1a3a6a", C: "#4a8ae0", i: "#d8f4ff",       // frost
  v: "#4a2a9a", V: "#b090ff",                     // lightning
  e: "#1e4a10", E: "#6ac028", n: "#d8ff90",       // poison
  // the font's tones, swapped for each damage kind's colours in the game
  "1": "#ffffff", "2": "#c0c0c0", "3": "#808080", "4": "#404040", "0": "#000000",
})
ramps("kbBtgGw", "rRoy", "cCi", "vV", "eEn", "sSL", "PpG")

// ------------------------------------------------------------------ damage digits (7x10, chunky)
// drawn in tone 3, then lit from above: two rows of 1, three of 2, three of 3, two of 4
const DIGITS = {
  0: `.33333.\n3333333\n333.333\n33...33\n33...33\n33...33\n33...33\n333.333\n3333333\n.33333.`,
  1: `..333..\n.3333..\n33333..\n..333..\n..333..\n..333..\n..333..\n..333..\n3333333\n3333333`,
  2: `.33333.\n3333333\n33...33\n.....33\n....333\n..3333.\n.333...\n333....\n3333333\n3333333`,
  3: `333333.\n3333333\n.....33\n.....33\n.33333.\n.333333\n.....33\n33...33\n3333333\n.33333.`,
  4: `....333\n...3333\n..33.33\n.33..33\n33...33\n3333333\n3333333\n.....33\n.....33\n.....33`,
  5: `3333333\n3333333\n33.....\n333333.\n3333333\n.....33\n.....33\n33...33\n3333333\n.33333.`,
  6: `.33333.\n3333333\n33.....\n333333.\n3333333\n33...33\n33...33\n33...33\n3333333\n.33333.`,
  7: `3333333\n3333333\n.....33\n....333\n...333.\n..333..\n..33...\n..33...\n..33...\n..33...`,
  8: `.33333.\n3333333\n33...33\n33...33\n.33333.\n3333333\n33...33\n33...33\n3333333\n.33333.`,
  9: `.33333.\n3333333\n33...33\n33...33\n3333333\n.333333\n.....33\n.....33\n3333333\n.33333.`,
  plus: `.......\n.......\n..333..\n..333..\n3333333\n3333333\n3333333\n..333..\n..333..\n.......`,
  minus: `.......\n.......\n.......\n.......\n3333333\n3333333\n3333333\n.......\n.......\n.......`,
  bang: `..333..\n..333..\n..333..\n..333..\n..333..\n...3...\n.......\n..333..\n..333..\n.......`,
}
const litDigit = [recolor({ 3: "1" }, [0, 0, 7, 2]), recolor({ 3: "2" }, [0, 2, 7, 3]), recolor({ 3: "4" }, [0, 8, 7, 2])]
for (const [k, g] of Object.entries(DIGITS)) sprite("d_" + k, { w: 7, h: 10, outline: "0" }, g, ...litDigit)

// ------------------------------------------------------------------ tag words (the 3x5 font)
// what a blow did beyond its number: an affliction taking hold, a limb off, a blow turned
const TAGS = ["BURNING", "FROZEN", "CHILLED", "POISONED", "SHOCKED", "SEVERED", "BEHEADED", "CUT IN TWO",
  "BLOCKED", "PARRIED", "RIPOSTE", "SLAIN", "CRUSHING", "CRITICAL", "IMMUNE", "LEVEL UP"]
for (const word of TAGS) {
  const w = word.length * 4 - 1
  sprite("tag_" + word.toLowerCase().replace(/ /g, "_"), { w, h: 5, outline: "0" },
    text(0, 0, word, "3"), recolor({ 3: "1" }, [0, 0, w, 2]), recolor({ 3: "2" }, [0, 2, w, 1]), recolor({ 3: "4" }, [0, 4, w, 1]))
}

// ------------------------------------------------------------------ the chat log's icons (9x9)
const icon = (name, rows, y = 0) => sprite("ic_" + name, { w: 9, h: 9, outline: "k" }, grid(0, y, rows))
icon("talk", `
.PPPPPPP.
PpppppppP
PpkpkpkpP
PpppppppP
.PPpPPPP.
..Pp.....
..P......`, 1)
icon("quest", `
...yyy...
...yGy...
...yGy...
...yGy...
...yGy...
....y....
.........
...yyy...
...yGy...`)
icon("qitem", `
....w....
....G....
....G....
...GwG...
wGGwwwGGw
...GwG...
....G....
....G....
....w....`)
icon("loot", `
...bbb...
....B....
...BtB...
..BtgtB..
.BtgGgtB.
.BttgttB.
.BtttttB.
..BBBBB..`, 1)
sprite("ic_gold", { w: 9, h: 9, outline: "k" }, circ(4, 4, 4, "g"), circ(4, 4, 3, "G"), circ(4, 4, 2, "g"), px(3, 3, "w"), px(4, 3, "G"), px(3, 4, "G"),
  shade((x, y) => x + y > 10, 1))
icon("xp", `
....G....
....G....
...GwG...
GGGGwGGGG
.GGwwwGG.
..GwwwG..
..GG.GG..
.GG...GG.
.G.....G.`)
icon("level", `
....w....
...wGw...
..wGGGw..
.wGGGGGw.
wwwGGGwww
...GGG...
...GgG...
...ggg...
...ggg...`)
icon("hit", `
........w
.......wL
......wL.
.....wL..
.g..wL...
..gwL....
...g.....
..b.g....
.b.......`)
icon("hurt", `
....R....
....R....
...RoR...
..RRoRR..
.RRoRRRr.
.RRoRRRr.
.RRRRRrr.
..RRrrr..
...rrr...`)
icon("kill", `
..LLLLL..
.LLLLLLL.
LLLLLLLLL
LkkLLLkkL
LkkLLLkkL
.LLLkLLL.
..LLLLL..
..LsLsL..`, 1)
icon("bell", `
....b....
...tgt...
..tgGgt..
..tgGgt..
.tgGGggt.
.tgGGggt.
tgggggggt
.ttttttt.
....b....`)
icon("ail", `
....R....
...Ro....
...Roo.R.
..RoyoRo.
.RoyyyoR.
.RoywyoR.
.RoywwoR.
..RoyyR..
...RRR...`)
icon("shield", `
.ttttttt.
tgGGGGGgt
tgGgggggt
tgggRgggt
tgggRgggt
.tggRggt.
.tgggggt.
..tgggt..
...ttt...`)
icon("death", `
..sssss..
.sSSSSSs.
.sSSLSSs.
.sSLLLSs.
.sSSLSSs.
.sSSLSSs.
.sSSSSSs.
eesssssee
EEEEEEEEE`)
icon("portal", `
..CCCCC..
.CiiiiiC.
CiCCCCCiC
CiC...CiC
CiC.i.CiC
CiC...CiC
CiCCCCCiC
.CiiiiiC.
..CCCCC..`)
icon("potion", `
...LLL...
...sLs...
...sLs...
..sRRRs..
.sRoRRRs.
.sRRRRRs.
.sRRRRrs.
..srrrs..`, 1)
icon("gem", `
..ccccc..
.cCiCiCc.
cCCiCCCCc
.cCCCCCc.
..cCCCc..
...cCc...
....c....`, 1)

// ------------------------------------------------------------------ afflictions (7x7), over a foe's life bar
const mark = (name, rows) => sprite("af_" + name, { w: 7, h: 7, outline: "k" }, rows)
mark("burn", `
...R...
..Ro...
..RoR..
.RoyoR.
.RoyyR.
RoywyoR
.RoooR.`)
mark("frozen", `
...i...
.i.C.i.
..CiC..
iCiiiCi
..CiC..
.i.C.i.
...i...`)
sprite("af_chill", { base: "af_frozen", swap: { i: "C", C: "c" } })
mark("poison", `
...E...
..EnE..
..EnE..
.EnnnE.
.EnwnE.
.EnnnE.
..eee..`)
mark("shock", `
....V..
...Vw..
..Vw...
.VwwwV.
...wV..
..wV...
..V....`)
mark("champ", `
.LLLLL.
LLLLLLL
LkkLkkL
LkkLkkL
.LLkLL.
.LsLsL.`)

// ------------------------------------------------------------------ the frame (9-slice: 24x24, corners 9)
// a bronze band lit along its middle, a riveted plate in each corner with a garnet. Written as the
// top-left quarter; the rest is mirrored. Columns and rows 9-14 are band only, so they repeat clean.
sprite("frame", { w: 24, h: 24, mx: true, my: true },
  (c) => {
    const band = ["k", "B", "g", "G", "t", "k"]
    band.forEach((col, i) => { c.hline(0, i, 12, col); c.vline(i, 0, 12, col) })
    // where the bands cross inside the plate's reach, the plate covers it
    c.rect(0, 0, 9, 9, "k"); c.rect(1, 1, 7, 7, "t")
    c.hline(1, 1, 7, "G"); c.vline(1, 1, 7, "G"); c.hline(2, 2, 5, "g"); c.vline(2, 2, 5, "g")
    c.hline(1, 7, 7, "b"); c.vline(7, 1, 7, "b")
    // the garnet: a diamond, lit at its top-left
    c.px(4, 2, "r"); c.px(3, 3, "r"); c.px(4, 3, "R"); c.px(5, 3, "r"); c.px(2, 4, "r"); c.px(3, 4, "o"); c.px(4, 4, "R"); c.px(5, 4, "R"); c.px(6, 4, "r")
    c.px(3, 5, "r"); c.px(4, 5, "R"); c.px(5, 5, "r"); c.px(4, 6, "r"); c.px(3, 3, "o")
  })

// ------------------------------------------------------------------ the orbs' cradle (61x78)
// a bronze ring lit from the top-left, eight rivets, three spikes on top round a gem (garnet for
// life, sapphire for mana) and a skull clasping the bottom. The liquid is drawn behind it in the
// game, a circle of radius 22 about (30, 40).
const OX = 30, OY = 40
sprite("_skull", { w: 11, h: 9, outline: "k" }, `
...LLLLL...
..LLLLLLL..
.LLLLLLLLL.
.LkkkLkkkL.
.LkkkLkkkL.
.LLLLkLLLL.
..LLkkkLL..
..LLLLLLL..
...LsLsL...`, shade((x, y) => x > 6 && y > 2, 1))
sprite("orb_life", { w: 61, h: 78 },
  (c) => {
    const d = (x, y) => Math.hypot(x - OX, y - OY)
    // three thorns on top (the ring covers their feet), the middle one tallest
    c.poly([OX - 5, 16, OX, 0, OX + 5, 16], "k"); c.poly([OX - 3, 15, OX, 3, OX + 3, 15], "g"); c.line(OX - 1, 6, OX - 1, 13, "G")
    for (const s of [-1, 1]) {
      const bx = OX + s * 12
      c.poly([bx - 4, 18, bx + s * 4, 3, bx + 4, 18], "k")
      c.poly([bx - 2, 17, bx + s * 4, 6, bx + 2, 17], "t")
    }
    c.circ(OX, OY, 30, "k")
    c.circ(OX, OY, 29, "B")
    c.ring(OX, OY, 27, "t")
    c.ring(OX, OY, 25, "b")
    c.circ(OX, OY, 24, "k")
    c.circ(OX, OY, 23, "g")
    // lit from the top-left, shadowed to the bottom-right (the ring only)
    c.light((x, y) => d(x, y) > 23.5 && d(x, y) < 29.5 && (x - OX) + (y - OY) < -14, 1)
    c.shade((x, y) => d(x, y) > 23.5 && d(x, y) < 29.5 && (x - OX) + (y - OY) > 16, 1)
    c.circ(OX, OY, 22, "_")
    // rivets round the band
    for (let a = 0; a < 8; a++) {
      const A = (a + 0.5) * Math.PI / 4, x = Math.round(OX + Math.cos(A) * 27), y = Math.round(OY + Math.sin(A) * 27)
      c.px(x, y, "G"); c.px(x + 1, y + 1, "b"); c.px(x + 1, y, "g"); c.px(x, y + 1, "g")
    }
    // the gem set in the band under the middle thorn
    const gy = OY - 27
    c.circ(OX, gy, 3, "k"); c.circ(OX, gy, 2, "r"); c.px(OX, gy, "R"); c.px(OX + 1, gy, "R"); c.px(OX - 1, gy - 1, "o"); c.px(OX, gy - 1, "R"); c.px(OX + 1, gy + 1, "r")
  },
  stamp("_skull", OX - 6, 66))
sprite("orb_mana", { base: "orb_life", swap: { r: "c", R: "C", o: "i" } })

// ------------------------------------------------------------------ a spell slot (32x32, opening 24x24)
sprite("slot", { w: 32, h: 32 },
  rect(0, 0, 32, 32, "k"), rect(1, 1, 30, 30, "B"),
  hline(1, 1, 30, "G"), vline(1, 1, 30, "G"), hline(2, 2, 28, "g"), vline(2, 2, 28, "g"),
  hline(1, 30, 30, "b"), vline(30, 1, 30, "b"), hline(2, 29, 28, "t"), vline(29, 2, 28, "t"),
  rect(3, 3, 26, 26, "k"), rect(4, 4, 24, 24, "_"),
  (c) => { for (const [x, y] of [[2, 2], [28, 2], [2, 28], [28, 28]]) { c.rect(x, y, 2, 2, "g"); c.px(x, y, "w") } })

// ------------------------------------------------------------------ the log's gear, and its resize grip
sprite("gear", { w: 11, h: 11, outline: "k" }, `
....ggg....
.gg.gGg.gg.
.gGgGGGgGg.
..gGGbGGg..
gggGb.bGggg
gGGb...bGGg
gggGb.bGggg
..gGGbGGg..
.gGgGGGgGg.
.gg.ggg.gg.
....ggg....`, shade((x, y) => x + y > 12, 1))
sprite("gear_hot", { base: "gear", swap: { g: "G", G: "w", b: "t" } })
sprite("grip", { w: 7, h: 7 }, `
G.G.G.G
.......
G.G.G..
.......
G.G....
.......
G......`)

sheet("hud", ["d_*", "tag_*", "ic_*", "af_*", "frame", "orb_*", "slot", "gear*", "grip"], { pad: 1 })
