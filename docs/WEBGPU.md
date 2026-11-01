# Bellmourn on WebGPU

Bellmourn draws with one of two renderers, chosen in `index.html` before any module loads:

| | WebGPU | WebGL |
|---|---|---|
| three.js | r187 (`three.webgpu.js`, shares `three.core.js`) | r170 (`three.module.js`) |
| renderer | `WebGPURenderer` (WebGPU backend only) | `WebGLRenderer` |
| custom shaders | TSL node graphs (`src/fps/nodes.js` + each module's own) | GLSL (`onBeforeCompile`, `ShaderMaterial`) |
| post | `src/fps/post.js` (`RenderPipeline`) | three's `EffectComposer` (main.js `glComposer`) |

Which one: `?renderer=webgpu|webgl`, else Settings → Renderer (`localStorage bm.renderer`: auto, webgpu,
webgl). `auto` takes WebGPU on a computer that has it and keeps WebGL on a phone (until WebGPU has been
tried on real phones). A WebGPU start that fails (no adapter, three falling back to its WebGL2 backend)
sets `sessionStorage bm.nogpu` and reloads as WebGL.

Every module imports `three` as before; under WebGPU that is r187's WebGPU build, which has every core
class plus the node materials, `WebGPURenderer` and `THREE.TSL`. It has no `ShaderChunk`, `ShaderLib`
or `UniformsUtils`, and a `ShaderMaterial` under it draws as a blank `NodeMaterial` (with a console
error). So each custom shader has two forms:

```js
import { WEBGPU, T } from './nodes.js';   // T = THREE.TSL under WebGPU, null under WebGL
if (WEBGPU) { /* TSL */ } else { /* the GLSL, untouched */ }
```

## Rules for TSL in this game

1. **One graph per kind, shared.** A node's cache key is its own id, so a graph built afresh for each
   material is a separate shader and pipeline for each material (the first WebGPU boot made ~2,400 and
   took over ten minutes). Build each kind's graph once, at module level or in a `Map` keyed by
   whatever changes the generated code, and give it to every material of that kind. Per-material
   values come from the material being drawn:
   - `ref('userData.tile', 'float')` (nodes.js) — a dotted path into the drawn material.
   - `shared((material, object) => texture, likeTexture)` (nodes.js) — a texture node that follows the
     drawn material; use `.sample(uv)`, `.grad(dx, dy)`, `.level(n)` on it as on any texture node.
   Not `T.materialReference`: in a shadow pass three draws its own depth material with your
   `colorNode`'s alpha and your `positionNode` in it, and a material reference then reads three's
   material (no colour: the frame throws; no map: alpha-tested leaves stop casting shadows). `ref` and
   `shared` find the object's own material there (`sourceOf(frame)`).
   Values that change the code (a GLSL `#define`, a number baked into the source, a boolean branch)
   pick a variant from the cache; prefer turning baked numbers into material references (fewer
   pipelines to compile before play).
2. **Classic materials don't key their nodes.** A `MeshPhongMaterial` with `colorNode` set is
   converted to a node material when drawn, but its cache key ignores node properties: two of them
   with different graphs would share a shader. Use node materials (`MeshPhongNodeMaterial`,
   `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`, `SpriteNodeMaterial`, `PointsNodeMaterial`,
   `NodeMaterial`) for new materials; where a classic material must stay (other code holds it), call
   `keyed(m, 'kind-variant')` so its key names its graph.
3. **Uniforms the game sets through `{ value }`.** Use the TSL uniform itself as that object:
   `const u = T.uniform(0); material.userData.glow = u;` — game code doing `u.value = 1` keeps working.
   For a `ShaderMaterial` port, keep a `.uniforms` object of such nodes on the new material so callers
   (`mat.uniforms.time.value = t`) still work.
4. **Derivatives and branches.** WGSL allows implicit-derivative sampling (`texture(t, uv)`, `dFdx`)
   only in uniform control flow. Work gradients out before any `If`, and sample inside branches with
   `.grad(dx, dy)` or `.level(n)`.
5. **NaN.** Clamp before `pow`, `sqrt`, `log`; bloom spreads a NaN pixel into a black box.
6. **Fog.** Node materials take the scene's fog (`scene.fogNode`, nodes.js `fogNode`: range fog plus the
   graveyard's ground mist) unless `material.fog = false`. A port of a `ShaderMaterial` that applied
   `fog_fragment` itself gets it by leaving `fog` on.
7. **Before play, everything compiled.** `prepare()` compiles against the world pass's buffer
   (`composer.readBuffer`, 4x MSAA half float) and warms into `composer.warmTarget()`, which matches it:
   a WebGPU pipeline belongs to its target's formats and sample count. Materials made later (a spell,
   a severed limb) must reuse a warmed graph, or `programCount(renderer)` grows mid-fight.

