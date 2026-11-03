// Quests, after the way World of Warcraft does them. Someone with a yellow ! over their head has
// work for you: speak with them (E) and they tell you about it; take it and the ! turns to a grey ?
// over their head (it's under way); finish it and the ? turns yellow (come back); hand it in and it's
// gone, unless they've more for you. Every quest says on the map where it's done, and what's under
// way can be followed in the tracker on the screen (T shows and hides it; the quest log, L, picks
// what it follows).
//
// The work: the dead of the Undercroft (as many as lie there: counted when you take it), the Ember
// Abbot in the Deep Undercroft, gravebloom from the graveyard, Velscour's dread knights on the downs,
// Sworn steel from their bodies, glowcaps from the Gloamhollow, the Trollhole's king, the Drowned
// Mother, Saint Ivo's reliquary from his barrow, the old watch's standard from its cellars, and in
// the end Velscour's Red Hand on his throne. Each pays in experience and coin, and in one of the
// village's treasures (uniques.js).
//
// Kills come in through onKill (every death in the world), things to gather lie about the world while
// they're wanted, and the bosses (champions: one of the dead grown huge) are raised when the quest is
// taken (and again when a game is loaded with it under way).
import * as THREE from 'three';
import { makeUnique } from './uniques.js';
import { makePotion, RARITY } from './gear.js';
import { tooltip } from './bag.js';
import { STAIRS, GRAVEYARD } from './world.js';
import { DELVES } from './delves.js';
import { glowTex } from './crater.js';
import { TOWER } from './belltower.js';
import { makeCharm } from './charms.js';
const qn = (t) => `<b class="c-q">${esc(t)}</b>`;   // a quest's name in the log

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------------------------------------------------------------------- who gives work, and where they wait
// [x, z, which way they face] in front of (and beside) their doors, clear of the doorway
export const GIVERS = {
  Odile: { call: 'Sister Odile', post: [-5.5, -43.6, 0] },
  Hesk: { call: 'Mother Hesk', post: [34.0, -45.2, -Math.PI / 2] },
  Garrow: { call: 'Garrow', post: [-20.2, 20.6, Math.PI / 2] },
  Brand: { call: 'Sergeant Brand', post: [54.6, 35.2, Math.PI] },
  Hild: { call: 'Hild', post: [49.2, 35.2, Math.PI] },
  Idris: { call: 'Idris', post: [-20.6, -15.4, Math.PI / 2] },
  Tobias: { call: 'Tobias', post: [18.2, 20.6, -Math.PI / 2] },
  Osric: { call: 'Reeve Osric', post: [3.2, 31.8, Math.PI] },
  Wren: { call: 'Wren', post: [84, 7.5, -Math.PI / 2] },
  // the Bellwright, in the bell tower's hall on Bell Knoll (belltower.js; he never leaves it)
  Orrin: { call: 'Orrin the Bellwright', post: [TOWER.x + 2.7, TOWER.z - 2.3, -0.785] },
  // Hornhollow's folk, high on the Sorrowhorn (their posts set when the mountain is built: main.js)
  Maud: { call: 'Elder Maud', post: [0, 0, 0] },
  Jory: { call: 'Jory the Herdsman', post: [0, 0, 0] },
  Tamsin: { call: 'Tamsin', post: [0, 0, 0] },
  // the Mountain Wardens, in Greywatch Keep's court and at Cairnwatch's foot (holds.js)
  Halvard: { call: 'Captain Halvard', post: [0, 0, 0] },
  Edda: { call: 'Edda of Cairnwatch', post: [0, 0, 0] },
};

