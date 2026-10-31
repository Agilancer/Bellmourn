// Buildings from the Medieval Village kit, reworked: a footprint of 2 m modules, one or two
// storeys of kit walls (plaster over a brick footing, or uneven brick; doors, windows with frames
// and shutters, timber-framed upper floors), corner posts, a plinth, plank floors, an inside stair,
// tiled gable roofs that sag (some fallen in), gable ends, chimneys, porches, dormers and balconies.
// Every piece is a kit instance; the house adds its own colliders (doorways stay open), its
// interior (for the place names and for whatever is put to live inside) and its furniture.
//
// House frame: centred on (x, z), the ridge along local z, the front door on local +z (a gable
// end) or +x (a long side). rot turns it by quarter turns.
import * as THREE from 'three';

export const H = 3.12;   // a storey: the kit walls' height
const ROOF = { 2: [4, 6, 8], 3: [6, 8, 10, 12, 14], 4: [8, 10, 12, 14] }; // round-tile roofs per span (modules) -> lengths (m)

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** A frame: local (x, y, z) and a local rotation to world. */
function frame(h) {
  const c = Math.cos(h.rot * Math.PI / 2), s = Math.sin(h.rot * Math.PI / 2);
  return {
    p: (x, y, z) => [h.x + x * c + z * s, h.y + y, h.z - x * s + z * c],
    r: (a) => a + h.rot * Math.PI / 2,
    box(x0, y0, z0, x1, y1, z1) { // a local box as a world AABB
      const a = this.p(x0, y0, z0), b = this.p(x1, y1, z1);
      return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
    },
  };
}

/**
 * Build a house. h: { x, z, y, rot, w (modules across, 2-4), d (modules long, 2-7), storeys,
 *   style 'plaster' | 'brick', name, title, door 'z' | 'x', roof variant, plaster variant,
 *   ruin (walls broken, roof holed), furnish [kind], chimney, porch, dormers, balcony, open (a
 *   front of arches: barns and stables) }.
 * Returns the interior { x0, z0, x1, z1, y0, y1, floor, name }.
 */
