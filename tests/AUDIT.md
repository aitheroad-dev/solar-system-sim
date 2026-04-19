# Solar System Sim — Code Audit

Date: 2026-04-18
File under audit: `/Users/yaronkra/projects/solar-system-sim/index.html` (2,960 lines after test hook)

## 1. Structural overview

**Single-file Three.js module-tagged script. Architecture:**

```
<style> — ~310 lines of CSS (tokens, panels, controls, overlays)
<script type="importmap"> — Three.js r0.168 via esm.sh
<body>
  <canvas> + panels (HUD, controls, search, time-jumps, help, info, PBD overlay, rock hint)
<script type="module">
  ├── Data:              BODIES (lines 579-), MOONS, COMET, belt consts
  ├── Constants:         SUN_/EARTH_ radius/diameter
  ├── Physics helpers:   planetRadius, orbitDistance, orbitScale, solveKepler, keplerPosition
  ├── Texture loaders:   loadTexture, proceduralTexture, proceduralMoonTexture, buildCoronaTexture
  ├── Scene setup:       canvas, renderer, scene, camera, camState, lights
  ├── Render state:      bodyObjects, orbitLines, sunShaderMat, beltObjects, cometObj
  ├── Build functions:   buildScene, buildBody, buildOrbitLine, buildMoons, buildBelts, buildComet, buildTrails, buildProbes
  ├── Simulation step:   updateBodies, updateBelts, updateTrails, updateRocks, updateProbes
  ├── Camera control:    applyCamera, updateCameraFocus, updateCameraTween, updateFlyCamera
  ├── Interaction:       dragging, wheel, keydown (3 listeners), search, click (rocks)
  ├── UI handlers:       speed slider, pause, orbits, trails, shadows, scale, today, time jumps
  ├── Feature modules:   PBD (runPaleBlueDot…), Drop-a-Rock (toggleRockMode, spawnRock…),
  │                      Probes (buildProbes, interpolateProbePosition…), Focus-pull (startCameraTween…)
  ├── HUD:               updateHUD, updateInfoPanel, formatDate, formatMass
  └── Test hook:         window.__test (read-only accessors)
```

## 2. Global state inventory

| Name | Type | Purpose | Mutability |
|------|------|---------|-----------|
| `bodyObjects` | const object | name → {group, pivot, mesh, radius, data} | inserted-at-build |
| `orbitLines` | const array | ellipse geometries | grows/shrinks at scale toggle |
| `sunShaderMat` | let | shader material for uTime updates | set once |
| `cometObj` | let | Halley object | set once |
| `beltObjects` | const | instance transforms for belts | populated at build |
| `asteroidMesh`, `kuiperMesh` | let | InstancedMesh handles | rebuilt on scale toggle |
| `camState` | const object | dist/az/polar/target/focus | mutated each frame |
| `cameraTween` | let | active tween or null | set/cleared by focus |
| `simDays` | let | simulation epoch offset | mutated each frame |
| `paused`, `speedMultiplier` | let | time controls | user input |
| `scaleMode` | let | "compressed"/"real" | toggle |
| `pbdActive`, `pbdState` | let | PBD sequence | cycle |
| `rockMode`, `rocks` | let/const | sandbox state | grows/shrinks |
| `probeObjects`, `probesVisible` | const/let | trajectories | built once, toggle |
| `flyMode`, `flyKeys`, `flyVelocity` | let/const | V-mode camera | cycles |

All state is module-local — no leaks into `window` except the opt-in `__test` hook.

## 3. Event listener inventory

| Target | Event | Handler owner | Notes |
|--------|-------|---------------|-------|
| canvas | pointerdown / pointerup / pointercancel / pointerleave / pointermove | drag system | correctly registered + endDrag unwires |
| canvas | wheel | zoom | preventDefault guard |
| canvas | click | rock shift+click | only acts on shiftKey+rockMode |
| window | keydown | unified handler | handles space, F, /, V, WASDQE, 1-9, Escape (PBD/rock) |
| window | keyup | fly-key release | |
| window | resize | camera aspect | via onResize |
| Pill `[data-focus]` | click | focusBody | one listener per button |
| `.jumpBtn[data-jump]` | click | time jump | one listener per button |
| shadowBtn / orbitsBtn / trailsBtn / scaleBtn / todayBtn / pauseBtn | click | respective toggle | single listener each |
| pbdBtn / pbdSkip / rockBtn / rockClearBtn / probesBtn | click | new features | single listener each |
| searchInput | input / keydown | search | isolated |
| searchOverlay | click | close | event delegation |
| speedInput | input | speed slider | single |