// ---------------------------------------------------------------------- the quests
// objectives: kill {where, count ('all': as many as are there when it's taken)}, boss {champ},
// gather {item, count, spots}, drop {item, count, from}, fetch {item, at}, slay (a named one already
// in the world: Ser Malgrave)
export const QUESTS = [
  { id: 'undercroft', giver: 'Odile', title: 'The Dead Beneath the Bell', lvl: 1,
    text: (n) => `Sacred Flame. I have kept the Litany for forty years, and it says: "beneath the bell, the dead lie down." They do not lie down. They walk the Undercroft under our feet, and they knock at the floor at night. I went down with a lamp and counted them: ${n[0]}. Not one more, not one fewer. Go down through the office behind the pulpit and give them their rest. All ${n[0]}.`,
    brief: (n) => `Destroy all ${n[0]} of the dead in the Undercroft beneath the cathedral.`,
    wait: 'They are still down there. I can hear them through the stones.',
    done: 'The knocking has stopped. For the first time in a year the bell rang tonight on its own and I was not afraid. Take Bellwarden: it was cast from the first bell\'s clapper, and it was waiting for you.',
    objectives: [{ type: 'kill', where: 'undercroft', count: 'all', label: 'Dead of the Undercroft destroyed' }],
    map: 'undercroft', reward: { xp: 450, gold: 40, items: ['bellwarden'] } },
  { id: 'gravebloom', giver: 'Hesk', title: 'Gravebloom', lvl: 1,
    text: 'You will be hurt, dear. Flames get hurt. Gravebloom grows only on the graves behind the cathedral, white as milk, and glows a little at dusk. Bring me six and I\'ll make you draughts that put you back together. Mind the dead: they don\'t like their flowers picked.',
    brief: 'Gather 6 gravebloom from the graves in the graveyard behind the cathedral.',
    wait: 'Six, dear. White ones. The graveyard.', done: 'Lovely. Lovely. Here: draughts, and a ring I\'ve wound from the root. It pricks. That is how you know it works.',
    objectives: [{ type: 'gather', item: 'gravebloom', name: 'Gravebloom', count: 6, label: 'Gravebloom gathered', spots: 'graves' }],
    map: 'graveyard', reward: { xp: 300, gold: 15, items: ['thornring'], potions: [['life', 5]] } },
  { id: 'steel', giver: 'Garrow', title: 'Sworn Steel', lvl: 2,
    text: 'That armour in the crater is ruined, but the steel under it... Velscour\'s smiths know something I don\'t. Bring me four shards of Sworn steel, cut off his dread knights on the Green Downs east of the village, and I\'ll make you something that won\'t let go of a sword.',
    brief: 'Take 4 shards of Sworn steel from the dread knights on the Green Downs.',
    wait: 'Four shards. The dread knights carry it. They won\'t hand it over.', done: 'Look at the grain on that. Here, put your hands in these. Quenched in the oil of a dozen of their blades.',
    objectives: [{ type: 'drop', item: 'steel', name: 'Sworn steel', count: 4, from: 'knights', label: 'Shards of Sworn steel' }],
    map: 'downs', reward: { xp: 650, gold: 50, items: ['hammerfall'] } },
  { id: 'downs', giver: 'Brand', title: 'Dread on the Downs', lvl: 3, after: ['undercroft'],
    text: 'The Vigil\'s dread knights and their sorcerers march the Green Downs as if they owned them, between Millhaven, the windmill and the falls. Millhaven sends no bread any more. I\'ve two watchmen and a crossbow with no string. You came down out of the sky and killed one of them with your face. Kill eight more.',
    brief: 'Kill 8 of Velscour\'s dread knights and sorcerers on the Green Downs.',
    wait: 'Eight. Out east, past the Bellwood Trail.', done: 'Millhaven sent a cart this morning. A cart! Take the Wall of the Watch. I painted the V off it myself, years ago, when I still thought it would come back.',
    objectives: [{ type: 'kill', where: 'downs', count: 8, label: 'Dread knights and sorcerers slain' }],
    map: 'downs', reward: { xp: 750, gold: 80, items: ['wallofthewatch'] } },
  { id: 'cellars', giver: 'Hild', title: 'The Old Watch\'s Standard', lvl: 3, after: ['undercroft'],
    text: 'Before the Vigil turned, the old watch kept its standard in the cellars under its tower, south-east in the Darkwood. The tower\'s fallen and the cellars are full of the dead. Bring the standard home, and put down eight of whatever guards it. Brand won\'t say it, but he cries about that banner.',
    brief: 'Bring back the old watch\'s standard from the Old Watch Cellars, and destroy 8 of the dead there.',
    wait: 'The cellars are south-east, in the Darkwood. Follow the stair down.', done: 'Oh, it\'s still blue under the mould. Take these: the old watchmen\'s boots. They walked the walls in them every night for sixty years.',
    objectives: [{ type: 'fetch', item: 'standard', name: 'The old watch\'s standard', at: 'cellars', label: 'The old watch\'s standard' },
      { type: 'kill', where: 'cellars', count: 8, label: 'Dead of the cellars destroyed' }],
    map: 'cellars', reward: { xp: 800, gold: 60, items: ['striders'] } },
  { id: 'glowcap', giver: 'Idris', title: 'Lights of the Gloamhollow', lvl: 4, after: ['undercroft'],
    text: 'The Gloamhollow, in the cliff north of Brightwater Falls, grows glowcaps: mushrooms that give their own light, quite safely, mostly. I need six for a staff I have been meaning to make for someone exactly like you. The ghasts there are very fast. Do not let them be faster.',
    brief: 'Gather 6 glowcaps in the Gloamhollow, the cave north of Brightwater Falls.',
    wait: 'Six glowcaps. North of the falls, in the cliff. Bring a light. Well, you are one.', done: 'Perfect. Hold this. It is perfectly safe. I have no eyebrows for unrelated reasons.',
    objectives: [{ type: 'gather', item: 'glowcap', name: 'Glowcap', count: 6, label: 'Glowcaps gathered', spots: 'gloam' }],
    map: 'gloam', reward: { xp: 800, gold: 50, items: ['gloamstaff'] } },
  { id: 'grotto', giver: 'Tobias', title: 'The Drowned Mother', lvl: 5, after: ['undercroft'],
    text: 'My brother fished below Brightwater Falls. Something came up out of the Drowned Grotto beside it, big as a cart, white as a corpse, and pulled him in by the leg. They call it the Drowned Mother. The others in there are her children, if you believe that kind of thing. I didn\'t, before.',
    brief: 'Slay the Drowned Mother in the Drowned Grotto, beside Brightwater Falls.',
    wait: 'The Grotto opens in the cliff by the falls, a little south.', done: 'Then he can rest. Drinks are free for you for as long as I live, which, thanks to you, may be a while. And this was in her. He gave it to our mother, once.',
    objectives: [{ type: 'boss', champ: 'mother', label: 'The Drowned Mother slain' }],
    map: 'grotto', reward: { xp: 1000, gold: 100, items: ['pearl'] } },
  { id: 'barrow', giver: 'Osric', title: 'Saint Ivo\'s Reliquary', lvl: 5, after: ['undercroft'],
    text: 'The Barrow of Saint Ivo lies north-west in the Darkwood. His Testament says the Fiend upon his far throne shall know fear, and our grandparents buried that fear with him. Something sits his bone throne now, wearing his face. Bring his reliquary out of there, and if you meet what sits on that throne, see that it sits no longer.',
    brief: 'Slay the Wight of Saint Ivo and bring back the saint\'s reliquary from his barrow.',
    wait: 'North-west, in the Darkwood. A stair-house of grey stone.', done: 'His halo. Inside, all this time. Wear it, Flame: the Testament would want it on a head that will be raised against the Fiend.',
    objectives: [{ type: 'boss', champ: 'wight', label: 'The Wight of Saint Ivo slain' }, { type: 'fetch', item: 'reliquary', name: 'Saint Ivo\'s reliquary', at: 'barrow', label: 'Saint Ivo\'s reliquary' }],
    map: 'barrow', reward: { xp: 1100, gold: 90, items: ['halo'] } },
  { id: 'deep', giver: 'Odile', title: 'The Ember Abbot', lvl: 6, after: ['undercroft'],
    text: 'There is a second stair, in the Undercroft\'s stair hall, that goes down to the Deep Undercroft. The abbots of the cathedral were buried there. One of them has not stopped burning. Abbot Cindermaw swings his censer in the dark and the dead come to him like moths. Put him out, and twelve of his flock.',
    brief: 'Slay Abbot Cindermaw, the Ember Abbot, and destroy 12 of the dead in the Deep Undercroft.',
    wait: 'The Deep Undercroft: down the stair in the Undercroft\'s stair hall.', done: 'His censer. I remember it swinging at my confirmation. Carry it, and let it burn for the right side now.',
    objectives: [{ type: 'boss', champ: 'abbot', label: 'Abbot Cindermaw slain' }, { type: 'kill', where: 'deep', count: 12, label: 'Dead of the Deep Undercroft destroyed' }],
    map: 'undercroft', reward: { xp: 1300, gold: 120, items: ['censer'] } },
  { id: 'trollhole', giver: 'Wren', title: 'The Trollhole King', lvl: 7, after: ['downs'],
    text: 'Far up the eastern cliff, north of the falls, there\'s the Trollhole. My grandfather went in after its king with his good axe forty winters ago. The king\'s still there. So, I think, is the axe. Old Gnarlgut. He\'s bigger than you\'re thinking. Bigger than that.',
    brief: 'Slay Old Gnarlgut, the Trollhole King, in the Trollhole far north on the eastern cliff.',
    wait: 'North along the cliff, past the falls and the Gloamhollow.', done: 'That\'s Grandfather\'s axe. It was in him? Of course it was. Take it, it\'s Trollbane now. He\'d have liked you.',
    objectives: [{ type: 'boss', champ: 'king', label: 'Old Gnarlgut slain' }],
    map: 'troll', reward: { xp: 1300, gold: 150, items: ['trollbane'] } },
  { id: 'redhand', giver: 'Odile', title: 'The Red Hand of Velscour', lvl: 9, after: ['deep', 'downs', 'barrow'],
    text: 'Now you are ready, as ready as the Canticle allows. West along the Vigil Road is Blackvigil Keep, where the Sworn keep their vigil for the Demon Lord Velscour. On the Red Throne sits Ser Malgrave, the Red Hand, who hangs men for saying your name. The Book says the Fiend upon his far throne shall know fear. Begin with his hand.',
    brief: 'Slay Ser Malgrave, the Red Hand of Velscour, on the Red Throne of Blackvigil Keep.',
    wait: 'West, along the Vigil Road, to Blackvigil Keep. The Red Throne is at the end of its hall.', done: 'His hand is cut off. Now Velscour knows your name, and he will be afraid of it. This was struck from Malgrave\'s blade in the green fire you came down in. It is yours. It was always yours.',
    objectives: [{ type: 'slay', who: 'malgrave', label: 'Ser Malgrave, the Red Hand, slain' }],
    map: 'keep', reward: { xp: 2600, gold: 400, items: ['tessarielsbrand'] } },
];
// the Bellwright's twelve: down the founders' shaft under his tower to the Shrine of Velscour
// (undershrine.js), stage by stage, each stage's gate opened by the key its warden carries
QUESTS.push(
  { id: 'bell_hatch', giver: 'Orrin', title: 'The Hatch Under the Bells', lvl: 6,
    text: (n) => `You climbed my knoll. Most don't. Listen: under this floor is the shaft the abbots' founders cut to cast my bells, and under that, something Velscour's adepts dug. Twice a day I ring the bells and twice a day it quiets. It is not quieting any more. I will break the seal on the hatch. Go down, and put the founders' dead back into their slag. All ${n[0]} of them.`,
    brief: (n) => `Go down the shaft under the Bell Tower and destroy all ${n[0]} of the dead in the Founders' Pit.`,
    wait: 'They were bellfounders. They are patient. Be quicker.', done: 'Quiet, from the pit. I heard it through the floor. Good. The next part is worse.',
    objectives: [{ type: 'kill', where: 'founders', count: 'all', label: "Founders' dead destroyed" }],
    map: 'shrine', reward: { xp: 1100, gold: 90, potions: [['life', 4]] } },
  { id: 'bell_warden', giver: 'Orrin', title: 'The Furnace-Warden', lvl: 6, after: ['bell_hatch'],
    text: 'Brother Slag kept the great furnace for the abbots, and he keeps it still, though he is mostly cinders now. The Iron Gate to the adepts\' cloister answers to the key on his belt. Put him out.',
    brief: 'Destroy Brother Slag, the Furnace-Warden, in the Great Furnace, and take the Iron Key.',
    wait: 'East of the pit. You will feel the heat before you see him.', done: 'The Iron Key. It was hot when they hung it on him, too.',
    objectives: [{ type: 'boss', champ: 'warden', label: 'Brother Slag destroyed' }], map: 'shrine', reward: { xp: 1400, gold: 120 } },
  { id: 'bell_seals', giver: 'Orrin', title: "The Founders' Seals", lvl: 6, after: ['bell_warden'],
    text: 'Every bell the founders cast, they stamped with a bronze seal and kept the stamp. The adepts scattered them: they use the bronze. Bring me six and I will know which of my bells they meant to crack.',
    brief: "Gather 6 of the founders' bronze seals in the Founders' Pit and the cloister below.", wait: 'Six. Bronze. Small. Look in the corners, the adepts never do.',
    done: 'Mourn\'s seal. And Vigil\'s, twice. They meant to silence the two that face the cliff. They are cleverer than they were.',
    objectives: [{ type: 'gather', item: 'seal', name: "Founders' seal", count: 6, label: "Founders' seals gathered", spots: 'shrine' }], map: 'shrine', reward: { xp: 1300, gold: 100 } },
  { id: 'bell_vigil', giver: 'Orrin', title: 'The Vigil Below', lvl: 7, after: ['bell_seals'],
    text: (n) => `Past the Iron Gate is the cloister the adepts built themselves, and the Vigil keep its watch there in Velscour's colours. I wore those colours. I know how they stand a watch. ${n[0]} of them. Break it.`,
    brief: (n) => `Kill all ${n[0]} of the Vigil keeping the Cloister of the Vigil.`, wait: 'They change the watch at midnight. Don\'t wait for it.', done: 'The cloister is ours. Theirs, still, but empty.',
    objectives: [{ type: 'kill', where: 'cloister', count: 'all', label: 'The Vigil in the cloister slain' }], map: 'shrine', reward: { xp: 1700, gold: 140, potions: [['life', 3], ['mana', 3]] } },
  { id: 'bell_hollin', giver: 'Orrin', title: 'Ser Hollin Vane', lvl: 7, after: ['bell_vigil'],
    text: 'Ser Hollin Vane holds the Oath Hall north of the cloister. He swore me in, once, and swore me out. He carries the Bronze Key. He will not give it to you. He would not give it to me.',
    brief: 'Slay Ser Hollin Vane, the Knight-Warden, in the Oath Hall, and take the Bronze Key.', wait: 'He fights with his shield high and his temper low. Make him lose one of them.',
    done: 'The Bronze Key. He kept it polished. Of course he did.',
    objectives: [{ type: 'slay', who: 'hollin', label: 'Ser Hollin Vane slain' }], map: 'shrine', reward: { xp: 2000, gold: 180 } },
  { id: 'bell_grimoire', giver: 'Orrin', title: "The Adepts' Grimoire", lvl: 7, after: ['bell_hollin'],
    text: 'The adepts write everything down. It is the only thing about them I miss. Their grimoire lies on the lectern in the scriptorium off the cloister. Bring it to me, and I will read you what Morcant is doing down there.',
    brief: "Bring Orrin the adepts' grimoire from the Scriptorium west of the cloister.", wait: 'The lectern. West. It will be open; they never close it.',
    done: '... Oh. Oh, Morcant. He is not holding a rite. He is ringing a bell of his own, in the rock, under mine. Mine are all that keep it from sounding.',
    objectives: [{ type: 'fetch', item: 'grimoire', name: "The adepts' grimoire", at: 'scriptorium', label: "The adepts' grimoire" }], map: 'shrine', reward: { xp: 1600, gold: 130 } },
  { id: 'bell_drowned', giver: 'Orrin', title: 'Under the Seep', lvl: 8, after: ['bell_grimoire'],
    text: (n) => `Past the Bronze Gate the adepts threw their dead, and the seep came in after them. ${n[0]} lie in that water and none of them are resting. Wade in.`,
    brief: (n) => `Destroy all ${n[0]} of the dead in the Drowned Ossuary and its chapel.`, wait: 'Ankle deep. They are under it. Watch the water move.',
    done: 'You smell of the seep. I would offer you a bath, but I have only the bell trap.',
    objectives: [{ type: 'kill', where: 'ossuary', count: 'all', label: 'Dead of the ossuary destroyed' }], map: 'shrine', reward: { xp: 2100, gold: 170, potions: [['life', 4]] } },
  { id: 'bell_murrain', giver: 'Orrin', title: 'Mother Murrain', lvl: 8, after: ['bell_drowned'],
    text: 'In the pit south of the ossuary the plague years\' dead were tipped in on one another, and what came of them calls itself Mother. She swallowed the Silver Key. I will not ask how I know.',
    brief: 'Destroy Mother Murrain in the Murrain Pit, and take the Silver Key.', wait: 'South of the ossuary. Breathe through your sleeve.',
    done: 'The Silver Key. Wash it. Wash it twice.',
    objectives: [{ type: 'boss', champ: 'murrain', label: 'Mother Murrain destroyed' }], map: 'shrine', reward: { xp: 2400, gold: 200 } },
  { id: 'bell_relic', giver: 'Orrin', title: 'The Bone Chapel', lvl: 8, after: ['bell_murrain'],
    text: 'North of the ossuary the adepts made a chapel of their dead, and in it a thing of bone that turns without a hand on it. Under it is a skull they took from my abbey. It was the last abbot\'s. Bring him home.',
    brief: "Bring the last abbot's skull from the Bone Chapel north of the ossuary.", wait: 'The turning thing. Under it. Do not look at it too long.',
    done: 'Abbot Hale. I will put him in the bell trap, under Mourn. He always liked Mourn.',
    objectives: [{ type: 'fetch', item: 'relic', name: "The last abbot's skull", at: 'chapel', label: "The last abbot's skull" }], map: 'shrine', reward: { xp: 2000, gold: 160 } },
  { id: 'bell_kneeling', giver: 'Orrin', title: 'The Hall of Kneeling', lvl: 9, after: ['bell_relic'],
    text: (n) => `Past the Silver Gate the Processional goes down under the cliff to the Hall of Kneeling, where Morcant's honour guard waits for him to need them. ${n[0]} of them. Do not let them kneel again.`,
    brief: (n) => `Slay all ${n[0]} of Morcant's honour guard in the Hall of Kneeling.`, wait: 'Down the Processional. You will hear them pray. Stop them.',
    done: 'Then there is only him.',
    objectives: [{ type: 'kill', where: 'kneeling', count: 'all', label: 'The honour guard slain' }], map: 'shrine', reward: { xp: 2600, gold: 220, potions: [['life', 4], ['mana', 4]] } },
  { id: 'bell_morcant', giver: 'Orrin', title: 'The Violet Hand', lvl: 10, after: ['bell_kneeling'],
    text: 'Magister Morcant. My brother in the Vigil, my master after, and what Velscour made of him at the last. He is in the shrine at the bottom, under the colossus, and he is stronger than anything you have fought. He will make more of himself. He will raise the floor against you. When he burns green, he is almost done. So are you. Do not stop.',
    brief: 'Slay Magister Morcant, the Violet Hand, in the Shrine of Velscour.', wait: 'Under the colossus. When he burns green, do not stop.',
    done: 'The rock is quiet. I have not heard it quiet in nineteen years.',
    objectives: [{ type: 'slay', who: 'morcant', label: 'Magister Morcant slain' }], map: 'shrine', reward: { xp: 4200, gold: 450 } },
  { id: 'bell_peal', giver: 'Orrin', title: 'The Last Peal', lvl: 10, after: ['bell_morcant'],
    text: 'One thing more. His sigil, the violet one, will be lying where he fell. Bring it up to me and I will melt it into Mourn\'s clapper, and then I will give you what I have been keeping for whoever did this. I did not think it would be you. I am glad it is.',
    brief: "Bring Morcant's sigil up from the Shrine of Velscour to Orrin.", wait: 'Where he fell. It will still be warm.',
    done: 'There. Hear that? No, you cannot, not yet. At noon. Here: the Wingbell. Ring it in the air and the air rings back. You will find the cliffs to the north-west are not so high, now.',
    objectives: [{ type: 'fetch', item: 'sigil', name: "Morcant's sigil", at: 'arena', label: "Morcant's sigil" }], map: 'shrine', reward: { xp: 3000, gold: 300, charms: ['wingbell'] } },
);
// Hornhollow's, at the Pilgrims' Road's end on the Sorrowhorn: their bell, their goats, their
// healer's flowers and her spring, the herding horn on the summit
QUESTS.push(
  { id: 'hh_bell', giver: 'Maud', title: 'The Hornhollow Bell', lvl: 10,
    text: "The goat men came down off Gorehoof's Shelf at the new moon and took the bell out of our shrine. It's no bigger than a bucket and it has rung for every birth and burial on this mountain for two hundred years. They've hung it up in their camp to mock us. Kill them, and bring it home.",
    brief: "Kill the goat men at Gorehoof's Shelf and bring Hornhollow's shrine bell home to Elder Maud.", wait: "Gorehoof's Shelf. Back down the road, under the crag. You'll smell them before you see them.",
    done: 'There. Hear it? That is the sound of this village again. I had forgotten how much I hated it.',
    objectives: [{ type: 'kill', where: 'gorehoof', count: 'all', label: "The goat men of Gorehoof's Shelf slain" }, { type: 'fetch', item: 'shrinebell', name: "Hornhollow's shrine bell", at: 'gorehoof', label: "The shrine bell" }],
    map: 'gorehoof', reward: { xp: 2600, gold: 220 } },
  { id: 'hh_horns', giver: 'Jory', title: 'Horn for Horn', lvl: 9,
    text: "Forty ewes, I had. Eleven now. The goat men take them for the fat and leave me the bones. Every goat man you put down, take his horns. Six pair, and I'll know the mountain's square with me.",
    brief: "Bring Jory six pairs of goat men's horns.", wait: 'Six pair. They grow them big up here.',
    done: "Six. I'll nail them over the fold, and let the rest of them see.",
    objectives: [{ type: 'drop', item: 'ramhorn', name: "Goat men's horns", count: 6, from: 'goats', label: "Goat men's horns" }], map: 'hornhollow', reward: { xp: 1900, gold: 160 } },
  { id: 'hh_snowbloom', giver: 'Tamsin', title: 'Snowbloom', lvl: 10,
    text: 'Snowbloom grows up on the snowfields beside the Shepherd\'s Stair, where nothing else will. It is the only thing I have that brings a fever down. I am too slow on the Stair now. Six flowers.',
    brief: "Gather six snowbloom on the snowfields beside the Shepherd's Stair.", wait: 'White, with a blue heart. They close when you breathe on them.',
    done: 'Six. That is four children who will see the spring.',
    objectives: [{ type: 'gather', item: 'snowbloom', name: 'Snowbloom', count: 6, label: 'Snowbloom gathered', spots: 'snowfield' }], map: 'summit', reward: { xp: 2100, gold: 120, potions: [['life', 4]] } },
  { id: 'hh_glimmer', giver: 'Tamsin', title: 'The Foul Water', lvl: 11, after: ['hh_snowbloom'],
    text: 'Our spring comes out of the Glimmerdeep, the cave at the top of the road. Since the autumn it tastes of the grave. The dead are walking in there, in the water. Lay them down and the water will run clean.',
    brief: 'Lay down every one of the dead walking in the Glimmerdeep.', wait: 'Up the road, where the stone shines. Take a light.',
    done: 'It ran clear this morning. I cried into it, which rather spoiled it.',
    objectives: [{ type: 'kill', where: 'glimmer', count: 'all', label: 'The dead in the Glimmerdeep laid down' }], map: 'glimmer', reward: { xp: 3000, gold: 240 } },
  { id: 'hh_horn', giver: 'Jory', title: 'The Herding Horn', lvl: 11, after: ['hh_horns'],
    text: "My grandfather's herding horn is up on the summit cairn. He left it there for the mountain when he got too old to climb, and the mountain can give it back now. With it I can call the flock off the high pasture before the goat men get to them.",
    brief: "Climb the Shepherd's Stair to the summit and bring back Jory's grandfather's herding horn.", wait: "Up the Stair behind the shrine. It's a long way. Don't look down. Do look out.",
    done: "That's it. I'd know it anywhere. Listen.",
    objectives: [{ type: 'fetch', item: 'herdhorn', name: 'The old herding horn', at: 'summit', label: 'The old herding horn' }], map: 'summit', reward: { xp: 3200, gold: 260 } },
);
// the Mountain Wardens': the Red Scythe on the road and in the Wardens' own old keep, the Crowstep
// bandits and the tithe they took, the dead at the Hollow Tower, the axes the reavers throw
QUESTS.push(
  { id: 'gw_scythes', giver: 'Halvard', title: 'Red on the Road', lvl: 10,
    text: "Men in red leather, throwing axes from the rocks and singing while they do it. The Red Scythe. They came over the high passes in spring and they bleed this road white. Kill a dozen of them, anywhere, and I'll know it can be walked.",
    brief: 'Slay twelve of the Red Scythe anywhere on the Sorrowhorn.', wait: 'Twelve. Watch the rocks above the road.',
    done: "Twelve. You did in a week what we couldn't do in a season. Sit and eat, then I'll tell you about their witch.",
    objectives: [{ type: 'kill', where: 'scythe', count: 12, label: 'Red Scythe slain' }], map: 'redfold', reward: { xp: 2600, gold: 200, potions: [['life', 3]] } },
  { id: 'gw_kindler', giver: 'Halvard', title: 'The Kindler', lvl: 11, after: ['gw_scythes'],
    text: "Their fire-callers answer to one woman. Ysolde, the Kindler. She burned the pilgrims' waystation with the pilgrims inside, and she keeps her fire at the Red Fold, up where the cliff is cut back. Put it out.",
    brief: "Slay Ysolde the Kindler in the Red Fold, the Red Scythe's war camp.", wait: "The Red Fold. You'll see the smoke from the road.",
    done: 'Her fire is out. The pilgrims can be buried now. I will see to it myself.',
    objectives: [{ type: 'slay', who: 'ysolde', label: 'Ysolde the Kindler slain' }], map: 'redfold', reward: { xp: 3400, gold: 300 } },
  { id: 'gw_hold', giver: 'Halvard', title: 'Scythe Hold', lvl: 12, after: ['gw_kindler'],
    text: 'Hask Redhand took our upper keep in the first week. He hung my brother from its wall and calls it Scythe Hold now. He stands a head over any man here and throws an axe like a glance. I am asking you to kill him.',
    brief: 'Slay Hask Redhand, Warlord of the Red Scythe, in Scythe Hold.', wait: 'Up the road past the Still Water. He wants to be found.',
    done: 'Then the keep is ours again. Tomorrow I go up and cut my brother down.',
    objectives: [{ type: 'slay', who: 'hask', label: 'Hask Redhand slain' }], map: 'scythehold', reward: { xp: 5200, gold: 520, potions: [['life', 4], ['mana', 4]] } },
  { id: 'gw_crowstep', giver: 'Halvard', title: 'The Crowstep Tithe', lvl: 9,
    text: "The Crowstep lot were here before the Red Scythe, and they grow fat on what the Scythe leaves. They took the old watchtower above the road, and our tithe chest with it. Clear them out, Old Corrick too, and bring the chest back.",
    brief: "Kill the bandits holding Crowstep Tower, Old Corrick with them, and bring the Wardens' tithe chest back to Captain Halvard.", wait: 'Up the path off the road, past the first bend.',
    done: 'Still locked. Corrick never could pick a lock. It goes down to Bellmourn with the next patrol.',
    objectives: [{ type: 'kill', where: 'crowstep', count: 'all', label: 'The Crowstep bandits killed' }, { type: 'fetch', item: 'tithe', name: "The Wardens' tithe chest", at: 'crowstep', label: 'The tithe chest' }],
    map: 'crowstep', reward: { xp: 2200, gold: 260 } },
  { id: 'cw_hollow', giver: 'Edda', title: 'The Last Watch', lvl: 11,
    text: 'See the broken tower on the shoulder? The old watch buried their own round it, and since the autumn they walk again. My grandmother is up there. Lay them down.',
    brief: 'Lay down the dead walking round the Hollow Tower.', wait: "They don't go far from the tower. They never did.",
    done: "Thank you. They say the last captain's chest is still at the top. Nobody has climbed it since the stair fell.",
    objectives: [{ type: 'kill', where: 'hollow', count: 'all', label: 'The old watch laid down' }], map: 'hollowtower', reward: { xp: 3000, gold: 220 } },
  { id: 'cw_bandits', giver: 'Edda', title: 'Eyes on the Road', lvl: 9,
    text: "From up here I see every bandit behind every rock on the road. I can't reach them; you can. Eight of them. Mind the ones above the road: they let you pass, then come down behind you.",
    brief: 'Kill eight crag bandits anywhere on the Sorrowhorn.', wait: 'Eight. Look up when the road narrows.',
    done: 'Eight. I watched you take the last two. Next time, look up sooner.',
    objectives: [{ type: 'kill', where: 'bandits', count: 8, label: 'Crag bandits killed' }], map: 'cairnwatch', reward: { xp: 2000, gold: 170 } },
  { id: 'cw_axes', giver: 'Edda', title: 'Thrown Iron', lvl: 10, after: ['cw_bandits'],
    text: "The Red Scythe's throwing axes are better iron than ours, and they leave them in the road like litter. Bring me five off the reavers who throw them. The smith at Greywatch will make arrowheads of them.",
    brief: 'Take five throwing axes from the Red Scythe and bring them to Edda.', wait: 'Five. Take them from their belts, not your back.',
    done: "Five. Arrowheads for a month. There's a kind of justice in it.",
    objectives: [{ type: 'drop', item: 'scytheaxe', name: 'Red Scythe throwing axes', count: 5, from: 'scythe', label: 'Throwing axes' }], map: 'cairnwatch', reward: { xp: 2300, gold: 210, potions: [['life', 3]] } },
);
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// the champions: one of the dead grown huge, in its place below ground
const CHAMPS = {
  abbot: { name: 'Abbot Cindermaw, the Ember Abbot', variant: 'ember_husk', place: 'deep', scale: 1.55, hp: 9, dmg: 2.4, xp: 900, tint: [1.6, 0.7, 0.3] },
  mother: { name: 'The Drowned Mother', variant: 'bloated_drowner', place: 'grotto', tag: 'drowned', scale: 1.65, hp: 10, dmg: 2.5, xp: 950, tint: [0.7, 0.9, 1.1] },
  wight: { name: 'The Wight of Saint Ivo', variant: 'tomb_mummy', place: 'barrow', scale: 1.45, hp: 9, dmg: 2.4, xp: 900, tint: [1.2, 1.15, 0.7] },
  king: { name: 'Old Gnarlgut, the Trollhole King', variant: 'bog_troll', place: 'troll', tag: 'lair', scale: 1.7, hp: 12, dmg: 2.8, xp: 1200, tint: [0.8, 1.05, 0.7] },
  warden: { name: 'Brother Slag, the Furnace-Warden', variant: 'ember_husk', place: 'founders', scale: 1.6, hp: 9, dmg: 2.4, xp: 950, tint: [1.9, 0.6, 0.15] },
  murrain: { name: 'Mother Murrain', variant: 'plague_bearer', place: 'ossuary', scale: 1.7, hp: 11, dmg: 2.6, xp: 1100, tint: [0.7, 1.5, 0.35] },
};

