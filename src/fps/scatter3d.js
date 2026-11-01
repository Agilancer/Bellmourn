// Every Velscour scatter sprite that isn't a plant, rebuilt as a 3D model: the world's props,
// clutter, statues, bones, lights, ruins and grave goods. Each sprite name is matched to a model
// kind (urn, statue, brazier, cart, ...) and its words pick the materials (iron, mossy, bone,
// gold, rotten, ...), so all ~250 of them get a model built from the library's textures and
// VectorClad's planks and bark. Models are built at real-world size in their own space and set
// down with Builder.place (one collider each); burning ones add flames that light the world.
import * as THREE from 'three';

// plants stay 2D billboards
const VEG = /fern|thorn_bush|mushroom|bramble|reeds|sapling|dead_shrub|ivy|funeral_flowers|leafy_shrub|wildflowers|palm|acacia|dead_snag|aloe|dry_scrub|twisted_roots|reed_bundle/;
export const isVegetation = (id) => VEG.test(id);

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** The materials models are made of, from the texture library. */
function palette(lib) {
  const M = (id, tile = 1, o = {}) => lib.material(id, { tile, ...o });
  const pick = (ids, name, tile) => M(ids[hash(name) % ids.length], tile);
  const planks = lib.ofKind('plank');
  const woods = [...planks, 'ship_01_tarblack_oak', 'ship_02_salt_worn_oak', 'ship_04_splintered_cypress', 'ship_06_salt_bleached_greyboards', 'wood_04_weathered_cedar', 'town_barn_boards'];
  const barks = lib.ofKind('bark');
  const glow = (r, g, b) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }); m.userData = { tileU: 1, tileV: 1, noCast: true }; return m; };
  return {
    M,
    wood: (n) => pick(woods, n, 1.2), plank: (n) => pick(planks.length ? planks : woods, n, 1.2), bark: (n) => pick(barks.length ? barks : woods, n, 1.4),
    stone: M('castle_ashlar', 1.6), marble: M('castle_keep_ivory_chapel_marble', 1.2), basalt: M('castle_basalt', 1.6),
    moss: M('castle_mossy', 1.6), sandstone: M('castle_keep_pale_keep_limestone', 1.4), rubble: M('castle_rubble', 1.4),
    slab: M('catacombs_crypt_limestone', 1.4),
    iron: M('met_02_riveted_black_iron', 0.6), rust: M('met_03_flaked_iron', 0.6), bronze: M('met_04_tarnished_bronze', 0.6),
    gold: M('gold_01_beaten_antique_gold', 0.5), silver: M('met_06_tarnished_silver', 0.6), steel: M('met_08_scratched_blue_steel', 0.6),
    cloth: (n) => pick(['cloth_01_coarse_sail_canvas', 'cloth_02_stitched_charcoal', 'cloth_03_patched_dark_canvas', 'cloth_04_aged_cream_linen', 'cloth_05_deep_plum_woven_sail'], n, 0.8),
    linen: M('cloth_04_aged_cream_linen', 0.8), canvas: M('cloth_01_coarse_sail_canvas', 0.8),
    bone: M('castle_keep_ivory_chapel_marble', 0.4, { tint: 0xe6dcc4 }), terra: M('catacombs_burial_terracotta', 0.8),
    straw: M('town_roof_straw_thatch', 0.8), soil: M('cathedral_graveyard_grave_soil', 1.5), grass: M('town_dense_meadow', 1.5),
    leaves: (n) => pick(lib.ofKind('leaves').length ? lib.ofKind('leaves') : ['town_dense_meadow'], n, 0.6),
    coals: glow(3.2, 1.1, 0.3), ash: M('sand_ash_wadi', 0.6), wax: M('castle_keep_ivory_chapel_marble', 0.3, { tint: 0xf4ecd8 }),
    glass: glow(2.2, 1.6, 0.8), crystal: { glowing: glow(0.6, 2.2, 2.4), amber: glow(2.6, 1.4, 0.3), turquoise: glow(0.3, 2.0, 1.7), salt: M('sand_salt_crust', 0.6) },
    shards: [glow(2.2, 0.4, 0.4), glow(0.4, 0.8, 2.4), glow(0.5, 2.2, 0.6), glow(2.2, 1.8, 0.4)],
  };
}

/** The materials one model uses, chosen by the words in its name. */
function matsFor(name, P) {
  const m = { wood: P.wood(name), plank: P.plank(name), bark: P.bark(name), stone: P.stone, metal: P.iron, cloth: P.cloth(name), shade: 1 };
  if (/moss|mold|algae|sludge|muck|green|vine|druid|forest/.test(name)) m.stone = P.moss;
  else if (/basalt|black|soot|obsidian|charcoal|sewer/.test(name)) m.stone = P.basalt;
  else if (/marble|ivory|saint|angel|chapel|cathedral|royal|font|celtic|gothic|memorial/.test(name)) m.stone = P.marble;
  else if (/sand_|desert|salt|caravan|wind_carved/.test(name)) m.stone = P.sandstone;
  else if (/rubble|cairn|boundary|fieldstone/.test(name)) m.stone = P.rubble;
  if (/bronze|brass|bell|censer/.test(name)) m.metal = P.bronze;
  else if (/rust|corroded|flaked|sewer/.test(name)) m.metal = P.rust;
  m.trim = /gold|jewel|crown|treasury|reliquary|royal/.test(name) ? P.gold : m.metal;
  if (/rot|mildew|filth|grime|sludge|rusty|rusted|corroded|mud|stagnant/.test(name)) m.shade = 0.72;
  return m;
}