export function house(ctx, h) {
  const { kit, physics } = ctx;
  const R = rng(Math.round(h.x * 13 + h.z * 7));
  const F = frame(h);
  const W = h.w * 2, D = h.d * 2, S = h.storeys || 1;
  const brick = h.style === 'brick';
  const pv = h.plaster || '';
  const put = (id, x, y, z, a = 0, s = 1, o = {}) => kit.place('village/' + id, ...F.p(x, y, z), F.r(a), s, { solid: false, ...o });
  const ruin = !!h.ruin;
  const roofV = h.roofVariant || '';
  // which modules hold what: per side, an array of 'wall' | 'door' | 'window' | 'arch'
  const sides = [
    { key: 'z+', n: h.w, at: (i) => [-W / 2 + 1 + i * 2, D / 2], a: 0 },
    { key: 'z-', n: h.w, at: (i) => [W / 2 - 1 - i * 2, -D / 2], a: Math.PI },
    { key: 'x+', n: h.d, at: (i) => [W / 2, D / 2 - 1 - i * 2], a: Math.PI / 2 },
    { key: 'x-', n: h.d, at: (i) => [-W / 2, -D / 2 + 1 + i * 2], a: -Math.PI / 2 },
  ];
  const doorSide = h.door === 'x' ? 'x+' : 'z+';
  const doorAt = Math.floor((doorSide === 'x+' ? h.d : h.w) / 2);
  const windowKinds = brick ? ['Wide_Flat', 'Wide_Round', 'Thin_Round'] : ['Wide_Flat', 'Wide_Round', 'Thin_Round', 'Wide_Flat2'];
  const wk = windowKinds[Math.floor(R() * windowKinds.length)];
  const doorKind = R() < 0.5 ? 'Flat' : 'Round';
  const shutOpen = R() < 0.5;
  // ---------------------------------------------------------------- walls
  for (let st = 0; st < S; st++) {
    const y = st * H;
    const upperStyle = st > 0 && !brick && h.timber !== false;
    for (const sd of sides) for (let i = 0; i < sd.n; i++) {
      const [lx, lz] = sd.at(i);
      let what = 'wall';
      if (st === 0 && sd.key === doorSide && i === doorAt) what = 'door';
      else if (h.open && st === 0 && sd.key === (doorSide === 'z+' ? 'x+' : 'z+')) what = 'arch';
      else if ((i + st) % 2 === 1 || (sd.n === 2 && i === 1 && st === 1)) what = 'window';
      const wallKind = brick ? 'UnevenBrick' : 'Plaster';
      let id;
      if (what === 'door') id = `Wall_${wallKind}_Door_${doorKind}`;
      else if (what === 'window') id = `Wall_${wallKind}_Window_${brick && wk === 'Wide_Flat2' ? 'Wide_Flat' : wk}`;
      else if (what === 'arch') id = 'Wall_Arch';
      else if (upperStyle && R() < 0.5) id = 'Wall_Plaster_WoodGrid';
      else if (!brick && st === 0) id = i === 0 ? 'Wall_Plaster_Straight_L' : i === sd.n - 1 ? 'Wall_Plaster_Straight_R' : 'Wall_Plaster_Straight_Base';
      else id = `Wall_${wallKind}_Straight`;
      // ruins: some walls broken, some gone, nothing left of an upper floor but stumps
      let variant = '';
      if (ruin && what !== 'door') {
        if (st > 0 && R() < 0.6) continue;
        if (R() < 0.45 && kit.has(`village/${id}~ruin`)) id = `${id}~ruin`;
      }
      put(id, lx, y, lz, sd.a, 1, { variant: pv || variant });
      // colliders: the wall's slab, open at doors and arches
      const seg = (u0, u1, y0, y1) => {
        const a = rotLocal(lx, lz, sd.a, u0, -0.33), b = rotLocal(lx, lz, sd.a, u1, 0.1);
        const [mn, mx] = F.box(Math.min(a[0], b[0]), y + y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y + y1, Math.max(a[1], b[1]));
        physics.add(mn, mx, 'wall');
      };
      const top = id.endsWith('~ruin') ? 1.4 : H;
      if (what === 'door') { seg(-1, -0.62, 0, top); seg(0.62, 1, 0, top); seg(-0.62, 0.62, 2.45, top); }
      else if (what === 'arch') { seg(-1, -0.85, 0, top); seg(0.85, 1, 0, top); seg(-0.85, 0.85, 2.6, top); }
      else seg(-1, 1, 0, top);
      if (what === 'window' && !id.endsWith('~ruin')) {
        const win = { Wide_Flat: 'Window_Wide_Flat1', Wide_Round: 'Window_Wide_Round1', Thin_Round: 'Window_Thin_Round1', Wide_Flat2: 'Window_Thin_Flat1' }[wk] || 'Window_Wide_Flat1';
        put(win, lx, y, lz, sd.a);
        const sh = { Wide_Flat: 'Wide_Flat', Wide_Round: 'Wide_Round', Thin_Round: 'Thin_Round', Wide_Flat2: 'Thin_Flat' }[wk] || 'Wide_Flat';
        if (R() < 0.8) put(`WindowShutters_${sh}_${(shutOpen ? R() < 0.75 : R() < 0.25) ? 'Open' : 'Closed'}`, lx, y, lz, sd.a);
      }
      if (what === 'door') {
        put(`DoorFrame_${doorKind}_${brick ? 'Brick' : 'WoodDark'}`, lx, y, lz, sd.a);
        if (ctx.doors && !ruin) {
          const hinge = F.p(...rotLocal3(lx, lz, sd.a, -0.56, 0.0, 0.0));
          ctx.doors.add({ hinge: [hinge[0], h.y + 0.02, hinge[2]], along: F.r(sd.a), width: 1.12, height: 2.2, opens: -1,
            name: (h.title ? h.title + ' door' : 'door'), model: `village/Door_${[1, 2, 4, 8][Math.floor(R() * 4)]}_${doorKind}` });
        }
      }
      // the brick footing and its plinth along the outside of the ground floor
      if (st === 0 && what !== 'door' && what !== 'arch') {
        put('Wall_BottomCover', lx, 0, lz, sd.a);
        put(R() < 0.5 ? 'Prop_ExteriorBorder_Straight1' : 'Prop_ExteriorBorder_Straight2', lx, 0, lz, sd.a);
      }
    }
    // corners
    const cornerId = brick ? (R() < 0.5 ? 'Corner_Exterior_Brick' : 'Corner_ExteriorWide_Brick') : (st === 0 ? 'Corner_Exterior_Brick' : R() < 0.5 ? 'Corner_Exterior_Wood' : 'Corner_ExteriorWide_Wood');
    [[W / 2, D / 2, 0], [-W / 2, D / 2, -Math.PI / 2], [-W / 2, -D / 2, Math.PI], [W / 2, -D / 2, Math.PI / 2]].forEach(([cx, cz, a], k) => {
      if (ruin && st > 0) return;
      const id = ruin && R() < 0.5 && kit.has(`village/${cornerId}~ruin`) ? `${cornerId}~ruin` : cornerId;
      put(id, cx, y, cz, a + Math.PI / 2 * 0);
      put(k % 2 ? 'Corner_Interior_Big' : 'Corner_Interior_Small', cx - Math.sign(cx) * 0.33, y, cz - Math.sign(cz) * 0.33, a + Math.PI);
      if (st === 0) put('Prop_ExteriorBorder_Corner', cx, 0, cz, a);
    });
  }
  // ---------------------------------------------------------------- floors and the stair
  // the stair runs up the long side away from a side door (one beside the door would come down
  // right into the doorway); sx is the side it's on
  const sx = doorSide === 'x+' ? -1 : 1;
  const stair = S > 1 && h.d >= 3 ? { x: sx * (W / 2 - 1.25), z0: D / 2 - 0.9, len: 4.6 } : null;
  const floorId = (st) => (st === 0 ? (h.floor || (brick ? 'Floor_UnevenBrick' : 'Floor_WoodDark')) : (R() < 0.5 ? 'Floor_WoodDark' : 'Floor_WoodLight'));
  physics.add(...F.box(-W / 2, -0.25, -D / 2, W / 2, 0, D / 2), 'floor'); // the ground floor (a house on stilts has no ground under it)
  for (let st = 0; st < S; st++) {
    for (let i = 0; i < h.w; i++) for (let k = 0; k < h.d; k++) {
      const fx = -W / 2 + 1 + i * 2, fz = -D / 2 + 1 + k * 2;
      if (st > 0 && stair && sx * fx > W / 2 - 2.1 && fz > stair.z0 - stair.len - 0.9) continue; // the stairwell
      if (st > 0 && ruin && R() < 0.4) continue;
      put(floorId(st), fx, st * H + 0.012, fz, 0);
    }
    if (st > 0) { // the upper floor's collider (round the stairwell) and the joists' trims
      const y = st * H;
      const cut = stair ? W / 2 - 2.1 : W / 2;
      let b = sx > 0 ? F.box(-W / 2, y - 0.25, -D / 2, cut, y, D / 2) : F.box(-cut, y - 0.25, -D / 2, W / 2, y, D / 2); physics.add(...b, 'floor');
      if (stair) { b = sx > 0 ? F.box(cut, y - 0.25, -D / 2, W / 2, y, stair.z0 - stair.len - 0.9) : F.box(-W / 2, y - 0.25, -D / 2, -cut, y, stair.z0 - stair.len - 0.9); physics.add(...b, 'floor'); }
      if (stair) {
        put('HoleCover_Straight', sx * (W / 2 - 1), y, stair.z0 - stair.len + 0.3, 0);
        put('HoleCover_90Stairs', sx * (W / 2 - 2.1), y, stair.z0 - stair.len / 2, sx > 0 ? Math.PI : 0);
        put('HoleCover_StraightHalf', sx * (W / 2 - 0.5), y, stair.z0 + 0.4, Math.PI);
      }
    }
  }
  if (stair) {
    const sid = ['Stair_Interior_Simple', 'Stair_Interior_Rails', 'Stair_Interior_Solid'][Math.floor(R() * 3)];
    put(sid, stair.x, 0, stair.z0, 0);
    // its treads as steps for the physics: 12 risers of 0.26 m up along -z
    for (let n = 0; n < 12; n++) {
      const z1 = stair.z0 - n * (stair.len / 12), z0 = z1 - stair.len / 12;
      const b = F.box(stair.x - 0.8, 0, z0, stair.x + 0.8, (n + 1) * (H / 12), z1);
      physics.add(...b, 'stair');
    }
  }
  // ---------------------------------------------------------------- roof
  const top = S * H;
  const spans = ROOF[h.w] || [];
  const len = spans.reduce((a, b) => (Math.abs(b - D) < Math.abs(a - D) ? b : a), spans[0]);
  if (h.w >= 2 && h.w <= 4 && len && !(ruin && R() < 0.35)) {
    const id = `Roof_RoundTiles_${h.w * 2}x${len}`;
    const holed = (ruin || h.holed) && kit.has(`village/${id}~holed`);
    const zoff = id === 'village/Roof_RoundTiles_6x4' ? -2.4 : 0;
    put(holed ? `${id}~holed` : id, 0, top, zoff, 0, [1, 1, D / len], { variant: roofV });
    for (const [z, a] of [[D / 2, 0], [-D / 2, Math.PI]]) put(`Roof_Front_Brick${h.w * 2}`, 0, top, z, a, 1, { variant: pv });
    if (h.chimney !== false) {
      const cz = (R() < 0.5 ? 1 : -1) * (D / 2 - 1.2), cx = (R() - 0.5) * (W - 3);
      put(R() < 0.5 ? 'Prop_Chimney' : 'Prop_Chimney2', cx, top - 0.4, cz, 0);
      ctx.chimneys?.push(F.p(cx, top + 3.0, cz));
    }
    if (h.dormers) for (let k = 0; k < h.dormers; k++) {
      const z = -D / 2 + (k + 1) * D / (h.dormers + 1);
      put('Roof_Dormer_RoundTile', W / 2 - 1.9, top + 0.1, z, 0, 1, { variant: roofV });
      put(R() < 0.5 ? 'Window_Roof_Thin' : 'Window_Roof_Wide', W / 2 - 1.9 + 1.6, top + 0.1, z, Math.PI / 2);
    }
  } else if (h.w >= 1) { // small sheds: the wooden roof modules
    for (let k = 0; k < h.d; k++) {
      const z = -D / 2 + 1 + k * 2;
      put(k === 0 ? 'Roof_Wooden_2x1_L' : k === h.d - 1 ? 'Roof_Wooden_2x1_R' : 'Roof_Wooden_2x1', -W / 4, top, z, -Math.PI / 2, [1, 1, W / 3]);
      put('Roof_Wooden_2x1_Center', W / 4, top, z, Math.PI / 2, [1, 1, W / 3]);
      put('Roof_Wooden_2x1_Middle', 0, top + 0.2, z, 0);
    }
  }
  // ---------------------------------------------------------------- porch, balcony, upper jetty
  const front = doorSide === 'z+' ? [0, D / 2, 0] : [W / 2, 0, Math.PI / 2];
  if (h.porch && !ruin) {
    const [px, pz, a] = front;
    const o = rotLocal(px, pz, a, 0, 1.2);
    put(R() < 0.5 ? 'Roof_RoundTile_2x1' : 'Roof_2x4_RoundTile', o[0], 2.5, o[1], a, 1, { variant: roofV });
    put('Roof_FrontSupports', ...rotPair(px, pz, a, 0, 0.3), 2.3, a);
    for (const u of [-1.3, 1.3]) { const q = rotLocal(px, pz, a, u, 2.1); put('Roof_Support2', q[0], 2.4, q[1], a); }
  }
  if (h.balcony && S > 1 && !ruin) {
    const sd = sides[doorSide === 'z+' ? 2 : 0];
    for (let i = 0; i < Math.min(2, sd.n); i++) { const [lx, lz] = sd.at(i); put(h.balcony === 'cross' ? 'Balcony_Cross_Straight' : 'Balcony_Simple_Straight', lx, H, lz, sd.a); }
  }
  if (h.jetty && S > 1 && !ruin) { // the upper floor's overhang, carried on the kit's brackets
    const sd = sides[1];
    for (let i = 0; i < sd.n; i++) {
      const [lx, lz] = sd.at(i);
      put(brick ? 'Overhang_UnevenBrick_Long' : 'Overhang_Plaster_Long', lx, H - 3.0, lz, sd.a);
      put(brick ? 'Overhang_Roof_UnevenBricks' : 'Overhang_Roof_Plaster', lx, H - 0.2, lz, sd.a);
    }
  }
  // ---------------------------------------------------------------- vines up the walls
  if (h.vines) for (let k = 0; k < h.vines; k++) {
    const sd = sides[Math.floor(R() * 4)], [lx, lz] = sd.at(Math.floor(R() * sd.n));
    put(['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine4', 'Prop_Vine5', 'Prop_Vine6', 'Prop_Vine9'][Math.floor(R() * 6)], lx, R() * 1.2, lz, sd.a, 1, { variant: h.vineVariant || 'dead' });
  }
  // ---------------------------------------------------------------- the interior
  const [mn, mx] = F.box(-W / 2 + 0.3, h.y - 0.5, -D / 2 + 0.3, W / 2 - 0.3, h.y + S * H + 2, D / 2 - 0.3);
  const zone = { x0: mn[0], z0: mn[2], x1: mx[0], z1: mx[2], y0: h.y - 1, y1: h.y + S * H + 3, floor: h.y, storeys: S, name: h.title || h.name || 'A house', kind: h.name };
  if (h.furnish) furnish(ctx, h, F, W, D, S, stair, doorSide, R);
  return zone;
}

