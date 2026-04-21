# Solar System Simulator — Stack Research Report

**Date:** 2026-04-21
**Scope:** Extensive research-only survey of 2026 best-practice stacks for rebuilding this solar-system simulator. 15 parallel research agents + 4-persona council + red-team.
**Sources:** Primary 2024-2026 — GitHub releases, arxiv, GDC/CitizenCon talks, official engine docs, JPL/NAIF docs, WebKit/Mozilla/Chrome release notes, Rein (2024) JoVI paper.
**Current sim:** `~/Projects/solar-system-sim/index.html` — single file, ~3,700 LOC, Three.js r0.168, Keplerian + PBD physics, live at solar-system-sim-1osz.vercel.app.

---

## TL;DR

| Rank | Approach | One-line take |
|---|---|---|
| **1. #1 PICK** | **Evolve** — Three.js r182 + WebGPU + TSL + VSOP87-in-worker + Spark splats + optional WebXR | Highest leverage, ~2 weeks, preserves working code, rides 2026 WebGPU wave |
| **2. DARK HORSE** | **Science-grade** — Three.js + REBOUND-WASM + pre-baked DE440s Chebyshev | Only stack with a genuine credibility moat; composes onto #1 as opt-in mode |
| 3 | **Componentize** — R3F v9 + Drei + Zustand + Leva + Rapier | Best DX but quarterly pmndrs re-pinning tax, reactive overhead risk at 60 Hz |
| 4 | **Native-first** — Bevy 0.18 + big_space + wgpu | Right architecture for a different sim (10k+ entities, desktop flagship) |
| 5 | **Cinematic AAA** — Unreal 5.6 + Cesium-for-Unreal + Lumen + Nanite | Strictly dominated: LWC still insufficient at 40 AU, no viable web target |

**Recommended action:** ship #1 now, layer #2 as opt-in "Science Mode" in month 2. All others fail a web-delivery constraint or a solo-dev velocity constraint.

---

## How the research was conducted

**Wave 1 — Landscape scan (9 parallel agents):**
Web 3D engines · Native game engines · Space-game case studies · Scientific orbital stacks · Educational sims · GPU compute + differentiable physics · Scale/precision techniques · Web 3D meta-frameworks · ECS / data-oriented engines.

**Wave 2 — Deep dives (6 parallel agents):**
Rust/wgpu/WASM reality check · Pixel-streaming vs WebGL economics · Gaussian splatting + neural rendering · WebXR / Vision Pro · AAA engine internals (StarEngine, COBRA, NMS) · Hybrid ephemeris pipelines.

**Wave 3 — Adversarial synthesis:** 4-persona council (GameEngineArchitect, ScientificSimResearcher, WebPlatformPragmatist, XRFuturist) ranked the 5 candidates; red-team identified 2 hidden failure modes per approach.

---

## Approach 1 — Evolve (Three.js r182 + WebGPU + TSL + VSOP87 + Spark) ★ #1 PICK

### Stack
| Layer | Choice |
|---|---|
| Rendering | **Three.js r182** (Dec 2025) with `WebGPURenderer` + TSL; WebGL fallback |
| Physics | **Astronomy Engine** (cosinekitty, ~200 KB, pure JS VSOP87-truncated) in a **Web Worker** |
| Scale | Keep AU-space + render-scale (already peer to Star Citizen zone model) |
| Visual hero assets | **Spark 2.0** Gaussian-splat renderer for asteroid/comet props (Bennu, 67P from NASA PDS imagery) |
| Immersive | Optional **WebXR** mode — Vision Pro Safari 26.2 + Quest 3/3S — 2-5 days to add |
| Deploy | Vercel static, no build step, auto-deploy from `main` |
| Language | JS/TS (stay) |