// ------------------------------------------------------------------ model kinds
// Each takes (o) — the helpers below — and builds at real size, ground at y = 0, front +z.
const urnProfile = [[0, 0], [0.16, 0], [0.24, 0.1], [0.29, 0.32], [0.24, 0.6], [0.11, 0.74], [0.13, 0.84], [0.16, 0.88], [0, 0.88]];
const K = {
  urn(o) {
    const n = /cluster|pottery/.test(o.name) ? 3 + (o.r() * 2 | 0) : 1;
    for (let i = 0; i < n; i++) {
      const a = i * 2.3, d = n > 1 ? 0.35 + 0.1 * i : 0, s = n > 1 ? 0.55 + o.r() * 0.45 : 1;
      const prof = (/broken/.test(o.name) && i === 0 ? urnProfile.slice(0, 5) : urnProfile).map(([r, y]) => [r * s, y * s]);
      o.lathe(prof, /terra|amphora|jar|pottery|clay|urn_cluster|burial/.test(o.name) ? o.P.terra : o.m.stone, Math.cos(a) * d, Math.sin(a) * d);
    }
    if (/broken|pottery/.test(o.name)) for (let i = 0; i < 5; i++) o.blob([o.r() - 0.5, 0.04, o.r() - 0.5], [0.09, 0.03, 0.07], o.P.terra, { detail: 0 });
    if (/buried/.test(o.name)) o.blob([0, 0.02, 0], [0.4, 0.12, 0.4], o.P.soil);
    if (/draped/.test(o.name)) o.blob([0.05, 0.62, 0], [0.26, 0.14, 0.24], o.P.linen);
  },
  amphora(o) {
    const big = /water_jar/.test(o.name) ? 1.6 : 1;
    o.lathe([[0, 0], [0.06, 0], [0.09, 0.1], [0.24, 0.36], [0.27, 0.56], [0.17, 0.8], [0.07, 0.88], [0.07, 1.06], [0.1, 1.1], [0, 1.1]].map(([r, y]) => [r * big, y * big]),
      /mold/.test(o.name) ? o.P.moss : o.P.terra);
    for (const s of [-1, 1]) o.beam([s * 0.08 * big, 1.0 * big, 0], [s * 0.21 * big, 0.78 * big, 0], 0.04, 0.04, o.P.terra);
    if (/broken/.test(o.name)) for (let i = 0; i < 4; i++) o.blob([o.r() - 0.5, 0.03, o.r() - 0.5], [0.1, 0.03, 0.08], o.P.terra, { detail: 0 });
  },
  statue(o) {
    const n = o.name, kneel = /kneel/.test(n), stone = o.m.stone;
    const ped = /idol|memorial|saint|warden|statue|lion|gargoyle|angel/.test(n) && !kneel;
    let y = 0;
    if (ped) { o.box(-0.45, 0, -0.45, 0.45, 0.4, 0.45, stone); o.box(-0.5, 0, -0.5, 0.5, 0.12, 0.5, stone); y = 0.4; }
    if (/memorial/.test(n)) { o.box(-0.6, 0, -0.6, 0.6, 0.9, 0.6, stone); y = 0.9; }
    if (/lion/.test(n)) {
      o.blob([0, y + 0.55, -0.05], [0.28, 0.3, 0.55], stone); o.blob([0, y + 0.95, 0.42], [0.3, 0.32, 0.26], stone);
      o.blob([0, y + 0.9, 0.62], [0.14, 0.14, 0.16], stone);
      for (const [x, z] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.4], [0.18, -0.4]]) o.cyl([x, y, z], [x, y + 0.45, z], 0.08, stone, 6);
      return;
    }
    if (/gargoyle/.test(n)) {
      o.blob([0, y + 0.45, 0], [0.32, 0.38, 0.3], stone); o.blob([0, y + 0.92, 0.12], [0.2, 0.2, 0.22], stone);
      for (const s of [-1, 1]) o.beam([s * 0.2, y + 0.75, -0.1], [s * 0.7, y + 1.25, -0.3], 0.55, 0.04, stone);
      return;
    }
    if (/idol/.test(n)) { o.blob([0, y + 0.35, 0], [0.24, 0.34, 0.2], stone); o.blob([0, y + 0.82, 0], [0.2, 0.2, 0.18], stone); return; }
    if (/armor/.test(n)) {
      const m = o.P.steel;
      o.box(-0.25, 0, -0.25, 0.25, 0.1, 0.25, o.m.wood);
      for (const s of [-1, 1]) o.cyl([s * 0.1, 0.1, 0], [s * 0.1, 0.95, 0], 0.08, m, 6);
      o.lathe([[0.2, 0.9], [0.24, 1.15], [0.27, 1.45], [0.2, 1.55], [0, 1.58]], m);
      for (const s of [-1, 1]) o.cyl([s * 0.3, 1.45, 0], [s * 0.34, 0.95, 0.05], 0.07, m, 6);
      o.cyl([0, 1.58, 0], [0, 1.85, 0], 0.13, m, 8); o.cone(0, 0, 0.14, 1.85, 0.12, m);
      return;
    }
    const h = kneel ? 1.0 : 1.55, robe = /hooded|mourner|warden|shroud/.test(n) ? (/hooded|mourner/.test(n) ? o.P.basalt : stone) : stone;
    o.lathe([[0.34, y], [0.3, y + h * 0.5], [0.22, y + h * 0.92], [0.17, y + h], [0, y + h + 0.02]], robe);
    if (!/headless/.test(n)) {
      if (/hooded|mourner/.test(n)) o.cone(0, 0.02, 0.17, y + h - 0.02, 0.34, robe); else o.blob([0, y + h + 0.13, 0.02], [0.11, 0.13, 0.12], stone);
    }
    // arms: hands together in prayer, or holding a staff (the warden)
    for (const s of [-1, 1]) o.beam([s * 0.2, y + h * 0.9, 0], [s * 0.05, y + h * 0.68, 0.2], 0.08, 0.08, robe);
    if (/warden/.test(n)) o.beam([0.25, y, 0.15], [0.25, y + h + 0.3, 0.15], 0.06, 0.06, o.m.metal);
    if (/angel/.test(n)) for (const s of [-1, 1]) {
      o.beam([s * 0.12, y + h * 0.88, -0.12], [s * 0.55, y + h + 0.45, -0.4], 0.5, 0.05, stone);
      o.beam([s * 0.35, y + h * 0.6, -0.2], [s * 0.6, y + h + 0.2, -0.42], 0.3, 0.04, stone);
    }
  },
  head(o) { // a great stone head on the ground (cracked, or half buried in sand)
    const s = o.m.stone;
    o.blob([0, 0.55, 0], [0.5, 0.6, 0.48], s, { detail: 2, jitter: 0.08 });
    o.blob([0, 0.48, 0.42], [0.1, 0.18, 0.12], s); // the nose
    if (/buried/.test(o.name)) o.blob([0, 0.05, 0], [0.9, 0.25, 0.9], o.P.sandstone);
  },
  bones(o) {
    const n = o.name, B = o.P.bone;
    const skull = (x, y, z, r = 0.11) => { o.blob([x, y + r, z], [r, r * 0.9, r * 1.15], B, { jitter: 0.06 }); o.blob([x, y + r * 0.35, z + r * 0.6], [r * 0.6, r * 0.35, r * 0.5], B, { detail: 0 }); };
    if (/pyramid|skull_pile|rat_infested/.test(n)) {
      let y = 0;
      for (const [k, s] of [[3, 0.3], [2, 0.3], [1, 0]]) { for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) skull((i - (k - 1) / 2) * 0.24, y, (j - (k - 1) / 2) * 0.24); y += 0.2; void s; }
      if (/rat/.test(n)) for (let i = 0; i < 3; i++) o.blob([o.r() - 0.5, 0.06, o.r() * 0.6], [0.06, 0.05, 0.12], o.P.basalt);
      return;
    }
    if (/giant_skull/.test(n)) { o.blob([0, 0.7, 0], [0.8, 0.7, 1.0], B, { detail: 2, jitter: 0.07 }); for (const s of [-1, 1]) o.blob([s * 0.3, 0.8, 0.82], [0.18, 0.16, 0.08], o.P.basalt); return; }
    if (/ribcage/.test(n)) {
      o.cyl([0, 0.15, -1.2], [0, 0.2, 1.2], 0.08, B, 6);
      for (let i = -4; i <= 4; i++) for (const s of [-1, 1]) {
        const z = i * 0.25; o.beam([0, 0.2, z], [s * 0.55, 0.75, z * 1.1], 0.05, 0.06, B); o.beam([s * 0.55, 0.75, z * 1.1], [s * 0.35, 0.02, z * 1.2], 0.05, 0.06, B);
      }
      return;
    }
    if (/skeleton|remains|boots_and_belt/.test(n)) {
      skull(0, 0, 0.78, 0.1); o.beam([0, 0.06, 0.65], [0, 0.06, -0.05], 0.05, 0.05, B);
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) o.beam([0, 0.07, 0.55 - i * 0.08], [s * 0.15, 0.05, 0.5 - i * 0.08], 0.03, 0.03, B);
      for (const s of [-1, 1]) { o.beam([s * 0.08, 0.05, -0.05], [s * 0.12, 0.05, -0.85], 0.045, 0.045, B); o.beam([s * 0.18, 0.05, 0.5], [s * 0.28, 0.05, 0.05], 0.035, 0.035, B); }
      if (/sludge|remains/.test(n)) o.blob([0, 0.02, 0.2], [0.45, 0.04, 0.7], o.P.moss);
      if (/boots/.test(n)) for (const s of [-1, 1]) o.box(s * 0.12 - 0.05, 0, -0.95, s * 0.12 + 0.05, 0.22, -0.72, o.P.cloth('boots'));
      return;
    }
    // a heap of long bones with a skull or two (wolf bones, deer skull with antlers)
    for (let i = 0; i < (/heap/.test(n) ? 16 : 7); i++) {
      const a = o.r() * 6.28, l = 0.3 + o.r() * 0.35, x = (o.r() - 0.5) * 0.8, z = (o.r() - 0.5) * 0.8, y = 0.04 + o.r() * 0.18;
      o.cyl([x - Math.cos(a) * l / 2, y, z - Math.sin(a) * l / 2], [x + Math.cos(a) * l / 2, y + (o.r() - 0.5) * 0.1, z + Math.sin(a) * l / 2], 0.03, B, 5);
    }
    skull(0.1, 0.05, 0.05);
    if (/deer/.test(n)) for (const s of [-1, 1]) { o.beam([s * 0.06, 0.3, 0.1], [s * 0.3, 0.7, -0.05], 0.03, 0.03, B); o.beam([s * 0.2, 0.55, 0], [s * 0.35, 0.65, 0.15], 0.025, 0.025, B); }
  },
  corpse(o) { o.blob([0, 0.17, 0], [0.24, 0.16, 0.85], /spider/.test(o.name) ? o.P.linen : o.P.linen, { jitter: 0.1 }); for (let i = 0; i < 4; i++) o.cyl([-0.25, 0.12, -0.5 + i * 0.32], [0.25, 0.12, -0.5 + i * 0.32], 0.17, o.P.canvas, 8); },
  eggs(o) { for (let i = 0; i < 9; i++) o.blob([(o.r() - 0.5) * 0.7, 0.12 + o.r() * 0.15, (o.r() - 0.5) * 0.7], [0.12, 0.16, 0.12], o.P.linen, { jitter: 0.05 }); o.blob([0, 0.05, 0], [0.5, 0.08, 0.5], o.P.linen); },
  candles(o) {
    o.box(-0.22, 0, -0.18, 0.22, 0.05, 0.18, o.m.stone);
    for (let i = 0; i < 6; i++) { const x = (o.r() - 0.5) * 0.36, z = (o.r() - 0.5) * 0.28, h = 0.12 + o.r() * 0.28; o.cyl([x, 0.05, z], [x, 0.05 + h, z], 0.028, o.P.wax, 6); o.flame(x, 0.07 + h, z, 0.07); }
  },
  candleTree(o) { // a tall standing candle tree (iron chandelier on its stand)
    const m = o.m.metal;
    for (let k = 0; k < 3; k++) { const a = k * 2.09; o.beam([0, 0.9, 0], [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], 0.04, 0.04, m); }
    o.cyl([0, 0.4, 0], [0, 1.75, 0], 0.035, m, 6);
    for (const [y, r, n] of [[1.2, 0.45, 6], [1.62, 0.25, 4]]) for (let k = 0; k < n; k++) {
      const a = k / n * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r;
      o.beam([0, y - 0.06, 0], [x, y, z], 0.025, 0.025, m); o.cyl([x, y, z], [x, y + 0.14, z], 0.025, o.P.wax, 5); o.flame(x, y + 0.16, z, 0.08);
    }
  },
  brazier(o) {
    const m = o.m.metal, ash = /ash/.test(o.name), wall = /wall_brazier/.test(o.name);
    if (wall) { o.box(-0.08, 0, -0.08, 0.08, 1.3, 0.08, o.m.stone); o.beam([0, 1.1, 0], [0, 1.3, 0.35], 0.05, 0.05, m); }
    else for (let k = 0; k < 3; k++) { const a = k * 2.09; o.beam([Math.cos(a) * 0.08, 0.95, Math.sin(a) * 0.08], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 0.05, 0.05, m); }
    const y = wall ? 1.25 : 0.9, z = wall ? 0.35 : 0;
    o.lathe([[0.06, 0], [0.32, 0.12], [0.4, 0.3], [0.36, 0.3], [0, 0.18]], m, 0, z, y);
    o.blob([0, y + 0.24, z], [0.3, 0.06, 0.3], ash ? o.P.ash : o.P.coals, { detail: 1 });
    if (!ash) o.flame(0, y + 0.3, z, /bronze|green/.test(o.name) ? 0.55 : 0.45);
  },
  torchStand(o) {
    const m = o.m.metal;
    for (let k = 0; k < 3; k++) { const a = k * 2.09; o.beam([0, 0.5, 0], [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], 0.04, 0.04, m); }
    o.cyl([0, 0.3, 0], [0, 1.8, 0], 0.035, o.m.wood, 6);
    o.lathe([[0.04, 0], [0.12, 0.12], [0.14, 0.2], [0, 0.12]], m, 0, 0, 1.75);
    o.flame(0, 1.95, 0, 0.32);
  },
  lantern(o) {
    const n = o.name, m = o.m.metal;
    let lx = 0, ly = 0.7, lz = 0;
    if (/grave_lantern/.test(n)) { o.box(-0.14, 0, -0.14, 0.14, 0.75, 0.14, o.m.stone); ly = 0.75; o.box(-0.2, 0.75, -0.2, 0.2, 0.8, 0.2, o.m.stone); ly = 0.8; }
    else if (/stake|hanging/.test(n)) {
      const h = /hanging/.test(n) ? 2.1 : 1.3;
      o.cyl([0, 0, 0], [0, h, 0], 0.045, o.m.wood, 6); o.beam([0, h - 0.05, 0], [0.45, h - 0.05, 0], 0.04, 0.05, m);
      o.beam([0.45, h - 0.05, 0], [0.45, h - 0.25, 0], 0.01, 0.01, m); lx = 0.45; ly = h - 0.6;
    } else if (/cage/.test(n)) ly = 0;
    o.box(lx - 0.13, ly, lz - 0.13, lx + 0.13, ly + 0.36, lz + 0.13, o.P.glass);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.beam([lx + dx * 0.14, ly, lz + dz * 0.14], [lx + dx * 0.14, ly + 0.37, lz + dz * 0.14], 0.025, 0.025, m);
    o.cone(lx, lz, 0.19, ly + 0.36, 0.16, m, 4);
    o.flame(lx, ly + 0.12, lz, 0.13);
  },
  campfire(o) {
    const cold = /cold|firepit/.test(o.name);
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; o.blob([Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5], [0.13, 0.1, 0.12], o.P.rubble, { detail: 0 }); }
    for (let k = 0; k < 4; k++) { const a = k * 0.8; o.cyl([Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38], [-Math.cos(a) * 0.1, 0.32, -Math.sin(a) * 0.1], 0.05, o.m.bark, 6); }
    o.blob([0, 0.02, 0], [0.36, 0.04, 0.36], cold ? o.P.ash : o.P.coals);
    if (!cold) o.flame(0, 0.25, 0, 0.7);
  },
  censer(o) {
    const m = o.P.bronze;
    for (let k = 0; k < 3; k++) { const a = k * 2.09; o.beam([0, 0.85, 0], [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], 0.03, 0.03, m); }
    o.beam([0, 0.85, 0], [0, 0.6, 0], 0.01, 0.01, m);
    o.lathe([[0, 0], [0.12, 0.06], [0.14, 0.14], [0.08, 0.22], [0, 0.26]], m, 0, 0, 0.36);
    o.flame(0, 0.6, 0, 0.06);
  },
  forge(o) {
    o.box(-0.9, 0, -0.6, 0.9, 0.85, 0.6, o.m.stone); o.box(-0.7, 0.85, -0.45, 0.7, 0.9, 0.45, /cold/.test(o.name) ? o.P.ash : o.P.coals);
    o.cone(0, 0, 0.9, 1.6, 0.9, o.P.rust, 4); o.box(-0.25, 2.5, -0.25, 0.25, 3.2, 0.25, o.P.rust);
    if (!/cold/.test(o.name)) o.flame(0, 1.0, 0, 0.4);
  },
  bench(o) {
    const m = /oak|wood/.test(o.name) ? o.m.wood : o.m.stone;
    o.box(-0.8, 0.38, -0.2, 0.8, 0.48, 0.2, m);
    for (const s of [-1, 1]) o.box(s * 0.62 - 0.08, 0, -0.17, s * 0.62 + 0.08, 0.38, 0.17, m);
    if (/wet|algae/.test(o.name)) o.blob([0, 0.47, 0], [0.5, 0.02, 0.15], o.P.moss);
  },
  table(o) {
    const n = o.name, m = o.m.wood;
    const h = /workbench/.test(n) ? 0.85 : 0.78, w = /war_map/.test(n) ? 1.0 : 0.75;
    o.box(-w, h, -0.5, w, h + 0.08, 0.5, m);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.box(x * (w - 0.08) - 0.05, 0, z * 0.42 - 0.05, x * (w - 0.08) + 0.05, h, z * 0.42 + 0.05, m);
    if (/war_map/.test(n)) { o.box(-0.8, h + 0.08, -0.4, 0.8, h + 0.09, 0.4, o.P.linen); for (let i = 0; i < 4; i++) o.cone(o.r() - 0.5, (o.r() - 0.5) * 0.6, 0.03, h + 0.09, 0.08, o.P.gold, 4); }
    if (/workbench/.test(n)) { o.box(-0.6, h + 0.08, -0.2, -0.2, h + 0.18, 0.1, o.P.iron); o.beam([0.2, h + 0.1, 0], [0.6, h + 0.1, 0.1], 0.04, 0.04, o.m.wood); o.box(-0.7, 0.2, -0.4, 0.7, 0.24, 0.4, m); }
    if (/market/.test(n)) for (let i = 0; i < 5; i++) o.blob([(o.r() - 0.5) * 1.2, h + 0.14, (o.r() - 0.5) * 0.6], [0.09, 0.08, 0.09], o.P.cloth('fruit' + i));
  },
  lectern(o) {
    const m = /corroded|iron/.test(o.name) ? o.m.metal : o.m.wood;
    o.box(-0.25, 0, -0.25, 0.25, 0.08, 0.25, m); o.cyl([0, 0.08, 0], [0, 1.0, 0], 0.06, m, 6);
    o.beam([0, 1.02, -0.18], [0, 1.18, 0.18], 0.55, 0.05, m, [0, 0, 1]);
    o.beam([-0.12, 1.08, -0.1], [-0.12, 1.18, 0.12], 0.22, 0.03, o.P.linen); o.beam([0.12, 1.08, -0.1], [0.12, 1.18, 0.12], 0.22, 0.03, o.P.linen);
    if (/royal/.test(o.name)) o.box(-0.28, 0.98, -0.2, 0.28, 1.0, 0.2, o.P.gold);
  },
  altar(o) {
    const n = o.name, s = o.m.stone;
    o.box(-0.8, 0, -0.45, 0.8, 0.95, 0.45, s); o.box(-0.9, 0.95, -0.5, 0.9, 1.05, 0.5, s);
    if (/shroud/.test(n)) o.box(-0.95, 0.4, -0.52, 0.95, 1.07, 0.52, o.P.linen);
    if (/bone/.test(n)) for (let i = 0; i < 3; i++) o.blob([-0.5 + i * 0.5, 1.15, 0], [0.11, 0.1, 0.13], o.P.bone);
    if (/vine/.test(n)) for (let i = 0; i < 5; i++) o.blob([(o.r() - 0.5) * 1.6, 0.2 + o.r() * 0.8, 0.48], [0.25, 0.2, 0.06], o.P.leaves(n + i), { jitter: 0.3 });
    for (const x of [-0.6, 0.6]) { o.cyl([x, 1.05, 0], [x, 1.3, 0], 0.03, o.P.wax, 5); o.flame(x, 1.33, 0, 0.07); }
  },
  basin(o) {
    const n = o.name, s = o.m.stone;
    if (/font/.test(n)) { o.lathe([[0.3, 0], [0.18, 0.12], [0.14, 0.6], [0.5, 0.75], [0.56, 1.0], [0.44, 1.0], [0, 0.86]], s, 0, 0, 0, 12); return; }
    if (/catch|trough/.test(n)) { o.box(-0.8, 0, -0.35, 0.8, 0.12, 0.35, s); for (const [a, b, c, d] of [[-0.8, -0.35, 0.8, -0.27], [-0.8, 0.27, 0.8, 0.35], [-0.8, -0.35, -0.72, 0.35], [0.72, -0.35, 0.8, 0.35]]) o.box(a, 0, b, c, 0.55, d, s); o.box(-0.72, 0.4, -0.27, 0.72, 0.42, 0.27, o.P.moss); return; }
    const r = /offering|stagnant/.test(n) ? 0.3 : 0.5;
    o.lathe([[0.2 * r / 0.5, 0], [r, 0.15], [r * 1.1, 0.32], [r * 0.95, 0.32], [0, 0.2]], s, 0, 0, /offering|stagnant/.test(n) ? 0 : 0.45, 10);
    if (r > 0.3) o.cyl([0, 0, 0], [0, 0.45, 0], 0.16, s, 8);
  },
  throne(o) {
    const s = o.m.stone, g = o.P.gold;
    o.box(-0.7, 0, -0.5, 0.7, 0.3, 0.6, s); o.box(-0.55, 0.3, -0.4, 0.55, 0.7, 0.45, s);
    o.box(-0.55, 0.7, -0.45, 0.55, /broken/.test(o.name) ? 1.7 : 2.3, -0.25, s);
    for (const x of [-0.6, 0.6]) { o.box(x - 0.08, 0.7, -0.4, x + 0.08, 1.05, 0.45, s); o.cone(x, -0.35, 0.1, /broken/.test(o.name) && x > 0 ? 1.7 : 2.3, 0.4, g, 4); }
    o.box(-0.5, 0.7, 0.42, 0.5, 0.72, 0.46, g);
    if (/broken/.test(o.name)) for (let i = 0; i < 3; i++) o.blob([0.4 + o.r() * 0.6, 0.1, 0.6 + o.r() * 0.4], [0.18, 0.12, 0.15], s);
  },
  confessional(o) {
    const w = o.m.wood;
    o.box(-1.1, 0, -0.5, 1.1, 0.1, 0.5, w); o.box(-1.15, 2.2, -0.55, 1.15, 2.35, 0.55, w);
    for (const x of [-1.1, -0.36, 0.36, 1.1]) o.box(x - 0.05, 0.1, -0.5, x + 0.05, 2.2, 0.5, w);
    o.box(-1.1, 0.1, -0.5, 1.1, 2.2, -0.45, w);
    o.box(-0.33, 0.25, 0.44, 0.33, 2.0, 0.48, w); // the priest's door
    for (const x of [-0.73, 0.73]) o.box(x - 0.34, 0.6, 0.45, x + 0.34, 2.1, 0.47, o.P.cloth('plum')); // curtains
    for (let x = -1.0; x <= 1.0; x += 0.25) o.cone(x, 0, 0.06, 2.35, 0.2, w, 4);
  },
  organ(o) {
    const w = o.m.wood, m = o.P.silver;
    o.box(-1.3, 0, -0.5, 1.3, 1.0, 0.5, w); o.box(-1.0, 0.95, 0.3, 1.0, 1.0, 0.7, o.P.linen);
    o.box(-1.35, 1.0, -0.5, 1.35, 1.2, 0.2, w);
    for (let i = 0; i < 15; i++) { const x = -1.2 + i * 0.17, h = 0.8 + (1 - Math.abs(i - 7) / 7) * 1.1; o.cyl([x, 1.2, -0.1], [x, 1.2 + h, -0.1], 0.07, m, 6); o.cone(x, -0.1, 0.07, 1.2, -0.1, m, 6); }
  },
  shrine(o) {
    const s = o.m.stone, ruined = /ruined/.test(o.name);
    o.box(-0.7, 0, -0.6, 0.7, 0.25, 0.6, s);
    for (const x of [-0.55, 0.55]) o.box(x - 0.12, 0.25, -0.45, x + 0.12, ruined && x > 0 ? 0.9 : 1.6, -0.2, s);
    if (!ruined) { o.box(-0.75, 1.6, -0.55, 0.75, 1.72, 0.1, s); o.cone(0, -0.22, 0.7, 1.72, 0.45, s, 4); }
    o.blob([0, 0.5, -0.3], [0.15, 0.25, 0.12], /quest|druid/.test(o.name) ? o.P.crystal.glowing : s);
    if (/vine|forest|druid/.test(o.name)) for (let i = 0; i < 4; i++) o.blob([(o.r() - 0.5) * 1.2, 0.4 + o.r() * 1.0, -0.15], [0.25, 0.25, 0.08], o.P.leaves(o.name + i), { jitter: 0.3 });
  },
  wheel(o, x = 0, y = 0.55, z = 0, r = 0.55, axis = 'x', m = o.m.wood) {
    const pt = (a, rr) => (axis === 'x' ? [x, y + Math.cos(a) * rr, z + Math.sin(a) * rr] : [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]);
    for (let k = 0; k < 12; k++) o.beam(pt(k / 12 * 6.28, r), pt((k + 1) / 12 * 6.28, r), 0.08, 0.08, m);
    for (let k = 0; k < 6; k++) o.beam(pt(k / 6 * 6.28, 0.06), pt(k / 6 * 6.28, r - 0.03), 0.04, 0.04, m);
    o.cyl(axis === 'x' ? [x - 0.08, y, z] : [x, y - 0.08, z], axis === 'x' ? [x + 0.08, y, z] : [x, y + 0.08, z], 0.08, o.P.iron, 6);
  },
  wheelAlone(o) { K.wheel(o, 0, 0.08, 0, 0.55, 'y', o.m.wood); if (/debris/.test(o.name)) for (let i = 0; i < 4; i++) o.beam([(o.r() - 0.5) * 1.4, 0.04, (o.r() - 0.5) * 1.4], [(o.r() - 0.5) * 1.4, 0.04, (o.r() - 0.5) * 1.4], 0.15, 0.04, o.m.plank); },
  cart(o) {
    const w = o.m.plank, broken = /broken/.test(o.name), tilt = broken ? 0.35 : 0;
    o.box(-0.9, 0.62 - tilt, -0.55, 0.9, 0.72 - tilt, 0.55, w);
    for (const z of [-0.55, 0.55]) o.box(-0.9, 0.72 - tilt, z - 0.04, 0.9, 1.0 - tilt, z + 0.04, w);
    K.wheel(o, 0, 0.5, 0.7, 0.5, 'x');
    if (broken) K.wheel(o, 1.4, 0.06, -0.6, 0.5, 'y'); else K.wheel(o, 0, 0.5, -0.7, 0.5, 'x');
    for (const z of [-0.4, 0.4]) o.beam([0.9, 0.66 - tilt, z], [2.2, 0.05, z], 0.07, 0.07, o.m.wood);
    if (/funerary/.test(o.name)) o.box(-0.8, 0.72, -0.35, 0.8, 1.0, 0.35, o.P.basalt);
    if (/scrap/.test(o.name)) for (let i = 0; i < 5; i++) o.blob([(o.r() - 0.5) * 1.2, 0.85, (o.r() - 0.5) * 0.6], [0.15, 0.1, 0.12], o.P.rust);
  },
  sacks(o) {
    const m = o.P.canvas;
    for (const [x, y, z] of [[-0.3, 0, 0], [0.3, 0, 0.05], [0, 0, -0.45], [0, 0.42, -0.1]]) { o.blob([x, y + 0.24, z], [0.28, 0.24, 0.24], m, { jitter: 0.12, floor: y }); o.cyl([x, y + 0.42, z], [x, y + 0.56, z], 0.06, m, 6); }
  },
  hay(o) { o.box(-0.6, 0, -0.38, 0.6, 0.7, 0.38, o.P.straw); o.box(-0.55, 0.7, -0.35, 0.55, 1.35, 0.35, o.P.straw); for (const x of [-0.3, 0.3]) o.box(x - 0.02, 0, -0.4, x + 0.02, 1.36, 0.4, o.P.wood('twine')); },
  rolls(o) {
    const n = o.name;
    if (/carpet/.test(n)) { for (let i = 0; i < 4; i++) { const y = 0.16 + (i > 2 ? 0.3 : 0), z = (i % 3 - 1) * 0.34 + (i > 2 ? 0.17 : 0); o.cyl([-0.9, y, z], [0.9, y, z], 0.16, o.P.cloth(n + i), 8); } return; }
    if (/tapestry/.test(n)) { o.box(-0.9, 0, -0.6, 0.9, 0.05, 0.6, o.P.cloth(n)); o.cyl([-0.9, 0.12, 0.6], [0.9, 0.12, 0.6], 0.12, o.P.cloth(n), 8); return; }
    o.box(-0.35, 0, -0.9, 0.35, 0.04, 0.6, /mildew|bedroll/.test(n) ? o.P.cloth(n) : o.P.linen);
    o.cyl([-0.35, 0.14, 0.75], [0.35, 0.14, 0.75], 0.14, /shroud/.test(n) ? o.P.linen : o.P.cloth(n + 'r'), 8);
  },
  basket(o) {
    const n = o.name;
    if (/potion/.test(n)) { o.box(-0.45, 0, -0.2, 0.45, 0.5, 0.2, o.m.wood); for (let i = 0; i < 6; i++) { const x = -0.35 + i * 0.14; o.lathe([[0, 0], [0.05, 0], [0.06, 0.08], [0.03, 0.15], [0.03, 0.2], [0, 0.2]], o.P.crystal[['glowing', 'amber', 'turquoise'][i % 3]], x, 0, 0.5, 6); } return; }
    if (/scroll/.test(n)) { o.box(-0.5, 0, -0.2, 0.5, 1.4, -0.15, o.m.wood); for (const y of [0.3, 0.7, 1.1]) { o.box(-0.5, y, -0.2, 0.5, y + 0.03, 0.2, o.m.wood); for (let i = 0; i < 5; i++) o.cyl([-0.4 + i * 0.2, y + 0.08, -0.15], [-0.4 + i * 0.2, y + 0.08, 0.18], 0.05, o.P.linen, 6); } return; }
    if (/bucket/.test(n)) { o.lathe([[0, 0], [0.16, 0], [0.2, 0.36], [0.18, 0.36], [0, 0.04]], o.m.wood); o.beam([-0.19, 0.36, 0], [0.19, 0.36, 0], 0.01, 0.01, o.P.iron); if (/shovel/.test(n)) { o.beam([0.4, 0, -0.1], [0.55, 1.2, -0.2], 0.04, 0.04, o.m.wood); o.box(0.33, 0, -0.18, 0.5, 0.28, -0.05, o.P.iron); } return; }
    o.lathe([[0, 0], [0.24, 0], [0.3, 0.3], [0.27, 0.3], [0, 0.04]], o.P.straw);
    for (let i = 0; i < 6; i++) o.blob([(o.r() - 0.5) * 0.3, 0.32, (o.r() - 0.5) * 0.3], [0.08, 0.07, 0.08], o.P.cloth('veg' + i));
  },
  shieldRack(o) {
    const w = o.m.wood;
    for (const x of [-0.8, 0.8]) o.beam([x, 0, -0.3], [x, 1.6, 0], 0.08, 0.08, w), o.beam([x, 0, 0.3], [x, 1.6, 0], 0.08, 0.08, w);
    o.beam([-0.8, 1.55, 0], [0.8, 1.55, 0], 0.08, 0.08, w);
    for (let i = 0; i < 3; i++) { const x = -0.5 + i * 0.5; o.cyl([x, 1.0, 0.1], [x, 1.0, 0.16], 0.32, i % 2 ? o.P.wood('sh') : o.P.iron, 12); o.blob([x, 1.0, 0.18], [0.07, 0.07, 0.05], o.P.bronze); }
  },
  trophy(o) { o.box(-0.45, 0.8, -0.04, 0.45, 1.5, 0.04, o.m.wood); o.cyl([0, 0, 0], [0, 0.8, 0], 0.05, o.m.wood, 6); for (const s of [-1, 1]) { o.beam([s * 0.5, 0.75, 0.08], [-s * 0.5, 1.6, 0.08], 0.05, 0.02, o.P.steel); o.beam([s * 0.36, 0.84, 0.1], [s * 0.25, 0.73, 0.1], 0.18, 0.03, o.P.gold); } },
  spears(o) {
    const n = o.name;
    if (/lance/.test(n)) { o.cyl([-1.5, 0.08, 0], [1.0, 0.08, 0.1], 0.06, o.m.wood, 6, 0.03); o.cone(-1.5, 0, 0.12, 0.02, 0.15, o.P.steel, 6); o.cyl([1.2, 0.05, 0.3], [1.6, 0.05, 0.5], 0.03, o.m.wood, 5); return; }
    const k = /cache/.test(n) ? 5 : 8;
    for (let i = 0; i < k; i++) { const a = i / k * 6.28; o.beam([Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.05, 2.0, Math.sin(a) * 0.05], 0.04, 0.04, o.m.wood); o.cone(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.04, 1.98, 0.2, o.P.steel, 4); }
    o.cyl([0, 1.2, 0], [0, 1.3, 0], 0.12, o.P.cloth('rope'), 8);
    if (/cache/.test(n)) { o.box(-0.5, 0, -0.35, 0.5, 0.5, 0.35, o.m.plank); o.blob([0, 0, 0], [0.8, 0.15, 0.6], o.P.sandstone); }
  },
  shield(o) {
    const smashed = /smashed/.test(o.name);
    if (smashed) { for (let i = 0; i < 4; i++) o.beam([(o.r() - 0.5), 0.03, (o.r() - 0.5)], [(o.r() - 0.5), 0.03, (o.r() - 0.5)], 0.25, 0.03, i % 2 ? o.P.gold : o.m.wood); return; }
    o.cyl([0, 0.42, 0.08], [0, 0.48, -0.06], 0.42, o.m.wood, 14); o.blob([0, 0.45, 0.1], [0.1, 0.1, 0.06], o.P.bronze);
  },
  cannon(o) {
    const n = o.name;
    if (/ball/.test(n)) { let y = 0; for (const [k, r] of [[3, 0.12], [2, 0.12], [1, 0.12]]) { for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) o.blob([(i - (k - 1) / 2) * 0.24, y + r, (j - (k - 1) / 2) * 0.24], [r, r, r], o.P.iron, { jitter: 0.02 }); y += 0.2; } return; }
    if (/ballista/.test(n)) {
      const w = o.m.wood;
      o.box(-0.15, 0.6, -1.2, 0.15, 0.75, 1.0, w); o.beam([0, 0, -0.6], [0, 0.65, -0.3], 0.12, 0.12, w); o.beam([-0.5, 0, 0.5], [0, 0.65, 0.4], 0.1, 0.1, w); o.beam([0.5, 0, 0.5], [0, 0.65, 0.4], 0.1, 0.1, w);
      for (const s of [-1, 1]) o.beam([0, 0.8, 0.8], [s * 1.0, 0.85, 0.4], 0.08, 0.08, w);
      o.beam([-1.0, 0.85, 0.4], [0, 0.82, -0.9], 0.01, 0.01, o.P.linen); o.beam([1.0, 0.85, 0.4], [0, 0.82, -0.9], 0.01, 0.01, o.P.linen);
      o.cyl([0, 0.82, -1.0], [0, 0.82, 1.2], 0.03, w, 5); return;
    }
    o.box(-0.45, 0.25, -0.8, 0.45, 0.55, 0.6, o.m.wood); K.wheel(o, -0.55, 0.38, 0.3, 0.38, 'x'); K.wheel(o, 0.7, 0.05, -0.5, 0.38, 'y');
    o.cyl([0, 0.7, -0.9], [0.1, 0.62, 1.2], 0.25, o.P.bronze, 10, 0.18);
  },
  bell(o) {
    const ground = /church/.test(o.name), m = o.P.bronze;
    if (!ground) { for (const x of [-0.6, 0.6]) o.box(x - 0.08, 0, -0.08, x + 0.08, 1.7, 0.08, o.m.wood); o.box(-0.7, 1.6, -0.1, 0.7, 1.75, 0.1, o.m.wood); }
    const y = ground ? 0 : 0.75;
    o.lathe([[0.55, 0], [0.5, 0.08], [0.36, 0.3], [0.3, 0.65], [0.22, 0.8], [0, 0.85]], m, 0, 0, y, 14);
    if (!ground) o.beam([0, 1.6, 0], [0, 1.6 - 0.05, 0], 0.05, 0.05, o.P.iron);
  },
  trough(o) { K.basin(Object.assign(o, { name: 'trough' + o.name })); },
  chains(o) {
    const m = o.m.metal, n = o.name;
    if (/winch|crank/.test(n)) {
      const w = o.m.wood;
      for (const x of [-0.6, 0.6]) o.box(x - 0.1, 0, -0.2, x + 0.1, 1.3, 0.2, w);
      o.cyl([-0.65, 1.0, 0], [0.65, 1.0, 0], 0.28, w, 10);
      if (/crank/.test(n)) K.wheel(o, 0.8, 1.0, 0, 0.5, 'x', w); else o.beam([0.7, 1.0, 0], [0.7, 1.45, 0.2], 0.05, 0.05, m);
      for (let i = 0; i < 8; i++) o.cyl([0, 0.95 - i * 0.12, 0.3], [0, 0.85 - i * 0.12, 0.3], 0.04, m, 5);
      return;
    }
    if (/trap/.test(n)) { o.box(-0.3, 0, -0.08, 0.3, 0.04, 0.08, m); for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const a = k / 6 * 3.14; o.beam([Math.cos(a) * 0.3, 0.04 + Math.sin(a) * 0.15, s * 0.04], [Math.cos(a + 0.52) * 0.3, 0.04 + Math.sin(a + 0.52) * 0.15, s * 0.04], 0.02, 0.02, m); } return; }
    if (/rope|hook|post/.test(n)) { o.cyl([0, 0, 0], [0, 1.0, 0], 0.07, o.m.wood, 6); o.lathe([[0.25, 0], [0.3, 0.05], [0.3, 0.18], [0.25, 0.22], [0.12, 0.22], [0.12, 0]], o.P.canvas, 0.35, 0, 0, 10); return; }
    if (/keyring/.test(n)) { o.cyl([0, 0.02, 0], [0, 0.03, 0], 0.12, m, 10); for (let i = 0; i < 4; i++) o.beam([Math.cos(i) * 0.1, 0.02, Math.sin(i) * 0.1], [Math.cos(i) * 0.3, 0.02, Math.sin(i) * 0.3], 0.03, 0.01, o.P.gold); return; }
    o.box(-0.08, 0, -0.08, 0.08, 0.5, 0.08, o.m.stone);
    for (let i = 0; i < 10; i++) { const x = 0.1 + i * 0.09; o.cyl([x, 0.03, Math.sin(i) * 0.08], [x + 0.08, 0.03, Math.sin(i + 1) * 0.08], 0.03, m, 5); }
    o.cyl([1.0, 0.05, 0], [1.0, 0.08, 0], 0.1, m, 8);
  },
  doorway(o) {
    const s = o.m.stone, n = o.name;
    if (/door_slab/.test(n)) { o.box(-0.55, 0, -0.06, 0.55, 2.0, 0.06, o.m.plank); for (const y of [0.4, 1.6]) o.box(-0.56, y, -0.08, 0.56, y + 0.08, 0.08, o.P.iron); return; }
    o.box(-1.1, 0, -0.3, -0.7, /ruined/.test(n) ? 2.6 : 2.6, 0.3, s); o.box(0.7, 0, -0.3, 1.1, /ruined/.test(n) ? 1.7 : 2.6, 0.3, s);
    if (/window/.test(n)) { o.box(-1.1, 0, -0.3, 1.1, 0.8, 0.3, s); for (const x of [-0.25, 0.25]) o.box(x - 0.05, 0.8, -0.05, x + 0.05, 2.3, 0.05, s); }
    if (!/ruined/.test(n)) for (const sx of [-1, 1]) o.beam([sx * 0.9, 2.6, 0], [0, 3.1, 0], 0.4, 0.5, s, [0, 0, 1]);
    for (let i = 0; i < 4; i++) o.blob([0.8 + o.r(), 0.12, (o.r() - 0.5) * 1.2], [0.25, 0.15, 0.2], s);
  },
  railing(o) {
    const m = /wood/.test(o.name) ? o.m.wood : o.m.metal, lying = /fallen/.test(o.name);
    const P = (x, y) => (lying ? [x, 0.05 + y * 0.12, y] : [x, y, 0]);
    o.beam(P(-1.2, 0.15), P(1.2, 0.15), 0.05, 0.05, m); o.beam(P(-1.2, 1.1), P(1.2, 1.1), 0.05, 0.05, m);
    for (let x = -1.1; x <= 1.1; x += 0.22) { o.beam(P(x, 0), P(x, 1.25), 0.03, 0.03, m); if (/spike/.test(o.name)) o.cone(...(lying ? [x, 1.25] : [x, 0]), 0.03, lying ? 0.2 : 1.25, 0.12, m, 4); }
  },
  wall(o) { // a low stone boundary, a split-rail fence
    if (/rail_fence/.test(o.name)) { for (const x of [-1.2, 0, 1.2]) o.box(x - 0.07, 0, -0.07, x + 0.07, 1.1, 0.07, o.m.wood); for (const y of [0.45, 0.9]) o.beam([-1.25, y, 0], [1.25, y, 0], 0.07, 0.1, o.m.bark); return; }
    for (let i = 0; i < 9; i++) o.blob([-1.2 + i * 0.3, 0.2 + (i % 2) * 0.25, 0], [0.22, 0.2, 0.25], o.m.stone, { detail: 0 });
  },
  pipe(o) {
    const n = o.name, m = o.m.metal;
    if (/manhole|drain/.test(n)) { o.cyl([0, 0, 0], [0, 0.06, 0], 0.55, /drain/.test(n) ? o.m.stone : m, 14); for (let i = -2; i <= 2; i++) o.box(i * 0.18 - 0.03, 0.06, -0.4, i * 0.18 + 0.03, 0.08, 0.4, m); return; }
    if (/spout/.test(n)) { o.box(-0.3, 0, -0.3, 0.3, 1.0, 0.3, o.m.stone); o.blob([0, 1.2, 0.1], [0.25, 0.22, 0.32], o.m.stone); o.cyl([0, 1.15, 0.35], [0, 1.1, 0.7], 0.08, m, 6); return; }
    o.cyl([-0.9, 0.45, 0], [0.9, 0.45, 0], 0.45, m, 12); for (let i = -3; i <= 3; i++) o.beam([0.92, 0.45 + i * 0.12, -0.42], [0.92, 0.45 + i * 0.12, 0.42], 0.03, 0.03, m);
  },
  rubble(o) {
    const n = o.name, s = /tile|brick/.test(n) ? o.P.terra : o.m.stone;
    const k = /collapsed|gothic|muck/.test(n) ? 10 : 7;
    for (let i = 0; i < k; i++) {
      const x = (o.r() - 0.5) * 1.6, z = (o.r() - 0.5) * 1.4, sz = 0.12 + o.r() * 0.22;
      if (/tile|brick|glass/.test(n)) o.box(x - sz, 0, z - sz * 0.5, x + sz, 0.06 + o.r() * 0.08, z + sz * 0.5, /glass/.test(n) ? o.P.shards[i % 4] : s);
      else o.blob([x, sz * 0.7, z], [sz * 1.3, sz, sz * 1.1], /muck/.test(n) ? o.P.moss : s, { detail: 0 });
    }
    if (/gothic|tracery/.test(n)) { o.cone(0.4, 0.2, 0.18, 0.1, 0.7, s, 4); o.beam([-0.6, 0.15, -0.3], [0.2, 0.15, 0.4], 0.12, 0.12, s); }
    if (/capital/.test(n)) o.lathe([[0.3, 0], [0.3, 0.25], [0.5, 0.45], [0.5, 0.55], [0, 0.55]], s, 0, 0, 0, 8);
    if (/buttress/.test(n)) { o.box(-0.4, 0, -0.8, 0.4, 1.4, 0.8, s); o.box(-0.32, 1.4, -0.6, 0.32, 2.2, 0.2, s); }
  },
  column(o) {
    const s = o.m.stone, n = o.name;
    if (/toppled|fallen/.test(n)) { o.cyl([-1.3, 0.3, 0], [1.1, 0.3, 0.2], 0.3, s, 10); o.box(1.1, 0, -0.3, 1.6, 0.65, 0.5, s); for (let i = 0; i < 3; i++) o.blob([-1.6 - o.r(), 0.12, o.r() - 0.5], [0.2, 0.14, 0.18], s); return; }
    if (/obelisk/.test(n)) { o.beam([0, 0, 0], [0.5, 1.0, 0.1], 0.5, 0.5, s); o.blob([0.8, 0.1, 0.4], [0.3, 0.2, 0.25], s); return; }
    o.box(-0.42, 0, -0.42, 0.42, 0.2, 0.42, s); o.cyl([0, 0.2, 0], [0, 0.8 + o.r() * 0.3, 0], 0.32, s, 10);
  },
  marker(o) { // standing stones, milestones, cairns, crosses, crests
    const n = o.name, s = o.m.stone;
    if (/cairn/.test(n)) { let y = 0; for (const r of [0.45, 0.36, 0.28, 0.2, 0.14]) { o.blob([o.r() * 0.06, y + r * 0.6, 0], [r, r * 0.6, r * 0.9], s, { detail: 0 }); y += r * 1.0; } return; }
    if (/celtic/.test(n)) { o.box(-0.3, 0, -0.18, 0.3, 0.3, 0.18, s); o.box(-0.1, 0.3, -0.08, 0.1, 1.6, 0.08, s); o.box(-0.45, 1.1, -0.08, 0.45, 1.28, 0.08, s); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28, b = (k + 1) / 12 * 6.28; o.beam([Math.cos(a) * 0.28, 1.19 + Math.sin(a) * 0.28, 0], [Math.cos(b) * 0.28, 1.19 + Math.sin(b) * 0.28, 0], 0.06, 0.12, s); } return; }
    if (/cross_grave|cross_marker/.test(n)) { o.beam([0, 0, 0], [0, 1.3, 0], 0.08, 0.06, o.m.wood); o.beam([-0.32, 1.0, 0], [0.32, 1.0, 0], 0.07, 0.06, o.m.wood); o.blob([0, 0.03, 0.5], [0.35, 0.08, 0.7], o.P.soil); return; }
    if (/crest|heraldic/.test(n)) { o.box(-0.4, 0, -0.3, 0.4, 0.8, 0.3, s); o.box(-0.35, 0.8, -0.06, 0.35, 1.5, 0.06, s); o.cone(0, 0, 0.35, 0.8, -0.35, s, 4); o.blob([0, 1.2, 0.08], [0.12, 0.12, 0.04], o.P.gold); return; }
    if (/seal/.test(n)) { o.cyl([0, 0.55, -0.1], [0, 0.6, 0.12], 0.55, s, 14); return; }
    if (/warning_slab/.test(n)) { o.beam([0, 0.08, -0.6], [0, 0.4, 0.6], 0.9, 0.15, s, [0, 1, 0]); o.blob([0, 0.45, 0.2], [0.1, 0.08, 0.1], o.P.bone); return; }
    if (/milestone|arrow/.test(n)) { o.beam([0, 0, 0], [0, 0.9, 0], 0.4, 0.3, s); o.blob([0, 0.9, 0], [0.2, 0.12, 0.15], s); if (/arrow/.test(n)) { o.beam([0, 1.1, 0], [0.7, 1.1, 0], 0.25, 0.05, o.m.plank); o.cyl([0, 0.9, 0], [0, 1.3, 0], 0.04, o.m.wood, 5); } return; }
    if (/dungeon_marker|rune/.test(n)) { o.beam([0, 0, 0], [0.05, 1.0, 0], 0.6, 0.2, s); o.box(-0.15, 0.4, 0.1, 0.15, 0.7, 0.12, o.P.crystal.glowing); return; }
    // a tall standing stone (druid stone, carved standing stone, forest obelisk)
    o.blob([0, 0.9, 0], [0.38, 0.95, 0.22], s, { detail: 1, jitter: 0.12, floor: 0 });
    if (/carved|druid/.test(n)) o.box(-0.12, 0.7, 0.2, 0.12, 1.2, 0.23, /druid/.test(n) ? o.P.crystal.glowing : s);
  },
  grave(o) { // fresh grave in its kerb, old mound, a dry wreath on a stake
    if (/wreath/.test(o.name)) { o.cyl([0, 0, 0], [0, 0.8, 0], 0.03, o.m.wood, 5); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; o.blob([Math.cos(a) * 0.25, 0.75 + Math.sin(a) * 0.25, 0.06], [0.08, 0.08, 0.06], o.P.straw, { detail: 0 }); } return; }
    if (/fresh/.test(o.name)) for (const [a, b, c, d] of [[-0.5, -1.0, 0.5, -0.9], [-0.5, 0.9, 0.5, 1.0], [-0.5, -1.0, -0.4, 1.0], [0.4, -1.0, 0.5, 1.0]]) o.box(a, 0, b, c, 0.2, d, o.P.slab);
    o.blob([0, 0, 0], [0.42, 0.22, 0.88], /old/.test(o.name) ? o.P.grass : o.P.soil, { jitter: 0.08, floor: 0 });
  },
  coffin(o) {
    const n = o.name, stone = /stone/.test(n), m = stone ? o.m.stone : o.m.plank;
    const pts = [[-0.22, -0.95], [0.22, -0.95], [0.34, 0.45], [0.26, 0.95], [-0.26, 0.95], [-0.34, 0.45]];
    const open = /open|broken/.test(n);
    for (let i = 0; i < 6; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % 6]; o.beam([x0, 0.25, z0], [x1, 0.25, z1], 0.05, 0.5, m, [0, 1, 0]); }
    o.box(-0.3, 0, -0.9, 0.3, 0.05, 0.9, m);
    if (!open) o.box(-0.33, 0.5, -0.92, 0.33, 0.58, 0.92, m);
    else o.beam([0.45, 0.02, -0.9], [0.75, 0.55, 0.8], 0.6, 0.06, m, [1, 0, 0]);
    if (/plank_heap|boards/.test(n)) return;
  },
  timber(o) { // firewood, timber and plank heaps, coffin boards, bridge planks
    const n = o.name, logs = /firewood|timber|rotten/.test(n);
    for (let i = 0; i < (logs ? 12 : 7); i++) {
      const layer = Math.floor(i / 4), x = (i % 4 - 1.5) * (logs ? 0.22 : 0.3), y = 0.1 + layer * 0.18;
      if (logs) o.cyl([x, y, -0.6], [x + (o.r() - 0.5) * 0.05, y, 0.6], 0.1, /rotten/.test(n) ? o.P.moss : o.m.bark, 7);
      else o.box(x - 0.13, y - 0.04, -1.0, x + 0.13, y + 0.02, 1.0, o.m.plank);
    }
  },
  stump(o) {
    const n = o.name, b = o.m.bark;
    if (/log/.test(n)) { o.cyl([-1.4, 0.32, 0], [1.4, 0.3, 0.2], 0.32, b, 10, 0.28); if (/hollow/.test(n)) o.cyl([1.42, 0.3, 0.2], [1.3, 0.3, 0.2], 0.2, o.P.basalt, 8); return; }
    o.cyl([0, 0, 0], [0, /sawn/.test(n) ? 0.45 : 0.7, 0], 0.42, b, 10, 0.36);
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; o.beam([Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3], [Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75], 0.14, 0.1, b); }
    if (/sawn|axe|anvil/.test(n)) o.cyl([0, /sawn/.test(n) ? 0.45 : 0.7, 0], [0, (/sawn/.test(n) ? 0.45 : 0.7) + 0.01, 0], 0.36, o.m.plank, 10);
    if (/axe/.test(n)) { o.beam([0, 0.72, 0], [0.2, 1.2, 0.3], 0.04, 0.04, o.m.wood); o.box(-0.08, 0.68, -0.1, 0.06, 0.8, 0.12, o.P.steel); }
    if (/anvil/.test(n)) o.prop('anvil', 0, 0.71, 0, 0, 0.45);
    if (/split|hollow/.test(n)) o.cyl([0, 0.71, 0], [0, 0.72, 0], 0.25, o.P.basalt, 8);
  },
  rock(o) {
    const n = o.name, s = o.m.stone;
    if (/shards|spires/.test(n)) { for (let i = 0; i < 6; i++) { const x = (o.r() - 0.5) * 1.2, z = (o.r() - 0.5) * 1.2, h = 0.8 + o.r() * 1.4; o.beam([x, 0, z], [x + (o.r() - 0.5) * 0.4, h, z + (o.r() - 0.5) * 0.4], 0.3, 0.3, /salt/.test(n) ? o.P.crystal.salt : o.P.basalt); } return; }
    const k = /cluster/.test(n) ? 5 : 1;
    for (let i = 0; i < k; i++) {
      const sz = k > 1 ? 0.25 + o.r() * 0.3 : 0.9, x = k > 1 ? (o.r() - 0.5) * 1.3 : 0, z = k > 1 ? (o.r() - 0.5) * 1.1 : 0;
      o.blob([x, sz * 0.55, z], [sz * 1.25, sz * (/wind/.test(n) ? 1.4 : 0.85), sz], s, { detail: 1, jitter: 0.22, floor: 0 });
    }
    if (/moss/.test(n)) o.blob([0, 0.7, 0], [0.8, 0.25, 0.7], o.P.moss, { jitter: 0.3 });
  },
  crystal(o) {
    const n = o.name, m = /amber/.test(n) ? o.P.crystal.amber : /turquoise/.test(n) ? o.P.crystal.turquoise : o.P.crystal.glowing;
    o.blob([0, 0.12, 0], [0.5, 0.15, 0.45], o.P.basalt);
    for (let i = 0; i < 6; i++) { const x = (o.r() - 0.5) * 0.6, z = (o.r() - 0.5) * 0.5, h = 0.3 + o.r() * 0.7; o.lathe([[0, 0], [0.09, 0.1], [0.08, h * 0.8], [0, h]], m, x, z, 0.05, 5); }
  },
  tent(o) {
    const n = o.name, c = o.P.canvas, w = o.m.wood;
    if (/poles/.test(n)) { for (let k = 0; k < 3; k++) { const a = k * 2.09; o.beam([Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [0, 2.2, 0], 0.06, 0.06, w); } return; }
    if (/awning/.test(n)) { for (const [x, z, h] of [[-1, 0.8, 1.8], [1, 0.8, 1.8], [-1, -0.8, 2.2], [1, -0.8, 2.2]]) o.cyl([x, 0, z], [x, h, z], 0.04, w, 5); o.quad(c, [-1.1, 1.8, 0.9], [1.1, 1.8, 0.9], [1.1, 2.2, -0.9], [-1.1, 2.2, -0.9]); o.quad(c, [1.1, 1.8, 0.9], [-1.1, 1.8, 0.9], [-1.1, 2.2, -0.9], [1.1, 2.2, -0.9]); return; }
    for (const s of [-1, 1]) { o.quad(c, [s * 1.0, 0, 1.2], [0, 1.6, 1.2], [0, 1.6, -1.2], [s * 1.0, 0, -1.2]); o.quad(c, [0, 1.6, 1.2], [s * 1.0, 0, 1.2], [s * 1.0, 0, -1.2], [0, 1.6, -1.2]); }
    o.mesh(c, [[-1, 0, -1.2], [1, 0, -1.2], [0, 1.6, -1.2]], [[0, 0], [2, 0], [1, 1.6]]);
    o.cyl([0, 0, 1.25], [0, 1.75, 1.25], 0.03, w, 5);
  },
  misc(o) { // the small things: hourglass and book, tools and ledger, boots and kit, bellows, mill, vanes, perches, signs, saddles, racks
    const n = o.name, w = o.m.wood;
    if (/hourglass/.test(n)) { o.box(-0.25, 0, -0.18, 0.15, 0.08, 0.18, o.P.cloth('book')); o.lathe([[0, 0], [0.07, 0.01], [0.01, 0.11], [0.07, 0.21], [0, 0.22]], o.P.glass, 0.2, 0, 0.0, 6); return; }
    if (/tools|ledger/.test(n)) { o.box(-0.2, 0, -0.15, 0.2, 0.06, 0.15, o.P.cloth('ledger')); o.beam([0.25, 0.03, -0.2], [0.5, 0.03, 0.2], 0.05, 0.05, o.P.rust); o.box(0.3, 0, -0.35, 0.55, 0.1, -0.2, o.P.rust); return; }
    if (/boots|kit/.test(n)) { for (const s of [-1, 1]) { o.box(s * 0.12 - 0.06, 0, -0.1, s * 0.12 + 0.06, 0.3, 0.05, o.P.cloth('boot')); o.box(s * 0.12 - 0.06, 0, 0.05, s * 0.12 + 0.06, 0.1, 0.22, o.P.cloth('boot')); } o.blob([0.5, 0.18, 0], [0.24, 0.18, 0.18], o.P.canvas); return; }
    if (/bellows/.test(n)) { o.beam([0, 0.5, -0.5], [0, 0.6, 0.4], 0.6, 0.08, w); o.beam([0, 0.35, -0.5], [0, 0.3, 0.4], 0.6, 0.08, w); o.box(-0.3, 0.3, -0.5, 0.3, 0.55, 0.2, o.P.cloth('leather')); o.cyl([0, 0.45, 0.4], [0, 0.45, 0.8], 0.05, o.P.iron, 6); o.box(-0.35, 0, -0.55, 0.35, 0.3, 0.45, w); return; }
    if (/handmill/.test(n)) { o.box(-0.4, 0, -0.4, 0.4, 0.6, 0.4, w); o.cyl([0, 0.6, 0], [0, 0.75, 0], 0.32, o.m.stone, 10); o.cyl([0, 0.75, 0], [0, 0.9, 0], 0.3, o.m.stone, 10); o.beam([0.2, 0.9, 0], [0.2, 1.25, 0], 0.04, 0.04, w); return; }
    if (/vane/.test(n)) { o.cyl([0, 0, 0], [0, 2.2, 0], 0.04, o.P.iron, 5); o.beam([-0.5, 2.1, 0], [0.5, 2.1, 0], 0.03, 0.03, o.P.iron); o.beam([0, 2.1, -0.5], [0, 2.1, 0.5], 0.03, 0.03, o.P.iron); o.box(0.3, 2.15, -0.02, 0.6, 2.4, 0.02, o.P.bronze); o.cone(-0.55, 0, 0.08, 2.1, 0.1, o.P.bronze, 4); return; }
    if (/perch|raven/.test(n)) { o.cyl([0, 0, 0], [0, 1.0, 0], 0.05, w, 5); o.beam([-0.3, 0.95, 0], [0.3, 0.95, 0], 0.04, 0.04, w); o.blob([0.12, 1.08, 0], [0.07, 0.08, 0.12], o.P.basalt); return; }
    if (/sign/.test(n)) { o.cyl([0, 0, 0], [0, 1.6, 0], 0.06, w, 6); o.box(0, 1.2, -0.04, 0.8, 1.45, 0.04, o.m.plank); o.cone(0.8, 0, 0.18, 1.2, 0.25, o.m.plank, 3); o.box(-0.7, 0.9, -0.04, 0, 1.1, 0.04, o.m.plank); return; }
    if (/saddle/.test(n)) { o.box(-0.4, 0, -0.3, 0.4, 0.6, 0.3, w); o.blob([0, 0.7, 0], [0.45, 0.15, 0.32], o.P.cloth('saddle')); for (const s of [-1, 1]) o.blob([s * 0.45, 0.5, 0], [0.12, 0.22, 0.22], o.P.canvas); return; }
    if (/waterskin|rack|tool_rack/.test(n)) { for (const x of [-0.7, 0.7]) o.box(x - 0.05, 0, -0.05, x + 0.05, 1.5, 0.05, w); o.box(-0.75, 1.35, -0.05, 0.75, 1.45, 0.05, w); for (let i = 0; i < 3; i++) { const x = -0.4 + i * 0.4; if (/tool/.test(n)) o.beam([x, 1.35, 0.06], [x + 0.1, 0.1, 0.06], 0.04, 0.03, i % 2 ? o.P.iron : w); else o.blob([x, 1.0, 0.1], [0.14, 0.25, 0.1], o.P.cloth('skin')); } return; }
    if (/crown/.test(n)) { o.cyl([0, 0, 0], [0, 0.1, 0], 0.18, o.P.gold, 10); for (let k = 0; k < 6; k++) o.cone(Math.cos(k) * 0.17, Math.sin(k) * 0.17, 0.04, 0.1, 0.1, o.P.gold, 4); return; }
    o.box(-0.3, 0, -0.2, 0.3, 0.3, 0.2, o.m.plank);
  },
  chest(o) { // stone coffers, strongboxes, reliquaries built here; plain chests are the prop
    const n = o.name, m = /stone|coffer/.test(n) ? o.m.stone : /strongbox|rusted/.test(n) ? o.m.metal : o.m.plank;
    o.box(-0.45, 0, -0.3, 0.45, 0.45, 0.3, m); o.box(-0.47, 0.45, -0.32, 0.47, 0.6, 0.32, m);
    for (const x of [-0.3, 0.3]) o.box(x - 0.04, -0.01, -0.33, x + 0.04, 0.61, 0.33, o.m.trim);
    o.box(-0.06, 0.32, 0.3, 0.06, 0.46, 0.34, o.m.trim);
    if (/jewel|reliquary/.test(n)) for (let i = 0; i < 3; i++) o.blob([-0.25 + i * 0.25, 0.62, 0], [0.05, 0.05, 0.05], o.P.shards[i]);
  },
  banner(o) {
    o.box(-0.3, 0, -0.3, 0.3, 0.12, 0.3, o.m.stone); o.cyl([0, 0.12, 0], [0, 2.4, 0], 0.04, o.m.wood, 6);
    o.beam([-0.45, 2.25, 0], [0.45, 2.25, 0], 0.04, 0.04, o.m.wood); o.cone(0, 0, 0.06, 2.4, 0.14, o.P.gold, 6);
    o.box(-0.42, 1.0, -0.01, 0.42, 2.22, 0.01, o.P.cloth('banner crimson'));
  },
  tomb(o) { // a knight's chest tomb or effigy sarcophagus: a stone chest with a figure lying on it
    const s = o.m.stone;
    o.box(-0.5, 0, -1.05, 0.5, 0.75, 1.05, s); o.box(-0.55, 0.75, -1.1, 0.55, 0.85, 1.1, s);
    o.blob([0, 0.97, 0.75], [0.12, 0.12, 0.13], s); o.blob([0, 0.97, -0.05], [0.24, 0.13, 0.72], s);
    o.beam([0, 1.1, 0.55], [0, 1.1, -0.6], 0.05, 0.02, o.P.steel);
  },
};

