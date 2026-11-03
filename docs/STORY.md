# Bellmourn: the story bible

This file says who everyone in Bellmourn is, what they know and how they sound. Several writers
rewrite every line of the game from it in parallel, story critics judge the result against it, and
each character's synthetic voice is designed from its VOICE paragraphs. The whole point is
consistency, so where this file decides something, that decision is canon, even where an old line in
the code says otherwise. The old lines count for facts only, never for style; §10 lists where they
disagree with each other and what was chosen.

**Status:** first draft (November 2026), written for a planned rewrite of all the game's dialogue,
and not yet reviewed. The game's current lines don't follow it yet: so far only the crater scene is
recorded, with the voices for its seven speakers designed from §5's VOICE paragraphs. How spoken
lines are recorded and added: [VOICES.md](VOICES.md).

1. Premise and tone · 2. Writing rules · 3. World and lore · 4. Quests · 5. Cast · 6. Enemies ·
7. Who talks to whom · 8. The opening walk · 9. Coming: Orrin the Bellwright · 10. Canon decisions

---

## 1. Premise and tone

**The game.** Bellmourn is a first-person dark-fantasy RPG in the line of Heretic, Hexen, Daggerfall
and Diablo II. A poor village sits in a forest clearing, under a cathedral built over something that
should never be rung. You play with sword, shield and staff. You go down the stair behind the pulpit
into the crypts, out east across the Green Downs to the caves in the cliff, and west along the Vigil
Road to a black keep.

**The conflict.** Lord Velscour, the Demon Lord, rules from a far throne that nobody in Bellmourn has
ever seen. His Sworn hold Blackvigil Keep at the end of the Vigil Road. They used to be the Vigil, a
holy order, and turned to him thirty years ago. Six of them are quartered in the village's own
barracks. They take the tithe, and they hang anyone who speaks the name *Tessariel*: the Sacred Flame
whom scripture promises will come down and end Velscour. Since last winter the cathedral's bell has
rung wrong, thirteen strokes at midnight with no hand on the rope, and the dead have come up: out of
the graveyard, out of the Undercroft beneath the nave, out of the barrows and cellars of the Darkwood.

**The player.** A man fell out of the sunset in a green star. He came down curled like a child, in
black smallclothes, exactly as the Canticle says, and landed on one of the Sworn. He climbed out of
the crater with no name, no memory and no words. **He never speaks.** The town has decided who he is.
To Bellmourn he is Tessariel come down, hope walking on bare feet. He is also mortal danger, because
saying his name in the square gets you hanged. So they hide him in plain sight, arm him with what they
have, and send him into every dark mouth. Writers never settle whether he truly is Tessariel. The town
believes, a few doubt, and the garrison calls him the false flame. His deeds will answer.

**The mood.** Dread comes first: the bell, the yard at night, the stair, the red lights on
Blackvigil's walls. Faith lives under that fear: people pray in a whisper, quote scripture behind
shutters and light green candles with the curtains drawn. The humour is gallows humour, from people
who have buried too many neighbours. It is dry, quick and rare, and never wacky. Hope is new to them,
and they don't yet know how to hold it.

**What the town sounds like.** Low voices. People who stop talking when armour goes past. Short
sentences, plain old words, local turns of phrase. Underneath: a hammer, rain, an oven door, the
well's chain, and always the bell. The comedy comes from who people are, never from gags. Picture a
country inn at closing time with the door barred, not a tavern full of jesters. When in doubt, say
less.

**Touchstones from the old lines** (this is the register to keep): *I'm frightened. Of what? Of
getting used to it.* / *I still set a bowl out for my brother.* / *The dead pass us by like
furniture.* / *Velscour is lord. Say it, then die.* / *I wanted to see spring.*