// where each quest is done, for the map (above ground: the way in)
function places(ctx) {
  const cave = (n) => ctx.caves?.find((c) => c.name === n);
  const m = (c) => (c ? { x: c.mouth.x, z: c.mouth.z } : null);
  return {
    undercroft: { x: STAIRS.x, z: STAIRS.z, r: 0, name: 'The stair down, in the cathedral office' },
    graveyard: { x: (GRAVEYARD.x0 + GRAVEYARD.x1) / 2, z: (GRAVEYARD.z0 + GRAVEYARD.z1) / 2, r: 40, name: 'The graveyard' },
    downs: { x: 520, z: 30, r: 140, name: 'The Green Downs' },
    cellars: { x: DELVES[1].x, z: DELVES[1].z, r: 0, name: DELVES[1].name },
    barrow: { x: DELVES[0].x, z: DELVES[0].z, r: 0, name: DELVES[0].name },
    gloam: { ...m(cave('The Gloamhollow')), r: 0, name: 'The Gloamhollow' },
    grotto: { ...m(cave('The Drowned Grotto')), r: 0, name: 'The Drowned Grotto' },
    troll: { ...m(cave('The Trollhole')), r: 0, name: 'The Trollhole' },
    keep: { x: -262, z: 0, r: 0, name: 'The Red Throne, Blackvigil Keep' },
    shrine: { x: TOWER.x, z: TOWER.z, r: 0, name: 'The hatch in the Bell Tower, Bell Knoll' },
    ...(ctx.mountain ? {
      hornhollow: { x: ctx.mountain.villageSite.x, z: ctx.mountain.villageSite.z, r: 20, name: 'Hornhollow, on the Sorrowhorn' },
      gorehoof: { x: ctx.mountain.camps[3].x, z: ctx.mountain.camps[3].z, r: 18, name: "Gorehoof's Shelf" },
      glimmer: { ...m(cave('The Glimmerdeep')), r: 0, name: 'The Glimmerdeep' },
      summit: { x: ctx.mountain.summitSite.x, z: ctx.mountain.summitSite.z, r: 20, name: 'The summit of the Sorrowhorn' },
      ...Object.fromEntries((ctx.mountain.holds || []).map((h) => [h.id, { x: h.x, z: h.z, r: h.r0, name: h.name }])),
    } : {}),
  };
}