// sprite name -> model kind (first match wins), or a prop from templates/models/props
const KINDS = [
  // names that would otherwise be caught by a broader rule further down
  [/offering_altar/, K.altar],
  [/warning_slab/, K.marker],
  [/spout/, K.pipe],
  [/boots|hourglass|tools_and|ledger|bellows|handmill|wind_vane|perch|trail_sign|saddle|waterskin|tool_rack|crown/, K.misc],
  [/banner_stand/, K.banner],
  [/cart_wheel|broken_wheel|cart_debris/, K.wheelAlone],
  [/forest_obelisk|druid_stone|standing_stone|dungeon_marker/, K.marker],
  [/column|obelisk_fragment/, K.column],
  [/boulder|fieldstone|basalt_shards|salt_spires/, K.rock],
  // the rest
  [/armory_barrel|closed_barrel|water_barrel/, { prop: 'barrel', fit: 1.0 }],
  [/wooden_crate|crate_stack|supply_crate|rotwood_crate|reed_crate|cloth_crate/, { prop: 'crate', fit: 0.9, stack: /stack/ }],
  [/weapon_chest|treasury_chest|wooden_chest|caravan_chest/, { prop: 'treasure_chest', fit: 0.75 }],
  [/coffer|strongbox|reliquary/, K.chest],
  [/royal_sarcophagus|sealed_sarcophagus|open_sarcophagus|broken_sarcophagus/, { prop: 'sarcophagus', fit: 1.0 }],
  [/knight_chest_tomb|effigy_sarcophagus/, K.tomb],
  [/coffin_plank|coffin_boards|bridge_planks|firewood|timber_heap/, K.timber],
  [/coffin/, K.coffin],
  [/rounded_headstone|broken_headstone|gothic_marker/, { prop: 'gravestone_round', fit: 1.0 }],
  [/squat_cross/, { prop: 'gravestone_cross', fit: 1.1 }],
  [/funerary_obelisk|sewer_obelisk/, { prop: 'gravestone_obelisk', fit: 1.6 }],
  [/candelabrum/, { prop: 'candelabrum', fit: 1.8 }],
  [/oak_pew/, { prop: 'pew', fit: 1.0 }],
  [/cathedral_altar/, { prop: 'altar', fit: 1.2 }],
  [/village_well|stone_well|pulley_well/, { prop: 'well', fit: 2.2 }],
  [/stump|fallen_log|hollow_log/, K.stump],
  // the pottery modelled for the object texture sheets (tools/models/texprops.py)
  // (plain storage jars and crocks: under the ground, blackened by the crypts' smoke)
  [/urn_cluster/, { pots: ['jar_storage', 'crock_lidded'], n: 3 }],
  [/amphora/, { pots: ['jar_storage'], n: 1 }],
  [/water_jar/, { pots: ['jar_storage'], n: 1 }],
  [/amphora|water_jar/, K.amphora],
  [/_urn|urn_|pottery/, K.urn],
  [/statue_head/, K.head],
  [/statue|angel|mourner|warden|idol|gargoyle|lion|memorial|suit_of_armor/, K.statue],
  [/skull|bone|skeleton|remains|ribcage/, K.bones],
  [/corpse|effigy/, K.corpse],
  [/spider_eggs/, K.eggs],
  [/chandelier/, K.candleTree],
  [/candle/, K.candles],
  [/brazier|green_fire/, K.brazier],
  [/torch/, K.torchStand],
  [/lantern/, K.lantern],
  [/campfire|firepit/, K.campfire],
  [/censer/, K.censer],
  [/forge/, K.forge],
  [/_table|workbench/, K.table],
  [/bench/, K.bench],
  [/lectern/, K.lectern],
  [/altar/, K.altar],
  [/font|basin|bowl|trough/, K.basin],
  [/throne/, K.throne],
  [/confessional/, K.confessional],
  [/pipe_organ/, K.organ],
  [/shrine/, K.shrine],
  [/wagon|handcart/, K.cart],
  [/sacks/, K.sacks],
  [/hay_bale/, K.hay],
  [/carpet|bedroll|shroud|tapestry/, K.rolls],
  [/basket|potion|scroll_rack|bucket/, K.basket],
  [/shield_rack/, K.shieldRack],
  [/swords_trophy/, K.trophy],
  [/spear|lance|weapon_cache/, K.spears],
  [/shield/, K.shield],
  [/cannon|ballista/, K.cannon],
  [/bell/, K.bell],
  [/chain|shackle|keyring|winch|crank|trap|rope|hook/, K.chains],
  [/doorway|door_slab|window_ruin/, K.doorway],
  [/railing/, K.railing],
  [/boundary|rail_fence/, K.wall],
  [/manhole|pipe|drain/, K.pipe],
  [/rubble|capital|buttress|tracery|glass_shards|tiles_and_bricks/, K.rubble],
  [/cairn|cross|crest|seal|milestone/, K.marker],
  [/grave|mound|wreath/, K.grave],
  [/crystal|_ore$/, K.crystal],
  [/tent|awning/, K.tent],
];

