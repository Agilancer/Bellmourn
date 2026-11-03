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
//  - Two renderers (index.html picks one before anything loads): WebGPU (three r187, its shaders in
//    TSL: nodes.js) where the browser has it, else WebGL (three r170, the GLSL below).
import * as THREE from 'three';
import { TEXELS, WEBGPU, crispColor, shared, T } from './nodes.js';

export { TEXELS, WEBGPU };
const store = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

// ------------------------------------------------------------------ crisp texels, anti-aliased
/** sharpTexel(t, uv): a texel-crisp sample whose texel seams are one screen pixel of blend (the
 * texture must be linear-filtered). For custom shaders: include this in the fragment shader. */
export const SHARP_GLSL = /* glsl */`
#ifndef SHARP_TEXEL
#define SHARP_TEXEL
// (with the uv's screen gradients given: safe inside a branch, and shared by every layer drawn
// from the same world position)
vec4 sharpTexelGrad( sampler2D t, vec2 uv, vec2 dx, vec2 dy ) {
${TEXELS === 'crisp' ? `  vec2 size = vec2( textureSize( t, 0 ) );
  vec2 p = uv * size;
  vec2 w = max( ( abs( dx ) + abs( dy ) ) * size, vec2( 1e-5 ) );
  vec2 seam = floor( p + 0.5 );
  vec2 q = seam + clamp( ( p - seam ) / w, -0.5, 0.5 );
  // magnified: square texels with a pixel of blend at each seam; minified: plain filtering
  q = mix( q, p, smoothstep( 0.7, 1.4, max( w.x, w.y ) ) );
  return textureGrad( t, q / size, dx, dy );` : '  return textureGrad( t, uv, dx, dy );'}
}
vec4 sharpTexel( sampler2D t, vec2 uv ) { return sharpTexelGrad( t, uv, dFdx( uv ), dFdy( uv ) ); }
// a tiling texture with its repeat hidden: a second copy, turned a quarter (or, for one with a grain
// such as laid slabs, mirrored along it) and shifted half a tile, laid over the first in patches. k (0..1, a
// slow noise) says where; within the blend the lighter of the two wins texel by texel (stones over
// grout), so it reads as one ground, not a double exposure
vec4 untiled( sampler2D t, vec2 uv, vec2 dx, vec2 dy, float k, bool grain ) {
  vec2 uv2 = grain ? vec2( uv.x, 0.5 - uv.y ) : vec2( -uv.y, uv.x ) + vec2( 0.5, 0.5 );
  vec2 dx2 = grain ? vec2( dx.x, -dx.y ) : vec2( -dx.y, dx.x ), dy2 = grain ? vec2( dy.x, -dy.y ) : vec2( -dy.y, dy.x );
  vec4 a = k < 0.999 ? sharpTexelGrad( t, uv, dx, dy ) : vec4( 0.0 );
  if ( k <= 0.001 ) return a;
  vec4 b = sharpTexelGrad( t, uv2, dx2, dy2 );
  if ( k >= 0.999 ) return b;
  float h = ( k - 0.5 ) * 3.0 + dot( b.rgb - a.rgb, vec3( 0.333 ) ) * 4.0;
  return mix( a, b, smoothstep( -0.35, 0.35, h ) );
}
// the patches k comes from: value noise on a turned, warped domain (no straight seams)
float untileMask( vec2 p, float seed ) {
  vec2 q = mat2( 0.8, -0.6, 0.6, 0.8 ) * p * 0.11 + seed;
  q.x += sin( q.y * 1.7 + seed ) * 0.6;
  vec2 i = floor( q ), f = fract( q ); f = f * f * ( 3.0 - 2.0 * f );
  vec4 h = fract( sin( vec4( dot( i, vec2( 127.1, 311.7 ) ), dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ),
    dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ), dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) ) * 43758.5453 );
  return smoothstep( 0.35, 0.65, mix( mix( h.x, h.y, f.x ), mix( h.z, h.w, f.x ), f.y ) );
}
#endif
`;
// three's own materials take it where a material asks (SHARP_MAP, set by crisp()): a painted
// picture, never a soft glow drawn on a canvas, which would come out in squares
if (!WEBGPU) THREE.ShaderChunk.map_pars_fragment = SHARP_GLSL + THREE.ShaderChunk.map_pars_fragment;
if (!WEBGPU) THREE.ShaderChunk.map_fragment = THREE.ShaderChunk.map_fragment.replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
  '#ifdef SHARP_MAP\n\tvec4 sampledDiffuseColor = sharpTexel( map, vMapUv );\n#else\n\tvec4 sampledDiffuseColor = texture2D( map, vMapUv );\n#endif');

const IMAGE = (t) => t && t.isTexture && !t.isDataTexture && !t.isDataArrayTexture && !t.isData3DTexture && !t.isCompressedTexture
  && !t.isRenderTargetTexture && !t.isCubeTexture && !t.isVideoTexture && !t.isDepthTexture && !t.isFramebufferTexture;