/** A point on a wall module: (u along it, v out from it), wall at (lx, lz) turned by a. */
function rotLocal(lx, lz, a, u, v) {
  const c = Math.cos(a), s = Math.sin(a);
  return [lx + u * c + v * s, lz - u * s + v * c];
}
function rotLocal3(lx, lz, a, u, y, v) { const p = rotLocal(lx, lz, a, u, v); return [p[0], y, p[1]]; }
function rotPair(lx, lz, a, u, v) { const p = rotLocal(lx, lz, a, u, v); return [p[0], p[1]]; }

// ------------------------------------------------------------------ furniture
const SETS = {
  inn: [['props/Table_Large', 3], ['props/Chair_1', 6], ['props/Bench', 2], ['props/Barrel', 3], ['props/Mug', 4], ['props/Table_Plate', 2], ['props/Chandelier', 1, 'ceiling'], ['props/Barrel_Holder', 1], ['props/Bottle_1', 2]],
  smith: [['props/Anvil', 1], ['props/Anvil_Log', 1], ['props/Workbench', 1], ['props/Whetstone', 1], ['props/WeaponStand', 1], ['props/Crate_Metal', 2], ['props/Bucket_Metal', 1], ['props/Chain_Coil', 1], ['props/Pickaxe_Bronze', 1]],
  store: [['props/Crate_Wooden', 4], ['props/FarmCrate_Apple', 2], ['props/FarmCrate_Carrot', 1], ['props/FarmCrate_Empty', 1], ['props/Shelf_Simple', 2], ['props/Barrel_Apples', 1], ['props/Bag', 2], ['props/Pouch_Large', 1], ['props/Rope_3', 1]],
  alchemist: [['props/Shelf_Small_Bottles', 2], ['props/Cauldron', 1], ['props/Bookcase_2', 2], ['props/Table_Large', 1], ['props/Potion_1', 3], ['props/Potion_2', 2], ['props/Potion_4', 2], ['props/SmallBottles_1', 2], ['props/Scroll_1', 1], ['props/BookStand', 1]],
  hall: [['props/Table_Large', 2], ['props/Bench', 4], ['props/Banner_1', 2, 'wall'], ['props/Banner_2', 2, 'wall'], ['props/CandleStick_Stand', 2], ['props/Chest_Wood', 1], ['props/Bookcase_2', 2], ['props/Chalice', 2]],
  barracks: [['props/Bed_Twin1', 4], ['props/Bed_Twin2', 2], ['props/WeaponStand', 2], ['props/Peg_Rack', 2, 'wall'], ['props/Shield_Wooden', 2, 'wall'], ['props/Chest_Wood', 2], ['props/Dummy', 1]],
  stable: [['bellmourn/haystack', 3], ['props/Bucket_Wooden_1', 2], ['props/Rope_1', 1], ['props/Barrel', 1], ['props/FarmCrate_Empty', 2]],
  bakery: [['props/Table_Large', 1], ['props/Barrel', 2], ['props/Bag', 3], ['props/Pot_1', 2], ['props/Pot_1_Lid', 1], ['props/Table_Knife', 1], ['props/Workbench_Drawers', 1]],
  healer: [['props/Bed_Twin1', 2], ['props/Bed_Twin2', 1], ['props/Nightstand_Shelf', 2], ['props/Shelf_Small_Bottles', 1], ['props/SmallBottle', 3], ['props/Bucket_Wooden_1', 1], ['props/Candle_1', 3]],
  home: [['props/Table_Large', 1], ['props/Stool', 2], ['props/Bed_Twin2', 1], ['props/Chest_Wood', 1], ['props/Cabinet', 1], ['props/Shelf_Arch', 1], ['props/Candle_2', 2], ['props/Pot_1', 1], ['props/Book_Stack_1', 1]],
  study: [['props/Bookcase_2', 3], ['props/BookGroup_Medium_1', 2], ['props/BookGroup_Small_2', 2], ['props/Book_5', 2], ['props/Book_7', 1], ['props/Scroll_2', 2], ['props/BookStand', 1], ['props/CandleStick_Triple', 2], ['props/Table_Large', 1], ['props/Chair_1', 1]],
  ruin: [['bellmourn/rubble', 2], ['props/Crate_Wooden', 1], ['props/Vase_Rubble_Medium', 2], ['dungeon/Cobweb', 2, 'ceiling'], ['dungeon/Skull', 1], ['props/Barrel', 1]],
  shrine: [['bellmourn/shrine', 1], ['props/CandleStick_Stand', 2], ['props/Candle_1', 4], ['props/Chalice', 1], ['props/Banner_2', 1, 'wall']],
};