// ---------------------------------------------------------------------- things to take up
const ITEM_LOOK = {
  gravebloom: { color: 0xe8fff0, glow: [0.6, 1.0, 0.75], shape: 'flower' },
  glowcap: { color: 0x60ffc0, glow: [0.3, 1.2, 0.8], shape: 'cap' },
  steel: { color: 0x40404a, glow: [1.0, 0.85, 0.4], shape: 'shard' },
  reliquary: { color: 0xd8a838, glow: [1.2, 1.0, 0.5], shape: 'box' },
  standard: { color: 0x2a4a9a, glow: [0.6, 0.8, 1.4], shape: 'banner' },
  seal: { color: 0xb8803a, glow: [1.3, 0.9, 0.4], shape: 'shard' },
  grimoire: { color: 0x4a2a6a, glow: [0.8, 0.5, 1.5], shape: 'box' },
  relic: { color: 0xd8ccae, glow: [0.8, 1.2, 0.8], shape: 'box' },
  sigil: { color: 0x9a4cff, glow: [1.0, 0.5, 1.7], shape: 'shard' },
  shrinebell: { color: 0xb08040, glow: [1.3, 1.0, 0.5], shape: 'box' },
  ramhorn: { color: 0xd8c8a8, glow: [1.0, 0.9, 0.7], shape: 'shard' },
  snowbloom: { color: 0xf0f8ff, glow: [0.7, 0.9, 1.4], shape: 'flower' },
  herdhorn: { color: 0xc8a878, glow: [1.2, 1.0, 0.6], shape: 'shard' },
  tithe: { color: 0x6a4a2a, glow: [1.2, 1.0, 0.5], shape: 'box' },
  scytheaxe: { color: 0x8a2a20, glow: [1.3, 0.5, 0.3], shape: 'shard' },
};
function itemModel(kind) {
  const L = ITEM_LOOK[kind], g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: L.color, emissive: L.color, emissiveIntensity: 0.35, shininess: 60 });
  if (L.shape === 'flower') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.32), new THREE.MeshLambertMaterial({ color: 0x3a6a3a }));
    stem.position.y = -0.16; g.add(stem);
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat); p.scale.set(1, 0.35, 0.55); p.position.set(Math.cos(i) * 0.07, 0, Math.sin(i) * 0.07); p.rotation.y = -i; g.add(p); }
  } else if (L.shape === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat); g.add(cap);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xd8e8d0 })); st.position.y = -0.11; g.add(st);
  } else if (L.shape === 'shard') {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshPhongMaterial({ color: 0x4a4a54, specular: 0xffffff, shininess: 90 })); s.scale.set(0.5, 1.4, 0.3); g.add(s);
  } else if (L.shape === 'box') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.24), mat); g.add(b);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 10, 1, false, 0, Math.PI), mat); lid.rotation.z = Math.PI / 2; lid.position.y = 0.13; g.add(lid);
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), new THREE.MeshLambertMaterial({ color: 0x5a4028 })); g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.7), new THREE.MeshLambertMaterial({ color: L.color, side: THREE.DoubleSide, emissive: 0x101830 })); cloth.position.set(0.29, 0.25, 0); g.add(cloth);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(...L.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glow.scale.setScalar(0.9); g.add(glow);
  // a pale gold beam, so quest things show from across a room
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 2.4, 6, 1, true).translate(0, 1.2, 0),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = -0.3; g.add(beam);
  g.userData.glow = glow;
  return g;
}