/** A material whose map is a painted picture (not a canvas-drawn glow, not added on as light) gets
 * crisp texels. Returns the material. */
export function crisp(m) {
  const t = m?.map;
  if (WEBGPU) {
    if (TEXELS === 'crisp' && IMAGE(t) && !t.isCanvasTexture && m.blending !== THREE.AdditiveBlending && !m.userData.sharp && !m.colorNode) crispColor(m);
    return m;
  }
  if (TEXELS === 'crisp' && IMAGE(t) && !t.isCanvasTexture && m.blending !== THREE.AdditiveBlending && !('SHARP_MAP' in (m.defines || {}))) {
    m.defines = { ...(m.defines || {}), SHARP_MAP: '' };
    m.needsUpdate = true;
  }
  return m;
}

// ------------------------------------------------------------------ the haze lies low
// three's range fog, thinned with height (as nodes.js fogNode under WebGPU): high ground, the
// Sorrowhorn's upper half, stands out of the haze from far off.
{
  const C = THREE.ShaderChunk, line = 'smoothstep( fogNear, fogFar, vFogDepth )';
  if (C?.fog_fragment?.includes(line)) {   // (WebGL only: the WebGPU build has no shader chunks)
    C.fog_pars_vertex += '\n#ifdef USE_FOG\n\tvarying float vFogAlt;\n#endif\n';
    C.fog_vertex += '\n#ifdef USE_FOG\n\tvFogAlt = ( transpose( mat3( viewMatrix ) ) * mvPosition.xyz + cameraPosition ).y;\n#endif\n';
    C.fog_pars_fragment += '\n#ifdef USE_FOG\n\tvarying float vFogAlt;\n#endif\n';
    C.fog_fragment = C.fog_fragment.replace(line, 'smoothstep( fogNear, fogFar, vFogDepth * mix( 1.0, 0.3, smoothstep( 40.0, 320.0, vFogAlt ) ) )');
  }
}

// ------------------------------------------------------------------ ground mist
/** Mist lying on the ground in `box` [x0, z0, x1, z1] (the graveyard): a height fog in three's own
 * fog shader, so everything drawn there (stones, the dead, the grass) sinks into it by how much mist
 * the eye looks through on its way, thick on the ground and thinning by knee height, broken into
 * banks by noise, and fading out over the last `edge` metres of the box. Call before anything is
 * compiled. Its colour is the fog's (so it follows the day and the night). */
export let MIST = null;
export function groundMist(box, { density = 0.07, falloff = 1.5, edge = 12 } = {}) {
  if (WEBGPU) { MIST = { box, density, falloff, edge }; return; }   // (nodes.js fogNode draws it)
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
			// (the exponents held in range: looking down a long way, exp() overflows, and at a phone's
			// precision far sooner; an Inf or NaN here, smeared by the bloom, is a black box on screen)
			float mist = a / b * exp( - clamp( cameraPosition.y, 0.0, 20.0 ) * b ) * ( 1.0 - exp( min( - dist * ry * b, 8.0 ) ) ) / ry;
			gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * 1.12, clamp( mist, 0.0, 0.8 ) * inside );
		}
	}