**Habits to drop:** the smallclothes gag, cute dodges of the name (Tuesday, turnip, "the sacred
whatsit"), a set-up-and-punchline triplet on every line, explaining the joke, and lore dumped into
barks.

---

## 2. Writing rules

### 2.1 Length (hard caps)

| Kind | Cap | Most lines |
|---|---|---|
| `greet` (to the player as he comes up) | 40 characters | 2 to 6 words |
| `bark` (muttered alone) | 90 characters | 3 to 12 words |
| `work` `stall` `dusk` `flee` `pray` `well` `hush` | 70 characters | 2 to 8 words |
| `talk` (answer to E, no business) | 140 characters, at most two sentences | one short sentence, or two |
| a line in a conversation | 80 characters | 3 to 10 words. A conversation runs 2 to 4 lines, rarely 5 |
| quest offer | about 300 characters, at most 4 sentences | the stake, the task, the place, one turn of feeling |
| quest wait | 70 characters, one sentence | where to go, or the giver's worry |
| quest done | about 220 characters, at most 3 sentences | relief, the treasure named, what it means to them |
| knight or sorcerer bark | 70 characters | 2 to 8 words |
| the dead | 40 characters | 1 to 5 words |

### 2.2 Register

- **Plain old English words.** Prefer short Saxon words such as dead, bread, stair, bell, iron, grave,
  dark and home. Avoid Latinate office words like deceased, proceed, situation, assist or require.
- **Countryside medieval, not pastiche.** Never use thee, thou, ye, thy, doth, hath, 'tis, forsooth,
  prithee, milord or m'lady. "My lady", "Ser", "sir" and "Sister" are fine. Contractions are fine.
- **"Aye"** belongs only to Garrow, Wren, Brand, Hesk, Maud, Grimwald, Bertha, Wat, Ebb and Orrin.
  Everyone else says yes.
- **No modern idiom.** Banned words: okay, OK, yeah, guys, kid or kids, boss, cool, awesome, deal with,
  fine by me, sure thing, no problem, literally, seriously, whatever, stuff, gonna, wanna, focus,
  mission, team, plan, process, trauma, stress, percent, science or scientist, minute and second (as
  units), hello and hi. Use good day, well met or the person's name instead of a greeting word.
- **No real-world religion words.** Never God, Christ, Jesus, amen, or "the Lord" meaning a god. The
  faith has saints, heaven ("the vault of heaven"), the Flame, the bell, scripture and the dark. Hell
  is allowed. To the Sworn, "my lord" and "the throne" mean Velscour.
- **Money:** crowns (gold), silver, coppers. **Time:** dawn, cockcrow, noon, the evening bell, dusk,
  midnight, the third hour, a week, a winter (the old count years in winters). **Distance:** strides,
  a bowshot, a mile, an hour's walk.
- **The player is "he".** He never speaks, so no line answers him ("What's that? You want...").
  Rhetorical questions are fine, and so are questions he can answer by doing something.

### 2.3 Short, memorable, true

- **One idea per line, and end on the strong word.** Write "Bring it back up. Every time." rather than
  "Make sure that every time you go down there you bring it back up."
- **Concrete beats abstract:** bread, rope, salt, lamp oil, a ring, a boot.
- **Let subtext work.** Never explain the joke or the grief. "I still set a bowl out" is enough.
- **Humour is dry, dark and rare.** Comic people (Maud, Tobias, Grimwald, Bertha, Hesk, Idris, Wat)
  get at most one line in four. Grave people (Odile, Garrow, Isolde, Hild, Osric, the garrison) get at
  most one in ten, and theirs is bleak. Never joke in a quest's done line, in the dead's lines or in a
  death line.
- **Don't default to set-up and punchline.** Half the conversations should end on a quiet true line
  rather than a gag.
- **Retired gags, with limits for the whole game:** Smallclothes: three lines at most (Garrow giving the
  armour, Maud once, one Sworn taunt). Cute name-dodges (Tuesday, turnip, you-know-who): one per speaker
  at most. "Genuine comet ash": Grimwald only. "Not room six": Tobias only, twice at most. Idris's
  eyebrows: twice in all.

**Before and after**

| Old | New |
|---|---|
| *The texts even got the smallclothes right. / Black. Girded in black. / I thought that was a figure of speech. / So did the knight.* | Harrow: *Girded in black, it says. I always thought it meant mourning.* |
| *You are to kill the Demon Lord Velscour. It is written. Sorry. Nobody asked you first.* | Odile: *It is written that you go. It is not written that you come back. Come back.* |
| *I'm forging a sword for the Flame. / What will you call it? / Paid for, I hope.* | Garrow: *Steel's steel. It doesn't care who swings it.* |
| *Tessariel tea! Steeped in crater water! / Hush! They'll hang the teapot.* | Grimwald: *Crater stones! Still warm! Don't ask me why!* |

### 2.4 Speakable: every line goes to a voice model

- No stage directions, asterisks, brackets, emoji, markup or quotation marks inside a line. A laugh
  is written "Ha." if it's spoken at all.
- **No placeholders** like `{a}`, `{b}` or a run-time count. Name people outright. A number that
  changes at run time is never spoken (Odile never says how many dead she counted).
- **Numbers as words.** Chapter and verse as words too: "Green Star, two, nine." "Canticle seven,
  twelve."
- No em-dash cut-offs. To break off a word, stop the sentence: "Tessar. The Flame, I mean."
- **Ellipses** are for the dead and the dying only, at most two per line. Everywhere else a full stop
  makes the pause.
- **Exclamation marks** only when someone shouts: fleeing, fighting, raising the alarm, calling
  across a distance. No capitals for emphasis; word order carries the stress.
- Read each line aloud once. Avoid sibilant pile-ups, tongue-twisters, and homographs the model may
  misread (wound, bow, lead, tear): rephrase.
- **Spelling.** Names are spelled as in §2.6. The respellings live in `tools/voice/say.json` and are
  never written into the line.
- How a line should be said is carried by its words (a delivery note, if the pipeline has one, goes
  in the data, not the text).

### 2.5 The Name

- **"Tessariel" is said aloud only by:** Odile, under the cathedral's roof or close and low to the
  player. Elsie, singing the old hymn she shouldn't. Harrow, talking to her dead husband. Hesk, once in
  a while, because at her age the gallows is a short walk. Idris, counting its syllables like a
  specimen. Malgrave, once, dying. Anyone in a conversation who gets hushed for it. The garrison and the
  Sworn never say it. The game checks earshot, but the line itself should still feel like a risk being
  taken.
- **What the town calls him instead** (each person has their own habit, see §5): the Flame, our
  guest, him, himself, the green one, holy one (the devout), lad (Garrow), dear (Hesk), friend
  (Tobias), soldier (Brand), you (Wren, Hild), sir (Osric in public, Tam, Grimwald).
- **What the garrison and the Sworn call him:** stranger, the crater-born, the false flame, the man
  from the hole, star (Malgrave), little star.
- **Velscour.** Villagers say the name when angry or frightened, and otherwise say the Fiend, the far
  throne, the V, or his lordship (bitterly). The garrison says Lord Velscour, my lord, or the throne.
  The Sworn's creed is "Velscour is lord."

### 2.6 Names and how to say them

Spellings are fixed. The respelling is what `tools/voice/say.json` feeds the voice model.

| Name | Say it | | Name | Say it |
|---|---|---|---|---|
| Bellmourn | Bell-morn | | Tessariel | Tessa-ree-ell (TESS) |
| Velscour | Vel-scour (scour as in scrub) | | Malgrave | Mal-grave |
| Blackvigil | Black-vigil | | Cindermaw | Cinder-maw |
| Gloamhollow | Glome-hollow | | Gnarlgut | Narl-gut |
| Odile | Oh-deel | | Isolde | Ih-zold |
| Osric | Oz-rick | | Idris | Id-riss |
| Garrow | Garro | | Hesk | Hesk |
| Aldric | All-drick | | Morwen | Mor-wen |
| Sabine | Sa-been | | Corvus | Kor-vus |
| Ulf | Oolf | | Sigurd | Sig-urd |
| Saint Ivo | Saint Ee-vo | | Orrin | Orr-in |
| Aymer | Ay-mer | | Piers | Peers |
| Aldo | Al-doh | | Anselm | An-selm |
| Hugh | Hew | | Grimwald | Grim-wold |
| Agnes | Ag-ness | | Joan | Jone |
| Maud | Mawd | | Wat | Wot |
| Ser (title) | Sir | | the V | the Vee |
| Hierophant | Hi-ro-fant | | Magister | Ma-jister |
| reliquary | rel-ick-wary | | Canticle | Can-tickle |
| Undercroft | Under-croft | | Trollhole | Troll-hole |

Plain English names need no respelling: Elsie, Brand, Hild, Tobias, Wren, Bertha, Ebb, Harrow, Tam,
Hob, Corin, Bram, Rook, Ned, Col, Rosy, Millhaven, Brightwater, Darkwood, Hammerfall.

### 2.7 Bellmourn's own words

- **Blessings:** Light keep you. / The Flame keep you (whispered). / Saints keep us.
- **Oaths:** Saints. / Saints preserve us. / Rot take it. / Bell take him. / By the bell.
- **Farewells:** Go careful. / Mind the dark. / Come back up.
- **Town idiom:** "the bell rang wrong": the thirteen strokes, and everything since. "gone down the
  stair": dead or lost below. "under the V": under Velscour's rule. "kneel to the V": submit. "salt the
  step": Agnes's charm, which everyone does now. "knock twice": the old folk knock twice on the
  cathedral door so the dead know it's the living coming in. "count the graves": the watch's nightly
  duty, and slang for being worried.
- **The garrison's words:** the Vigil, the oath, the throne, the V, the tithe, kneel, everything.

### 2.8 The lists, and how many lines each person gets

These lists belong to the planned per-character format, where each person's lines are written and
recorded for that person alone (not built yet; today's lines are shared pools). The counts are
suggestions, so that parallel writers produce a similar amount.

| Who | greet | talk | bark | work | stall | dusk | flee | pray | well | hush |
|---|---|---|---|---|---|---|---|---|---|---|
| Quest-givers (the phone cast) | 6 | 8 | 10 | 4 | - | 3 | 3 | 3 | 2 | 3 |
| Other townsfolk | 4 | 5 | 8 | 3 | 6 if they keep a stall | 2 | 2 | 2 | 2 | 2 |
| Garrison (Aldric, Morwen, Sabine) | 5 | 6 | 8 | - | - | - | - | - | - | - |

Conversations are written per named pair or trio from §7, about six per pair and three per trio.
Give the phone pairs more.

---

## 3. World and lore

### 3.1 The village

A clearing in the forest, a hundred strides and more across. The square and its well sit in the
middle. Roads run out by three gates: west (the Vigil Road), east (the Bellwood Trail) and south.
North of the square stands the cathedral with the graveyard walled in behind it. The crater lies on
the meadow to the north-west, under the western woods.

| Place | Where | Who, and what to say about it |
|---|---|---|
| **The square and the well** | middle | Everyone meets here. The Grimwalds' two stalls face the well, and the garrison stands about it. The well's chain squeals, and a shield with the V was fished out of it. |
| **The Cathedral of the Mourning Bell** | north of the square | Nave, pulpit, and behind the pulpit the office, with the stair-house door down to the Undercroft. Bell tower at the south-east corner. The banners carry the holy T. Sister Odile keeps the steps. Old folk knock twice before going in. |
| **The graveyard** | walled, behind the cathedral | The mausoleum, the old yew, gravebloom on the graves. At night the dead claw out of it. Lord Aymer lies here under a stone with no name. |
| **The Tolling Bell Inn** | east of the square | Tobias and Elsie. Room six (nobody has slept in it since the fire, yet someone keeps ordering ale for it). A fiddler nobody hired. The Sworn drink here too. |
| **Hammerfall** | west of the square | Garrow's smithy and shop (the shop is called Hammerfall Forge). Aldo's great sword hangs on the wall until Garrow gives it away. |
| **Grimwald's Provisions** | north-east of the square | Master and Mistress Grimwald, plus their stalls in the square. Comet ash, crater stones, rope, salt. |
| **The Alchemist's** | north-west of the square | Idris. Gems, draughts, a coffin "for storage", a cat with two shadows, the sky-ledger. |
| **Bellmourn Town Hall** | south of the square | Reeve Osric and Lady Isolde. The tithe rolls. A cellar that scratches. |
| **The Watch Barracks** | south-east | Sergeant Brand and Hild on one side, Velscour's garrison of six on the other. One roof, two oaths. |
| **The Stables** | east | Tam (and Hob). Tam's cow, which wakes lowing at the crater. |
| **The Bakehouse** | west | Agnes. Salt on the step. The knight's staff came through its roof. |
| **The House of Mending** | north-east, by the cathedral | Mother Hesk. Sister Odile lodges here. Two beds, both usually full of the bitten. |
| **The Mage's Tower** | south-west | Empty, locked by the reeve. The Vigil's battle-mage was quartered here until he walked out nineteen years ago (see §9). |
| Spoken of, never entered | off the lanes | Maud and Wat's cooperage; Ebb's chandlery; Widow Harrow's cottage (Wren lodges there); Joan's tannery (downwind); the Burnt House, Lord Aymer's manor, burned eight winters ago. |
| **The crater** | the meadow north-west, by the watch's western post | Green glass at the bottom, still smoking. A ring of midsummer-green grass round it that sheep won't eat. Rain stops at the rim. The stones hum. Candles, wreaths and bread are left at the edge. Tam's cart is somewhere in it. |

### 3.2 Under the cathedral

The way down: through the door behind the pulpit into the office, then the stair-house door and the
stair.

- **The Undercroft** (fourteen to twenty-one metres down; nobody says metres, they say "down"): the
  **Bell Crypt**, where the ringers lie standing, hands raised; the **Ringers' Reliquary** (their
  relics, which they say are their hands); the **Gallery of the Poor**, buried in its floor and
  clawing out of it; the **Sexton's Overlook**, where the old sexton watched the Gulf "till he died, and
  a little longer"; the **Sexton's Stair** down to **the Mourning Gulf**, "a crack in the world", and
  the **rope bridge** over it (the rope is looked after, nobody knows by whom); the **Hall of the
  Founders** round the stepped **Founders' Tomb**; the **Plague Ossuary**, walled up a hundred years
  ago; the **Stair Hall** and its long flights down.
- **The Deep Undercroft**, where the abbots lie: the **Bell Shrine**, where **the First Bell of
  Bellmourn** hangs on chains over a stone plinth (strike it and everything down there hears); the
  **Charnel**; the **Abbots' Gallery** of effigy tombs, behind an iron grille chained to the First
  Bell; **Cindermaw's Tomb**, the deepest place.

### 3.3 East: the Bellwood Trail, the Green Downs, the cliff caves

- **The Bellwood Trail** runs east through the forest to **the Green Downs**: open grass hills, rock
  outcrops, thyme (where the dread knights camp, out of spite).
- **Millhaven**, the farm and its **windmill**. The miller is Col, Tam's brother, and his daughter
  Rosy is Ebb's sweetheart. Millhaven has sent no flour in a month.
- **The hamlet** beyond, quiet, "too quiet for sheep country".
- **The river** crosses the plateau and drops at **Brightwater Falls** into a pool. Downstream are a
  stream and a **bridge**. Brightwater once froze in the night in the shape of a woman leaning out.
- **The eastern cliff caves:** **The Gloamhollow**, just north of the falls. Glowcaps, ghasts and
  grubbers. **The Drowned Grotto**, beside the falls. The Drowned Mother and her children. **The
  Trollhole**, far north along the cliff. Old Gnarlgut.
- The **dread knights and sorcerers** of the Vigil march between Millhaven, the windmill and the
  falls, and hold the downs' houses.

### 3.4 West: the Darkwood and Blackvigil Keep

- **The Darkwood** is the forest that rings the clearing. "Walk soft. Look up." A sign at its edge
  says Turn Back, and it faces the wrong way: it is for things coming out.
- **The Vigil Road** runs west from the village gate through the Darkwood. The last mile is paved
  with headstones, or so they say.
- **Blackvigil Keep** has stood five hundred years. A black curtain wall with slate corner towers and
  a gatehouse. Inside: a courtyard of braziers, then the Hall of the Sworn, the barracks, the armoury,
  **the chapel where they pray to Velscour**, the reliquary, and at the end **the Red Throne**, where
  Ser Malgrave sits his vigil before a chest sealed by his oath. Red lights burn on its walls at night
  and never blink. Men who said the name hang from those walls.
- In the Darkwood, two grey stone stair-houses lead down:
  - **The Barrow of Saint Ivo** to the north-west: crypts, ossuaries, a bone throne.
  - **The Old Watch Cellars** to the south-east, under the old watch's fallen tower: storerooms,
    barracks, a forge, a well chamber.

### 3.5 Coming (not in the game yet; may be mentioned as rumour)

**Bell Knoll** and **the Bell Tower of the Four Watches** in the north-east of the downs, whose bells
Mourn, Vigil, Mercy and Dawn are rung at noon and midnight by Orrin the Bellwright (§9); **the great
mountain** to the north-west; and **powers not yet met**: the Bell-Wyrm beneath the bells, the Hollow
King of the Barrowdeep, the Gloam Mother far beneath the Gloamhollow, Velscour himself. Villagers may
only half-name these in dread. Nobody describes them.

### 3.6 Factions

- **The town.** The town is poor, tithed and frightened, and keeps its faith in secret. Reeve Osric runs
  it in fact; Lady Isolde in name. The watch is Sergeant Brand and Hild, and that is all of it. People
  bow to the V in the square and pray to the T behind shutters.
- **The Church.** The Cathedral of the Mourning Bell. The abbots who built it are long gone. The last of
  them was Cindermaw, a hundred years dead. The last priest, Father Anselm, died three winters ago. The
  bishop is far off and never writes. Sister Odile keeps the cathedral and the holy texts alone. The
  church's sign is the T, the mark of the Flame.
- **Lord Velscour, the Demon Lord.** He rules from a far throne. Nobody in Bellmourn has seen him or
  knows where it is. His sign is the V, on every Sworn shield and on the banners where his people are.
  He takes a tithe of grain, coin and iron. He forbids the Flame's name and the books that hold it.
  Whether he is a man, a demon, or something that wears both, nobody here can say. The garrison speaks
  of him as cold, near and watching.
- **The Sworn of the Vigil.** Five hundred years ago the Vigil built Blackvigil to keep watch on the
  western road and the Darkwood. The old talk calls its knights Templars. Thirty years ago the Vigil
  turned. Its knights swore one word to Velscour: Everything. Now they are the Sworn. In the Keep: the
  Sworn of the Vigil, and the Adepts of the Vigil (bareheaded, eyes burning, blade and staff). On the
  downs, in field companies: Dread Knights (bloodforged plate, the shock troops), Ashen Templars (the
  oldest knights, grey and bright, who remember the order before it turned) and Gravewardens (bone and
  axe; they herd the dead). In the village barracks, the garrison of six: Ser Aldric, Black Morwen, Dame
  Sabine, Ulf, Magister Corvus and Bram.
- **Ser Malgrave, the Red Hand of Velscour.** Lord of Blackvigil, sitting the Red Throne. He hangs those
  who say the name. He seals each hanging with a ruby signet cut with the V. He hanged Lord Aymer, and
  the pedlar who sang the third verse. He sends one-word letters ("Soon.") and never the second word. He
  wants the man from the crater, alive if he can get him.
- **Velscour's sorcerers.** These are the learned of the Vigil, and they walk with the dread knights.
  Hollow Magisters study the hollow places under the world and raise the dead. Blood Witches read blood
  and hex the ground. Rot Hierophants preach rot as a sacrament and raise the dead.
- **The dead.** The dead are Bellmourn's own and older. In the yard, the Undercroft, the Barrow, the
  cellars and the water. They wake when the bell rings wrong. They do not touch the Sworn. ("They pass
  us by like furniture.")
- **The Ember Abbot, Cindermaw.** He was the last abbot, and he burned in life with a fire that never
  went out: at supper, at prayer, in his bed. He was buried in the Deep Undercroft. Now he swings his
  censer in the dark, and the dead come to him like moths.
- **The things of the caves.** Ghasts and grubbers are living things of the deep rock, not the dead.
  The Drowned Mother and Old Gnarlgut are the great ones.

### 3.7 The bells

- **The First Bell.** It was cast before the town ("before the saints, some say"). The founders built
  Bellmourn round it. Long ago its tongue was taken out. Bellwarden was forged from that clapper, and
  the ringers wore slivers of it. The bell was hung deep in the rock and the cathedral raised over it.
  The Litany's first verse says it was hung "over its head, that it should sleep". The town takes "it"
  to mean death. It doesn't.
- **The Mourning Bell.** It hangs in the cathedral tower and rings the hours. It tolls nine for a man,
  six for a woman and three for a child, and that is where the Litany of the Ninth Bell gets its name.
- **Ringing wrong.** Since last winter the Mourning Bell has rung by itself at midnight: thirteen
  strokes with no hand on the rope. People feel a deeper bell under their feet, in their teeth. Each
  time, more of the dead get up.
- **The Bell Tower of the Four Watches** (coming): four bells the abbots cast on Bell Knoll, whose
  ringing holds something down.

### 3.8 The holy texts, and how people quote them

| Text | What it is | The lines everyone half-knows |
|---|---|---|
| **The Book of the Green Star** | prophecy | *And in the latter days a star of green fire shall fall out of the vault of heaven.* (one, one) / *And the first of the Fiend's servants shall be struck down where he stood.* (two, nine) / *He shall go down into every dark mouth.* (three, four) |
| **The Canticle of Embers** | the Flame's hymn, sung | *Curled as a child in the womb, girded in black, and burning.* (seven, twelve) / *His first tooth shall be the blade of his enemy.* (nine, three) |
| **The Litany of the Ninth Bell** | the office for the dead, read at the ninth stroke | *Over its head we hung the bell, that it should sleep.* (verse one) / *And every soul of the town shall cry out as one.* (verse four) / *Speak not his name, for the servants listen.* (verse six) / *He shall walk beneath the bell, and the dead lie down.* (verse nine) |
| **Saint Ivo's Testament** | the saint's last letter | *The Fiend upon his far throne shall know fear.* / *I go down to wait. Wake me when the green star falls.* |

- *Tessariel* means "ember that falls" in the old tongue. The Flame's sign is the T.
- The garrison burns every copy of the texts it finds. Odile copies them out again by night.
- **How each person quotes:** Odile gives chapter and verse, word-perfect, then one plain sentence of
  her own. Osric quotes exactly and drily. Elsie sings. Ordinary folk paraphrase and mix the books up
  ("the Book, or the Canticle, one of them"). Wren doesn't quote at all. The garrison quotes back
  mockingly, word-perfect, which is worse.

### 3.9 Timeline

| When | What |
|---|---|
| Before the town | The First Bell. The founders hang it deep and build round it. |
| Five hundred years ago | The Vigil raises Blackvigil Keep. |
| A hundred years ago | Abbot Cindermaw burns, dies burning, and is laid in the Deep Undercroft. His censer is kept as a relic and hangs in the vestry. It is swung at every confirmation, Odile's among them. |
| Seventy winters ago | Saint Ivo, a knight-priest of the old Vigil, writes his Testament and is carried into his barrow in the Darkwood. Osric's grandfather bears the bier. |
| Forty winters ago | Wren's grandfather Rook goes into the Trollhole after its king and does not come out. |
| Thirty years ago | The Vigil turns and swears Everything to Velscour. The old watch makes its last stand in the cellars under its tower. Hild's father dies there, and Brand, sent to ring the alarm, comes back too late. The tower falls. A garrison is quartered in Bellmourn, the name is forbidden and the V goes on every shield. |
| Nineteen years ago | The Vigil's battle-mage in Bellmourn walks out of the Mage's Tower and Velscour's service (Orrin, §9). |
| Nine years ago | Ned Harrow dies. |
| Eight winters ago | Lord Aymer refuses the tithe in a starving year, and Malgrave hangs him at Blackvigil. He is buried under a nameless stone, and the manor burns. |
| Three winters ago | Father Anselm dies. No priest is sent. |
| **Last winter** | **The bell rings wrong** for the first time. The same night Idris writes "one star too many, green" in his ledger. The censer is gone from the vestry. Garrow's son Aldo takes his father's great sword down the stair and is never seen again. |
| Last spring | Aldo's sword is found at the foot of the stair. Piers, Tobias's brother, is taken at the falls by the Drowned Mother. |
| Last summer | The yard's dead begin to claw out. Odile goes down with a lamp and counts the dead. |
| **This autumn, at sunset** | The green star falls on Ser Hugh of the Sworn. The town screams as one. A man climbs out of the crater. The game begins. |

### 3.10 What is secret or uncertain

The truths below are for writers. Characters only guess, hint, or have one piece each. **No line
states the whole of any of them.** Personal secrets are in each cast entry (§5): hint, never spill.

1. **The Litany is literal.** The First Bell hangs over the head of something asleep: the Bell-Wyrm.
2. **The bell is being rung from below.** Cindermaw's corpse swings the stolen censer against the First
   Bell. The tower bell answers it: that is the thirteen strokes. Each ringing wakes the dead in a
   wider ring.
3. **Velscour's adepts put the censer in his hand.** Magister Corvus is in Bellmourn to listen to the
   bell, which is why he bought every candle Ebb had: to keep watch at the bell's hours. Orrin knows
   what they woke under Bell Knoll.
4. **The dead spare those who wear the V.** Everyone can see it; nobody explains it.
5. **The green star came the night the bell first rang wrong.** That is Idris's ledger. The Flame
   answers the bell. Only Idris suspects it, and Odile would make a verse of it, so he hasn't told her.
6. **Is he Tessariel?** That stays unresolved. He fits every verse, remembers nothing and says
   nothing.

---

## 4. The quests

The quests are the backbone. Each gives the giver's **Stake** (what it costs them; the offer says so
plainly, once), the **Offer**, the **Wait** (where their worry shows) and the **Done** (sincere, never
a joke: relief, the treasure named aloud, what it means). Suggested lines are models; writers may
better them. A giver with more than one job open says their own "there's more than one thing to do".

### The Dead Beneath the Bell: Sister Odile (level one, first quest)

- **What:** destroy every one of the dead in the Undercroft, down through the office behind the
  pulpit. **Reward:** Bellwarden, the sword forged from the First Bell's clapper.
- **Stake:** Odile went down with a lamp and counted them, and she knew faces: the ringers, the poor,
  people she buried herself. They knock under the nave while she prays. This is the first test of
  Litany verse nine ("the dead lie down"), and of her forty years of faith.
- **Offer:** certainty with dread underneath. "I counted them" (never the number). Ask for rest, not
  slaughter. Give the way down.
- **Wait:** she can still hear them through the stones.
- **Done:** the knocking has stopped. Tonight the bell rang and she was not afraid. She gives
  Bellwarden, "made from the first bell's tongue", kept for this hand.
- Suggested: *I went down with a lamp and counted them. I knew some of the faces. Go down behind the
  pulpit, child, and give them their rest.* / done: *The knocking has stopped. Take Bellwarden. It was
  made from the first bell's tongue, and it has waited a long time for your hand.*

### Garrow's Oath (Garrow's gift, after The Dead Beneath the Bell)

- **When:** the first time the player speaks to Garrow after The Dead Beneath the Bell is handed in.
  Decision: the gift is held back until then, because Garrow's words depend on it. **What:** Aldo's
  great sword, Garrow's Oath.
- **Beat:** in four short lines. You went down and came back up. I made this for my boy, and he didn't
  come back. They found it at the foot of the stair. Take it, swing it with both hands, and bring it
  back up every time.
- Suggested: *You went down and came back up. Aldo didn't.* / *I made this for him. Best thing I ever
  forged.* / *They found it at the foot of the stair. Not him.* / *Two hands, lad. And bring it back up.
  Every time.*

### Gravebloom: Mother Hesk (level one)

- **What:** six gravebloom from the graves behind the cathedral. **Reward:** Mother Hesk's Thornring
  and healing draughts.
- **Stake:** every white flower in that yard grows from someone she couldn't save, and she knows whose
  grave each one is on. She has buried half the town. She will not bury the Flame.
- **Offer:** practical tenderness. You'll be hurt, and Flames get hurt. The flower is white as milk and
  glows a little at dusk. Mind the dead, because they don't like their flowers picked.
- **Wait:** six, the white ones, and mind who's under them.
- **Done:** every one of these was somebody, and now they'll mend you. She gives the ring she wound
  from the root: "It pricks. That's how you know it works."
- Suggested: *Every white flower in that yard is somebody I couldn't mend. Bring me six. They'll mend
  you instead.*

### Sworn Steel: Garrow (level two)

- **What:** four shards of Sworn steel cut off the dread knights on the Green Downs. **Reward:**
  Hammerfall Grips.
- **Stake:** Aldo went down with the best steel Garrow could make, and it wasn't enough. Velscour's
  smiths know something he doesn't, and he means to learn it, so that the next thing he makes for
  someone going into the dark holds.
- **Offer:** gruff and technical, with grief two words deep. The dread knights carry it. They won't
  hand it over.
- **Wait:** four shards. Take them.
- **Done:** he reads the grain like a letter. The grips were quenched in the oil of a dozen of their
  blades. "Nothing they hold will slip. Not this time."
- Suggested: *Their steel's better than mine. I want to know why. Four shards, off the knights on the
  downs.*

### Dread on the Downs: Sergeant Brand (level three, after the Undercroft)

- **What:** kill eight of the Vigil's dread knights and sorcerers on the Green Downs. **Reward:** the
  Wall of the Watch.
- **Stake:** the old watch swore to keep the Bellwood Trail open to Millhaven. Now the Vigil's field
  companies hold it, and Millhaven sends no flour. Brand has Hild, a crossbow with no string, and his
  oath. Underneath is the old shame: once before, he came too late.
- **Offer:** a sergeant's briefing, dry. "You killed one of them coming down. Eight more, on purpose."
- **Wait:** eight, east past the Bellwood Trail.
- **Done:** Millhaven sent a cart this morning, a whole cart. He hands over the sergeants' shield. He
  painted the V off it himself, years back, "when I still thought the old watch would come home".
- Suggested: *I've Hild, a crossbow with no string, and you. That's the army. Eight of them, on the
  downs.*

### The Old Watch's Standard: Hild (level three, after the Undercroft)

- **What:** bring the old watch's standard back from the Old Watch Cellars in the Darkwood, and put
  down eight of the dead there. **Reward:** the Watchman's Striders.
- **Stake:** her father died holding those cellars thirty years ago. The dead who guard the standard
  are the old watch, and he is among them. And Brand cries about that banner, though he'd never say
  so.
- **Offer:** flat and terse. The personal fact is said once, plainly, with no tremor. That is the
  tremor.
- **Wait:** south-east, the stair-house in the Darkwood.
- **Done:** "It's still blue under the mould." The boots walked the walls for sixty years. Then the
  nearest she comes to breaking: "Don't tell me what he looked like."
- Suggested: *My father's down there, guarding it still. Put him down gently. Then bring the standard
  home.*

### Lights of the Gloamhollow: Idris (level four, after the Undercroft)

- **What:** six glowcaps from the Gloamhollow, north of Brightwater Falls. **Reward:** the Gloamstaff.
- **Stake:** he has been building this staff for a year, since the night he saw one star too many and
  nobody listened. The glowcaps are the last piece. The staff is his proof that he was right.
- **Offer:** excited and precise, with the warning about ghasts thrown away far too lightly.
- **Wait:** north of the falls, in the cliff. Bring a light. "Well. You are one."
- **Done:** perfectly safe, mostly. One of the two eyebrow jokes in the game may go here.
- Suggested: *I began this staff the night I saw your star. Nobody believed me. Six glowcaps, and it's
  finished.*

### The Drowned Mother: Tobias (level five, after the Undercroft)

- **What:** slay the Drowned Mother in the Drowned Grotto beside Brightwater Falls. **Reward:** the
  Drowned Mother's Pearl.
- **Stake:** his brother Piers fished below the falls. Last spring something came out of the Grotto,
  white and big as a cart, took him by the leg and pulled him under. Piers was Elsie's father. The
  pearl was their mother's, and Piers wore it on a string.
- **Offer:** the gossip has no patter left. It is the plainest Tobias ever speaks.
- **Wait:** the Grotto, a little south of the falls. Don't look at the water too long.
- **Done:** "Then he can rest." The pearl was in her, and he gives it. Drinks are free for as long as
  he lives.
- Suggested: *My brother Piers fished below the falls. Something white came up and took him by the
  leg. Elsie's father. Find it.*

### Saint Ivo's Reliquary: Reeve Osric (level five, after the Undercroft)

- **What:** slay the Wight of Saint Ivo and bring the saint's reliquary out of his barrow, north-west
  in the Darkwood. **Reward:** the Halo of Saint Ivo.
- **Stake:** seventy winters ago Osric's grandfather carried Ivo's bier into the Barrow. He told the
  boy the Testament's last line: wake me when the green star falls. Something sits Ivo's bone throne
  now, wearing his face. Osric has bowed to the V for thirty years. Sending you is the one brave thing
  he can do.
- **Offer:** the reeve's careful sentences, quoting the Testament exactly, and a rare true feeling at
  the end.
- **Wait:** north-west, a stair-house of grey stone.
- **Done:** "His halo. My grandfather said it still gave light. It does." Wear it against the Fiend.
- Suggested: *My grandfather carried Saint Ivo down. Wake me, the saint said, when the green star
  falls. Something else woke instead.*

### The Ember Abbot: Sister Odile (level six, after the Undercroft)

- **What:** slay Abbot Cindermaw and twelve of his flock in the Deep Undercroft, down the second stair
  in the Stair Hall. **Reward:** the Censer of the Ninth Bell.
- **Stake:** the censer swung at Odile's own confirmation. It hung in the vestry as the Abbot's relic.
  The night the bell first rang wrong she saw it swinging on its hook with no hand on it, and in the
  morning it was gone. Now she hears it below the floor, in time with her own: clink, pause, clink.
  She half believes the Abbot is ringing the bell. She has told no one until now.
- **Offer:** her secret, given up at last. The abbots lie down there, one has not stopped burning,
  and the dead go to him like moths.
- **Wait:** the second stair, in the Stair Hall. Follow the sound of the censer.
- **Done:** "It swung at my confirmation." Carry it, and let it burn for the right side.
- Suggested: *I saw his censer swing with no hand on it, the night the bell first rang wrong. I have
  told no one. Put him out.*

### The Trollhole King: Wren (level seven, after Dread on the Downs)

- **What:** slay Old Gnarlgut in the Trollhole, far north along the eastern cliff. **Reward:**
  Trollbane.
- **Stake:** her grandfather Rook went in after the king forty winters ago with his good axe (forged
  by Garrow's father). He was the only person who never treated her as just a girl. She has been in
  once herself, to the first bend, and ran. She wants the axe back more than the troll dead.
- **Offer:** plain. "He's bigger than you're thinking. Bigger than that."
- **Wait:** north along the cliff, past the falls and the Gloamhollow.
- **Done:** "That's Grandad's axe. It was in him? Course it was." It's Trollbane now, and he'd have
  liked you.
- Suggested: *Grandad went in after the king with his good axe. Forty winters back. I went in once. I
  ran. Go further than I did.*

### The Red Hand of Velscour: Sister Odile (level nine, after the Ember Abbot, Dread on the Downs and Saint Ivo's Reliquary)

- **What:** slay Ser Malgrave on the Red Throne of Blackvigil Keep. **Reward:** Tessariel's Brand.
- **Stake:** the Testament says the Fiend upon his far throne shall know fear, and it begins with his
  hand. Malgrave hanged the pedlar for a hymn, hanged Lord Aymer for a tithe, and hanged everyone who
  ever sang the name. Odile is sending the town's whole hope west, and it terrifies her.
- **Offer:** solemn and short. "Begin with his hand."
- **Wait:** west along the Vigil Road. The Red Throne is at the end of the hall.
- **Done:** now Velscour knows your name. Garrow struck the Brand from Malgrave's blade in the green
  fire of the crater: "his first tooth shall be the blade of his enemy" (Canticle nine, three). It was
  always yours.
- **After:** Lady Isolde gets one line once this is done (she will have Aymer's name cut on the stone
  tomorrow, a hand deep). It's worth having.
- Suggested: *West along the Vigil Road, the Red Hand sits his throne. He has hanged everyone who ever
  sang your name. Begin with his hand.*

---

## 5. The cast

**On a phone** (eleven): Odile, Hesk, Garrow, Brand, Hild, Idris, Tobias, Osric, Wren, Aldric and
Morwen. **On desktop** (twenty-two): those eleven plus Elsie, Agnes, Grimwald, Bertha, Isolde, Wat,
Maud, Ebb, Harrow, Tam and Sabine. **Never on screen:** Hob, Joan, Sigurd, Corin, Ulf, Corvus and
Bram, who may be talked about but never speak.

The cast is written to be distinct. No two people share a verbal habit or a pet name for the player, and
people who often talk together (§7) differ in accent or, where both are gentry, in age and timbre.
Each entry ends with a self-contained **VOICE** paragraph for the voice designer. The game adds its
own effects (the knights' helm, the monsters' chains), so the paragraphs never describe them.

### 5.1 The phone cast (quest-givers)

#### Sister Odile
*Keeper of the holy texts. Keeps the cathedral steps; lodges at the House of Mending. Sixty-two.
Gives three quests.*
- **Who:** She is the last of the church in Bellmourn: a lay sister who has kept the cathedral alone
  since Father Anselm died. For forty years she has read the Litany aloud to emptying pews. The green
  star answers every night she prayed, and the terror of being right is on her. Burning certainty, held
  down by discipline. She went down the stair with a lamp and counted the dead, and hasn't slept well
  since.
- **Speech:** Scripture is her native tongue: a verse, word-perfect, then one plain sentence of her own.
  Short declaratives. When she is moved she goes quieter, never louder. She jokes almost never, and when
  she does it is bleak. Her words: written, beneath the bell, lie down, rest, child, as it was written.
- **Calls him:** "child" when tender, "Flame" when in earnest. She says "Tessariel" only under the
  cathedral's roof, or close and low.
- **Ties:** **Hesk**: they share a house and argue about the dead (pray for them, or bandage the
  living). Each does the other's work when nobody is looking. **Osric**: she wants the reeve's coin for
  candles, and she despises his bowing while understanding it. **Aldric**: he burns her copies of the
  texts, and she copies them out again. **Idris**: her Book against his ledger. They need each other and
  won't say so. **Isolde**: Odile buried Lord Aymer, and she carved his name on the underside of the
  nameless stone. **Elsie**: Odile taught her the old hymns, and now regrets it.
- **Believes:** completely. Her fear is not that she is wrong. It is that the texts say he will go,
  and never say he will win.
- **Secret / want:** she saw the Abbot's censer swing with no hand on it, the night the bell first rang
  wrong. She tells no one until she gives the Ember Abbot quest. She wants to hear the bell ring right
  once before she dies.
- **Lines:** greet *Child. You came back up.* · talk *It is written that you go. It is not written that
  you come back. Come back.* · bark *Beneath the bell, the dead lie down. Lie down, then.* · hush *Not
  in the square. Never in the square.*
- **VOICE:** Female, early sixties, a church sister in a cold stone cathedral. Soft southern Irish
  lilt, educated and careful. A clear, low alto worn smooth by forty years of reading aloud. Slow and
  deliberate; she lands every word. Underneath runs a tremor of fervour she keeps on a short rein, and
  when she is moved she drops towards a whisper instead of rising. Warm to the frightened, iron to the
  garrison.

#### Mother Hesk
*Healer and midwife. House of Mending. Seventy-four. Quest: Gravebloom. Gift in the opening: the
draughts.*
- **Who:** For fifty years she has been midwife and bonesetter to half the town. She delivered most of
  the living and laid out most of the dead. Unshockable, grimly funny, gentle with her hands and sharp
  with her tongue. Bandages first, saints second.
- **Speech:** Imperatives: "Sit. Drink. Hold still." She diagnoses aloud. Scots turns, used lightly:
  aye, wee. Never thick dialect spelling. Her jokes are about dying, because she is near it and not
  afraid.
- **Calls him:** "dear", and "lad" when cross.
- **Ties:** **Odile**: housemate and sparring partner. **Osric**: he comes every day for a sleeping
  draught. The town thinks he's courting her. She knows the real reason (see Osric) and keeps it.
  **Garrow**: she patched Aldo the night before he went down. Aldo came to her for something against
  fear, and she gave it. She has never told Garrow. **Idris**: his draughts are "poison in pretty
  bottles". **Morwen**: Hesk delivered her, and neither of them ever mentions it. **Brand**: she sets
  his old wounds and mocks his knees.
- **Believes:** half. "Flame or no, he bleeds. I've seen the blood." She will keep him alive either
  way.
- **Secret / want:** Aldo, and Morwen. She wants one winter without a funeral.
- **Lines:** greet *Hands. Let me see. Hm. Still yours.* · talk *Red for the blood, blue for the head.
  Drink before you need it, not after.* · bark *Boil it twice. The dead aren't clean.* · hush *At my
  age the gallows is a short walk. At yours, hush.*
- **VOICE:** Female, mid-seventies, a village healer and midwife. Low, dry, crackling old voice with a
  soft Highland Scottish accent. Unhurried and matter-of-fact, the warmth buried under gravel. She
  rarely raises her voice. A wry, knowing edge, as if she has already seen how this ends and is going
  on anyway.

#### Garrow
*The smith. Hammerfall. Fifty-two. Quest: Sworn Steel. Gifts: the armour in the opening, and Garrow's
Oath after the Undercroft. Runs the forge shop.*
- **Who:** A big, quiet widower. His only son, Aldo, took the great sword his father made down the
  cathedral stair the winter the bell first rang wrong, and never came back. Gruff, with few words, and
  he means all of them. He judges people by their hands and what they do with steel. The forge is where
  he keeps his grief.
- **Speech:** The shortest sentences in town. Statements, hardly ever questions. Lancashire plainness:
  aye, nowt, owt (sparingly). He talks to the steel more than to people. His lines end early. The
  silence after is part of them.
- **Calls him:** "lad".
- **Ties:** **Agnes**: she brings him a hot loaf every morning. A ring he made her sits in his apron
  pocket, ten years if he waits. **Hesk**: she patched Aldo. **Wren**: his father forged her
  grandfather's axe. **Aldric**: the Sworn bring their blades to Hammerfall. He grinds them well,
  because he can't do otherwise, and he hates himself for it. **Tobias**: one cup at the Tolling Bell
  every night. Two men who lost someone to the dark.
- **Believes:** he has no use for books. "Saint or no, you'll want a better edge." But he saw the
  knight's armour fused at the joints, and he respects that.
- **Secret / want:** he swore he'd go down after Aldo, and never did. He wants someone to bring the
  sword back up, every time.
- **Lines:** greet *Lad.* · talk *Steel's steel. It doesn't care who swings it.* · bark *Another heat.
  Then another.* · opening gift *You can't fight the dead in your smalls, lad. Arms up.*
- **VOICE:** Male, early fifties, a village blacksmith. Deep, rough, gravelly baritone with a broad
  Lancashire accent. Slow, heavy and economical, with long pauses where other men would talk. The grief
  sits low in his chest and never shows. When he is tender he gets quieter and gruffer at once.

#### Sergeant Brand
*Sergeant of the watch. Watch Barracks. Fifty-eight. Quest: Dread on the Downs. Wears the knight's
armour set.*
- **Who:** Bellmourn's last soldier. He was a young watchman when the Vigil turned. The old watch made
  its last stand in the cellars and sent him back to ring the alarm, and he came back too late. He
  carries that shame like his old shield. Dutiful, weary and decent, with a soldier's gallows wit. He
  commands a watch of exactly one, Hild, and must salute Ser Aldric across the barracks floor.
- **Speech:** Clipped orders in a sergeant's rhythm: "Right." "Eyes up." "Wall holds." Dry
  understatement. He gives bad news as a report. Northumbrian turns: aye, lad.
- **Calls him:** "soldier". He has quietly enlisted him.
- **Ties:** **Hild**: like a daughter. She beats him at dice. **Aldric**: they share a roof and a forced
  courtesy. **Harrow**: he courts the widow with flowers. Her dead husband, she says, approves.
  **Osric**: the watch's pay is late. **Tobias**: the watch drinks on the inn's slate.
- **Believes:** he wants to, and is afraid to. He acts as if he does, and has ordered the watch to look
  the other way.
- **Secret / want:** he was the boy who ran for help, and he cries about the old watch's banner. He
  wants to die on a wall, not in a bed.
- **Lines:** greet *Soldier.* · talk *I've Hild, a crossbow with no string, and you. That's the army.*
  · bark *Wall holds. Wall holds.* · hush *Belay that. Ears everywhere.*
- **VOICE:** Male, late fifties, an old village sergeant. Gruff, weathered baritone with a Northumbrian
  (Geordie) accent. Clipped and steady, parade-ground short, with a tired dry humour under it. Firm,
  never shouting. There is a crack of old shame in him that he would never admit to.

#### Hild
*The watchwoman. Watch Barracks. Thirty-four. Quest: The Old Watch's Standard. Wears the mailed armour
set.*
- **Who:** The watch's only other member, and she doesn't sleep: "Someone has to not." Her father died
  holding the old watch's cellars when she was four. Brand half raised her. Flat, watchful, laconic and
  deadpan. She trusts nothing she can't see, and not much she can. She was on post by the western woods
  when the star came down, and she saw the knight die.
- **Speech:** The fewest words in town. Reports, not conversations. No exclamations. No adjectives she
  can do without.
- **Calls him:** nothing at all, or "you".
- **Ties:** **Brand**: always "Sergeant", never his name. **Wren**: they went to the crater together,
  and each trusts the other's eyes. **Morwen**: Morwen probes, and Hild gives back nothing. Their talks
  are duels of silence. **Idris**: he wants a drop of her blood "for a measurement". She says no every
  day.
- **Believes:** "I saw it. That's all I'll swear to." Doubting everything has kept her alive.
- **Secret / want:** she has walked to the cellars' stair-house alone three times and not gone down.
- **Lines:** greet *You. Still alive.* · talk *I saw the knight look up. That's all I'll swear to.* ·
  bark *Count the graves. Count them again.* · hush *Quiet.*
- **VOICE:** Female, mid-thirties, a village watchwoman. Flat, level, low voice with an East Midlands
  (Derbyshire) accent. Terse, dry and unhurried, with almost no rise and fall. Deadpan to the point of
  severity: a hard calm that never quite cracks.

#### Idris
*The alchemist. The Alchemist's. Forty-five. Quest: Lights of the Gloamhollow. Runs the gem shop.*
- **Who:** Gem-cutter, draught-maker and watcher of the sky, curious well past the point of sense. He is
  the only person in Bellmourn who is thrilled rather than frightened. He has kept a ledger of the night
  sky for twenty years. Rumour says he was a lord's son once.
- **Speech:** Quick, precise and musical. He corrects himself ("Safe. Mostly safe.") and measures
  everything. Learned words, never modern ones: ledger, measure, the art, a specimen. Never "science".
- **Calls him:** "my friend", and "you impossible man" when delighted.
- **Ties:** **Odile**: her Book against his ledger. "A poor book with excellent aim." **Hesk**: rival
  remedies. **Aldric**: Aldric demands to know what fell. "A stone, Ser Aldric. A very green stone."
  **Corvus**: a scholar of the other side. Idris is afraid of what Corvus knows. **Hild**: he begs her
  blood.
- **Believes:** he doesn't believe; he observes. "You should be ash. You are not. That is a miracle, or
  a measurement I haven't made."
- **Secret / want:** his ledger shows the green star appeared the very night the bell first rang
  wrong. He thinks the bell called it. He wants to be right, and to be told so once.
- **Lines:** greet *You! Still impossible. Good.* · talk *The star came the night the bell first rang
  wrong. I wrote it down. Nobody reads my books.* · bark *Copper, ash, and something like a hymn.* ·
  hush *Four syllables. Count them in your head.*
- **VOICE:** Male, mid-forties, a village alchemist and stargazer. Quick, light, bright tenor with a
  lilting South Welsh accent. Fast and musical, tumbling over his own words in excitement, then
  stopping dead on a precise point. Nervous energy, delight, and a scholar's fussiness.

#### Tobias
*Innkeeper. The Tolling Bell. Forty-seven. Quest: The Drowned Mother. Gift in the opening: forty
crowns.*
- **Who:** He came from the city twenty years ago with his brother Piers and their mother's pearl,
  bought the inn, and never left. Warm, talkative and nervy. A gossip who knows everything said under
  his roof and is afraid of half of it. He waters the ale and denies it. Last spring the Drowned Mother
  took Piers. Tobias is raising Piers's girl, Elsie.
- **Speech:** Chatty and quick, in London rhythm. Patter, asides, lowered voice. He talks money as a way
  of not talking about fear. Every bit of patter drops away when Piers comes up.
- **Calls him:** "friend".
- **Ties:** **Elsie**: niece. Her singing terrifies him. **Garrow**: one cup together every night.
  **Morwen**: she drinks at the inn and asks who toasts whom. **Brand**: the watch's slate. **Osric**:
  the ale tax. **Wren**: she brings hares for the pot, and looks for Piers's boat along the falls.
- **Believes:** fiercely and quietly. He is terrified it will get Elsie hanged.
- **Secret / want:** the box in the cellar marked "after" holds coin to bury Piers properly, and to
  take Elsie away from Bellmourn after.
- **Lines:** greet *Friend! In, in. Mind the step.* · talk *First cup's free. Second, we talk. Third,
  you're family.* · bark *Not room six. Never room six.* · hush *Not under my roof. Walls have Sworn
  in them.*
- **VOICE:** Male, late forties, an innkeeper. Warm, round, slightly hoarse middle-aged voice with a
  London accent. Quick and chatty: a salesman's patter that drops to an anxious mutter whenever the
  door opens. Friendly, worried, good-hearted, always half listening for trouble.

#### Reeve Osric
*The reeve. Bellmourn Town Hall. Seventy-two. Quest: Saint Ivo's Reliquary.*
- **Who:** Reeve for forty years under three masters: the old lord, Lord Aymer, and the V. He keeps the
  tithe rolls and counts the graves and the living. He bows to the garrison just slowly enough for those
  watching to notice. A careful, dry, frightened old man who is quietly brave, and who lies for the town
  every day.
- **Speech:** Measured and clerkly: sums, lists and understatement. Polite phrases with a knife in them.
  He quotes the Testament exactly.
- **Calls him:** "sir" in public, "our guest" in private, and once, at the end, "Flame".
- **Ties:** **Isolde**: he obeys her, and shields her from her own defiance. **Aldric**: the daily lie
  ("a tinker, Ser Aldric"). **Hesk**: the daily draught. **Odile**: candle money. **Tam**: the crater is
  on common land, and Tam's cart is in it. **Brand**: the late pay.
- **Believes:** he doesn't dare to. "I should like to be wrong about everything, for once."
- **Secret / want:** His wife Margery died last winter and got up again. He could not bring himself to
  do what should be done, and she is locked in the Town Hall cellar. That is the scratching. Hesk's
  draught is so he can sleep through it. He writes to Blackvigil every season begging a lower tithe. The
  last letter came back with a V cut through the seal. Hint at the cellar. Never state it.
- **Lines:** greet *Sir. Quietly, please.* · talk *To the garrison you are a tinker. Be a dull one.* ·
  bark *Forty-one graves. Forty-one yesterday. Good.* · hush *I heard nothing. Neither did you.*
- **VOICE:** Male, early seventies, the village reeve. Thin, dry, creaking old man's voice with a slow
  Norfolk (East Anglian) burr. Precise and careful, with a clerk's exactness and a weary wit so dry it
  barely moves. Polite to everyone, afraid of most, and braver than he sounds.

#### Wren
*Hunter. Lodges at Widow Harrow's cottage. Twenty-seven. Quest: The Trollhole King. Leads the opening
walk. Gift: the hand wraps. Wears the hunter's armour set.*
- **Who:** She hunts the Darkwood and the downs, and she was the only one who walked to the crater's
  edge. Blunt, brave and practical, warm under the bluntness. Few words, all of them useful. Forty
  winters ago her grandfather Rook went into the Trollhole after its king with his good axe. She trusts
  deeds, not books.
- **Speech:** Short, plain Yorkshire: aye, nowt. Directions given by landmark. A tracker's eye: wind,
  tracks, cover. She laughs rarely and briefly.
- **Calls him:** "you". Never anything softer.
- **Ties:** **Hild**: the crater, and trust. **Harrow**: Harrow mothers her, and Wren humours her talks
  with Ned. **Garrow**: his father forged her grandfather's axe. **Tobias**: hares for the inn, and she
  searches the falls for Piers's boat. **Morwen**: Wren scuffed the player's tracks from the crater, and
  Morwen knows it.
- **Believes:** "I saw you fall. I saw you get up. That'll do me."
- **Secret / want:** she has been into the Trollhole once, to the first bend, and ran. She wants the axe
  more than the troll's death.
- **Lines:** greet *There you are.* · talk *Woods are full of dead now. Walk soft. Look up.* · bark
  *Wind's turned. Something's rotting east.* · hush *Shut it. Sworn by the well.*
- **VOICE:** Female, late twenties, a village hunter. Strong, clear, slightly husky voice with a broad
  Yorkshire accent. Plain, brisk and steady, every word useful. Brave and practical, warm underneath,
  with a short dry laugh she rarely uses.

### 5.2 The desktop townsfolk

#### Elsie
*Serving girl. The Tolling Bell. Nineteen.*
- **Who:** Piers's daughter, raised by her uncle Tobias. Bright, eager and romantic. She believes every
  word of the Canticle. She sings the old hymns under her breath while she works, including the one with
  the name in its third verse. She says what everyone is thinking, out loud, a beat too early.
- **Speech:** quick, breathless and full of questions. Then she catches herself and drops to a whisper.
- **Calls him:** "holy one", then corrects herself to "sir".
- **Ties:** **Tobias**: uncle and scold. **Wat**: he drew her a poem, and she kept it. **Odile**: taught
  her the hymns. **Morwen**: Morwen once asked her to sing. She didn't. **Maud**: teases her about Wat.
- **Believes:** completely.
- **Secret / want:** she wants to go to the Grotto herself and see where her father went. She knows all
  nine verses of the forbidden hymn.
- **Lines:** greet *It's you! Sorry. It's you.* · bark *Ember that falls, ember that falls. No. Hush,
  Elsie.* · talk *Will you go to the Grotto? My father's there. Was there.*
- **VOICE:** Female, about nineteen, a serving girl at a village inn. Bright, light, quick voice with a
  soft Devon (West Country) accent. Eager and breathless, swinging from excitement to a guilty whisper.
  Friendly and a little nervous, with a clear, sweet singing tone.

#### Agnes
*The baker. The Bakehouse. Forty-six. The knight's staff came through her roof.*
- **Who:** She feeds the town and its strays. She salts every doorstep, bakes iron filings into the
  crust for luck, and bakes an extra loaf every night for whatever knocks. She takes Garrow a hot loaf
  every morning, and waits, without saying so, for him to ask.
- **Speech:** warm, bustling and brisk. Food is love and armour to her. "Eat."
- **Calls him:** "duck".
- **Ties:** **Garrow**: the loaf, and the waiting. **Tam**: Millhaven's flour has come down grey.
  **Hesk**: bread traded for salves. **Grimwald**: he overcharges her for salt. **Morwen**: bought a
  loaf from her and stared.
- **Believes:** "He's thin. Saint or not, he's thin."
- **Secret / want:** she leaves the extra loaf on the graveyard wall, not the step, and something takes
  it. She thinks it's Aldo.
- **Lines:** greet *Eat something, duck.* · talk *Salt on the step, iron in the crust. Bread for
  whatever knocks.* · bark *Rise, you stubborn thing.*
- **VOICE:** Female, mid-forties, a village baker. Warm, round, brisk alto with a Black Country (West
  Midlands) accent. Busy and mothering, quick and practical, with flour-dusted good humour, and a soft
  catch in her voice when she speaks of the smith.

#### Master Grimwald
*Merchant. Grimwald's Provisions and its stall. Sixty-one. Keeps the goods shop with Bertha.*
- **Who:** He has never once left the shop. His prices go up whenever the bell rings. He sells "genuine
  comet ash" (from his own chimney) and warm crater stones. Wheedling, penny-wise and cowardly, and
  funny without meaning to be. His wife is cleverer.
- **Speech:** Market patter and sales cries, haggling, counting aloud. Yorkshire: "Now then."
- **Calls him:** "sir", with a shopkeeper's bow.
- **Ties:** **Bertha**: married, bickering, devoted. **Ebb**: the rival stall, her candles against his
  ash. **Agnes**: salt. **Osric**: taxes. **The garrison**: he sells to them too, smiling, with a
  shaking hand.
- **Believes:** in coin, and in what sells.
- **Secret / want:** eight years ago, when the garrison took the church plate, he hid the cathedral's
  silver cup in his salt barrel. He has never told anyone, not even Bertha.
- **Lines:** stall *Crater stones! Still warm! Don't ask me why!* · greet *Now then, sir. All for sale.
  Nearly.* · talk *Comet ash, two coppers. Is it real? It's ash. Ash is real.*
- **VOICE:** Male, early sixties, a village shopkeeper. Reedy, nasal, wheedling voice with a broad
  Yorkshire accent. A market crier's sing-song when he sells, dropping to a nervous mutter when the
  garrison is near. Penny-pinching, cowardly, oddly lovable.

#### Mistress Bertha Grimwald
*Merchant. Grimwald's Provisions and its stall. Fifty-eight.*
- **Who:** The brains of the shop. She counts the coins twice, and the second count always comes out
  higher. She sleeps with the cash box. She faced down the garrison while her husband hid in the flour
  bin with the good stock. Sharp, unsentimental and loyal. She wants to leave Bellmourn, and knows they
  never will.
- **Speech:** Quick and deflating. She finishes men's sentences for them. Lancashire. "Love" said like a
  blade.
- **Calls him:** "love".
- **Ties:** **Grimwald**: she runs him. **Ebb**: likes her, and won't say so. **Isolde**: sells her
  black silk. **Morwen**: stared her down once and hasn't forgotten.
- **Believes:** "If he's a saint, he'll pay. Saints pay."
- **Secret / want:** a cottage at Millhaven, somewhere the bell can't be heard.
- **Lines:** greet *Coin first, love. Then we're friends.* · stall *Draughts, rope, salt. Pay the
  lady.* · talk *We buy anything and sell it back dearer. That's not sin. That's shopkeeping.*
- **VOICE:** Female, late fifties, a shopkeeper's wife. Sharp, quick, no-nonsense voice with a broad
  Lancashire accent. Dry, deflating and fast, with a tongue as exact as a shop scale. Tough and
  unsentimental, with grudging affection showing through.

#### Lady Isolde
*The widowed lady of Bellmourn. Lodges at the Town Hall. Forty-one.*
- **Who:** Widow of Lord Aymer, the last lord of Bellmourn. Eight winters ago Ser Malgrave hanged him at
  Blackvigil for refusing the tithe in a starving year. The garrison let her bury him in the yard on
  condition that his stone carry no name. The manor burned that winter. Composed, cold and exact: grief
  hammered into manners. She sees the Flame as the blade she has waited eight years for.
- **Speech:** Formal, complete sentences, with understatement as a weapon. She gives orders as requests.
  Few contractions. She never raises her voice.
- **Calls him:** "holy one" when they are alone, "sir" in public.
- **Ties:** **Osric**: she shames his bowing, and he shields her. **Sabine**: two women of rank on
  opposite sides. Sabine pities her, and it is unbearable. **Odile**: knows the name is carved under the
  stone. **Bertha**: buys black silk, "to be ready".
- **Believes:** "I do not need you to be holy. I need you to be sharp."
- **Secret / want:** Malgrave's ruby signet, the seal he set on Aymer's hanging. And Aymer's name cut
  on the stone, a hand deep.
- **Lines:** greet *Holy one. Do keep out of sight.* · talk *Ser Malgrave hanged my husband over a
  short tithe. Begin with him, if you take requests.* · bark *A stone with no name. I know the name.*
- **VOICE:** Female, early forties, the widowed lady of the village. Cool, clear, cultivated Received
  Pronunciation. Measured and precise, every consonant in its place. Grief worn as composure, steel
  under silk, never raised.

#### Wat
*The cooper's apprentice. The cooperage. Nineteen.*
- **Who:** Eager, gangly and sweet, brave in talk. He proposed to Maud, and she told him to lift the
  cart first. He drew Elsie a poem. He talks about going down the stair, and hero-worships the Flame.
- **Speech:** eager boasts that fall apart halfway. "Did you see...?"
- **Calls him:** "sir!"
- **Ties:** **Maud**: his master. He adores her, and she laughs at him kindly. **Elsie**: the poem.
  **Hob**: dares. **Tam**: borrows his cart wheel.
- **Believes:** totally.
- **Secret / want:** he did go down the stair once: three steps. He tells everyone ten.
- **Lines:** greet *Sir! Is it true you killed a hundred?* · bark *Three steps down. Nearly four.* ·
  talk *Take me down with you. I'll carry the lamp. I'm good at lamps.*
- **VOICE:** Male, about nineteen, a cooper's apprentice. Light, eager, cracking young voice with a
  Geordie (Tyneside) accent. Fast and earnest, full of boasts that wobble. Good-hearted and easily
  embarrassed.

#### Maud
*The cooper. The cooperage. Thirty-six.*
- **Who:** The strongest person in Bellmourn. She carries coffins alone and lifts cart wheels. She
  arm-wrestled Ulf of the Sworn at the inn and kept his gauntlet. Loud and laughing, unimpressed by
  saints, knights or men. Her laugh is the only loud sound the garrison puts up with.
- **Speech:** big, blunt and teasing. She laughs mid-line, written "Ha."
- **Calls him:** "skinny", or "saint" when she's teasing.
- **Ties:** **Wat**: fond of him, and pretends otherwise. **Ulf**: his gauntlet hangs on her wall.
  **Sabine**: they respect each other. **Elsie**: teases her. **Tobias**: arm-wrestles at his inn.
- **Believes:** "He's thin for a saint. I'll believe it when he lifts a barrel."
- **Secret / want:** the dead are buried in her barrels now, hooped twice and pitched. Something got out
  of the last ones.
- **Lines:** greet *Saint! Still thin.* · talk *I hoop the coffins twice now. You know why.* · bark
  *Lift with your legs, Wat. Not your mouth.*
- **VOICE:** Female, mid-thirties, a strong village cooper. Big, hearty, booming voice with a broad
  Glaswegian (Lowland Scots) accent. Blunt, teasing and quick to laugh, utterly unafraid, with a
  rough warmth.

#### Ebb
*The chandler. The chandlery; keeps a stall in the square. Twenty-eight.*
- **Who:** She makes candles. The blue ones "show you what else is in the room". The green ones sold out
  the day after the star. Quick-witted and sharp-tongued, and romantic in secret. Her sweetheart is
  Rosy, the miller's daughter at Millhaven (Tam's niece), and the road is shut. She is feuding with Joan
  over a candle that smelled of the tannery. She charged Magister Corvus double for every candle he
  bought.
- **Speech:** quick and cheeky, selling with wit. Soft whenever Millhaven comes up.
- **Calls him:** "holy one", with a wink in the voice.
- **Ties:** **Joan**: the feud. **Grimwald**: the rival stall. **Tam**: Rosy. **Odile**: Ebb sells her
  the church's candles cheap. **Corvus**: the candle mystery.
- **Believes:** she has sold out of green twice. She believes, and she sells.
- **Secret / want:** under the counter she keeps green candles for the faithful, sold only to those who
  ask for "the late-burning ones".
- **Lines:** stall *Candles! Blue for seeing, white for praying!* · greet *Light, holy one? You'll want
  plenty.* · bark *Rosy's not written. The road's shut, that's all.*
- **VOICE:** Female, late twenties, a village candlemaker. Quick, bright, sharp-edged voice with a
  Northern Irish (Ulster) accent. Fast, cheeky and clever, with crisp consonants, and a softer, wistful
  note when she talks of Millhaven.

#### Widow Harrow
*Widow. Her cottage, where Wren lodges. Sixty-nine.*
- **Who:** She talks to her husband Ned, nine years dead, and says he answers. Gentle and uncanny,
  cheerful in a way that unsettles people. She knew the Flame would come because Ned told her. She takes
  in strays, Wren among them. Brand brings her flowers.
- **Speech:** Soft and sing-song, with asides to Ned in the middle of a sentence ("Ned says you're
  taller than he thought"). Matter-of-fact about the uncanny.
- **Calls him:** "my lovely".
- **Ties:** **Ned**: dead. **Wren**: her lodger. **Brand**: the flowers. **Hesk**: an old friend, who
  thinks it is grief. It isn't, quite. **Odile**: they pray together on the steps.
- **Believes:** "Ned saw you coming. He's got a better view now."
- **Secret / want:** Ned's voice comes up through the floorboards. Lately it has been asking to be let
  in.
- **Lines:** greet *There's my lovely. Ned, look who it is.* · talk *Ned says the bell rings for
  someone it shouldn't. He won't say who.* · bark *Yes, Ned. I heard you. I'm old, not deaf.*
- **VOICE:** Female, about seventy, a village widow. Soft, sing-song, gently quavering voice with a
  lilting North Welsh accent. Cheerful, kindly and calm, in a way that is quietly unsettling. She talks
  to the dead as easily as to the living.

#### Tam
*Farmer and stableman. The Stables. Forty.*
- **Who:** Slow-spoken and kind, with a simple faith. He works the stables and a strip of turnips. His
  cart is in the crater. His cow has bad dreams. He named his new calf after the Flame, and calls her
  Daisy in company. His brother Col is the miller at Millhaven, cut off by the dread knights.
- **Speech:** slow and plain, weather and beasts. "I reckon."
- **Calls him:** "sir". Once, by mistake, "your holiness".
- **Ties:** **Osric**: the cart, and the crater tax. **Agnes**: flour. **Ebb**: Rosy. **Brand**: Tam
  begs him to clear the road. **Hob**: stablemate.
- **Believes:** simply, the way he believes in rain.
- **Secret / want:** he sleeps in the barn because the cow wakes lowing towards the crater, and he's
  afraid she sees something there.
- **Lines:** greet *Morning, sir. Mind the muck.* · talk *My brother Col's at Millhaven. No flour in a
  month. Look in on him, if you pass?* · bark *Easy, girl. It's only the bell.*
- **VOICE:** Male, about forty, a farmer and stableman. Slow, warm, broad Somerset (West Country) burr.
  Plain and gentle, unhurried, a little bashful, with a simple faith and a kind heart.

### 5.3 Velscour's garrison in Bellmourn

Six of the Sworn are quartered in the Watch Barracks: Aldric, Morwen and Sabine walk the square, and
Ulf, Corvus and Bram are only talked about. They have only `greet`, `talk` and `bark` lists.

- They never say the Name. They hunt for whoever does.
- They speak to villagers by name or by trade ("Smith." "Reeve."), and to the player as "stranger".
- Menace through courtesy and patience. They don't shout in the village. They don't need to.

#### Ser Aldric
*Officer of the garrison. Watch Barracks. Thirty-eight. Templar armour set.*
- **Who:** He commands the six Sworn in Bellmourn. A proper knight: correct, rigid and cold, who
  believes in order and in the oath. Ser Hugh, the knight the star fell on, was his sworn brother.
  Aldric kicked through the armour in the crater looking for the rest of him. He hunts the man from the
  crater with a grief he calls duty.
- **Speech:** Clipped and formal. Commands and questions. "Say it." "Kneel." Never a wasted word, never
  a joke.
- **Calls him:** "stranger".
- **Ties:** **Brand**: a shared roof, contempt edged with respect. **Osric**: he half knows the reeve
  lies, and lets it pass, for now. **Morwen**: he fears her, because she reports to Malgrave over his
  head. **Garrow**: grinds his blade. **Odile**: he burns her copies. **Idris**: wants to know what
  fell.
- **Believes:** "There is no Sacred Flame. There is a man. Men die." But he saw the armour.
- **Secret / want:** the player carries Hugh's sword, the scorched Vigil arming sword from the crater.
  Aldric knows it on sight and wants it back.
- **Lines:** greet *Stranger. Stand still.* · talk *That sword was my brother's. Keep it clean. I will
  come for it.* · bark *Velscour is lord. Here as everywhere.*
- **VOICE:** Male, late thirties, the officer of a company of black knights quartered in a village.
  Cold, clipped, upper-class English (Received Pronunciation) baritone. Precise and controlled, every
  sentence an order, with grief and anger pressed flat beneath correctness.

#### Black Morwen
*The garrison's inquisitor. Watch Barracks. Thirty-three. Fiend armour set.*
- **Who:** Malgrave's ear in Bellmourn. Quiet, patient, courteous, and the most frightening person in
  town. She gets people to say the name, to see who flinches. She remembers everything. She was born in
  Bellmourn. Hesk delivered her, and she took the black at sixteen. Nobody says so to her face.
- **Speech:** Soft, unhurried and intimate. She asks questions she already knows the answers to, uses
  first names, and lets silence do the threatening. She never raises her voice. Sometimes she sounds
  kind, which is worse.
- **Calls him:** "new face", or "stranger".
- **Ties:** **Hesk**: delivered her. **Hild**: duels of silence. **Tobias**: she drinks at his inn and
  asks about the toasts. **Elsie**: asked her to sing. **Aldric**: outranks him in fear, if not in
  title. **Wren**: knows about the scuffed tracks.
- **Believes:** she doesn't care what he is. She cares who says what.
- **Secret / want:** her mother lies in the yard. Morwen leaves something on the grave at night, and she
  knows where every grave in Bellmourn is.
- **Lines:** greet *New face. I collect those.* · talk *Everyone stops talking when you pass. I find
  that so interesting.* · bark *Someone always says it. In the end.*
- **VOICE:** Female, early thirties, a black-armoured inquisitor. Low, soft, silken voice: cultivated
  Received Pronunciation with a faint country vowel she has worked hard to lose. Slow, intimate,
  patient and polite. Chillingly calm, with the hint of a smile.

#### Dame Sabine
*Knight of the garrison. Watch Barracks. Fifty. Drake armour set. Desktop only.*
- **Who:** The oldest of the six, a veteran who has seen too many hangings. Dry, tired, sardonic and
  dutiful. She feeds a stray cat she named Tithe. Of all the Sworn in town, she is the one who might one
  day look away.
- **Speech:** dry, weary and aristocratic, with truths dressed up as complaints.
- **Calls him:** "stranger"; townsfolk "child".
- **Ties:** **Isolde**: pity, rank and shame. **Maud**: respect, since Maud beat Ulf. **Aldric**: she
  thinks him young. **Morwen**: she dislikes her. **Tithe**: the cat.
- **Believes:** in nothing, officially. She is afraid he might be real.
- **Secret / want:** she was at Lord Aymer's hanging, and she held the ladder.
- **Lines:** greet *Move along, stranger. Slowly. My knees.* · talk *I have kept the vigil thirty
  years. It used to mean something.* · bark *Tithe. Here, Tithe. Leave the man's sausage.*
- **VOICE:** Female, about fifty, a veteran knight. Dry, low, weathered upper-class English voice
  (Home Counties RP), unhurried and sardonic. Tired authority and a cynic's gallows wit, with a
  conscience buried somewhere that she keeps underfoot.

### 5.4 In the roster, never on screen (they never speak)

Anyone may mention these seven. Keep the details consistent.

- **Hob:** the stable lad, about seventeen, at the Stables. He leaves flowers and ribbon at the
  mausoleum for a girl fifty years dead. He borrowed the watch's crossbow string for a kite and wants
  to join the watch.
- **Joan:** the tanner, about forty. Her tannery is downwind of the chandlery. She is feuding with Ebb,
  and her dog follows the Sworn about.
- **Sigurd:** a northern sellsword lodging at the Tolling Bell. He pays in old gold stamped with a
  queen nobody remembers. He writes letters to a wife and never sends them, and he once sparred with
  Hild.
- **Corin:** a mapmaker lodging at the Tolling Bell who has never been past the crater. He draws what
  travellers tell him and has sold the same Gloamhollow map three times.
- **Ulf:** the biggest of the Sworn. He lost an arm-wrestle and a gauntlet to Maud, and kept his helm
  on throughout.
- **Magister Corvus:** the garrison's adept, in the Runebound robes. He bought every candle Ebb had.
  He listens to the bell (§3.10).
- **Bram:** a Sworn brawler who can't read and holds notices upside down. He went white, then red, the
  first time he heard the Name, and then went looking for whoever said it.

---

## 6. Enemies

### 6.1 The Sworn of the Vigil (the Keep, the roads and the downs)

The same voices speak for everyone who fights in plate: the Sworn and Adepts of the Vigil at
Blackvigil, and the Dread Knights, Ashen Templars and Gravewardens on the downs.

**Creed and oaths.** "Velscour is lord." "The Vigil holds." "Kneel to the V." "The V does not
tarnish." The oath is one word, said like the last word of a prayer: "Everything."

**How they talk.** Clipped, contemptuous soldiers' speech: commands, wagers, drill. They mock what
Bellmourn is (turnips, prayers, mud, pot-lid shields) and where he came from (crater-born, the man
from the hole, little star). The creed comes out in a fight like a drumbeat. They never say the Name,
never swear by heaven or saints, never make speeches.

**The fear underneath.** Ser Hugh's death haunts them: "A dozen strides. He got a dozen strides."
They whisper about whether he is really *him*, then shut it down. Losing makes them brittle and fast;
winning makes them cruel and slow.

**Dying.** The man or woman under the plate comes out. Some say the creed. Some ask for their mother,
or say they wanted to see spring. Now and then one says "So it was you." No jokes in death lines.

**Lists**, as in `lines/foes.js`: `spot`, `taunt`, `hit`, `hurt`, `wounded`, `kill`, `lose`, `flee`,
`die`. **Banter** comes in four moods: `start` (closing in), `fight`, `losing` (you've just cut one
down) and `winning`. Write each banter for named pool voices (*the Captain and the Veteran*): lines
are recorded per voice, so a banter can't be cast at random.

**Who says what.** The Sworn of the Keep speak the creed most. The Ashen Templars are old and tired,
and remember the order before it turned: "We kept a better vigil once." The Gravewardens are coarse
and talk about the dead as cattle: "Back in your row." The Dread Knights are the brutes and the
boasters. The Adepts of the Vigil fight bareheaded with blade and staff, and speak in the Blood
Witch's register (§6.3) in pool voices.

**The voice pool: four men and two women** (the game adds the helm).

- **The Captain** (m) commands, judges, dismisses. *Shields together. He bleeds like the rest.*
  - **VOICE:** Male, late forties, a commander of black knights. Cold, deep, upper-class English
    (Received Pronunciation) baritone. Unhurried, clipped and contemptuous; every line an order or a
    verdict.
- **The Young Blood** (m) boasts, then wobbles. *He dropped a star on Hugh. On Hugh!*
  - **VOICE:** Male, mid-twenties, a young black knight. Sharp, fast, upper-class English tenor,
    cocky and loud, with nerves showing through the swagger when things go badly.
- **The Veteran** (m) wagers, jokes on the gallows, has seen it all. *A crown says he lasts till the
  bell. No. Make it a breath.*
  - **VOICE:** Male, mid-fifties, an old soldier risen from the ranks. Gravelly, worn voice with a
    rough East London accent. Cynical and amused, betting on everything, unimpressed by anything.
- **The Brute** (m), slow, few words, enjoys it. *Come here. Little star.*
  - **VOICE:** Male, mid-thirties, a huge, slow knight. Very deep, slow, heavy bass with a Scottish
    Borders accent. Few words, savoured; a low chuckle in the throat; simple cruelty.
- **The Blade** (f), a duellist, cool and precise, mocks his technique. *You swing like a ploughman.*
  - **VOICE:** Female, early thirties, a duellist knight. Cool, clear, precise alto in Received
    Pronunciation. Mocking and controlled, with an elegant contempt, quick and light.
- **The Zealot** (f) prays to Velscour mid-fight, the creed as scripture. *Everything. Everything.*
  - **VOICE:** Female, mid-forties, a fanatical knight. Hoarse, intense voice with a hard Yorkshire
    accent. Fervent, chanting the creed like prayer, rising to a cracked shout.

### 6.2 Ser Malgrave, the Red Hand of Velscour

- **Who:** Lord of Blackvigil, half as big again as his knights and burning red. He waits on the Red
  Throne before the oath-sealed chest. He hangs those who say the Name and seals each hanging with his
  ruby signet. He has been the Lord's blade for thirty years. He wants the man from the crater, alive,
  to lay before Velscour, and he wants Bellmourn to watch him break.
- **Register:** Few words, absolute certainty, courtly cruelty. He never hurries and doesn't shout until
  he is below half his life. Then he is fast and terrible, and furious that he can be hurt. He speaks to
  the player as "star". He knows Bellmourn: the reeve's letters, Lady Isolde's husband. *Your town had a
  lord once. He kicked a long while.*
- **Lists:** `lordTaunt`: shorten the old list to 2 to 8 words each, and keep the best of it (*You
  killed my knight by falling on him. I'll kill you on purpose.* is fine at its length). A first-sight
  line in the throne room: *So. The star.*
- **Death speech:** three short lines, the only time he says the Name.
  *Kneel. No. I see.* / *I hanged men for your name. Every one of them was right.* / *He has seen you
  now, Tessariel. He will come himself.*
- **VOICE:** Male, about fifty, a warlord in black plate. Very deep, slow, menacing bass in
  upper-class English. Quiet, controlled and utterly certain; he never needs to raise his voice. A
  cold courtliness over bottomless contempt, with the faint relish of a man who enjoys his work.

### 6.3 The sorcerers

They walk the downs with the dread knights, keep their distance and blink away when pressed. Their
lines promise and gloat, never explain. The game adds a chorus and a swell, so design the voices dry.

- **Hollow Magister** (arcane; raises the dead). A scholar of the hollow places under the world. Dry,
  condescending and precise. He calls the player "specimen" and "little candle". *The ground is hollow.
  So are you.* / *Rise. We have a guest.*
  - **VOICE:** Male, mid-sixties, a cold scholar-sorcerer. Thin, dry, papery voice in precise, educated
    Received Pronunciation. Quiet and condescending, every word clipped and exact, with a whisper's
    intimacy.
- **Blood Witch** (blood bolts, hexes the ground). Wicked delight, intimate and sing-song. She reads his
  blood and tastes his fear. She calls him "sweet", "flame" and "pet". *Bleed for me, pet. Slowly.* /
  *The ground's mine now. Mind your feet.*
  - **VOICE:** Female, mid-forties, a gleeful blood-witch. Low, husky, purring voice with a West Country
    accent. Playful and sing-song, mocking and intimate, sliding into a hiss.
- **Rot Hierophant** (venom; raises the dead). A preacher of rot as a sacrament. He has a sermon's
  cadence, wet and ecstatic, and blesses the player's decay. He calls him "brother". *All flesh is a
  slow sermon, brother.* / *Rot takes all. Rot takes you.*
  - **VOICE:** Male, late fifties, a mad hedge-preacher of decay. Wet, phlegmy, rolling baritone with a
    Cornish accent. Sermonising cadence, ecstatic and slow, swelling to a ranting crescendo, gurgling at
    the edges.

### 6.4 The champions (the bosses under the ground)

Each is one of the dead grown huge. They may have a few lines each (spot, wounded, die) in their own
voices. The game adds the dead's effects.

- **Abbot Cindermaw, the Ember Abbot.** Liturgy turned to fire, in the old abbots' speech. *Kneel, and
  be lit.* / *The censer swings. The bell answers.* / dying: *Out. At last. Out.*
  - **VOICE:** Male, very old, a burning abbot. Cracked, dry, scorched voice with a clerical, cultivated
    English intonation, chanting like plainsong, rasping as if every breath is smoke.
- **The Drowned Mother.** Keening, mostly without words. The few words she has: *Children.* / *Down.
  Stay down.* / *Mine.*
  - **VOICE:** Female, ageless, a drowned giantess. Low, wet, choking keen, half song and half gurgle;
    slow and mournful, rising to a scream.
- **The Wight of Saint Ivo.** It wears the saint's face and speaks his Testament wrong. *The Fiend upon
  his far throne shall know... nothing.* / *Wake me? I am awake.*
  - **VOICE:** Male, ancient, a dry corpse speaking in a dead saint's voice. Whispering, papery and
    hollow, with a priest's measured cadence gone wrong, gentle and horrible.
- **Old Gnarlgut, the Trollhole King.** No words. Bellows, grunts, a chewing laugh.
  - **VOICE:** a huge cave troll. A cavernous bass roar, wet snorts and grinding grunts, with a slow,
    chewing laugh. No words at all.

### 6.5 The dead

**The rules.** The dead don't converse. They mutter fragments of the lives they had: one to five
words, ellipses allowed, never a full thought. Where they died decides what they say. Bellmourn's own
dead may name Bellmourn places (the well, the Tolling Bell, the yard), and now and then a living
person's name: Agnes, or Hild, heard from the dark, is worth more than any monster's roar. Their death
lines are release (thanks, rest, a name remembered, quiet), the most important lines the dead have,
so let them be gentle. No jokes, ever; a line that comes out sad-funny by accident ("is it Sunday")
is allowed.

**What they mutter, by kind and place.**

| Kind (in game) | Where | Their fragments |
|---|---|---|
| Rotting dead (shambler and family) | yard, Undercroft, Darkwood | Daily life cut off: *my bread... it's burning* / *is it Sunday* / *Mother?* / *the well... down the well* / *don't bury me* |
| Plague-bearers | yard, Old Watch Cellars, the walled Plague Ossuary | Fever and thirst: *water... please* / *don't touch me* / *burn the bedding* |
| Tomb mummies and pale ghouls (the old, dry dead: whispered) | Barrow, Undercroft | Old words, prayers worn away: *keep the vigil* / *the saint sleeps* / *ring for the abbot* / ghouls: *hungry... always* |
| Bloated drowners and deep maws (drowned: gurgled) | the Grotto, the falls, the stream | *cold... pull* / *the bottom* / *Mother wants you* / *come in, the water's...* |
| Ember husks | Deep Undercroft | *hot... so hot* / *the censer* / *Abbot... Abbot...* |
| Chitin fiends, fungal husks, bog trolls | the deep places | No words: only the wordless set below |
| The old watch, in the Old Watch Cellars | the cellars | *hold the stair* / *who goes there* / *keep the standard dry* / *tell my girl... I held* |

**The wordless set.** This replaces `gibberish()`. Each dead voice records all fourteen. Moans are
picked from this list, and a fragment from the table above surfaces sometimes.

> *Hhhaaah.* · *Uuunnh.* · *Mmmmh.* · *Nnnngh.* · *Ghhhh.* · *Aaah...* · *Hhuh. Hhuh.* · *Ohhh...* ·
> *Rrrhhh.* · *Kkhh.* · *Hnnn...* · *Aaaghh!* (the lunge) · *Uh. Uh. Uh.* (the shamble) ·
> *Hhhhhh...* (the last breath)

**Death lines** stay in the old spirit, short. *rest... at last* / *thank you* / *the bell... stops* /
*I remember my name* / *warm... at last* / *tell them* / *home*. A few of the Undercroft's may thank
the Flame. None says the Name.

**The dead's voice pool.** The game adds the undead chains: the dead get the sub and ring, the drowned
gurgle, the old whisper.

- **Dead man:** Male, middle-aged, a walking corpse. Hoarse, rasping, broken voice, barely human,
  slow and moaning, gasping between words, as if the throat has forgotten how.
- **Dead woman:** Female, middle-aged, a walking corpse. Thin, cracked, breathy voice, wavering and
  lost, moaning softly, words falling apart as she speaks.
- **Drowned man:** Male, a drowned corpse. Thick, waterlogged, choking voice, bubbling and slow, words
  half swallowed.
- **Drowned woman:** Female, a drowned corpse. High, wet, keening voice that chokes and gurgles,
  mournful and slow.
- **Old dead man (wraith):** Male, ancient, a mummified corpse. Dry, papery whisper, long breaths
  between words, an old-fashioned solemn cadence.
- **Old dead woman (wraith):** Female, ancient, a mummified corpse. Dry, rustling whisper, faint and
  hollow, slow, like dead leaves speaking.

### 6.6 The cave beasts (noises only)

Ghasts and grubbers are living things of the deep rock. They make noises, never words. Write a fixed
set of ten to twelve noises each.

- **Ghasts** are pale, fast, on all fours, and live in the dark. They shriek when they find you, hiss
  as they circle and click as they wait: *Hsssss!* · *Kkkhhh...* · *Skreeee!* · *Tk. Tk. Tk.* ·
  *Hhhaaah!* · *Sssst.*
  - **VOICE:** a pale cave predator, no words. A high, thin shriek and rasping hisses, sharp clicks of
    the tongue, fast, panting breaths. Inhuman and frantic.
- **Grubbers** are squat warren-dwellers who farm fungus and swing nail-studded clubs. They grunt,
  snort, gurgle and chuckle wetly: *Grk. Grk.* · *Hurr-hurr.* · *Snrrk!* · *Gluk.* · *Hrah!* ·
  *Huff. Huff.*
  - **VOICE:** a squat cave brute, no words. Low, wet grunts and snorts, gurgling chuckles, guttural
    barks of effort; thick and piggish.

---

## 7. Who talks to whom

Conversations are written for these named pairs and trios, so their history comes through. Each pair
gets a flavour and an opening line in the new style to set the tone. **(P)** marks a pair whose
members both appear on a phone; give those the most conversations, because they are all a phone
player will ever hear.

### 7.1 Pairs

| # | Pair | Where and why | Flavour, and an opening line |
|---|---|---|---|
| 1 | **Odile and Hesk** (P) | Housemates, House of Mending | Faith against physic, bickering like an old married couple, love underneath. *Pray for them if you like. I'll boil the bandages.* |
| 2 | **Odile and Osric** (P) | Cathedral steps | Candles against coin; the bishop who never writes; his bowing. *You bowed to him again, Osric.* / *Slowly, Sister. I bowed slowly.* |
| 3 | **Odile and Idris** (P) | Steps, or his door | Book against ledger, the star; prickly mutual need. *Your Book has excellent aim, Sister. Terrible prose.* |
| 4 | **Odile and Aldric** (P) | The square | He burns her copies; she answers him in scripture. The most dangerous courtesy in town. *What did you read on holy day, Sister?* / *Psalms. About bread.* |
| 5 | **Odile and Wren** (P) | Steps | Scripture against "I saw him fall". Odile wants Wren to stay at his side; Wren won't be told. |
| 6 | **Hesk and Garrow** (P) | The forge door | Old friends. She pushes him towards Agnes; Aldo goes unspoken between them. *Eat her bread. Then ask her the question.* |
| 7 | **Hesk and Osric** (P) | House of Mending | The daily draught. The town thinks it's a courtship. Their talk is in code. *Same as yesterday, Osric?* / *Same as yesterday.* |
| 8 | **Hesk and Brand** (P) | Barracks, or Mending | His knees, his nights, his stubbornness. *Sit. Your knee's louder than the bell.* |
| 9 | **Hesk and Morwen** (P) | The square | The midwife and the girl she delivered. Morwen probes, and Hesk doesn't flinch. Neither says the word "born". |
| 10 | **Garrow and Tobias** (P) | The inn at night | One cup together. Two men who lost someone to the dark, talking about anything else. *Same again.* / *Same again.* |
| 11 | **Garrow and Wren** (P) | The forge | Arrowheads; the axe his father made for her grandfather. Two plain talkers who respect each other. |
| 12 | **Garrow and Aldric** (P) | The forge | Grinding the Sworn's blades. A cold civility over hate. *Sharper than last time, smith.* / *Steel's steel.* |
| 13 | **Brand and Hild** (P) | Barracks, the walls | The sergeant and his watch of one: dice, sleep, the banner. Father and daughter in all but name. *Sleep, Hild.* / *After you, Sergeant.* |
| 14 | **Brand and Aldric** (P) | The barracks | One roof, two oaths, every round walked twice. Brand ranks lower and knows it. |
| 15 | **Brand and Osric** (P) | Town Hall | Late pay, reports on the graveyard, the wall wanted higher. *Write quiet, Sergeant. Big letters.* |
| 16 | **Brand and Tobias** (P) | The inn | The watch's slate; news off the road; gossip about Brand's flowers. |
| 17 | **Hild and Wren** (P) | The western woods, the crater | The two who went to the edge. Few words each: the quietest talk in town. *Tracks?* / *His. Scuffed.* / *Good.* |
| 18 | **Hild and Morwen** (P) | The barracks, the square | Duels of silence. Morwen asks; Hild answers with as little as there is. |
| 19 | **Hild and Idris** (P) | His door | He wants a drop of her blood for a measurement, and she says no every day. A running thread. |
| 20 | **Idris and Hesk** (P) | Between their doors | Rival remedies. *Poison in pretty bottles.* / *Medicine in ugly ones.* |
| 21 | **Idris and Aldric** (P) | The square | *What fell, alchemist?* / *A stone, Ser Aldric. A very green stone.* |
| 22 | **Tobias and Morwen** (P) | The inn | She drinks and asks who toasts whom. He sweats and pours. |
| 23 | **Tobias and Osric** (P) | The inn, the Town Hall | The ale tax, the crater fence. Osric suspects the "after" box. |
| 24 | **Tobias and Wren** (P) | The inn door | Hares for the pot; she searches the falls for Piers's boat; he can't ask, so she tells him. |
| 25 | **Osric and Aldric** (P) | The square | The daily lie, the tithe, the reeve's polite knife. *The tithe is short, reeve.* / *So is the harvest, Ser Aldric. I'll write it down.* |
| 26 | **Wren and Morwen** (P) | The crater, the woods | Hunter and hunter. Morwen knows the tracks were scuffed. |
| 27 | **Garrow and Agnes** | The forge door, mornings | The loaf, and the ring in his apron. The slowest courtship in Bellmourn. *It's warm.* / *It's always warm.* |
| 28 | **Grimwald and Bertha** | Their stall | A marriage run like a shop: the cash box, the comet ash, the flour bin. |
| 29 | **Tobias and Elsie** | The inn | Uncle and niece: her singing, his fear, Piers. |
| 30 | **Wat and Maud** | The cooperage | Apprentice and master: the proposal, the cart, the barrels hooped twice. |
| 31 | **Wat and Elsie** | The well | The poem, a heart or a turnip. Young and shy and doomed-sweet. |
| 32 | **Ebb and Grimwald** | Facing stalls | Rival hawkers: candles against "comet ash". |
| 33 | **Brand and Harrow** | Her gate | The courtship. Ned approves, she says, and Brand doesn't know where to look. |
| 34 | **Harrow and Wren** | The cottage | Landlady and lodger. Harrow passes on messages from Ned, and Wren humours her, mostly. |
| 35 | **Isolde and Osric** | Town Hall | Lady and reeve. She shames his bowing, he shields her defiance, and they share a grief. |
| 36 | **Isolde and Sabine** | The square | Two women of rank on opposite sides: pity, and the ladder Sabine held. |
| 37 | **Tam and Ebb** | The stables, her stall | Col and Rosy at Millhaven; waiting for the road to open. |
| 38 | **Tam and Agnes** | The bakehouse | Millhaven's flour has come down grey. |
| 39 | **Maud and Sabine** | The inn | Ulf's gauntlet. Respect across the V. |
| 40 | **Odile and Elsie** | The steps | The hymns Odile taught her, and the danger of singing them. |

### 7.2 Trios

| Trio | Where | Flavour |
|---|---|---|
| **Odile, Hesk and Osric** (P) | House of Mending | The town's elders deciding what to do about him, each from their own fear. |
| **Brand, Hild and Aldric** (P) | Barracks door | The watch and the garrison changing rounds. Two against one, and the one holds all the power. |
| **Tobias, Garrow and Wren** (P) | The inn at night | The table by the fire: the lost, and the one who goes looking. |
| **Morwen, Tobias and Hild** (P) | The inn | An interrogation over a cup of ale. |
| **Grimwald, Bertha and Ebb** | The stalls | The market: haggling and gossip. |
| **Wat, Maud and Elsie** | The well | The young ones, and Maud, who isn't young and says so. |

---

## 8. The opening walk

The opening is cut down to a brisk walk of about three minutes, with roughly forty spoken lines in
all. It does three jobs: it gives the player his first human voices, it gets him dressed and armed,
and it teaches the danger without anyone saying the Name until the very end.

**Route:** the crater on the north-west meadow, then the lane south past the Alchemist's, then
Hammerfall, then the square and the well, then the Tolling Bell's door, then north up the cathedral
lane to the steps, where Hesk has come out of the House of Mending next door. That is about two
hundred and thirty strides at Wren's pace.

**The core cast** all appear on a phone: Wren, Hild, Idris, Garrow, Osric, Aldric, Morwen, Tobias,
Hesk and Odile. Elsie and Agnes are desktop-only flourishes, and no gift depends on them.

**Before it starts:** the cinematic. Its four scripture captions should be **read in Odile's voice**,
quietly, like a lesson in a cold church. They are the first voice the player hears, and the walk ends
with her.

### The beats

1. **The crater floor.** Wren on the rim, Hild beside her with the crossbow. Warmth and urgency; on
   the way up he picks up the knight's sword, shield and staff.
   - Wren calls down as he comes round: *Hoy! You, down there! Can you stand?* / *Easy. Glass is
     still hot.* / *Bring the knight's things. He's done with them.*
   - Hild: *He's moving.* / *Garrison will be out to look. Get him up.*
   - While he climbs, between themselves: Hild *That was one of the Sworn.* Wren *Was.* / Hild
     *They'll want to know who.* Wren *Then we'd best know first.*
   - Wren's nudges, about four (*Up here. Where it's not so steep.* / *That's it.*) and lag lines
     (*This way.* / *Keep up.*).
2. **The rim.** Wren gives the hand wraps: *Wrap your hands. You'll want them.* Hild goes ahead:
   *I'll keep the Sworn busy at the well.* Wren leads: *Come on. Town's this way. Stay by me.*
3. **Past the Alchemist's** (no stop). Idris at his door, a spark of wonder and a seed for his quest:
   *You should be ash! Come and see me. Later. Go, go.*
4. **Hammerfall.** Garrow gives the armour (gambeson, chausses, boots, cap), so he's dressed before
   the square: *Garrow. Smith.* / *You can't walk into town in your smalls, lad. Arms up.* / *There.
   Now you're nobody. Good.* On desktop Agnes is at the door with Garrow's morning loaf and gives it
   to *him*: *Eat, duck. Garrow can wait. He's good at it.*
5. **The square and the well**, the beat that teaches the danger. Ser Aldric at the well with Black
   Morwen, Hild standing near.
   - Aldric: *You. Stand still.* / Osric, stepping in: *A tinker, Ser Aldric. His cart went up in
     the fire.* / Aldric: *Then he's a lucky tinker. Move him on, reeve.*
   - Morwen, as they pass: *New face.* Wren, low: *Keep walking. Don't look at the V.*
   - Osric, past the well and out of earshot: *Osric. Reeve. I lie for the town. Don't make it
     harder.*
6. **The Tolling Bell's door.** Tobias gives forty crowns. On desktop Elsie bursts out (*It's him!*)
   and is sent back (*Inside, Elsie. Now.*). Tobias: *Tobias. The Tolling Bell. Forty crowns out of
   the box. Come back and drink some of it.*
7. **The cathedral steps.** Hesk, out of the House of Mending, gives the draughts: *Hands. Hm. Not a
   burn on you. That's not natural, and I'm glad of it.* / *Red for the blood, blue for the head.
   Drink before you need it.* Wren hands him over (*Sister. Here he is.*) and takes her leave
   (*That's you delivered. I'm at the widow's if you need me.*). Odile draws him under the porch,
   glances at the square (the garrison is out of earshot), and says it:
   - *In here we may say it. You are Tessariel. The Sacred Flame.*
   - *The Book says you will end Velscour. The Litany says the dead lie down where you walk.*
   - *They do not lie down. They walk beneath this floor.*
   - Her **!** appears; pressing E gives the offer of The Dead Beneath the Bell (§4).

### Rules for the walk

- **Every stop** is two to four lines and nobody repeats information. The town's whole situation is
  in the square beat, without one word of explanation.
- **If he wanders off,** Wren calls once (*Not that way. That way's the Keep.*) and waits. Gifts not
  yet given arrive on Continue, as the game does now.
- **Nobody says "Tessariel"** before Odile does. Everyone before her says "him", "you", "lad" or
  "tinker". That holding back is what makes her line land.

---

## 9. Coming: Orrin the Bellwright

This section is for the mountain expansion, which isn't merged yet. **Do not write lines for him for
the current game**; villagers may mention "the old mage who walked out" as rumour.

- **Who:** He is seventy-one. Once he was the turned Vigil's battle-mage in Bellmourn, quartered in the
  Mage's Tower, the man who burned what Velscour told him to burn. Nineteen years ago he walked out.
  Since then he has kept the Bell Tower of the Four Watches on Bell Knoll in the north-east of the
  downs. He rings its bells, Mourn, Vigil, Mercy and Dawn, at noon and midnight, never late, because
  their ringing holds down what Velscour's adepts woke under the knoll. He still wears the Runebound
  Regalia with the helm off: "Penance is a garment, too."
- **Ties:** Corvus is his successor in Velscour's service, and Orrin despises him. Hesk, Osric and
  Harrow remember the mage in the tower, and the fires. Odile will want him to answer for them. He knows
  more about bells, and the First Bell, than anyone alive.
- **Speech:** Precise, rueful and exacting. He talks about tuning and bronze the way other men talk
  about their children, and about his past with contempt. Short, finished sentences: a commander's
  habit, gone quiet.
- **His existing lines** are the right register; keep them, trimmed: *Noon and midnight. Never late.
  Not once in nineteen years.* / *The bronze remembers every hand that rang it.* / *Mourn is out of
  true again. A hair flat.* / *Mind the hatch. What is under it does not sleep. It waits.* / *I wore
  his colours once. I still wear them. Penance is a garment, too.*
- **VOICE:** Male, about seventy, a retired battle-mage turned bell-keeper. Dry, measured, educated
  Edinburgh Scots. A voice that was once a commander's and is now a hermit's: precise, rueful and
  quietly formidable, tender when he speaks of the bells and contemptuous when he speaks of himself.

---

## 10. Canon decisions

Where the old lines or code disagreed with each other, or were thin, this is what was chosen.

1. **Blackvigil's age.** Malgrave says the Keep has stood five hundred years; a garrison chat says the
   Vigil has stood three hundred. **The Keep is five hundred years old. The Vigil turned to Velscour
   thirty years ago.** Drop the three hundred.
2. **The priest.** Several old lines speak of "the priest... he". **Father Anselm, the last priest,
   died three winters ago.** Odile keeps the cathedral alone. Retire the male-priest lines.
3. **Cindermaw's censer.** Odile remembers it swinging at her confirmation, yet its lore says it swung
   below for a hundred years. **It hung in the vestry as the Abbot's relic until last winter, then
   vanished.** It now swings below. The Censer's lore line in `uniques.js` should say so.
4. **"The Book spells it with two Rs."** Tessariel has two S's and one R. Drop the joke.
5. **Garrow's Oath** fires on the first talk with Garrow, but its words assume he has come back up the
   stair. **Gate it after The Dead Beneath the Bell.** Garrow gives the armour in the opening first.
6. **"I've two watchmen."** The watch is Brand and Hild, and nobody else. (Hob wants to join.)
7. **"Templars"** in old lines. That is the old name for the Vigil's knights before the turning, and
   the Ashen Templars on the downs are the remnant. Townsfolk call the garrison "the Sworn", never
   Templars.
8. **Nell the carter** appears in old lines but not in the roster. Retire her.
9. **Numbers of rooms and dead.** Nobody gives the Undercroft's room count, and Odile never speaks the
   count of the dead: it's set at run time, and the brief and tracker show it.
10. **"Stranger" and "adventurer" lines** from before the comet are gone. He is the man from the
    crater. Only the garrison and the Sworn call him stranger.
11. **Elsie's "sweetheart who only comes after the bell"** is retired. Hob's courtship at the
    mausoleum keeps that idea.
12. **Tessariel's Brand** was "struck from Malgrave's blade in the green fire". **Garrow forges it
    from Malgrave's sword in the crater's fire,** and Odile gives it.
13. **Two thrones.** The Red Throne is Malgrave's seat in Blackvigil. The far throne is Velscour's,
    and nobody knows where it is.
14. **Homes the code leaves open.** Wren lodges with Widow Harrow (the roster allowed Mending or
    Harrow); Odile lodges at the House of Mending; Joan keeps her own tannery; the cooperage, the
    chandlery and Harrow's cottage are spoken of, never entered.
15. **The Mage's Tower** has no tenant in the code. Here it was the Vigil's battle-mage's billet until
    nineteen years ago. That is Orrin (§9), to be confirmed when the mountain branch merges.
16. **"Gods of Bellmourn"** in a knight's death line. The faith has saints and heaven, not gods.
17. **Hammerfall** appears as "Hammerfall Smithy" (the building) and "Hammerfall Forge" (the shop).
    In speech it is just Hammerfall.
18. **The opening's crowd.** The README gathers the whole village at the crater; now Wren and Hild
    meet him there and the rest along the walk. The town still screamed as one, from its doorsteps.
19. **Names invented here** where the canon needed them: Ser Hugh (the knight the star fell on),
    Piers (Tobias's brother), Rook (Wren's grandfather), Lord Aymer (Isolde's husband), Margery
    (Osric's wife), Ned Harrow, Col the miller and his daughter Rosy, and Father Anselm.
