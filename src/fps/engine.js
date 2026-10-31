// The engine: how Bellmourn is drawn.
//
//  - The picture is drawn at the screen's own resolution (a phone's held to 1.5 device pixels a CSS
//    pixel), with 4x multisampling, and eased down a little when frames run long.
//  - Texels stay crisp, square and low resolution as the old games drew them, but where two texels
//    meet the one screen pixel between them is blended, so texture edges don't stair-step or crawl;
//    far off (more than a texel to a pixel) it's ordinary trilinear, anisotropic filtering.
//  - Alpha-tested things (leaves, hair, lashes, plants) are smoothed by alpha to coverage.
//  - Characters are culled to what the camera (and the sun) can see.
//  - Before the first frame of play everything is loaded, every texture uploaded and every shader
//    compiled, so nothing is made on the GPU in the middle of a fight.
import * as THREE from 'three';

const store = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
/** 'crisp' (square texels, anti-aliased) or 'smooth' (plain bilinear). */
export const TEXELS = store('bm.texels', 'crisp') === 'smooth' ? 'smooth' : 'crisp';

// ------------------------------------------------------------------ crisp texels, anti-aliased
/** sharpTexel(t, uv): a texel-crisp sample whose texel seams are one screen pixel of blend (the
 * texture must be linear-filtered). For custom shaders: include this in the fragment shader. */
export const SHARP_GLSL = /* glsl */`
#ifndef SHARP_TEXEL
#define SHARP_TEXEL
vec4 sharpTexel( sampler2D t, vec2 uv ) {
${TEXELS === 'crisp' ? `  vec2 size = vec2( textureSize( t, 0 ) );
  vec2 p = uv * size;
  vec2 w = max( fwidth( p ), vec2( 1e-5 ) );
  vec2 seam = floor( p + 0.5 );
  vec2 q = seam + clamp( ( p - seam ) / w, -0.5, 0.5 );
  // magnified: square texels with a pixel of blend at each seam; minified: plain filtering
  q = mix( q, p, smoothstep( 0.7, 1.4, max( w.x, w.y ) ) );
  return textureGrad( t, q / size, dFdx( uv ), dFdy( uv ) );` : '  return texture( t, uv );'}
}
#endif
`;
THREE.ShaderChunk.map_pars_fragment = SHARP_GLSL + THREE.ShaderChunk.map_pars_fragment;
THREE.ShaderChunk.map_fragment = THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'sharpTexel( map, vMapUv )');

// ------------------------------------------------------------------ ground mist
/** Mist lying on the ground in `box` [x0, z0, x1, z1] (the graveyard): a height fog in three's own
 * fog shader, so everything drawn there (stones, the dead, the grass) sinks into it by how much mist
 * the eye looks through on its way, thick on the ground and thinning by knee height, broken into
 * banks by noise, and fading out over the last `edge` metres of the box. Call before anything is
 * compiled. Its colour is the fog's (so it follows the day and the night). */