### Reference projects / users
- Three.js WebGPURenderer production-ready since r171 (Sept 2025); 2.7M weekly npm downloads; dominant WebGPU adoption.
- NASA Eyes on the Solar System (eyes.nasa.gov) uses a custom WebGL engine — same tier as this sim.
- Spacekit.js (Ian Webster, MIT) — powers Asterank, Meteor Showers, Ancient Earth.
- jsOrrery uses VSOP87; arcminute-class accuracy.
- Spark 2.0 (sparkjs.dev) ships Three.js-native LoD streaming.

### Ratings
- **Physics fidelity:** 8/10 — arcminute planetary positions (VSOP87 truncated), Keplerian+PBD preserved.
- **Visual fidelity:** 9/10 — WebGPU compute for ring particles/atmospheres, Spark splats for asteroids, native HDR.
- **Reach:** web + mobile + Vision Pro + Quest + desktop browser. Single URL distribution.
- **Velocity:** days to minutes iteration. HMR in JS. No build step.
- **Time-to-first-pixel:** ~2 weeks for full migration; r168→r182 upgrade alone is a day.

### Top-3 risks (red team)
1. **WebGPU log-depth trap** — Three.js issues #29810, #29797. Current log-depth breaks on WebGPURenderer in 2026. Mitigation: dual-renderer CI screenshot tests from day one; hold WebGL fallback for 6+ months.
2. **TSL reverse-lock** — porting hero shaders (atmosphere, ring scattering, comet tail) to TSL couples you to Three.js monthly releases. Keep raw-GLSL paths for critical shaders until TSL API freezes.
3. **Mobile WebGPU regressions** — Safari 26 ships WebGPU but Android Firefox/Linux still pending through 2026. Keep the WebGL path as auto-fallback.

### Migration cost from current single-file sim
**~2 weeks for a solo dev.** Bump importmap to `three@0.182`; swap `WebGLRenderer` → `WebGPURenderer` behind `?renderer=webgpu` flag; port hot shaders to TSL incrementally; move Kepler propagation into a Web Worker (single `postMessage` tick, Transferable Float32Array); replace Halley comet + asteroid placeholders with Spark 2.0 splats of 67P and Bennu; add `renderer.xr.enabled` + `@three/xr` controllers behind "Enter VR" button.

### Best-fit persona
The solo developer with a live working sim who wants **maximum leverage with minimum disruption** — preserve 3,700 LOC of working code, ride the 2026 WebGPU adoption curve for free, keep Vercel free-tier economics, unlock WebXR as a zero-competitor spatial differentiator.

### Primary sources
- Three.js r182 release: https://github.com/mrdoob/three.js/releases/tag/r182
- WebGPURenderer docs: https://threejs.org/docs/pages/WebGPURenderer.html
- TSL field guide (Heckel): https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/
- Astronomy Engine: https://github.com/cosinekitty/astronomy
- Spark.js (3DGS for Three.js): https://sparkjs.dev
- WebGPU browser support: https://web.dev/blog/webgpu-supported-major-browsers
- Safari 26.2 WebXR+WebGPU: https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
- Meta Quest WebXR: https://developers.meta.com/horizon/documentation/web/webxr-overview/

---

## Approach 2 — Componentize (R3F v9 + Drei + Zustand + Leva + Rapier)