8. **Refresh cost.** three refreshes every draw of a material that has any node of its own (its
   uniforms worked out and written again) every frame. A graph fed only by the drawn material's own
   values (`ref`, `shared`) needs that only when the draw is first made, so mark it `settled(node)`
   (nodes.js): three then treats its material like a plain one, and with `object.static = true` (the
   builders' meshes: main.js prepare) a draw costs almost nothing to repeat. So: **any uniform that
   changes over time and isn't a property of the drawn material (time, the sun, a glow the game sets)
   must be `.setGroup(T.renderGroup)`**, shared and updated once a render; otherwise a static draw keeps
   its first value. `SKY` (nodes.js) holds the sun's direction, colour and glow for every graph.

## The pieces

- `src/fps/nodes.js` — TSL helpers and rules (above); `fogNode` (range fog, the graveyard's ground mist,
  and haze that glows toward the sun or moon: `SKY`).
- `src/fps/post.js` — the composer: the world and arms in one 4x MSAA half-float pass, bloom, god rays
  (a half-size pass marching toward the sun's place on screen through the picture's bright sky), and
  one fused last pass (CAS sharpening, Neutral tone mapping, flash, vignette, contrast, hurt).
- `src/fps/sunshadow.js` — the sun's shadow in two maps: the still world's (4096 over 176 m) kept and
  redrawn an eighth of its casters a frame into a back map when you've walked 14 m or the sun has
  turned, then copied in; the moving things' (2048 over 56 m, about you) every frame; the light takes
  the darker. Both with a 16-tap Vogel-disk PCF on hardware comparisons. `?onemap` turns it off.
- `src/fps/cells.js` — the builders' static meshes (~4,000) in 40 m cells, each a render bundle the GPU
  replays: culled per cell against whichever camera draws (world, sun, torches), re-recorded only when a
  piece in it is shown, hidden or stops casting. This took the CPU from 16.8 to 10.2 ms a frame (mean of
  the nine bench views at 1080p; WebGL: 16.3). `?nocells` turns it off.
- `src/fps/engine.js` — `makeRenderer` (WebGPU or WebGL), `hideUnported` (a GLSL ShaderMaterial still
  about under WebGPU is hidden and named in the console, not thrown on), `findBadDraw` / `?debugrender`
  (which object makes a frame throw), `programCount` (pipelines under WebGPU).

## TSL quick reference (r187)

- Inline functions: `Fn(() => { const v = vec3(0).toVar(); If(c, () => { v.assign(x); }); return v; })()`
  is inlined (no WGSL function unless `.setLayout()`), so it can use any node from outside.
- Material hooks (node materials): `colorNode` (replaces map × colour; vertex colours and opacity are
  applied after), `opacityNode`, `alphaTestNode`, `normalNode`, `emissiveNode`, `positionNode`
  (replaces `positionLocal` AFTER morphs, skinning, batching and instancing: an instanced mesh's
  `positionLocal` already has its instance matrix in it, unlike GLSL's `transformed`; the raw vertex
  is `positionGeometry`), `roughnessNode`,
  `metalnessNode`, `outputNode` (after lighting and fog), `fragmentNode` (replaces everything),
  `vertexNode` (clip position), `castShadowPositionNode`, `maskNode`.
- Varyings: `varying(node)` or `vertexStage(node)` move a vertex-stage value to the fragment.
- Attributes: `attribute('edge', 'float')`; instancing: `instanceIndex`; skinning is automatic.
- Built-ins: `positionLocal`, `positionWorld`, `positionView`, `normalLocal`, `normalWorld`,
  `normalView`, `cameraPosition`, `uv()`, `screenUV`, `time` (seconds, from three's frame loop),
  `modelWorldMatrix`, `cameraProjectionMatrix`, `modelViewMatrix`.
- The r187 source is the reference: `node_modules`-style copy in a session scratchpad, or
  https://cdn.jsdelivr.net/npm/three@0.187.0/src/ (TSL exports: `src/nodes/TSL.js`).

## Traps found on the way

- WebGPU's clip depth is 0..1; three rebuilds each camera's projection for it (`updateProjectionMatrix`).
  A hand-made projection (the arms' camera, viewmodel.js) must build it for `camera.coordinateSystem`.
- three advances its node frame (what "once a frame" nodes, shadow maps and the world pass go by) only
  from its own animation loop; post.js steps it on each `composer.render()`, and test scripts stepping
  the game by hand must too (`renderer._nodes.nodeFrame.update()`), or lights and passes keep their
  first values.
- three never resolves multisampled depth under WebGPU: the world pass's depth texture is empty. Effects
  that need depth (AO, depth-tested god rays) need it written to a colour target (MRT) first.
- WGSL's `%` rounds toward zero (GLSL's `mod` floors); TSL `select()` becomes a branch, so sample both
  textures before it.

## Testing

- `tools/gpu_bench.js`: the same nine views under either renderer, stepped by hand, uncapped; ms per
  frame, CPU ms, the picture's CPU share, GPU ms (timer query / timestamps), draw calls, triangles,
  and a shot of each view. In the page: `(await import('/tools/gpu_bench.js')).bench('wgpu')`.
- Headless Chrome on the real GPU (WebGPU works headless on Windows with `--enable-unsafe-webgpu`
  not even needed; the page must be a secure context, i.e. `http://127.0.0.1`).