// ====================================================================== the quests' state and work
export class Quests {
  /** o: { ui, ctx, zombies, foes, villagers, sfx, char(), toast(text), onReward({xp, gold, items, potions}), onOpen(on),
   * log(kind, html): the chat log's lines ('quest', 'qitem') } */
  constructor(o) {
    this.o = o;
    this.ctx = o.ctx;
    this.state = {};            // id -> { s: 'active'|'ready'|'done', p: [progress], n: [needed], track }
    this.flags = { tracker: true };
    this.items = [];            // things lying about to be taken up
    this.champs = new Map();    // champ key -> the zombie
    this.group = new THREE.Group();
    o.ctx.scene.add(this.group);
    this.buildUi(o.ui);
    this.places = places(o.ctx);
  }

  // -------------------------------------------------------------- state
  /** A line in the chat log (main.js). */
  say(kind, html, o) { this.o.log?.(kind, html, o); }
  get(id) { return this.state[id]; }
  status(id) { return this.state[id]?.s || (this.available(id) ? 'available' : 'locked'); }
  available(id) {
    const q = BY_ID[id];
    return !this.state[id] && (q.after || []).every((a) => this.state[a]?.s === 'done');
  }
  /** What a giver shows over their head: '!' (work to give), '?' (come back: done), 'g' (under
   * way), or null. */
  markOf(name) {
    const mine = QUESTS.filter((q) => q.giver === name);
    if (mine.some((q) => this.state[q.id]?.s === 'ready')) return '?';
    if (mine.some((q) => this.available(q.id))) return '!';
    if (mine.some((q) => this.state[q.id]?.s === 'active')) return 'g';
    return null;
  }
  /** Has this giver anything to say about work (to stay at their post for)? */
  business(name) { return !!this.markOf(name); }

  /** Save and load: what's under way and done, and how far. */
  save() { return { state: JSON.parse(JSON.stringify(this.state)), flags: { ...this.flags } }; }
  load(data) {
    for (const it of this.items) this.group.remove(it.obj);
    this.items = [];
    for (const z of this.champs.values()) if (!z.dead && !z.gone) { z.remove?.(); z.gone = true; }
    this.champs.clear();
    this.state = data?.state ? JSON.parse(JSON.stringify(data.state)) : {};
    this.flags = { tracker: true, ...(data?.flags || {}) };
    for (const id of Object.keys(this.state)) if (this.state[id].s === 'active') this.raise(id);
    this.refresh();
  }