export function groundMist(box, { density = 0.07, falloff = 1.5, edge = 12 } = {}) {
  const [x0, z0, x1, z1] = box.map((v) => v.toFixed(1));
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex += '\n#ifdef USE_FOG\n\tvarying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex += '\n#ifdef USE_FOG\n\tvFogWorld = transpose( mat3( viewMatrix ) ) * mvPosition.xyz + cameraPosition;\n#endif\n';
  C.fog_pars_fragment += /* glsl */`
#ifdef USE_FOG
	varying vec3 vFogWorld;
	float bmMistHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
	float bmMistNoise( vec2 p ) {
		vec2 i = floor( p ), u = fract( p ); u = u * u * ( 3.0 - 2.0 * u );
		return mix( mix( bmMistHash( i ), bmMistHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( bmMistHash( i + vec2( 0.0, 1.0 ) ), bmMistHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
	}
#endif
`;
  C.fog_fragment = C.fog_fragment.replace(/#endif\s*$/, /* glsl */`
	{
		vec2 mq = vFogWorld.xz;
		vec2 me = min( mq - vec2( ${x0}, ${z0} ), vec2( ${x1}, ${z1} ) - mq );
		float inside = smoothstep( 0.0, ${edge.toFixed(1)}, min( me.x, me.y ) ) * step( -1.5, vFogWorld.y ) * step( -1.5, cameraPosition.y );   // (not in the vaults below)
		if ( inside > 0.0 ) {
			// the mist along the eye's ray (Quilez's height fog): density a at the ground, falling off over 1 / b m
			vec3 rd = vFogWorld - cameraPosition;
			float dist = min( length( rd ), 70.0 );
			rd = normalize( rd );
			float ry = abs( rd.y ) < 1e-3 ? ( rd.y < 0.0 ? -1e-3 : 1e-3 ) : rd.y;
			float a = ${density.toFixed(3)} * ( 0.45 + 1.1 * bmMistNoise( mq * 0.09 ) ) * ( 0.7 + 0.6 * bmMistNoise( mq * 0.31 + 7.0 ) );
			float b = ${falloff.toFixed(2)};
			float mist = a / b * exp( - max( cameraPosition.y, 0.0 ) * b ) * ( 1.0 - exp( - dist * ry * b ) ) / ry;
			gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * 1.12, clamp( mist, 0.0, 0.8 ) * inside );
		}
	}
#endif
`);
}

/** The anisotropy every texture gets (set once the renderer is known). */
export let ANISO = 8;

/** The renderer, drawing to `canvas`. */
export function makeRenderer(canvas, { touch }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(1);   // (the size is set in device pixels: Resolution)
  ANISO = Math.min(touch ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
  THREE.Texture.DEFAULT_ANISOTROPY = ANISO;
  return renderer;
}

/** The composer's buffers: the one the world is drawn into is multisampled (EffectComposer draws its
 * scene passes into readBuffer, renderTarget2); the other only ever takes full-screen passes. */
export function multisample(composer, samples) {
  if (!samples) return;
  composer.renderTarget2.samples = samples;
  composer.renderTarget2.dispose();   // (re-made, multisampled, on its next use)
}

// ------------------------------------------------------------------ textures and materials
const IMAGE = (t) => t && t.isTexture && !t.isDataTexture && !t.isDataArrayTexture && !t.isData3DTexture && !t.isCompressedTexture
  && !t.isRenderTargetTexture && !t.isCubeTexture && !t.isVideoTexture && !t.isDepthTexture && !t.isFramebufferTexture;

/** A picture texture made ready for the new look: linear filtering (sharpTexel keeps it crisp),
 * mipmaps and anisotropy. Data, depth and render-target textures are left alone. */
export function refineTexture(t) {
  if (!IMAGE(t)) return;
  const want = t.magFilter !== THREE.LinearFilter || t.minFilter !== THREE.LinearMipmapLinearFilter || !t.generateMipmaps || t.anisotropy < ANISO;
  if (!want) return;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ANISO;
  const img = t.image;
  if (img && (img.width || img.data)) t.needsUpdate = true;
}

const MAPS = ['map', 'emissiveMap', 'alphaMap', 'specularMap', 'aoMap', 'lightMap', 'bumpMap', 'roughnessMap', 'metalnessMap'];

/** Every material under `root`: its pictures refined, and (with multisampling) alpha to coverage on
 * anything alpha-tested. */
export function refineScene(root, { a2c = true } = {}) {
  const seen = new Set();
  let n = 0;
  root.traverse((o) => {
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of MAPS) refineTexture(m[k]);
      if (m.isShaderMaterial && m.uniforms?.map?.value) refineTexture(m.uniforms.map.value);
      if (a2c && m.alphaTest > 0 && !m.transparent && !m.alphaToCoverage && !m.isShaderMaterial) { m.alphaToCoverage = true; n++; }
    }
  });
  return { materials: seen.size, a2c: n };
}

// ------------------------------------------------------------------ characters
const _s = new THREE.Vector3();
/** A skinned body that can be culled: a bounding sphere about its bind pose, grown by `pad` metres
 * (in the world) to hold whatever its animations do (a crawl, a fall), used by the camera's and the
 * sun's frustum tests. */
export function cullable(root, pad = 1.2) {
  root.updateWorldMatrix(true, true);
  root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const g = m.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const k = Math.max(1e-6, m.getWorldScale(_s).x / Math.max(1e-6, root.getWorldScale(_s).x || 1));
    const s = g.boundingSphere.clone();
    s.radius = s.radius * 1.2 + pad / k;
    m.boundingSphere = s;
    m.frustumCulled = true;
  });
}

/** One skeleton for every part of a body bound to the same bones the same way. A cloned model gets a
 * skeleton of its own for each mesh (SkeletonUtils.clone), so a villager in thirteen pieces had its
 * bones worked out and sent to the GPU thirteen times a frame. */
export function shareSkeletons(root) {
  const groups = [];
  root.traverse((m) => {
    if (!m.isSkinnedMesh) return;
    const s = m.skeleton;
    const same = groups.find((g) => g.bones.length === s.bones.length && g.bones.every((b, i) => b === s.bones[i])
      && g.boneInverses.every((x, i) => x.equals(s.boneInverses[i])));
    if (same) m.skeleton = same;
    else groups.push(s);
  });
  return groups.length;
}

/** The scene's world matrices worked out only where something can be drawn: a hidden subtree (a
 * zombie in the deep, a villager indoors, their dozens of bones each) is skipped until it's shown
 * again. three.js walks every object, shown or not, every frame. */
export function visibleMatrices(scene) {
  const up = (o, force) => {
    if (o.matrixAutoUpdate) o.updateMatrix();
    if (o.matrixWorldNeedsUpdate || force) {
      if (o.matrixWorldAutoUpdate) {
        if (o.parent === null) o.matrixWorld.copy(o.matrix);
        else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
        // what SkinnedMesh's and Camera's own updateMatrixWorld add
        if (o.isSkinnedMesh) {
          if (o.bindMode === THREE.AttachedBindMode) o.bindMatrixInverse.copy(o.matrixWorld).invert();
          else if (o.bindMode === THREE.DetachedBindMode) o.bindMatrixInverse.copy(o.bindMatrix).invert();
        } else if (o.isCamera) o.matrixWorldInverse.copy(o.matrixWorld).invert();
      }
      o.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (c.visible || c.isLight) up(c, force);
      else if (force) c.matrixWorldNeedsUpdate = true;   // (brought up to date when it's next shown)
    }
  };
  scene.updateMatrixWorld = function (force = false) { up(this, force); };
}

/** Small pieces of the built world (a lamp's ironwork, a sign, a step) are left out past a distance
 * that grows with their size, and cast no sun shadow past a shorter one: the far village is hundreds
 * of draws of things a few pixels across. `meshes`: the builder's merged meshes. */
export class DetailCull {
  /** under: meshes whose showing something else decides each frame (they're only ever hidden here). */
  constructor(meshes, { touch, under = [] }) {
    this.k = touch ? [20, 45, 12, 18] : [30, 70, 20, 25];   // shown: a + b*r m; casts: c + d*r m
    this.list = [];
    const U = new Set(under);
    for (const m of meshes) {
      const s = m.geometry.boundingSphere;
      if (!s || s.radius > 6) continue;   // (big pieces: always)
      const c = s.center.clone().applyMatrix4(m.matrixWorld);
      this.list.push({ m, x: c.x, y: c.y, z: c.z, show: this.k[0] + this.k[1] * s.radius, cast: this.k[2] + this.k[3] * s.radius,
        castBase: m.castShadow, under: U.has(m) });
    }
  }

  /** Each frame, after anything else has decided what's shown. */
  update(p) {
    for (const e of this.list) {
      const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > e.show * e.show) e.m.visible = false;
      else if (!e.under) e.m.visible = true;
      e.m.castShadow = e.castBase && d2 < e.cast * e.cast;
    }
  }
}

// ------------------------------------------------------------------ everything in, before play
/** Resolves once nothing is loading through three's default loading manager (every texture and
 * model asked for so far has arrived, or failed), and has stayed so for a moment. */
export function settled(quiet = 150, limit = 180000) {
  const M = THREE.DefaultLoadingManager, t0 = performance.now();
  return new Promise((done) => {
    let calm = 0;
    const look = () => {
      calm = M.itemsTotal > M.itemsLoaded ? 0 : calm + 50;   // (a failed load counts as loaded too)
      if (calm >= quiet || performance.now() - t0 > limit) done();
      else setTimeout(look, 50);
    };
    look();
  });
}

/** Every texture the materials under `root` use (their maps and their uniforms'). */
export function texturesOf(root, out = new Set()) {
  const seen = new Set();
  root.traverse((o) => {
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) out.add(v);
      for (const u of Object.values(m.uniforms || {})) {
        if (u?.value?.isTexture) out.add(u.value);
        else if (Array.isArray(u?.value)) for (const x of u.value) if (x?.isTexture) out.add(x);
      }
    }
  });
  return out;
}

/** Upload every texture in `list` to the GPU now (a few at a time, so the loading line can move). */
export async function upload(renderer, list, onStep) {
  let i = 0;
  for (const t of list) {
    const img = t.image;
    const ready = t.isRenderTargetTexture || t.isDataArrayTexture || t.isDataTexture || (img && (img.width || img.data || img.length));
    if (ready) { try { renderer.initTexture(t); } catch (e) { console.warn('upload', t.name, e); } }
    if (++i % 24 === 0) { onStep?.(i / list.size); await new Promise((r) => setTimeout(r)); }
  }
}

/** Compile the programs every material under each [scene, camera] needs, as drawn into `target`
 * (the composer's buffer: drawn to a target, the shaders come out without tone mapping, so a
 * compile against the screen would make the wrong ones). */
export async function compile(renderer, pairs, target) {
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    for (const [scene, camera] of pairs) await renderer.compileAsync(scene, camera);
  } finally { renderer.setRenderTarget(was); }
}

// ------------------------------------------------------------------ the picture's size
/** The picture's size in device pixels: the window's, times the device's pixels (capped), times the
 * player's resolution choice, times the easing scale `rs` (0.6 .. 1) the frame time sets; and no
 * more than `maxPixels` in all. */
export class Resolution {
  constructor({ touch }) {
    this.touch = touch;
    this.dpr = Math.min(devicePixelRatio || 1, touch ? 1.5 : 2);
    this.choice = Number(store('bm.res', '1')) || 1;   // 1, 0.75, 0.5
    this.maxPixels = touch ? 1.3e6 : 4.2e6;
    this.rs = 1; this.frameMs = 16; this.t = 0; this.held = false;
    this.w = 2; this.h = 2;
  }

  size() {
    const cw = Math.max(1, innerWidth), ch = Math.max(1, innerHeight);
    let k = this.dpr * this.choice * this.rs;
    const px = cw * ch * k * k;
    if (px > this.maxPixels) k *= Math.sqrt(this.maxPixels / px);
    this.w = Math.max(2, Math.floor(cw * k)); this.h = Math.max(2, Math.floor(ch * k));
    return [this.w, this.h];
  }

  /** A frame took `ms` (from one to the next): every second and a half or so, the scale eases down
   * when 60 a second isn't being kept, and back up when it is. Returns true when the size should
   * change. */
  frame(ms, playing) {
    this.frameMs += (Math.min(100, ms) - this.frameMs) * 0.05;
    if (!playing || this.held || ++this.t < 90) return false;
    this.t = 0;
    const want = this.frameMs > 21 ? Math.max(0.6, this.rs * 0.9) : this.frameMs < 17.8 ? Math.min(1, this.rs * 1.05) : this.rs;
    if (Math.abs(want - this.rs) < 0.01) return false;
    this.rs = want;
    return true;
  }
}