export class Scatter3D {
  constructor(ctx) {
    this.ctx = ctx;
    this.P = palette(ctx.lib);
    this.unmatched = new Set();
    this.count = 0;
  }

  /** Build the model for sprite `id` at (x, y, z); `scale` as the billboard's was. */
  place(id, x, y, z, scale = 1, rot = null) {
    const name = id;
    const hit = KINDS.find(([re]) => re.test(name));
    const kind = hit ? hit[1] : K.misc;
    if (!hit) this.unmatched.add(id);
    let seed = hash(id + Math.round(x * 10) + ',' + Math.round(z * 10));
    const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const turn = rot ?? r() * Math.PI * 2;
    const s = (0.92 + r() * 0.16) * Math.min(1.4, Math.max(0.6, scale));
    const { ctx } = this;
    this.count++;
    if (kind.pots) {   // one, or a huddle of them, each its own
      for (let i = 0; i < kind.n; i++) {
        const a = turn + i * 2.3, d = kind.n > 1 ? 0.32 + r() * 0.2 : 0;
        const pot = kind.pots[Math.floor(r() * kind.pots.length)] + (y < -3 ? '_sooted' : '');
        ctx.props.add(pot, x + Math.cos(a) * d, y, z + Math.sin(a) * d, r() * 6.28, (0.85 + r() * 0.25) * s);
      }
      return;
    }
    if (kind.prop) {
      if (kind.stack) {
        const [a, b, top] = [[-0.48, 0, 0], [0.48, 0, 0.05], [0, 0.88, 0]].map(([dx, dy]) => ctx.props.add(kind.prop, x + dx * Math.cos(turn), y + dy, z - dx * Math.sin(turn), turn, 1, kind.fit * s));
        a.above = b.above = top;   // (break either under it and the top one comes down too)
      } else ctx.props.add(kind.prop, x, y, z, turn, 1, kind.fit * s);
      return;
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(s, s, s));
    ctx.b.place(x, y, z, turn, s, (B) => {
      let bseed = seed;
      const o = {
        name, P: this.P, m: matsFor(name, this.P), r,
        box: (x0, y0, z0, x1, y1, z1, mt) => B.box([x0, y0, z0], [x1, y1, z1], mt, { solid: false, shade: o.m.shade }),
        cyl: (a, b, rr, mt, n = 8, r1 = rr) => B.cylinder(a, b, rr, n, mt, { r1, shade: o.m.shade }),
        beam: (a, b, w, h, mt, up) => B.beam(a, b, w, h, mt, { up: up || [0, 1, 0], shade: o.m.shade }),
        blob: (c, rr, mt, opt = {}) => B.blob(c, rr, mt, { seed: bseed++, shade: o.m.shade, ...opt }),
        lathe: (prof, mt, lx = 0, lz = 0, ly = 0, n = 10) => B.lathe(lx, lz, prof, n, mt, { y: ly, shade: o.m.shade }),
        cone: (lx, lz, rr, ly, h, mt, n = 8) => B.cone(lx, lz, rr, ly, h, n, mt, o.m.shade),
        quad: (mt, a, b, c, d) => B.quad(mt, a, b, c, d, [a, b, c, d].map((p) => [p[0] + p[2], p[1]]), o.m.shade),
        mesh: (mt, pos, uv) => B.mesh(mt, pos, uv, [[0, 1, 2]], o.m.shade),
        flame: (lx, ly, lz, size) => {
          const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
          ctx.flames.push([p.x, p.y, p.z, size * s, size <= 0 ? 'glow' : null]);
        },
        prop: (pid, lx, ly, lz, lrot, fit) => {
          const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
          ctx.props.add(pid, p.x, p.y, p.z, turn + lrot, 1, fit * s);
        },
      };
      kind(o);
    });
  }
}