  // -------------------------------------------------------------- taking, doing and handing in
  accept(id) {
    const q = BY_ID[id];
    if (!this.available(id)) return;
    if (id === 'bell_hatch') this.ctx.shrine?.unseal();   // (the Bellwright breaks the hatch's seal)
    const n = q.objectives.map((ob) => this.needed(ob));
    this.state[id] = { s: 'active', p: q.objectives.map(() => 0), n, track: true };
    this.raise(id);
    this.o.sfx?.quest(false);
    this.o.toast(`Quest taken: ${q.title}`);
    this.say('quest', `Quest taken: ${qn(q.title)} <i>from ${esc(GIVERS[q.giver]?.call || q.giver)}</i>`);
    this.check(id);
    this.refresh();
  }

  abandon(id) {
    const st = this.state[id];
    if (!st || st.s === 'done') return;
    delete this.state[id];
    this.items = this.items.filter((it) => { if (it.quest === id) { this.group.remove(it.obj); return false; } return true; });
    this.o.toast(`Quest given up: ${BY_ID[id].title}`);
    this.say('quest', `Quest given up: ${qn(BY_ID[id].title)}`);
    this.refresh();
  }

  complete(id) {
    const q = BY_ID[id], st = this.state[id];
    if (!st || st.s !== 'ready') return;
    st.s = 'done';
    const items = (q.reward.items || []).map((u) => makeUnique(u)).filter(Boolean);
    const potions = (q.reward.potions || []).map(([k, c]) => makePotion(k, c));
    const charms = (q.reward.charms || []).map((c) => makeCharm(c)).filter(Boolean);
    this.o.onReward({ xp: q.reward.xp, gold: q.reward.gold || 0, items: [...items, ...potions, ...charms], title: q.title });
    this.o.sfx?.quest(true);
    this.o.toast(`Quest done: ${q.title}`);
    this.say('quest', `Quest complete: ${qn(q.title)}`, { big: true });
    this.refresh();
  }

  /** How many an objective wants (a count of 'all' is everything of its kind there now). */
  needed(ob) {
    if (ob.type === 'kill') return ob.count === 'all' ? Math.max(1, this.o.zombies.list.filter((z) => !z.dead && !z.gone && this.matches(ob.where, z)).length) : ob.count;
    if (ob.type === 'gather' || ob.type === 'drop') return ob.count;
    return 1;
  }

  /** Is z one of the kind an objective wants? */
  matches(where, z) {
    const c = this.ctx, nm = z.dg?.name || '';
    switch (where) {
      case 'undercroft': return z.dg === c.dungeon;
      case 'deep': return z.dg === c.deep;
      case 'cellars': return nm === 'The Old Watch Cellars';
      case 'downs': return !!z.def && !z.def.body && (z.kindName === 'knight' || z.kindName === 'sorcerer');
      case 'knights': return !!z.def && z.kindName === 'knight';
      case 'founders': case 'cloister': case 'ossuary': case 'kneeling': return z.shrineTag === where && !z.mirror;
      case 'morcant': return z.slay === 'morcant';
      case 'goats': return /^goat_/.test(z.variant || '');
      case 'gorehoof': { const g = c.mountain?.camps?.[3]; return /^goat_/.test(z.variant || '') && !!g && Math.hypot(z.home.x - g.x, z.home.z - g.z) < 22; }
      case 'glimmer': return nm === 'The Glimmerdeep';
      case 'scythe': return z.def?.faction === 'scythe';
      case 'bandits': return z.def?.faction === 'bandit';
      case 'crowstep': case 'hollow': case 'redfold': case 'scythehold': return z.band === where;
      default: return false;
    }
  }

  /** Every death in the world comes through here. */
  onKill(z) {
    for (const [id, st] of Object.entries(this.state)) {
      if (st.s !== 'active') continue;
      const q = BY_ID[id];
      q.objectives.forEach((ob, i) => {
        if (st.p[i] >= st.n[i]) return;
        if (ob.type === 'kill' && this.matches(ob.where, z)) { st.p[i]++; this.progress(q, ob, st, i); }
        else if (ob.type === 'boss' && z.champ?.key === ob.champ) { st.p[i] = 1; this.progress(q, ob, st, i); }
        else if (ob.type === 'slay' && (ob.who === 'malgrave' ? z.def?.boss && !z.slay : z.slay === ob.who && !z.mirror)) { st.p[i] = 1; this.progress(q, ob, st, i); }
        else if (ob.type === 'drop' && this.matches(ob.from, z)) {
          const want = st.n[i] - st.p[i] - this.items.filter((it) => it.quest === id && it.obj_i === i).length;
          if (want > 0) this.drop(id, i, ob.item, z.pos.x, z.pos.y + 0.5, z.pos.z);
        }
      });
      this.check(id);
    }
    this.refresh();
  }

  progress(q, ob, st, i) {
    this.o.toast(`${ob.label}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}`);
    this.say('quest', `${esc(ob.label)}: <b class="c-num">${Math.min(st.p[i], st.n[i])}/${st.n[i]}</b> <i>(${esc(q.title)})</i>`);
  }

  /** All its objectives met: it's ready to hand in. */
  check(id) {
    const st = this.state[id];
    if (!st || st.s !== 'active') return;
    if (st.p.every((v, i) => v >= st.n[i])) {
      st.s = 'ready';
      this.o.sfx?.quest(true);
      this.o.toast(`${BY_ID[id].title}: done — return to ${GIVERS[BY_ID[id].giver].call}`);
      this.say('quest', `${qn(BY_ID[id].title)}: all done. Return to ${esc(GIVERS[BY_ID[id].giver].call)}`);
    }
  }

  // -------------------------------------------------------------- what lies about, and the champions
  /** Put a quest's things and champions in the world (on taking it, or loading a game with it). */
  raise(id) {
    const q = BY_ID[id], st = this.state[id];
    q.objectives.forEach((ob, i) => {
      if (st.p[i] >= st.n[i]) return;
      if (ob.type === 'gather') {
        const spots = this.spots(ob.spots, ob.count + 2);
        for (const [x, y, z] of spots) this.drop(id, i, ob.item, x, y, z, true);
      } else if (ob.type === 'fetch') {
        const r = this.deepest(ob.at);
        if (r) this.drop(id, i, ob.item, r[0], r[1], r[2], true);
      } else if (ob.type === 'boss') this.champion(ob.champ);
      else if (ob.type === 'slay' && ob.who !== 'malgrave') this.ctx.shrine?.raiseFoe(ob.who);
    });
  }

  /** Spots for things to gather: beside graves, or about a cave's chambers. */
  spots(kind, n) {
    const out = [], Z = this.o.zombies;
    if (kind === 'graves') {
      for (let i = 0; i < n * 4 && out.length < n; i++) {
        const s = Z.graveSpot?.(null);
        if (s && !out.some((o) => Math.hypot(o[0] - s[0], o[2] - s[1]) < 6)) out.push([s[0], 0.4, s[1]]);
      }
    } else if (kind === 'shrine') {
      out.push(...(this.ctx.shrine?.spots(n) || []));
    } else if (kind === 'snowfield') {
      out.push(...(this.ctx.mountain?.snowSpots?.(n) || []));
    } else if (kind === 'gloam') {
      const cave = this.ctx.caves?.find((c) => c.name === 'The Gloamhollow');
      const tags = ['cavern', 'north', 'nest', 'south', 'warren', 'shrine', 'bones', 'loop', 'cavern', 'warren'];
      for (const t of tags) { if (out.length >= n) break; const p = cave?.spot(t, 1.0); if (p) out.push([p.x, p.y + 0.4, p.z]); }
    }
    return out;
  }

  /** The room furthest from a dungeon's way in (a spot on its floor), or a cave chamber. */
  deepest(place) {
    const at = this.ctx.shrine?.fetchSpot(place) || this.ctx.mountain?.fetchSpot?.(place);
    if (at) return at;
    const dg = this.dungeonOf(place);
    if (!dg) return null;
    if (dg.spot) { const p = dg.spot(this.CAVE_TAG?.[place] || 'pool', 1); return p ? [p.x, p.y + 0.4, p.z] : null; }
    const rooms = dg.roomList, e = rooms[0], cx = (r) => (r.x0 + r.x1) / 2, cz = (r) => (r.z0 + r.z1) / 2;
    const far = rooms.reduce((a, r) => (Math.hypot(cx(r) - cx(e), cz(r) - cz(e)) > Math.hypot(cx(a) - cx(e), cz(a) - cz(e)) ? r : a), e);
    const P = this.ctx.physics;
    const fy = far.y ?? dg.y;      // (a room's own floor, where the place's floors aren't all one height)
    for (let t = 0; t < 40; t++) {
      const x = far.x0 + 1.5 + Math.random() * (far.x1 - far.x0 - 3), z = far.z0 + 1.5 + Math.random() * (far.z1 - far.z0 - 3);
      const f = P.floorAt(x, z, fy + 0.3, 0.3, 0.45);
      if (Math.abs(f - fy) < 0.1) return [x, fy + 0.45, z, far];
    }
    return [cx(far), fy + 0.45, cz(far), far];
  }