/** Furniture along the inside walls, big pieces down the middle, small things on tables; each
 * piece only where it fits. Kept clear: an apron inside the door, the stair and the way onto it,
 * and a walkway (from the door across the house, and down its length), so every part of the
 * floor can be got to; pieces down the middle keep room to walk round them. */
function furnish(ctx, h, F, W, D, S, stair, doorSide, R) {
  const { kit } = ctx;
  const list = (Array.isArray(h.furnish) ? h.furnish : SETS[h.furnish] || SETS.home).flatMap(([id, n, where]) => Array.from({ length: n }, () => [id, where]));
  const doorAt = Math.floor((doorSide === 'x+' ? h.d : h.w) / 2);
  const dx = -W / 2 + 1 + doorAt * 2, dz = D / 2 - 1 - doorAt * 2; // the door, on z+ or x+
  // local rects [x0, z0, x1, z1]: `taken` stops everything solid, `lane` only what stands at the walls
  const taken = [doorSide === 'x+' ? [W / 2 - 2.2, dz - 0.9, W / 2, dz + 0.9] : [dx - 0.9, D / 2 - 2.2, dx + 0.9, D / 2]];
  if (stair) taken.push([stair.x - (stair.x > 0 ? 1.85 : 0.85), stair.z0 - stair.len - 0.3, stair.x + (stair.x > 0 ? 0.85 : 1.85), D / 2]);
  const lane = doorSide === 'x+' ? [[-W / 2, dz - 0.55, W / 2, dz + 0.55], [-0.55, -D / 2, 0.55, D / 2]] : [[dx - 0.55, -D / 2, dx + 0.55, D / 2]];
  const room = [-W / 2 + 0.3, -D / 2 + 0.3, W / 2 - 0.3, D / 2 - 0.3];
  const hit = (f, rs, pad) => rs.some((t) => f[0] < t[2] + pad && f[2] > t[0] - pad && f[1] < t[3] + pad && f[3] > t[1] - pad);
  /** Room for id at (x, z) turned a (pushed off the walls if it pokes through one)? Returns the
   * spot it settles at, and takes its floor. */
  const fit = (id, x, z, a, mid) => {
    let f = kit.footprint(id, x, z, a, 1);
    if (!f) return [x, z];
    const sx = Math.max(0, room[0] - f[0]) - Math.max(0, f[2] - room[2]), sz = Math.max(0, room[1] - f[1]) - Math.max(0, f[3] - room[3]);
    x += sx; z += sz; f = [f[0] + sx, f[1] + sz, f[2] + sx, f[3] + sz];
    if (f[0] < room[0] - 0.01 || f[1] < room[1] - 0.01 || f[2] > room[2] + 0.01 || f[3] > room[3] + 0.01) return null; // too big for the room
    if (mid ? hit(f, taken, 0.8) || f[0] < room[0] + 0.7 || f[2] > room[2] - 0.7 || f[1] < room[1] + 0.7 || f[3] > room[3] - 0.7 : hit(f, taken, 0.15) || hit(f, lane, 0)) return null;
    taken.push(f);
    return [x, z];
  };
  const spots = [];
  const inset = 0.95;
  for (let x = -W / 2 + 1.4; x <= W / 2 - 1.4; x += 1.6) { spots.push([x, -D / 2 + inset, 0]); spots.push([x, D / 2 - inset, Math.PI]); }
  for (let z = -D / 2 + 1.6; z <= D / 2 - 1.6; z += 1.6) { spots.push([-W / 2 + inset, z, Math.PI / 2]); spots.push([W / 2 - inset, z, -Math.PI / 2]); }
  const mid = [];
  for (let x = -W / 2 + 2.5; x <= W / 2 - 2.5; x += 2.4) for (let z = -D / 2 + 2.5; z <= D / 2 - 2.5; z += 2.6) mid.push([x, z]);
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  let si = 0, mi = 0;
  const used = new Set();
  for (const [id, where] of list) {
    if (!kit.has(id)) continue;
    const big = /Table_Large|Bench|Bed|Workbench|Anvil|haystack|Cauldron|Dummy/.test(id);
    if (where === 'ceiling') { const [x, z] = mid[mi % Math.max(1, mid.length)] || [0, 0]; mi++; kit.place(id, ...F.p(x, S * H - 1.7, z), F.r(0), 1, { solid: false }); continue; }
    if (where === 'wall') { // hung on a wall: nothing to walk into
      const k = spots.findIndex((s, n) => !used.has(n));
      if (k < 0) continue;
      used.add(k);
      kit.place(id, ...F.p(spots[k][0], 1.2, spots[k][1]), F.r(spots[k][2]), 1, { solid: false });
      continue;
    }
    if (big && mi < mid.length) {
      const [x, z] = mid[mi++], a = R() < 0.5 ? 0 : Math.PI / 2;
      const at = fit(id, x, z, a, true) ? [x, z, a] : fit(id, x, z, a + Math.PI / 2, true) ? [x, z, a + Math.PI / 2] : null;
      if (at) { kit.place(id, ...F.p(at[0], 0.02, at[1]), F.r(at[2]), 1); continue; }
    }
    const small = /Mug|Bottle|Potion|Candle|Book|Scroll|Plate|Knife|Chalice/.test(id);
    // the next wall spot where it fits (turned along the wall if it won't fit facing out)
    for (let n = si; n < spots.length; n++) {
      if (used.has(n)) continue;
      const [x, z, a0] = spots[n];
      let a = a0 + (R() - 0.5) * 0.3, at = small ? [x, z] : fit(id, x, z, a, false);
      if (!at) { a += Math.PI / 2; at = fit(id, x, z, a, false); }
      if (!at) continue;
      used.add(n);
      kit.place(id, ...F.p(at[0], 0.02, at[1]), F.r(a), 1, { solid: !small });
      break;
    }
    while (used.has(si)) si++;
  }
}