**Post-cleanup state: exactly one global keydown listener (previous dup removed). No orphan registrations.**

## 4. Resource disposal

Checked cleanup paths:
- **Orbit lines (scale toggle):** `scene.remove()` + `geometry.dispose()` + `material.dispose()` ✅
- **Belts (scale toggle):** dispose geometry + material ✅
- **Rocks (cull + clear + max):** dispose mesh geometry + material + trail geometry + trail material ✅
- **Probe lines (scale rebuild):** updates buffer in place — no dispose needed ✅

**Potential gap:** When the sim exits (page navigation), Three.js contexts are not explicitly released. Acceptable for a single-page sim; browser GC handles it.

## 5. Hot-path performance

Per-frame work in `animate()`:
- `updateBodies()` — 9 planets + comet trig, cheap
- `updateBelts(dt)` — 2 rotations on InstancedMesh matrices (3,200 bodies), O(n) but no reuploads
- `updateTrails()` — 8 shift-pushes when Δ > 0.5 sim-days (rate-limited)
- Shadow light update (if shadows on) — 1 vector math
- `sunShaderMat.uTime` update — 1 uniform set
- Camera tween or fly integration — trivial
- `updateRocks(dt)` — rocks × substeps × gravity math + trail-buffer shift (360 floats each); up to ~10.8k float writes at 30 rocks — acceptable but known shift-cost (see /simplify notes)
- `updateProbes()` — ~5 waypoint interpolations — trivial
- `updateHUD()` rate-limited to every 120ms
- `renderer.render()` — Three.js

**Sun shader:** 5-oct fbm + 3× 3-oct fbm warp per pixel — reduced from 5-oct for warp in /simplify pass. ~112 noise hashes per fragment. Acceptable at normal sun screen size.

## 6. Coverage of existing constants / physics

- Planet sizes: EXACT ratios relative to Earth=1 (Earth 1.0, Jupiter 11.21, etc.)
- Orbital periods: EXACT real day counts
- Axial tilts: EXACT degrees
- Eccentricity & inclination: EXACT per body
- Moon textures: procedural (credible)
- Comet eccentricity: 0.9671 (Halley)
- Starfield: Nano Banana 4K panorama + 10,000 procedural points

## 7. Scorecard (1-5 each)

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Structure** | 5 | Well-organized single-file; clear section comments; shallow globals |
| **Readability** | 4 | Long file but logical sections; some dense shader GLSL is unavoidable |
| **Performance** | 4 | Stable 60fps budget; rock trail shift is O(N) per rock per frame — noted but not fixed |
| **Robustness** | 4 | formatDate guarded; tween/PBD/rock/fly interactions cross-checked; canvas shadow disposal clean. One open: probe focus previously lost-target (fixed in /simplify) |
| **Extensibility** | 5 | New features slotted in cleanly; `__test` hook added with zero collateral; data-driven tables (BODIES, PROBE_DATA) make new additions easy |

## 8. Risks remaining

1. **Rock trail shift-buffer is O(N)** per rock per frame; 30 rocks × 120 floats × ~60fps = 216K float writes/sec plus GPU re-uploads. Fine today; convert to ring buffer if rocks ever scale to 100+.
2. **Probe trajectories are hand-curated waypoints**, not real ephemerides — positions are visually faithful, not kilometer-accurate.
3. **Memory cleanup on page unload** is not explicit — relies on browser GC.
4. **Shader on iGPUs** untested — fBm + warp at 5+3 octaves may stutter on integrated graphics.

## 9. Summary

Clean codebase. Single file, no build step, ~2,960 lines. Clear separation between data, physics, rendering, and UI. Test instrumentation cleanly bolted on. No dead code, no orphan listeners, all disposals wired. Overall rating: **4.4 / 5** across structure, readability, performance, robustness, and extensibility.