### Stack
| Layer | Choice |
|---|---|
| Rendering | **React Three Fiber v9** (Dec 2025, requires React 19) + **Drei** helpers |
| State | **Zustand** (primary) + **Leva** for tunable-parameter UI |
| Physics | Astronomy Engine worker (same as #1); optional `@react-three/rapier` for collisions |
| Immersive | `@react-three/xr` |
| Deploy | Next.js 15 on Vercel with `dynamic(() => import('./Scene'), { ssr: false })` |
| Language | TypeScript + React 19 |

### Reference projects / users
- lusion.co (agency portfolio, R3F + custom shaders)
- Flux CAD editor (engineering drawings, heavy GPU)
- Galaxy Voyager (220+ procedural star systems — directly comparable)
- Zillow 3D home tours
- pmndrs ecosystem (~15+ production sites)

### Ratings
- **Physics fidelity:** 8/10 — same propagator as #1.
- **Visual fidelity:** 9/10 — same Three.js under the hood.
- **Reach:** same as #1, + easier SSR'd share-links.
- **Velocity:** best-in-class DX once ramped; Leva replaces hand-rolled UI panels.
- **Time-to-first-pixel:** ~3-4 weeks to port 3,700 imperative LOC.

### Top-3 risks
1. **pmndrs pinning treadmill** — quarterly re-pinning across `fiber`, `drei`, `rapier`, `xr`, `postprocessing` as React evolves. Solo-dev tax of ~weekend/quarter.
2. **Reactive overhead at 60 Hz boundary** — Zustand state ticking each frame either re-renders or bypasses React (via `useFrame` + refs), at which point the componentization thesis partially collapses.
3. **Bundle bloat** — React 19 + R3F + Drei + Leva adds ~150-250 KB over vanilla Three.js.

### Migration cost
**~3-4 weeks.** Bodies become `<Body/>` components, RAF → `useFrame`, globals → Zustand stores. Shader + orbital math ports line-for-line. Next.js scaffold. Lose the single-file property.

### Best-fit persona
The builder who plans to add **multi-scene, saved states, shareable deep-links, landing page, and SSR** — i.e., productizing the sim beyond a single visualization.

### Primary sources
- R3F v9 migration guide: https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide
- pmndrs React Three Next starter: https://github.com/pmndrs/react-three-next
- `react-three/rapier`: https://github.com/pmndrs/react-three-rapier

---

## Approach 3 — Science-grade (REBOUND-WASM + DE440s + Three.js) ★ DARK HORSE

### Stack
| Layer | Choice |
|---|---|
| Rendering | **Three.js** (lean, stay r182) |
| Physics | **REBOUND compiled to WASM** via Emscripten — Rein (2024) JoVI paper |
| Integrators | IAS15 (machine precision), WHFast (symplectic long-term) |
| Ephemeris | **JPL DE440s** Chebyshev kernels (~31 MB) pre-sampled to binary JSON via Skyfield offline pipeline |
| Data bakery | Python script (Skyfield + jplephem) runs CI; exports static `ephemeris.bin` |
| Deploy | Vercel edge caching + `Range` requests for time-windowed ephemeris chunks |
| Language | JS + WASM |

### Reference projects / users
- **REBOUND**: Rein et al., thousands of exoplanet/solar-system papers; used for TRAPPIST-1, Planet Nine, asteroid close-approaches.
- **Rein 2024 paper** (Journal of Visualization and Interaction) — `hannorein.github.io` runs REBOUND examples in the browser today.
- **Artemis-II-tracker** (Javilop) — the cleanest Python-Horizons-to-JSON-to-Three.js reference.
- NASA uses SPICE/DE440 for actual spacecraft navigation.

### Ratings
- **Physics fidelity:** **10/10** — sub-km positions, JPL ground-truth-grade. This is the only approach on the list with a genuine scientific credibility moat.
- **Visual fidelity:** 8/10 — same Three.js as #1.
- **Reach:** web + Vercel, with a caveat (see risk #1).
- **Velocity:** moderate; adds an offline bakery pipeline.
- **Time-to-first-pixel:** ~3-4 weeks (WASM integration + bakery + data-streaming UI).

### Top-3 risks
1. **31 MB asset cliff** — pre-baked DE440s doesn't gzip well. Need chunked Range-request ephemeris streaming; educational users on slow networks may bounce. Mitigation: DE440s-century-subset + aggressive cubic-Hermite interp = ~3-5 MB is realistic.
2. **Accuracy paradox vs render-scale** — sub-km science positions visible against planets rendered 1000× oversized creates "Io inside Jupiter" moments; need a separate "realistic-scale" mode (which NASA Eyes does) to avoid credibility backfire.
3. **REBOUND visualization coupling** — REBOUND's Emscripten build has its own WebGL renderer; pulling particle state cleanly into your Three.js scene requires ~3-5 days of integration work.

### Migration cost
**~3-4 weeks.** Compile REBOUND to WASM (recipe in the Rein 2024 paper); write offline ephemeris bakery (Python + Skyfield); add interpolation layer in JS; gate behind "Science Mode" toggle. **Composes onto Approach 1** — recommended ship path is Approach 1 first, then Approach 3 as opt-in mode.

### Best-fit persona
The educator or researcher who wants to claim **"real physics, real ephemeris"** — turning the sim from a toy into something a planetary-science curriculum can legitimately assign. This is a market position no other public-web solar sim currently occupies.

### Primary sources
- Rein 2024 REBOUND WASM paper: https://www.journalovi.org/2024-rein-rebound/
- REBOUND: https://github.com/hannorein/rebound
- JPL DE440/441 paper: https://ssd.jpl.nasa.gov/doc/Park.2021.AJ.DE440.pdf
- Skyfield: https://rhodesmill.org/skyfield/
- Artemis-II-tracker reference: https://github.com/Javilop/artemis-ii-tracker
- SpiceyPy: https://spiceypy.readthedocs.io/

---

## Approach 4 — Native-first (Bevy 0.18 + big_space + wgpu)

### Stack
| Layer | Choice |
|---|---|
| Rendering | **wgpu 26** (native Vulkan/Metal/DX12; WebGPU fallback via WASM) |
| Engine | **Bevy 0.18** (Jan 2026) ECS |
| Scale | **big_space 0.12** crate — hierarchical grid + floating origin in f64 |
| Physics | Custom Rust orbital systems (n-body if wanted); **Rapier** for rigid-body |
| Desktop | Steam release via standard `cargo build --release` |
| Web | `wasm32-unknown-unknown` target as 2nd-class |
| Language | Rust |

### Reference projects / users
- **Tiny Glade** (Steam, Sept 2024) — Bevy ECS + custom renderer; strongest commercial case study.
- Foresight Spatial Labs.
- No headline solar-system sim has shipped on Bevy through April 2026 (flagged uncertain).

### Ratings
- **Physics fidelity:** 9/10 — f64 native, ECS makes SIMD trivial for N-body.
- **Visual fidelity:** 8/10 — wgpu is modern, but shader ecosystem smaller than Three.js.
- **Reach:** desktop-first + web 2nd-class; no easy mobile or Vision Pro path.
- **Velocity:** slow. Rust compile 60-180s clean, 2-6s incremental; quarterly Bevy 0.x breaking API migration.
- **Time-to-first-pixel:** full rewrite, ~8-12 weeks.

### Top-3 risks
1. **Bundle size** — Bevy WASM brotli is ~6-7 MB vs ~300 KB for Three.js app. 20-40× penalty kills web-first LCP and SEO.
2. **Bevy 0.x quarterly breakage** — big_space is a third-party crate; out-of-sync update tempo means broken builds at upstream bumps. Solo-dev graveyard pattern.
3. **Web companion always trails desktop** — WASM renderer features lag 6-12 months (compute shaders, indirect draw); visual parity promise fails.

### Migration cost
**~8-12 weeks full rewrite.** All JS physics, UI, tests replaced. No code reuse.

### Best-fit persona
The founder of a *different* product — one targeting **10,000+ asteroid belt sims, native desktop Steam release, long-term platform ownership**, with a team willing to ride Bevy's 0.x pre-1.0 breakage. Wrong fit for the current single-dev, web-first, 18-entity sim.

### Primary sources
- Bevy 0.18 release: https://bevy.org/news/bevy-0-18/
- big_space crate: https://github.com/aevyrie/big_space
- Bevy web size guide: https://bevy-cheatbook.github.io/platforms/wasm/size-opt.html
- jms55's candid Bevy-at-5 retrospective: https://jms55.github.io/posts/2025-09-03-bevy-fifth-birthday/

---

## Approach 5 — Cinematic AAA (Unreal 5.6 + Cesium-for-Unreal + Lumen + Nanite)

### Stack
| Layer | Choice |
|---|---|
| Engine | **Unreal Engine 5.6** (June 2025) with Large World Coordinates |
| Rendering | **Lumen** (GI), **Nanite** (micro-geometry), virtual shadow maps |
| Scale | LWC doubles, + **scaled-space layer** mandatory (LWC caps at ~0.6 AU / 88M km — Pluto is 40 AU) |
| Geodesy | **Cesium-for-Unreal** for real-Earth framing, world-anchors |
| Physics | Chaos + custom orbital C++ |
| Deploy | Steam desktop; optional **Pixel Streaming** at $250–25K/mo per 1-10K MAU |
| Language | C++ + Blueprints |

### Reference projects / users
- The Expanse: Osiris Reborn (UE5).
- No solar-system title confirmed on UE 5.x through April 2026 (flagged uncertain).

### Ratings
- **Physics fidelity:** 7/10 — LWC doubles help, but scaled-space rewrite reintroduces current sim's existing complexity.
- **Visual fidelity:** **10/10** — Nanite/Lumen are genuinely unmatched for cinematic fidelity.
- **Reach:** desktop only. Web = pixel streaming, which is economically non-viable for free educational sim (~$250-25K/month at current-sim traffic).
- **Velocity:** weakest. C++ build times, Blueprint churn, engine migrations across 5.6→5.7.
- **Time-to-first-pixel:** ~12-16 weeks from scratch.

### Top-3 risks
1. **LWC insufficient at solar scale** — 88M km is 0.6 AU; Pluto at 40 AU still needs scaled-space (same architecture as current sim). Headline feature doesn't solve the real problem.
2. **No viable web target** — Pixel Streaming = $0.526/hr per GPU, ~1 stream per T4; 1000 concurrent = $50-150K/month. Free educational distribution is dead.
3. **Solo-dev capacity** — UE 5.6 is not realistic for one developer with the current sim's scope on anything approaching "weeks."

### Migration cost
**~12-16 weeks full rewrite.** Lose URL-based distribution permanently.

### Best-fit persona
A funded studio of 3+ engineers building a **cinematic AAA space game** where production values matter more than distribution reach, and desktop Steam is the product.

### Primary sources
- UE 5.6 release: https://forums.unrealengine.com/t/unreal-engine-5-6-released/2538952
- Large World Coordinates: https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5
- Cesium-for-Unreal: https://cesium.com/platform/cesium-for-unreal/
- Pixel Streaming at scale (AWS): https://aws.amazon.com/blogs/gametech/deploy-unreal-engines-pixel-streaming-at-scale-on-aws/

---

## Comparison matrix

| Criterion | 1 Evolve | 2 Componentize | 3 Science★ | 4 Bevy | 5 Unreal |
|---|---|---|---|---|---|
| **Rendering fidelity** | 9 | 9 | 8 | 8 | 10 |
| **Physics fidelity** | 8 | 8 | **10** | 9 | 7 |
| **Reach (platforms)** | web+XR+mobile | web+XR+mobile | web+XR+mobile | desktop+web* | desktop only |
| **Bundle size (brotli)** | ~300 KB | ~500 KB | ~800 KB + 5 MB data | ~6-7 MB | N/A |
| **Solo-dev velocity** | high | medium | medium | low | very low |
| **Migration weeks** | 2 | 3-4 | 3-4 | 8-12 | 12-16 |
| **Reuses current 3,700 LOC** | **~95%** | ~70% | ~90% | 0% | 0% |
| **Preserves Vercel URL** | yes | yes | yes | yes (degraded) | **no** |
| **WebXR path** | 2-5 days | 2-5 days | 2-5 days | future | no (Pixel Stream) |
| **Differentiation moat** | WebGPU + XR | DX + UI polish | **JPL-grade credibility** | 10k+ entities | cinematic visuals |
| **Cost at 10K MAU** | ~$0 (Vercel) | ~$0 | ~$50 (edge cache) | ~$0 | ~$25K/mo |

\* Bevy web build trails native by 6-12 months on renderer features.

---

## Recommendation

**Ship Approach 1 (Evolve) first, in ~2 weeks.** The r168→r182 bump + WebGPURenderer + TSL migration + VSOP87 worker + optional WebXR toggle is the highest-leverage work in any Three.js codebase in 2026. It preserves your 3,700 lines of working Keplerian+PBD code, keeps the Vercel free-tier URL, and opens WebXR — where **True-Scale Walk has no competitor in immersive form** — for roughly 5 days of incremental work.

**Then, in month 2, layer Approach 3 (Science-grade) as an opt-in "Science Mode."** REBOUND-WASM + a DE440s ephemeris bakery turns the sim from "pretty" into "research-grade" — a credibility moat no other public-web solar viz currently occupies (not NASA Eyes, not Stellarium-Web, not Spacekit). This is the dark horse: nobody expects it, it composes onto #1 rather than replacing it, and it unlocks an audience (educators, amateur astronomers, curriculum adopters) the visual approaches can't reach.

**Do not rewrite.** Approaches 2, 4, and 5 all require discarding working code. #2 is a lateral move paying a forever-tax on pmndrs churn. #4 is architecturally right for a *different product* (10k+ asteroids, Steam-native). #5 is strictly dominated — its headline feature (LWC) doesn't solve the 40 AU problem, and its web distribution requires $250-25K/month streaming economics that make free educational distribution impossible.

---

## Surprising findings (what the research actually turned up)

1. **NASA Eyes uses a custom WebGL engine**, not a game engine — meaning this sim is already in the correct tier; no "real pros use Unity" comeback.
2. **REBOUND already runs in the browser via WASM** (Rein 2024 paper with shipped demos) — the "science-grade in a browser" door is open, and nobody in the public-edu space has walked through it.
3. **Bevy web builds are 20-40× larger than Three.js apps** — the Rust rewrite thesis breaks on bundle math before it breaks on anything else.
4. **Unreal's LWC caps at 0.6 AU** — the most advertised "large-world" feature in the industry doesn't reach Mars without a second layer you already have in this sim.
5. **Safari 26.2 shipped WebXR + WebGPU on Vision Pro** — a 2-5 day WebXR add-on turns this into a cross-device spatial experience.
6. **Gaussian splatting works for asteroid/comet props but fails for planets** (view-dependent radiance breaks at orbital distances) and fails for nebulae (volumetric). Use it narrowly for Bennu/67P hero assets.
7. **Pixel-streaming Unreal = $250-25K/month per 1-10K MAU** vs $0-200 for web-native. Kills the free educational distribution model.
8. **KSP2's failure teaches:** own your simulation stack. Intercept didn't. You do. Don't give that up.

---

## Appendix: full source list

Three.js r182 release · https://github.com/mrdoob/three.js/releases/tag/r182
Three.js WebGPURenderer docs · https://threejs.org/docs/pages/WebGPURenderer.html
TSL field guide · https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/
Three.js log-depth WebGPU issue #29810 · https://github.com/mrdoob/three.js/issues/29810
Babylon.js 8 · https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/
Babylon.js 9 · https://babylonjs.medium.com/welcome-to-babylon-js-9-0-c3edc9ee6428
PlayCanvas Engine · https://github.com/playcanvas/engine
WebGPU browser support · https://web.dev/blog/webgpu-supported-major-browsers
WebGPU caniuse · https://caniuse.com/webgpu
Safari 26.2 features · https://webkit.org/blog/17640/webkit-features-for-safari-26-2/
Unity 6 release · https://unity.com/releases/unity-6
Unity WebGPU (experimental) · https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html
Unreal 5.6 release · https://forums.unrealengine.com/t/unreal-engine-5-6-released/2538952
Unreal LWC docs · https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5
Godot 4.3 web export progress · https://godotengine.org/article/progress-report-web-export-in-4-3/
Godot large world coords · https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html
Bevy 0.18 release · https://bevy.org/news/bevy-0-18/
big_space crate · https://github.com/aevyrie/big_space
Bevy WASM size guide · https://bevy-cheatbook.github.io/platforms/wasm/size-opt.html
Bevy-at-5 retrospective (jms55) · https://jms55.github.io/posts/2025-09-03-bevy-fifth-birthday/
wgpu-rs · https://wgpu.rs/
Rein 2024 REBOUND-WASM paper · https://www.journalovi.org/2024-rein-rebound/
REBOUND · https://github.com/hannorein/rebound
JPL Horizons API · https://ssd-api.jpl.nasa.gov/doc/horizons.html
JPL DE440 paper · https://ssd.jpl.nasa.gov/doc/Park.2021.AJ.DE440.pdf
Skyfield · https://rhodesmill.org/skyfield/
SpiceyPy · https://spiceypy.readthedocs.io/
Astronomy Engine · https://github.com/cosinekitty/astronomy
Spacekit.js · https://github.com/typpo/spacekit
jsOrrery · https://github.com/mgvez/jsorrery
Artemis-II-tracker · https://github.com/Javilop/artemis-ii-tracker
Stellarium Web Engine · https://github.com/Stellarium/stellarium-web-engine
NASA Eyes · https://science.nasa.gov/eyes/
Outerra log depth · https://outerra.blogspot.com/2009/08/logarithmic-z-buffer.html
Cesium hybrid multi-frustum · https://cesium.com/blog/2018/05/24/logarithmic-depth/
Star Citizen 64-bit engine (Tracy) · https://gamersnexus.net/gg/2622-star-citizen-sean-tracy-64bit-engine-tech-edge-blending
CitizenCon Gen12 Vulkan · https://www.youtube.com/watch?v=SV9_chUpDgc
No Man's Sky continuous world (GDC) · https://www.gdcvault.com/play/1024265
Elite Dangerous Stellar Forge · https://www.space.com/31366-elite-dangerous-stellar-forge-interview.html
Outer Wilds N-body design (GDC) · https://gdconf.com/article/see-the-4d-level-design-of-outer-wilds-deconstructed-at-gdc-2020
R3F v9 migration · https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide
react-three-rapier · https://github.com/pmndrs/react-three-rapier
pmndrs Next starter · https://github.com/pmndrs/react-three-next
Threlte 8 · https://threlte.xyz/blog/threlte-8/
Spark 2.0 (3DGS) · https://sparkjs.dev
Khronos KHR_gaussian_splatting · https://cgchannel.com/2026/02/3d-gaussian-splats-are-being-added-to-the-gltf-standard/
Brush 3DGS trainer · https://github.com/ArthurBrussee/brush
Meta WebXR · https://developers.meta.com/horizon/documentation/web/webxr-overview/
Interop 2026 WebXR · https://github.com/web-platform-tests/interop/issues/1021
Unity XRI visionOS · https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/samples-vision-os.html
Pixel Streaming at scale (AWS) · https://aws.amazon.com/blogs/gametech/deploy-unreal-engines-pixel-streaming-at-scale-on-aws/
Vagon Streams pricing · https://vagon.io/streams/pricing
bitECS · https://github.com/NateTheGreatt/bitECS
Flecs · https://github.com/SanderMertens/flecs
EnTT · https://github.com/skypjack/entt
nyx-space · https://github.com/nyx-space/nyx
dSGP4 differentiable SGP4 · https://arxiv.org/html/2402.04830v3

---

*Report generated 2026-04-21 from 15 parallel research agents + 4-persona council + red-team synthesis. PRD trace at `~/.jarvis/MEMORY/WORK/20260421-000500_solar-sim-stack-research/PRD.md`.*
