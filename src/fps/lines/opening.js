// What the village says at the crater after the green star (main.js placeInCrater runs the scene:
// villagers.gather). Plain data, so the voice recorder reads the very words the game says
// (tools/voice/script.mjs; docs/VOICES.md): every line here is recorded in its speaker's voice.

export const CALLER = 'Wren';

// Wren calls down to you as you come round, the others calling to her, and she to them over her shoulder
export const GATHER_CALLS = [
  { name: 'Wren', text: 'Hoy! You, down there! Can you hear me?', toYou: true, wave: true },
  { name: 'Elsie', text: 'Is he alive, Wren?', to: 'caller' },
  { name: 'Wren', text: "He's moving! Saints, he's moving!" },
  { name: 'Wren', text: 'Easy, now. Can you stand? Are you hurt?', toYou: true },
  { name: 'Tobias', text: "Don't go any nearer the edge, girl. It's still smoking.", to: 'caller' },
  { name: 'Wren', text: "Come on up to me. Slowly, now. Mind the glass, it's still hot.", toYou: true },
  { name: 'Wren', text: "And bring the knight's things with you. He won't be needing them now.", toYou: true },
];
// and now and then after, while you're still down in it
export const GATHER_AGAIN = [
  { text: "This way. Up here, where it's not so steep." },
  { text: 'That\'s it. Take your time.' },
  { text: 'Up here! Follow my voice.' },
  { text: 'Nobody here will hurt you. Come on up.' },
  { text: 'Can you hear me? Up here, friend.', wave: true },
  { text: "Don't be afraid. You're safe now." },
];
// what the others say among themselves, back from the edge (between her calls)
export const GATHER_CHATTER = [
  { name: 'Elsie', text: 'Did you see it? He fell right out of the sky!' },
  { name: 'Osric', text: 'In a ball of green fire. Square on top of one of the Sworn.' },
  { name: 'Garrow', text: 'Nothing left of that knight but his armour.' },
  { name: 'Hesk', text: 'Nobody lives through a fall like that.' },
  { name: 'Odile', text: 'Green fire out of the vault of heaven… It cannot be. It cannot.' },
  { name: 'Garrow', text: "That girl's mad, going right up to the edge." },
  { name: 'Osric', text: 'Somebody had to. Better her than me.' },
  { name: 'Elsie', text: 'Do you think he is an angel?' },
  { name: 'Tobias', text: 'Spinning like a top, he was, all the way down.' },
  { name: 'Hesk', text: "If he lives, he'll come to us. Wait." },
];
// when you've come up near her: she turns, and takes you to them (and if you fall behind)
export const GATHER_LEAD = [{ text: 'There you are. Gently, now. Come and meet the others.', wave: true }];
export const GATHER_LAG = [{ text: 'This way. Over here.', wave: true }, { text: "Come on. They don't bite." }, { text: 'Over here, friend.' }];
// and the rest, seeing you climb out
export const GATHER_SIGHT = [
  { name: 'Elsie', text: "There! He's climbing out!" },
  { name: 'Tobias', text: "Saints preserve us. He's alive." },
  { name: 'Garrow', text: 'And in his smallclothes, too.' },
  { name: 'Odile', text: 'Nobody run. Let him come to us.', wave: true },
];
// what they tell you when you come to them, in turn: who they are, who you are (and what they give you)
export const GATHER_TALK = [
  { name: 'Odile', text: "Welcome, child. You're among friends. This is Bellmourn, and I am Sister Odile.", wave: true },
  { name: 'Elsie', text: "I'm Elsie! You fell out of the sky! In a ball of green fire! We all saw!" },
  { name: 'Osric', text: "Osric. I'm reeve here. You came down square on one of Lord Velscour's Sworn. There's nothing left of him but his armour." },
  { name: 'Odile', text: 'A green star out of heaven, a man curled as a child, girded in black. It is written, child.' },
  { name: 'Odile', text: 'You are Tessariel. The Sacred Flame, sent down to kill the Demon Lord Velscour.' },
  { name: 'Hesk', text: "Hush! Say that name where the garrison can hear, and they'll hang the lot of us." },
  { name: 'Tobias', text: "I'm Tobias. I keep the inn, the Tolling Bell. Velscour rules us from his far throne, and the Book says you will end him." },
  { name: 'Garrow', text: "Garrow. I'm the smith. You can't go about in your smallclothes, though. Here. You'll want more than that.", gift: 'armor' },
  { name: 'Wren', text: "I'm Wren. I hunt these woods. Wraps for your hands. And keep that sword close.",
    ifArms: "I'm Wren. I hunt these woods. Wraps for your hands. And the knight's sword and shield are still down there: take them.", gift: 'gloves' },
  { name: 'Tobias', text: "Forty crowns from the inn's box. Don't spend it all on ale.", gift: 'gold' },
  { name: 'Hesk', text: "And I'm Mother Hesk. I mend what gets broken. Draughts, dear: red for the blood, blue for the mind.", gift: 'potions' },
  { name: 'Odile', text: 'But before the Fiend, Flame, we have a task for you.' },
  { name: 'Odile', text: 'The dead are walking beneath our cathedral. Speak with me, and I will tell you all of it.' },
];
// if you walk off while they're talking to you
export const GATHER_AWAY = [{ name: 'Elsie', text: 'Wait! Where are you going?' }];
/** Every line of the gathering, in the order they'll be wanted (made ahead, while the game loads). */
export const gatherLines = () => [...GATHER_CALLS, ...GATHER_AGAIN.slice(0, 3).map((l) => ({ ...l, name: CALLER })), ...GATHER_LEAD.map((l) => ({ ...l, name: CALLER })), ...GATHER_SIGHT,
  ...GATHER_TALK.flatMap((l) => (l.ifArms ? [l, { ...l, text: l.ifArms }] : [l])), ...GATHER_AGAIN.slice(3).map((l) => ({ ...l, name: CALLER })),
  ...GATHER_LAG.map((l) => ({ ...l, name: CALLER })), ...GATHER_AWAY, ...GATHER_CHATTER];