  dungeonOf(place) {
    const c = this.ctx, cave = (n) => c.caves?.find((q) => q.name === n);
    return { deep: c.deep, undercroft: c.dungeon, barrow: c.unders?.find((u) => u.dg.name === 'The Barrow of Saint Ivo')?.dg,
      cellars: c.unders?.find((u) => u.dg.name === 'The Old Watch Cellars')?.dg, grotto: cave('The Drowned Grotto'), troll: cave('The Trollhole'),
      gloam: cave('The Gloamhollow'), founders: c.shrine?.dgs.founders, ossuary: c.shrine?.dgs.ossuary }[place] || null;
  }

  /** Raise a champion (if it isn't up already). */
  champion(key) {
    const C = CHAMPS[key];
    const have = this.champs.get(key);
    if (have && !have.dead && !have.gone) return have;
    const dg = this.dungeonOf(C.place), Z = this.o.zombies;
    if (!dg || !Z.gltf[C.variant]) return null;
    let at;
    if (dg.bossSpot) at = [...dg.bossSpot];            // (a place that keeps its boss's tomb: he rises from it)
    else if (dg.spot) { const p = dg.spot(C.tag, 1.5); if (!p) return null; at = [p.x, p.y, p.z]; }
    else { const r = this.deepest(C.place); if (!r) return null; at = [r[0], r[1] - 0.45, r[2], r[3]]; }
    const z = Z.spawn(C.variant, at[0], at[2], { y: at[1], zone: 'dungeon', dg, room: at[3] || null, kind: 'runner', start: dg.bossSpot ? 'buried' : 'stand' });
    z.champion?.({ ...C, key });
    this.champs.set(key, z);
    return z;
  }

  /** Something to take up, lying at (x, y, z). */
  drop(quest, i, item, x, y, z, rest = false) {
    const obj = itemModel(item);
    const P = this.ctx.physics, f = P.floorAt(x, z, y + 0.3, 0.15, 3);
    const floor = Number.isFinite(f) ? f : y - 0.4;
    obj.position.set(x, rest ? floor + 0.45 : y, z);
    this.group.add(obj);
    this.items.push({ quest, obj_i: i, item, obj, floor, vy: rest ? 0 : 3, t: Math.random() * 6 });
  }