#endif
`);
}

/** The anisotropy every texture gets (set once the renderer is known). */
export let ANISO = 8;

/** The renderer, drawing to `canvas` (WebGPU: a promise, settled once the GPU's device is ours;
 * it rejects where there's no WebGPU device to be had, and the game goes back to WebGL). */
export function makeRenderer(canvas, { touch }) {
  if (WEBGPU) return makeWebGPU(canvas, { touch });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(1);   // (the size is set in device pixels: Resolution)
  ANISO = Math.min(touch ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
  THREE.Texture.DEFAULT_ANISOTROPY = ANISO;
  keepCompiled(renderer);
  return renderer;
}

/** What's compiled before play stays compiled. three lets a shader go when the last thing drawn with
 * it is disposed (WebGL r170: its program; WebGPU r187: its node build, shader modules and pipeline),
 * and a hex, a spell's flash, a cut-off limb, a body cleared away each have materials of their own,
 * disposed when they're gone: the next was compiled again, mid-fight, though the warm-up and the
 * rehearsal had made it. So nothing is let go until play begins (`keepCompiled.freeze()`, after the
 * rehearsal); then what was made by then is kept for good, and of what's made later the first LATE are
 * kept too (a kind first met in play), the rest let go as three would (a material that builds its own
 * nodes, or a ShaderMaterial, whose cache keys never come round again, would otherwise pile up).
 * WebGL: programs are pinned after each frame drawn (`keepCompiled.pin`); a ShaderMaterial's never
 * (its key is its shader's place in three's cache, which goes with its last material: kept, it would
 * never be used again). `keepCompiled.stats()` for the counts. */
const LATE = 96;
export function keepCompiled(renderer) {
  let frozen = false, late = 0;
  const lateOne = () => late < LATE && ++late;
  if (WEBGPU) {
    const P = renderer._pipelines, cache = renderer._nodes?.nodeBuilderCache;
    if (!P || !cache) return;
    const keptP = new Set(), keptG = new Set(), keptK = new Set();
    const spare = (kept, x) => {
      if (!frozen || kept.has(x)) return true;
      if (lateOne()) { kept.add(x); return true; }
      return false;
    };
    const relP = P._releasePipeline.bind(P), relG = P._releaseProgram.bind(P), del = cache.delete.bind(cache);
    // (a pipeline kept keeps its shader programs: their ids are in its key, and it would never be found
    // again with new ones; three lets the pipeline go first, then its programs)
    P._releasePipeline = (p) => {
      if (!spare(keptP, p)) { relP(p); return; }
      for (const g of [p.vertexProgram, p.fragmentProgram, p.computeProgram]) if (g) keptG.add(g);
    };
    P._releaseProgram = (g) => { if (frozen && !keptG.has(g)) relG(g); };
    cache.delete = (k) => (spare(keptK, k) ? false : del(k));
    keepCompiled.freeze = () => {
      if (frozen) return;
      for (const p of P.caches.values()) keptP.add(p);
      for (const m of Object.values(P.programs || {})) for (const g of m.values()) keptG.add(g);
      for (const k of cache.keys()) keptK.add(k);
      frozen = true;
    };
    keepCompiled.stats = () => ({ pipelines: P.caches.size, nodeBuilds: cache.size, kept: keptP.size, late, frozen });
    return;
  }
  keepCompiled.pin = () => {
    const list = renderer.info.programs;
    if (!list) return;
    for (const p of list) {
      if (p.kept || p.type === 'ShaderMaterial' || p.type === 'RawShaderMaterial') continue;   // (r170: type is the material's type)
      if (frozen && !lateOne()) continue;
      p.kept = true; p.usedTimes += 1e9;
    }
  };
  keepCompiled.freeze = () => { keepCompiled.pin(); frozen = true; };
  keepCompiled.stats = () => ({ programs: renderer.info.programs?.length, late, frozen });
}
keepCompiled.pin = () => {};
keepCompiled.freeze = () => {};
keepCompiled.stats = () => ({});

async function makeWebGPU(canvas, { touch }) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', trackTimestamp: true });
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('no WebGPU device (three fell back to WebGL2)');
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);   // (a pass without a background of its own clears to nothing: the arms)
  ANISO = Math.min(touch ? 4 : 16, renderer.getMaxAnisotropy());
  THREE.Texture.DEFAULT_ANISOTROPY = ANISO;
  shadowNodesShared(renderer);
  keepCompiled(renderer);
  // r187 keeps a skeleton's bone matrices, and a small instanced mesh's matrices, in a uniform buffer
  // of each draw's own, written again with every draw (a Sworn: nineteen draws, and each shadow's, of
  // its sixty-odd bones); what it does for ones too big for a uniform buffer (a bone texture written
  // once a frame for each skeleton, instance matrices as vertex buffers written when they change) is
  // taken for all of them. (Set before anything is built: it changes their shaders.)
  if (THREE.NodeBuilder?.prototype.getUniformBufferLimit) THREE.NodeBuilder.prototype.getUniformBufferLimit = () => 0;
  // ?debugrender: a draw that throws names its object and material, once each
  if (/[?&]debugrender/.test(location.search)) {
    Error.stackTraceLimit = 60;
    const draw = renderer._renderObjectDirect.bind(renderer), told = new Set();
    renderer._renderObjectDirect = (object, material, scene, camera, ...rest) => {
      try { return draw(object, material, scene, camera, ...rest); } catch (e) {
        if (!told.has(material)) { told.add(material); console.error('draw failed:', object.type, object.name, '|', material.type, material.name, Object.keys(material).filter((k) => /Node$|map$/i.test(k) && material[k]).join(','), '|', scene.overrideMaterial?.type || '', e.message); }
      }
    };
  }
  return renderer;
}

/** In a shadow pass three draws its own depth material, given the object's map alpha through a node
 * that names that one material (reference('map', material)): a node build, kept, for every textured
 * material and kind of shadow (6,600 of them for 163 shaders; most of the WebGPU heap). Here an opaque
 * caster gets no colour node at all (its alpha is never looked at), and an alpha-cut one (leaves, hair)
 * one graph for all: its own colour node's alpha where it has one (a shared graph), else its map's,
 * through a texture that follows the material (nodes.js shared). */
function shadowNodesShared(renderer) {
  const base = renderer._getShadowNodes?.bind(renderer);
  if (!base) return;
  const byColor = new WeakMap(), byMap = new Map();
  renderer._getShadowNodes = (material) => {
    if (material.castShadowNode?.isNode || material.maskShadowNode?.isNode || material.maskNode?.isNode) return base(material);
    const positionNode = material.castShadowPositionNode?.isNode ? material.castShadowPositionNode : material.positionNode?.isNode ? material.positionNode : null;
    const depthNode = material.depthNode?.isNode ? material.depthNode : null;
    if (!(material.alphaTest > 0 || material.alphaHash)) return { colorNode: null, depthNode, positionNode };
    let colorNode = null;
    if (material.colorNode?.isNode) {
      colorNode = byColor.get(material.colorNode);
      if (!colorNode) byColor.set(material.colorNode, colorNode = T.vec4(T.vec3(0), material.colorNode.a));
    } else if (material.map?.isTexture) {
      const m = material.map, k = `${m.colorSpace}|${m.channel}`;
      colorNode = byMap.get(k);
      if (!colorNode) byMap.set(k, colorNode = T.vec4(T.vec3(0), shared((mat) => mat.map, m).sample(T.uv(m.channel)).a));
    } else return base(material);
    return { colorNode, depthNode, positionNode };
  };
}

/** The composer's buffers: the one the world is drawn into is multisampled (EffectComposer draws its
 * scene passes into readBuffer, renderTarget2); the other only ever takes full-screen passes. */
export function multisample(composer, renderer, samples) {
  if (WEBGPU) return samples;   // (the world's pass is made multisampled: main.js)
  const gl = renderer.getContext();
  // half-float multisampled buffers need a float colour buffer (some phone GPUs have none)
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) samples = 0;
  samples = Math.min(samples, gl.getParameter(gl.MAX_SAMPLES) || 0);
  if (!samples) return 0;
  const ms = composer.renderTarget2;
  ms.samples = samples;
  ms.dispose();   // (re-made, multisampled, on its next use)
  // the scene passes draw into readBuffer: a pass that swaps buffers an odd number of times a frame
  // would leave the world drawn without multisampling every other frame, so it's always put back
  const render = composer.render.bind(composer);
  composer.render = (dt) => { if (composer.readBuffer !== ms) composer.swapBuffers(); render(dt); };
  return samples;
}

// ------------------------------------------------------------------ textures and materials
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
      if (!m.isShaderMaterial) crisp(m);
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

// ------------------------------------------------------------------ shadows
/** The layer of the bodies' shadow stand-ins (zombies.js makeShade): seen by every light's shadow
 * camera (shadeLayers), never by a camera that draws the picture. */
export const SHADE_LAYER = 5;

/** Every shadow map sees the stand-ins. WebGPU (r187) tests a caster's layers against the light's
 * shadow camera: each shadow-casting light under `root` gets the layer (call before the sun's maps are
 * made: sunshadow.js copies its camera's layers). WebGL (r170) tests them against the view camera, so
 * the view camera takes the layer while the maps are drawn, after its own list of what it draws is
 * made (the stand-ins are never in the picture). */
export function shadeLayers(root, renderer) {
  root.traverse((l) => { if (l.isLight && l.castShadow && l.shadow?.camera) l.shadow.camera.layers.enable(SHADE_LAYER); });
  if (WEBGPU || !renderer?.shadowMap || renderer.shadowMap._shade) return;
  const sm = renderer.shadowMap, draw = sm.render;
  sm._shade = true;
  sm.render = function (lights, scene, camera) {
    const was = camera.layers.mask;
    camera.layers.enable(SHADE_LAYER);
    try { draw.call(this, lights, scene, camera); } finally { camera.layers.mask = was; }
  };
}

/** Let three forget what it kept for drawing these (WebGPU: each draw's render objects, their uniform
 * buffers and their hold on the body, until the object itself is disposed; one with a shared material,
 * never disposed, was kept for good). Call before taking a body's shared buffers off its geometry:
 * a render object let go of later, by the geometry's own dispose, took the shared buffers with it. */
export function letGo(root) {
  root.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) o.dispatchEvent({ type: 'dispose' }); });
}

/** Something that moves: a body (or anything on its bones: a sword, a shield, a stub), or what's
 * marked so (a limb cut off, an arm dropped, a gib). */
export function isMover(o) {
  for (let p = o, k = 0; p && k < 6; p = p.parent, k++) if (p.isSkinnedMesh || p.isBone || p.userData.mover) return true;
  return false;
}

// ---- point lights' shadow passes (WebGPU). Each draws six faces, and each face walks the whole scene,
// most of it the bones of bodies nowhere near the light; a body's root (a direct child of the scene,
// at its own position) is marked userData.body, so a pass can leave out those it has no use for.
const _lp = new THREE.Vector3(), _hid = [], _near = [], _kept = new Set();
/** For one pass: hide the scene's direct children `out(child)` says to (put back by shown()). */
function hidden(scene, out) {
  // (a cell's visible is whether it's in the view of whatever camera is drawing: its own flag is shown)
  for (const c of scene.children) if (!c.isLight && (c.isCell ? c.shown : c.visible) && out(c)) { c.visible = false; _hid.push(c); }
}
function shown() { for (const c of _hid) c.visible = true; _hid.length = 0; }
/** A filter on what a shadow pass draws, made once for each pass's own draw function. */
function filtered(node, base, keep) {
  if (node._base !== base) {
    node._base = base;
    node._fn = (object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId) => {
      if (keep(object)) base(object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
    };
  }
  return node._fn;
}
let PS = null;
function pointShadows() {
  if (PS || !WEBGPU || !THREE.PointShadowNode) return PS;
  const Base = THREE.PointShadowNode, still = (o) => !isMover(o);
  /** A torch's kept map: nothing that moves is drawn in it, and no body walked. */
  class Still extends Base {
    getShadowRenderObjectFunction(r, s) { return filtered(this, super.getShadowRenderObjectFunction(r, s), still); }
    renderShadow(frame) { hidden(frame.scene, (c) => c.userData.body); try { super.renderShadow(frame); } finally { shown(); } }
  }
  /** A spell's light: all that casts, but bodies out of its reach not walked. */
  class Ranged extends Base {
    renderShadow(frame) {
      const p = this.light.getWorldPosition(_lp), r2 = ((this.light.distance || this.shadow.camera.far) + 2.5) ** 2;   // (the pass sets its far to the light's reach)
      hidden(frame.scene, (c) => c.userData.body && c.position.distanceToSquared(p) > r2);
      try { super.renderShadow(frame); } finally { shown(); }
    }
  }
  /** A torch with bodies' shadows (liveShadows): one map for its light to read, as before (no texture or
   * sampler more for a shader to hold: a stage's sixteen were full). Its still world is drawn into a
   * map of its own when the game asks (the torch gone to another flame, a crate broken), with nothing
   * that moves; each time it's drawn that is copied into the light's map, and when there are bodies
   * near it the nearest `most` are drawn over it, the copy not cleared. */
  class Kept extends Base {
    setupRenderTarget(shadow, builder) {
      const r = super.setupRenderTarget(shadow, builder), size = shadow.mapSize.width;
      this.still?.dispose();   // (set up again: a shadow of another kind)
      r.depthTexture.type = THREE.FloatType;   // (32-bit float depth: copied whole from one to the other)
      const d = new THREE.CubeDepthTexture(size);
      d.type = THREE.FloatType; d.compareFunction = r.depthTexture.compareFunction; d.name = 'PointShadowStillTexture';
      this.still = builder.createCubeRenderTarget(size);
      this.still.depthTexture = d;
      this.box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(size, size, 6));
      this.stillDirty = true;
      return r;
    }
    getShadowRenderObjectFunction(r, s) {
      return filtered(this, super.getShadowRenderObjectFunction(r, s), (o) => (this.pass === 'live' ? isMover(o) : !isMover(o)));
    }
    dispose() { this.still?.dispose(); this.still = null; super.dispose(); }
    renderShadow(frame) {
      const { renderer, scene } = frame;
      // (its still world drawn again where the torch has gone to another flame, or when told: dirty())
      // (or its reach changed: the still depth is only good for the far it was drawn with)
      const at = this.light.getWorldPosition(_lp), far = this.light.distance || this.shadow.camera.far;
      if (!this.stillAt?.equals(at) || this.stillFar !== far) { this.stillDirty = true; (this.stillAt ||= new THREE.Vector3()).copy(at); this.stillFar = far; }
      if (this.stillDirty) {   // the still world, into its own map
        const map = this.shadowMap;
        this.shadowMap = this.still; this.pass = 'still';
        hidden(scene, (c) => c.userData.body);
        try { super.renderShadow(frame); } finally { shown(); this.shadowMap = map; this.pass = null; }
        this.stillDirty = false;
      }
      renderer.copyTextureToTexture(this.still.depthTexture, this.shadowMap.depthTexture, this.box);
      if (!this.keep) return;
      // what moves near it, over the copy (three's pass clears each face first: not this time)
      // (the warm-up: every body and everything that moves, wherever it is, so that every pipeline a
      // body is drawn into this kind of map with is made before play)
      const p = this.light.getWorldPosition(_lp), r2 = this.warmAll ? Infinity : ((this.light.distance || this.shadow.camera.far) + 2.5) ** 2;
      // (those that cast at all: near you, not a slime; the dead after the standing)
      const near = _near; near.length = 0;
      for (const c of scene.children) {
        if (!c.userData.body || !c.visible || !(this.warmAll || c.userData.casts)) continue;
        const d = c.position.distanceToSquared(p);
        if (d < r2) near.push([c.userData.down ? d * 9 + 1e4 : d, c]);
      }
      near.sort((a, b) => a[0] - b[0]);
      const kept = _kept; kept.clear();
      for (let i = 0; i < near.length && (this.warmAll || i < this.most); i++) kept.add(near[i][1]);
      hidden(scene, (c) => !(kept.has(c) || (c.userData.mover && !c.userData.body && c.position.distanceToSquared(p) < r2)));
      const clear = renderer.clear;
      renderer.clear = () => renderer;
      this.pass = 'live';
      try { super.renderShadow(frame); } finally { renderer.clear = clear; this.pass = null; shown(); }
    }
  }
  return (PS = { Still, Ranged, Kept });
}

/** (Call before anything is compiled or drawn: a light's shadowNode is read once, when its light node
 * is first set up.) The torches' shadow maps are kept (drawn again only when a torch moves to another
 * flame, or a crate breaks), so nothing that moves is drawn into them: a body standing by a torch when
 * its map was drawn left its shadow on the wall there after it had walked off, or died. WebGPU: their
 * shadow nodes skip movers (liveShadows gives them back their moving shadows); WebGL: a mover's draws
 * into them are emptied (onBeforeShadow, for those cameras only). */
export function stillShadows(lights) {
  lights = lights.filter((l) => l.castShadow && l.shadow);
  if (!lights.length) return;
  if (WEBGPU) {
    const P = pointShadows();
    if (!P) return;
    for (const l of lights) if (l.isPointLight && !l.shadow.shadowNode) l.shadow.shadowNode = new P.Still(l, l.shadow);
    return;
  }
  const cams = new Set(lights.map((l) => l.shadow.camera));
  const P = THREE.Mesh.prototype;
  P.onBeforeShadow = function (r, o, cam, shadowCamera, geometry) {
    if (cams.has(shadowCamera) && isMover(this)) { this._still = geometry.drawRange.count; geometry.drawRange.count = 0; }
  };
  P.onAfterShadow = function (r, o, cam, shadowCamera, geometry) {
    if (this._still !== undefined) { geometry.drawRange.count = this._still; this._still = undefined; }
  };
}

/** The spells' shadow-casting lights (WebGPU): bodies out of their reach aren't walked by their passes. */
export function rangedShadows(lights) {
  const P = pointShadows();
  if (P) for (const l of lights) if (l.isPointLight && l.castShadow && !l.shadow.shadowNode) l.shadow.shadowNode = new P.Ranged(l, l.shadow);
}

/** Bodies' shadows by the torches again (WebGPU), without the phantoms: a shadowed torch's node is
 * a Kept (its still world kept apart, what moves drawn over a copy of it). Each frame (update) the
 * `most` torches nearest you with a casting body in reach, where their light shows, take turns to be
 * drawn again (one a frame); one that's done is drawn once more without them. Its still world is drawn
 * again when the torch has gone to another flame, or when told (dirty: a crate broken by it). In
 * place of stillShadows for these lights; call before anything is compiled. */
export function liveShadows(torches, { most = 2, near = 30, bodies = 8 } = {}) {
  const P = pointShadows();
  if (!P) return null;
  const list = [];
  for (const l of torches) {
    if (!l.castShadow || !l.isPointLight) continue;
    const node = new P.Kept(l, l.shadow);
    node.most = bodies;
    l.shadow.shadowNode = node;
    list.push({ l, node, on: false, d: 0, any: false });
  }
  const want = [];
  let turn = 0;
  return {
    list,
    /** The warm-up (main.js): the first torch draws every body into its map (their pipelines are the
     * same for every torch); after it, all are drawn again as they are (without them). */
    warm(on) { if (list[0]) { list[0].node.warmAll = on; list[0].node.keep = on; } },
    /** Each frame, after the torches have gone to their flames and before the picture: `at` where you
     * are, `scene` for the bodies; `dark`: whether a torch's light shows at all (night, or under the
     * ground). The live ones take turns, one redrawn a frame (their bodies' shadows move at half the
     * frame rate, or a third). */
    update(at, scene, dark = true) {
      want.length = 0;
      for (const e of list) {
        e.d = e.l.intensity > 0 ? e.l.position.distanceTo(at) : Infinity;
        e.any = false;
        if (e.d < near) want.push(e);
      }
      if (want.length && dark && !this.off) {
        for (const c of scene.children) {
          if (!c.userData.body || !c.visible || !c.userData.casts) continue;
          for (const e of want) if (!e.any && c.position.distanceToSquared(e.l.position) < ((e.l.distance || e.l.shadow.camera.far) + 1) ** 2) e.any = true;
        }
      }
      want.sort((a, b) => a.d - b.d);
      const live = [];
      for (const e of want) if (!this.off && dark && e.any && live.length < most) live.push(e);
      const pick = live.length ? live[turn++ % live.length] : null;
      for (const e of list) {
        const on = live.includes(e);
        // (the one whose turn it is drawn with its bodies; one that has just stopped, once more without)
        if (e === pick || (!on && e.on)) { e.node.keep = on; e.l.shadow.needsUpdate = true; }
        else if (e.l.shadow.needsUpdate) e.node.keep = on;
        e.on = on;
      }
    },
    /** A torch's still world changed where it stands (a crate broken, a lid swung): drawn again. */
    dirty(l) { for (const e of list) if (e.l === l) e.node.stillDirty = true; },
  };
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

/** How many shader programs (WebGL) or render pipelines (WebGPU) have been made so far. */
export function programCount(renderer) {
  if (renderer.isWebGPURenderer) return renderer._pipelines?.caches?.size ?? renderer.info.memory?.programs ?? 0;
  return renderer.info.programs?.length ?? 0;
}

// ------------------------------------------------------------------ the picture's size
/** The picture's size in device pixels: the window's, times the device's pixels (capped), times the
 * player's resolution choice, times one of a few fixed steps (LEVELS) that the frames choose; and no
 * more than `maxPixels` in all.
 *
 * A step down only when the GPU is what holds a frame up (timed by the GPU's own timer where it has
 * one; otherwise, a long frame whose own work was short), two slow spells in a row; and if a step down
 * didn't help (a screen held to 30 a second, a frame the CPU holds up), it goes back and stays. Each
 * step re-makes the buffers, so they're few. */
export class Resolution {
  constructor({ touch }) {
    this.touch = touch;
    this.dpr = Math.min(devicePixelRatio || 1, touch ? 1.5 : 2);
    this.choice = Number(store('bm.res', '1')) || 1;   // 1, 0.75, 0.5
    this.maxPixels = touch ? 1.3e6 : 4.2e6;
    this.LEVELS = [1, 0.8, 0.65];
    this.level = 0; this.floor = this.LEVELS.length - 1;
    this.w = 2; this.h = 2;
    this.win = { n: 0, gap: 0, work: 0, gpu: 0, gpuN: 0 }; this.slow = 0; this.quick = 0; this.tried = null;
    this.timer = null; this.lockedAt = 0; this.lockFor = 30000; this.fails = {};   // (doubled before each use: 1, 2, 4 minutes)
  }

  get rs() { return this.LEVELS[this.level]; }
  set(level) { this.level = Math.max(0, Math.min(this.LEVELS.length - 1, level)); }
  /** The step nearest a scale k of the full size. */
  fit(k) { let best = 0; this.LEVELS.forEach((v, i) => { if (Math.abs(v - k) < Math.abs(this.LEVELS[best] - k)) best = i; }); return best; }

  size() {
    const cw = Math.max(1, innerWidth), ch = Math.max(1, innerHeight);
    let k = this.dpr * this.choice * this.rs;
    const px = cw * ch * k * k;
    if (px > this.maxPixels) k *= Math.sqrt(this.maxPixels / px);
    this.w = Math.max(2, Math.floor(cw * k)); this.h = Math.max(2, Math.floor(ch * k));
    return [this.w, this.h];
  }

  /** The GPU's own timer round each frame's drawing, where there is one: begin() before, end() after. */
  gpuTimer(renderer) {
    if (renderer.isWebGPURenderer) return this.gpuTimerWebGPU(renderer);
    const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const T = this.timer = { begin() {}, end() {} };
    if (!ext) return T;
    let q = null;
    const wait = [];
    T.begin = () => { if (q || wait.length > 2) return; q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); };
    T.end = () => {
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); wait.push(q); q = null; }
      while (wait.length && gl.getQueryParameter(wait[0], gl.QUERY_RESULT_AVAILABLE)) {
        const done = wait.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { this.win.gpu += gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6; this.win.gpuN++; }
        gl.deleteQuery(done);
      }
    };
    return T;
  }

  /** WebGPU's timestamps (every render pass's, a frame's summed by three), read back every few frames. */
  gpuTimerWebGPU(renderer) {
    const T = this.timer = { begin() {}, end() {} };
    if (!renderer.backend.trackTimestamp || !renderer.hasFeature?.('timestamp-query')) return T;
    let n = 0, busy = false;
    T.end = () => {
      if (busy || ++n % 8) return;
      busy = true;
      renderer.resolveTimestampsAsync('render').then((ms) => {
        if (ms > 0 && ms < 1000) { this.win.gpu += ms; this.win.gpuN++; }
      }).catch(() => {}).finally(() => { busy = false; });
    };
    return T;
  }

  /** A frame: `gap` ms since the last, `work` ms of it spent in the game's own code. Every second and
   * a half or so of play the step may change; true when the size should change. */
  frame(gap, work, playing) {
    if (!playing) { this.win = { n: 0, gap: 0, work: 0, gpu: 0, gpuN: 0 }; return false; }
    const W = this.win;
    W.n++; W.gap += Math.min(100, gap); W.work += work;
    if (W.n < 90) return false;
    const g = W.gap / W.n, wk = W.work / W.n, gpu = W.gpuN ? W.gpu / W.gpuN : null;
    this.win = { n: 0, gap: 0, work: 0, gpu: 0, gpuN: 0 };
    // a step down that didn't make frames quicker: back up, and no lower again for a minute
    // (each failure locks it out longer: one, two, four minutes; a second failure at a level, for good)
    if (this.tried && this.tried.level === this.level && g > this.tried.gap * 0.92) {
      const n = this.fails[this.level] = (this.fails[this.level] || 0) + 1;
      this.floor = this.level - 1; this.level--; this.tried = null;
      this.lockedAt = performance.now(); this.lockFor = n > 1 ? Infinity : Math.min(240000, this.lockFor * 2);
      return true;
    }
    this.tried = null;
    if (this.floor < this.LEVELS.length - 1 && performance.now() - this.lockedAt > this.lockFor) this.floor = this.LEVELS.length - 1;
    // slow: frames missing 60 a second, and (where the GPU can be timed) the GPU the reason (a screen
    // capped at 30 is found out by the trial step and the lock above)
    const gpuBound = g > 18.5 && (gpu != null ? gpu > 14 : wk < g * 0.55);
    const roomy = gpu != null ? gpu < 9.5 && g < 18 : g < 17.6;
    this.slow = gpuBound ? this.slow + 1 : 0;
    this.quick = roomy ? this.quick + 1 : 0;
    if (this.slow >= 2 && this.level < this.floor) { this.slow = 0; this.tried = { level: this.level + 1, gap: g }; this.level++; return true; }
    if (this.quick >= 3 && this.level > 0) { this.quick = 0; this.level--; return true; }
    return false;
  }
}

// ------------------------------------------------------------------ WebGPU: shaders not yet in TSL
/** Under WebGPU a GLSL ShaderMaterial can't be drawn (three draws a blank node material in its place,
 * which reads a colour it hasn't got, and the frame throws). Any still about under `roots` is hidden,
 * and named once in the console, so the rest of the world draws; one made later is caught by the
 * prototype's colour (drawn blank, not thrown). Returns how many were hidden. */
export function hideUnported(...roots) {
  if (!WEBGPU) return 0;
  if (!THREE.ShaderMaterial.prototype.color) THREE.ShaderMaterial.prototype.color = new THREE.Color(0, 0, 0);
  const seen = new Set();
  for (const root of roots) root?.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m?.isShaderMaterial || m.isNodeMaterial || seen.has(m)) continue;
      seen.add(m);
      m.visible = false;
    }
    for (const m of [o.customDepthMaterial, o.customDistanceMaterial]) if (m?.isShaderMaterial && !m.isNodeMaterial) { o.customDepthMaterial = o.customDistanceMaterial = undefined; }
  });
  if (seen.size) console.warn(`WebGPU: ${seen.size} GLSL ShaderMaterials hidden (not yet in TSL):`, [...seen].map((m) => m.name || m.type).slice(0, 20));
  return seen.size;
}

/** ?debugrender: which object makes a WebGPU frame throw. Every drawable under `scene` is hidden, then
 * shown in halves (its shadow maps redrawn each time) until the one that throws is found; names it
 * and its material, and puts everything back. */
export async function findBadDraw(renderer, scene, camera, target) {
  const all = [];
  scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) all.push(o); });
  const lights = []; scene.traverse((o) => { if (o.isLight && o.castShadow) lights.push(o); });
  const tryOn = (list) => {
    for (const o of all) o.visible = false;
    for (const o of list) o.visible = true;
    renderer._nodes?.nodeFrame?.update?.();   // (a new frame: shadow maps are drawn once a frame)
    for (const l of lights) l.shadow.needsUpdate = true;
    const was = renderer.getRenderTarget();
    try { renderer.setRenderTarget(target); renderer.render(scene, camera); return null; } catch (e) { return e; } finally { renderer.setRenderTarget(was); }
  };
  let list = all, found = [];
  if (!tryOn(list)) { for (const o of all) o.visible = true; return 'no failure'; }
  while (list.length > 1) {
    const a = list.slice(0, list.length >> 1), b = list.slice(list.length >> 1);
    if (tryOn(a)) list = a; else if (tryOn(b)) list = b; else { found = ['only together', a.length, b.length]; break; }
  }
  for (const o of all) o.visible = true;
  const o = list[0], m = [o.material].flat()[0];
  const err = tryOn([o]);
  for (const x of all) x.visible = true;
  const path = []; for (let p = o; p; p = p.parent) path.push(p.name || p.type);
  const info = { object: o.type, path: path.slice(0, 6).join(' < '), material: m?.type, name: m?.name, keys: Object.keys(m || {}).filter((k) => /Node$|map$|Map$/.test(k) && m[k]).join(','),
    defines: m?.defines, userData: Object.keys(m?.userData || {}).join(','), geometry: Object.keys(o.geometry?.attributes || {}).join(','), err: err?.message, found };
  console.error('bad draw:', JSON.stringify(info));
  return info;
}