  /** Each frame: things to take up turn and glint, and come into the bag of quest things when
   * you walk over them; the tracker and the givers' marks follow. */
  update(dt, player) {
    const p = player.pos;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k], o = it.obj;
      it.t += dt;
      if (it.vy) { it.vy -= 10 * dt; o.position.y += it.vy * dt; if (o.position.y <= it.floor + 0.45) { o.position.y = it.floor + 0.45; it.vy = 0; } }
      else o.position.y = it.floor + 0.45 + Math.sin(it.t * 2) * 0.05;
      o.rotation.y += dt * 1.1;
      o.userData.glow.material.opacity = 0.45 + 0.25 * Math.sin(it.t * 3.4);
      if (Math.hypot(p.x - o.position.x, p.z - o.position.z) < 1.3 && Math.abs(p.y + 0.6 - o.position.y) < 1.8) {
        const st = this.state[it.quest];
        this.items.splice(k, 1); this.group.remove(o);
        if (!st || st.s !== 'active' || st.p[it.obj_i] >= st.n[it.obj_i]) continue;
        st.p[it.obj_i]++;
        const ob = BY_ID[it.quest].objectives[it.obj_i];
        this.o.sfx?.equip();
        this.o.toast(`${ob.name}: ${st.p[it.obj_i]}/${st.n[it.obj_i]}`);
        this.say('qitem', `${esc(ob.type === 'fetch' ? 'Found' : 'Gathered')}: <b class="c-qitem">${esc(ob.name)}</b> <b class="c-num">${st.p[it.obj_i]}/${st.n[it.obj_i]}</b> <i>(${esc(BY_ID[it.quest].title)})</i>`);
        // a gathered set is complete: the spare ones wither
        if (st.p[it.obj_i] >= st.n[it.obj_i]) this.items = this.items.filter((q) => { if (q.quest === it.quest && q.obj_i === it.obj_i) { this.group.remove(q.obj); return false; } return true; });
        this.check(it.quest);
        this.refresh();
      }
    }
    this.flash = Math.max(0, (this.flash || 0) - dt);
  }

  /** The champion nearest you that's fighting you, for the boss bar. */
  bossBar(player) {
    for (const z of this.champs.values()) {
      if (z.gone) continue;
      const d = Math.hypot(z.pos.x - player.pos.x, z.pos.z - player.pos.z);
      if (d < 30 && Math.abs(z.pos.y - player.pos.y) < 5 && (z.aggro || z.dead)) {
        if (z.dead) { if ((z.deadT || 0) < 2.5) return { name: z.champ.name, frac: 0 }; continue; }
        return { name: z.champ.name, frac: Math.max(0, z.hp / z.champ.max) };
      }
    }
    return null;
  }

  /** Map pins: who has work (!/?) and where tracked work is done. */
  pins(villagers) {
    const out = [];
    for (const [name, g] of Object.entries(GIVERS)) {
      const mark = this.markOf(name);
      if (!mark) continue;
      const v = villagers?.list.find((a) => a.name === name);
      out.push({ kind: mark, x: v ? v.pos.x : g.post[0], z: v ? v.pos.z : g.post[1], label: g.call });
    }
    for (const [id, st] of Object.entries(this.state)) {
      if (st.s !== 'active' || !st.track) continue;
      const pl = this.places[BY_ID[id].map];
      if (pl && Number.isFinite(pl.x)) out.push({ kind: 'area', x: pl.x, z: pl.z, r: pl.r, label: BY_ID[id].title, sub: pl.name });
    }
    return out;
  }

  // -------------------------------------------------------------- the screen: tracker, log, the giver's words
  buildUi(ui) {
    this.tracker = el('div', 'qtrack');
    ui.querySelector('.hud')?.append(this.tracker);
    this.logEl = el('div', 'panel qlog hidden');
    ui.append(this.logEl);
    this.dlg = el('div', 'panel qdlg hidden');
    ui.append(this.dlg);
    this.tip = el('div', 'tt hidden');
    ui.append(this.tip);
  }

  get open() { return !this.logEl.classList.contains('hidden') || !this.dlg.classList.contains('hidden'); }
  close() { this.logEl.classList.add('hidden'); this.dlg.classList.add('hidden'); this.tip.classList.add('hidden'); this.o.hush?.(); this.o.onOpen?.(false); }

  /** The tracker on the screen: what's under way and being followed. */
  refresh() {
    const T = this.tracker;
    const list = Object.entries(this.state).filter(([, st]) => st.s !== 'done' && st.track);
    T.classList.toggle('hidden', !this.flags.tracker || !list.length);
    let h = '<div class="qt-head">Quests <span>T to hide · L for the log</span></div>';
    for (const [id, st] of list) {
      const q = BY_ID[id];
      h += `<div class="qt-q${st.s === 'ready' ? ' ready' : ''}"><b>${esc(q.title)}</b>`;
      if (st.s === 'ready') h += `<div class="qt-o done">Return to ${esc(GIVERS[q.giver].call)}</div>`;
      else q.objectives.forEach((ob, i) => { h += `<div class="qt-o${st.p[i] >= st.n[i] ? ' done' : ''}">${esc(ob.label)}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}</div>`; });
      h += '</div>';
    }
    if (T.dataset.h !== h) { T.dataset.h = h; T.innerHTML = h; }
    if (!this.logEl.classList.contains('hidden')) this.renderLog();
    this.o.onChange?.();
  }

  toggleTracker() {
    this.flags.tracker = !this.flags.tracker;
    this.o.toast(this.flags.tracker ? 'Quest tracker shown' : 'Quest tracker hidden');
    this.refresh();
  }

  rewardHtml(q) {
    const items = (q.reward.items || []).map((u) => makeUnique(u));
    let h = `<div class="q-rew"><div class="dim">Reward: <b class="xp">${q.reward.xp} experience</b>${q.reward.gold ? ` · <b class="gold">${q.reward.gold} gold</b>` : ''}${(q.reward.potions || []).map(([k, c]) => ` · ${c} ${k === 'life' ? 'healing' : 'mana'} draughts`).join('')}</div>`;
    items.forEach((it, i) => { h += `<div class="q-item" data-i="${i}" style="color:${RARITY[it.rarity].color}; border-color:${RARITY[it.rarity].color}">${esc(it.name)} <span class="dim">· ${esc(it.base)}</span></div>`; });
    return [h + '</div>', items];
  }

  /** Hover tips on the reward cards. */
  wireTips(root, items) {
    for (const d of root.querySelectorAll('.q-item')) {
      const it = items[Number(d.dataset.i)];
      d.onpointerenter = (e) => { this.tip.innerHTML = tooltip(it); this.tip.classList.remove('hidden'); this.moveTip(e); };
      d.onpointermove = (e) => this.moveTip(e);
      d.onpointerleave = () => this.tip.classList.add('hidden');
      d.onclick = (e) => { this.tip.innerHTML = tooltip(it); this.tip.classList.toggle('hidden'); this.moveTip(e); };
    }
  }
  moveTip(e) {
    const r = this.tip.getBoundingClientRect();
    let x = e.clientX + 16, y = e.clientY + 12;
    if (x + r.width > innerWidth - 4) x = e.clientX - r.width - 12;
    if (y + r.height > innerHeight - 4) y = innerHeight - r.height - 4;
    this.tip.style.left = x + 'px'; this.tip.style.top = Math.max(4, y) + 'px';
  }

  /** What a giver would say if you spoke with them now (read aloud as their work comes up), or null
   * if they've none for you: main makes it ahead, while you're looking at them. */
  words(name) {
    const mine = QUESTS.filter((q) => q.giver === name && (this.available(q.id) || ['active', 'ready'].includes(this.state[q.id]?.s)));
    if (!mine.length) return null;
    const ready = mine.find((q) => this.state[q.id]?.s === 'ready');
    if (!(mine.length === 1 || ready)) return 'There is more than one thing to be done.';
    const q = ready || mine[0], st = this.state[q.id];
    const n = st ? st.n : q.objectives.map((ob) => this.needed(ob));
    return st?.s === 'ready' ? q.done : st?.s === 'active' ? q.wait : typeof q.text === 'function' ? q.text(n) : q.text;
  }

  /** Speak with a giver: their work (one quest at once, or a list to choose from). True if they
   * had any. */
  talk(name, v = null) {
    const mine = QUESTS.filter((q) => q.giver === name && (this.available(q.id) || ['active', 'ready'].includes(this.state[q.id]?.s)));
    if (!mine.length) return false;
    const ready = mine.find((q) => this.state[q.id]?.s === 'ready');
    if (mine.length === 1 || ready) this.show(ready || mine[0], name);
    else this.choose(mine, name);
    this.o.onOpen?.(true);
    return true;
  }

  choose(list, name) {
    const D = this.dlg;
    D.innerHTML = '';
    D.append(this.closeBtn(), el('h2', null, esc(GIVERS[name].call)));
    D.append(el('div', 'q-text', 'There is more than one thing to be done.'));
    this.o.speak?.(name, 'There is more than one thing to be done.');
    for (const q of list) {
      const st = this.state[q.id];
      const b = el('button', 'q-pick', `<span class="qm ${st ? (st.s === 'ready' ? 'q' : 'g') : 'e'}">${st ? '?' : '!'}</span> ${esc(q.title)}`);
      b.onclick = () => this.show(q, name);
      D.append(b);
    }
    if (this.o.shopOf?.(name)) { const t = el('button', 'q-pick q-trade', '<span class="qm e">&#9673;</span> Trade'); t.onclick = () => this.o.onTrade?.(name); D.append(t); }
    D.classList.remove('hidden');
  }

  closeBtn() { const c = el('button', 'close', '&times;'); c.onclick = () => this.close(); return c; }

  show(q, name) {
    const D = this.dlg, st = this.state[q.id];
    const n = st ? st.n : q.objectives.map((ob) => this.needed(ob));
    D.innerHTML = '';
    D.append(this.closeBtn(), el('h2', null, esc(q.title)), el('div', 'q-giver', esc(GIVERS[name].call)));
    const body = st?.s === 'ready' ? q.done : st?.s === 'active' ? q.wait : typeof q.text === 'function' ? q.text(n) : q.text;
    D.append(el('div', 'q-text', esc(body)));
    this.o.speak?.(name, body);      // (and the giver says it aloud)
    if (!st || st.s === 'active') {
      const ob = el('div', 'q-obj');
      ob.innerHTML = `<h3>What is to be done</h3><div>${esc(typeof q.brief === 'function' ? q.brief(n) : q.brief)}</div>` +
        (st ? q.objectives.map((o, i) => `<div class="dim">${esc(o.label)}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}</div>`).join('') : '') +
        `<div class="dim small">Where: ${esc(this.places[q.map]?.name || '')} (marked on the map)</div>`;
      D.append(ob);
    }
    const [rh, items] = this.rewardHtml(q);
    D.append(el('div', null, rh));
    this.wireTips(D, items);
    const row = el('div', 'hb');
    const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.onclick = fn; row.append(b); };
    if (!st) { btn('Accept', () => { this.accept(q.id); this.close(); }, 'sel'); btn('Decline', () => this.close()); }
    else if (st.s === 'ready') btn('Complete the quest', () => { this.complete(q.id); this.close(); }, 'sel');
    else btn('Goodbye', () => this.close());
    if (this.o.shopOf?.(name)) btn('Trade', () => this.o.onTrade?.(name));   // (a merchant: their shop from here too)
    D.append(row);
    D.classList.remove('hidden');
  }

  /** The quest log (L). */
  showLog(on = true) {
    this.logEl.classList.toggle('hidden', !on);
    if (on) { this.dlg.classList.add('hidden'); this.renderLog(); }
    else this.tip.classList.add('hidden');
    this.o.onOpen?.(on);
  }

  renderLog() {
    const L = this.logEl;
    L.innerHTML = '';
    L.append(this.closeBtn(), el('h2', null, 'Quest Log'));
    const top = el('label', 'q-toggle', `<input type="checkbox" ${this.flags.tracker ? 'checked' : ''}> Show the quest tracker on the screen (T)`);
    top.querySelector('input').onchange = (e) => { this.flags.tracker = e.target.checked; this.refresh(); };
    L.append(top);
    const wrap = el('div', 'q-wrap'), left = el('div', 'q-list'), right = el('div', 'q-detail');
    const entries = QUESTS.filter((q) => this.state[q.id]);
    const open = entries.filter((q) => this.state[q.id].s !== 'done'), done = entries.filter((q) => this.state[q.id].s === 'done');
    if (!this.sel || !this.state[this.sel]) this.sel = open[0]?.id || done[0]?.id || null;
    const row = (q) => {
      const st = this.state[q.id];
      const r = el('div', 'q-row' + (this.sel === q.id ? ' sel' : '') + (st.s === 'done' ? ' fin' : ''),
        `<input type="checkbox" title="Follow it in the tracker" ${st.track ? 'checked' : ''} ${st.s === 'done' ? 'disabled' : ''}><span>${esc(q.title)}</span><em>${st.s === 'ready' ? 'done' : st.s === 'done' ? '' : 'level ' + q.lvl}</em>`);
      r.querySelector('input').onclick = (e) => { e.stopPropagation(); st.track = e.target.checked; this.refresh(); };
      r.onclick = () => { this.sel = q.id; this.renderLog(); };
      return r;
    };
    left.append(el('h3', null, 'Under way'));
    if (!open.length) left.append(el('div', 'dim small', 'Nothing yet. Look for a yellow ! over someone\'s head.'));
    open.forEach((q) => left.append(row(q)));
    if (done.length) { left.append(el('h3', null, 'Done')); done.forEach((q) => left.append(row(q))); }
    const q = BY_ID[this.sel];
    if (q) {
      const st = this.state[q.id];
      right.append(el('h3', null, esc(q.title)), el('div', 'q-giver', `From ${esc(GIVERS[q.giver].call)}`));
      right.append(el('div', 'q-text', esc(typeof q.brief === 'function' ? q.brief(st.n) : q.brief)));
      const ob = el('div', 'q-obj');
      ob.innerHTML = q.objectives.map((o, i) => `<div class="${st.p[i] >= st.n[i] ? 'up' : ''}">${esc(o.label)}: ${Math.min(st.p[i], st.n[i])}/${st.n[i]}</div>`).join('')
        + (st.s === 'ready' ? `<div class="up">Return to ${esc(GIVERS[q.giver].call)}</div>` : '')
        + `<div class="dim small">Where: ${esc(this.places[q.map]?.name || '')}</div>`;
      right.append(ob);
      const [rh, items] = this.rewardHtml(q);
      right.append(el('div', null, rh));
      this.wireTips(right, items);
      if (st.s !== 'done') { const b = el('button', 'small red', 'Give it up'); b.onclick = () => { this.abandon(q.id); }; right.append(b); }
    } else right.append(el('div', 'dim', 'Quests you take show here.'));
    wrap.append(left, right);
    L.append(wrap);
  }
}
