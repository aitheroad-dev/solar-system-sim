# Solar System Sim — Implementation Plan

**Created:** 2026-04-19
**Based on:** tests/AUDIT.md (2026-04-18) + fresh 4-perspective council audit (2026-04-19) + UX comprehension analysis (2026-04-19)
**File under improvement:** `index.html` (3,453 lines, single-file Three.js module)
**Current quality score:** 3.8 / 5 (down from 4.4 after +493 lines of feature growth)

---

## 1. Goals

1. **Raise code-quality score back above 4.2 / 5** by closing the four High-priority council findings and the top four Medium-priority findings. Every change surgical — no architectural rewrites.
2. **Close the top seven user-comprehension gaps** so a first-time visitor understands what they see (bodies, scales, probe lines) and what they can do (click a planet, drop a rock, reverse time).
3. **Preserve everything that currently works.** Zero regressions on the 82 ISC from the prior test run; zero new console errors; the single-file no-build-step design stays intact.
4. **Ship in two independent tracks** so each can be delivered and tested on its own.

## 2. Non-goals (explicit)

- Not rewriting the file structure. Single-file stays.
- Not migrating to a bundler / framework.
- Not authoring new simulation physics (real JPL ephemerides, real GM constants) — the sim is visual-teaching first.
- Not redesigning the visual style — only additive UX affordances.
- Not changing the public `window.__test` API shape — tests depend on it.

## 3. Track A — Code Quality Fixes

Eight fixes in execution order. Estimated total effort: **4–6 hours** of careful editing + verification.

### A.1 — Harden `buildScene` against texture failures

- **Finding reference:** B1 (High)
- **Current:** `buildScene()` at line 1445 awaits texture loads in sequence. The outer `.catch()` at line 3220-3231 sets an error message on the loader div but **never hides it**. One failed texture mid-build → loader spins forever, no sim.
- **Target:** Each body's build wrapped in its own `try { ... } catch (err) { console.warn(...); }`. Loader unconditionally hidden in `.finally()`. Texture failures fall through to procedural fallback (already exists in `loadTexture`), the scene continues building.
- **Files/lines:** `index.html:1445-1737` (buildScene), `index.html:3220-3231` (invocation).
- **Diff size:** ~40 lines added, ~5 lines modified.
- **Verification:** Simulate a texture 404 by blocking a texture URL in DevTools → loader hides, scene renders, warn in console, no frozen loader.
- **Risk:** Swallowing real bugs. Mitigation: `console.warn` with body name + error so failures are visible.

### A.2 — Hoist per-frame Vector3 allocations

- **Finding reference:** P1, P2 (High)
- **Current:** `new THREE.Vector3()` called every frame in:
  - `updateBodies` line 1841 (`_worldSunDir`)
  - `animate` line 1994 (`wp`)
  - Shadow path lines 1997-1998 (two `.clone()` calls)
  - Drag handler lines 2194-2196 (4 vectors per pointermove event, up to 120Hz)
  - Fly camera lines 2950-2952 (3 vectors per frame in fly mode)
- **Target:** Module-scope scratch vectors alongside existing `_tmpV3` (line 1789) and `TMP_V`/`TMP_V2` (line 2369):
  ```js
  const _scratchWorld = new THREE.Vector3();
  const _scratchDir   = new THREE.Vector3();
  const _scratchUp    = new THREE.Vector3(0, 1, 0);
  const _scratchForward = new THREE.Vector3();
  const _scratchRight   = new THREE.Vector3();
  ```
  All per-frame sites rewritten to `.set()`, `.copy()`, `.subVectors()` etc. instead of `new`.
- **Files/lines:** `index.html:1789-1795` (add to existing scratch block), `1841`, `1994`, `1997-1998`, `2194-2196`, `2950-2952`.
- **Diff size:** ~25 lines, mostly one-line replacements.
- **Verification:** DevTools Performance profile → GC pause count during a 30-second drag session drops to near-zero. Visual behavior unchanged.
- **Risk:** Aliasing — if two code paths share `_scratchDir` within one frame, state corruption. Mitigation: name scratch vectors per-owner (dragScratch, shadowScratch) where reuse risk exists.

### A.3 — Collapse `animate()` error handling + extract shadow math

- **Finding reference:** R1, A1 (High)
- **Current:** `animate` at lines 1974-2037 has four try/catch styles: inner catches around `updateBodies`, `updateBelts`, `updateTrails`, `updateHUD`; no catches around `updateRocks`, `updateProbes`, shadow block; outer catch wrapping everything. `animErrorLogged` global flag is a first-error-wins toggle at line 1972.
- **Target:**
  - Remove all inner try/catches. Keep only the outer try/catch at `animate` boundary.
  - Extract `updateShadowLight()` from lines 1990-2011 into its own function above `animate`.
  - Replace `animErrorLogged` with a bounded counter (`animErrorCount`) that logs up to 3 distinct errors before throttling, so regressions surface.
- **Files/lines:** `index.html:1972` (animErrorLogged), `1974-2037` (animate body), new function before 1974.
- **Diff size:** ~30 lines net reduction.
- **Verification:** `__test.animate` error counter exposed; trigger a forced error via instrumentation, confirm it logs and the loop continues.
- **Risk:** Low. Error boundary shape is preserved; just rationalized.

### A.4 — Guard PBD / tween against scale toggle and pill clicks

- **Finding reference:** B2, B4 (Medium)
- **Current:**
  - Scale toggle handler (2789-2825) mutates orbit radii without checking `pbdActive` or `cameraTween` → tween interpolates against stale targets, produces visible camera jumps.
  - Focus-pill row has no pointer-events guard during PBD → clicks fire silently, can mutate `camState.focus` while PBD reads stale `savedCamera` state.
- **Target:**
  - In scale toggle: `if (pbdActive) endPaleBlueDot(false); cameraTween = null;` before rebuild.
  - In `focusBody`: early-return if `pbdActive`. Set `.pillRow { pointer-events: none }` via CSS class toggled on PBD start/end (mirrors existing `pbdBtn` disable at line 2301).
- **Files/lines:** `index.html:2789-2825` (scale), `2258-2360` (PBD enter/exit), `2760-2777` (focusBody + pill handlers), CSS additions.
- **Diff size:** ~15 lines.
- **Verification:**
  - Start PBD → click scale button → no camera jump, PBD cleanly exits, then scale applies.
  - Start PBD → click a planet pill → click is ignored, PBD completes normally.
- **Risk:** Over-blocking — user can't cancel PBD via pill. Mitigation: PBD already has skip button (2301) and tap-to-exit (813), so pill being inert during PBD is correct behavior.

### A.5 — Fix probe focus stale-target + make probes searchable

- **Finding reference:** A2, B5 (Medium)
- **Current:**
  - `updateCameraFocus` falls back to probes at 1856-1861 but only if `po.sprite.visible` — otherwise returns without resetting focus. Camera orbits dead target.
  - Search overlay reads only `bodyObjects` (2865-2867); probes are absent despite code comment claiming otherwise.
- **Target:**
  - In `updateProbes` (around 2662-2664): when a probe becomes invisible and `camState.focus === probe.name`, call `focusBody("Sun")` as fallback.
  - Register each probe into `bodyObjects` at build time with `isProbe: true` flag. `focusBody` branches on flag → calls existing `focusProbe` logic, or merge `focusProbe` into `focusBody`.
  - Remove now-duplicate `focusProbe` function (3325-3343) once unified.
- **Files/lines:** `index.html:1852-1867`, `2488-2700` (probe build + update), `3325-3343` (focusProbe), `2865-2867` (search).
- **Diff size:** ~50 lines (consolidation net-neutral).
- **Verification:**
  - Focus Voyager 1 → time-jump to 1900 → camera smoothly returns to Sun; focus HUD updates.
  - Press `/` → type "Voyager" → Voyager 1 and 2 appear in results → selecting focuses the probe.
- **Risk:** Merging `focusProbe` into `focusBody` could break tween semantics. Mitigation: add a targeted `__test.actions.focusProbe` check + test both paths.

### A.6 — Replace hardcoded name list in scale rebuild

- **Finding reference:** R3 (Medium)
- **Current:** Line 2801 has a hardcoded 8-planet name array for orbit rebuild. Adding a new body requires editing this list.
- **Target:** Replace with `for (const b of BODIES) if (b.orbitAU > 0 && !b.isComet) { ... }`. Halley stays special-cased (its own orbit line is comet-specific).
- **Files/lines:** `index.html:2789-2825`.
- **Diff size:** ~10 lines.
- **Verification:** Scale toggle still rebuilds all 8 planet orbits + Halley; add a dummy body to BODIES locally → its orbit appears/disappears on toggle without code edit.
- **Risk:** Low. Mechanical refactor.

### A.7 — Consolidate Halley dual-state

- **Finding reference:** A3 (Medium)
- **Current:** `cometObj` at 3133-3141 and `bodyObjects.Halley` at 3144-3157 are two records for the same comet. `updateBodies` skips Halley via `isComet` flag; `cometObj` drives motion.
- **Target:** Keep one record. Store motion-driving data on `bodyObjects.Halley` with `isComet: true`; remove `cometObj` global. Update `updateBodies` to handle `isComet` inline (or keep a small `updateComet` helper reading from the unified record).
- **Files/lines:** `index.html:1833-1849` (updateBodies comet branch), `3133-3157` (cometObj + bodyObjects.Halley build).
- **Diff size:** ~30 lines net reduction.
- **Verification:** Halley still orbits, `__test.bodies().hasHalley === true`, focus on Halley still works.
- **Risk:** Medium. This touches simulation logic. Mitigation: re-run the category 11 regression tests from TEST-PLAN.md before merging.

### A.8 — Fix `orbitDistance` magic numbers + misleading comment

- **Finding reference:** R2 (Medium)
- **Current:** Line 1086-1094 has a comment claiming "Neptune 620" but actual math gives 558. Magic constants 25, 120, 1, 10 unnamed.
- **Target:**
  ```js
  const INNER_LINEAR_SLOPE = 25;   // compressed units per AU for inner solar system
  const OUTER_LOG_SCALE = 120;     // log-compressed scale factor for outer planets
  const BLEND_AU_START = 1;        // start of linear→log blend
  const BLEND_AU_SPAN = 10;        // AU span of blend region (full log past 11 AU)
  ```
  Fix comment to match actual outputs: "Mercury 35, Earth 60, Jupiter 298, Neptune 558 at compressed scale."
- **Files/lines:** `index.html:1066-1107`.
- **Diff size:** ~15 lines.
- **Verification:** All existing scale-toggle visuals identical (same numbers, just named).
- **Risk:** None — pure naming + comment.

### Track A lower-priority items (deferred unless quick)

The following Low-priority items are acknowledged but NOT in this plan's scope unless time permits at the end. They are tracked in AUDIT.md and can be addressed in a separate pass:
- B3 (PBD resize reticle freeze)
- B6 (integrator clock mismatch at 10k×)
- B7 (importmap CDN failure timeout)
- A4 (buildScene split into buildSun/buildEarth/buildGenericPlanet)
- R4 (moon `localOrbitRadius` shape consistency)
- R5 (TMP_V/TMP_V2 shared between PBD + Rocks — move to top of module with shared-scratch comment)
- R6 (`__test.version` bump)
- P3/P4 (trail ring buffer + addUpdateRange — big refactor, low current impact)
- P5 (sun shader auto-LOD based on measured frame time)
- P6 (shadow path redundant `.clone()`)

---

## 4. Track B — UX Enhancements

Five core picks ordered by value-per-hour, plus three cheap wins. Estimated total effort: **10-12 hours**.

### B.1 — Coach card (first-run onboarding)

- **Finding reference:** G2, G6 gaps
- **What:** A dismissible 3-line overlay shown only on first visit. Uses localStorage key `coach-dismissed` (follows same pattern as panel-collapse state at line 3257).
- **Content:**
  1. "Drag to rotate · scroll to zoom"
  2. "Tap a planet pill OR click a planet to focus on it"
  3. "Press ? for full controls — or the Help panel at top-right"
- **Behavior:** Fades in after 800ms, auto-hides after 14s, dismissible by click or Escape. Never shown again once dismissed. Respects `prefers-reduced-motion`.
- **Files/lines:** New HTML element (insert near loader at line 681), CSS block (~40 lines), JS init block (~30 lines) inserted after DOM wiring.
- **Diff size:** ~80 lines added.
- **Cost:** S (~1h). **Lift:** H.
- **Verification:** First visit → card appears, dismissible. Reload → card does not reappear. `localStorage.removeItem('coach-dismissed')` + reload → card reappears.

### B.2 — Hover labels on 3D bodies

- **Finding reference:** G2, G7, G8 gaps
- **What:** When the mouse hovers a body mesh, show a floating HTML label with:
  - Name (e.g., "Europa")
  - Type (Planet / Moon / Comet / Rock / Probe / Asteroid / Star)
- **Implementation:**
  - Raycast on throttled pointermove (≥50ms interval via existing rAF loop).
  - Single absolutely-positioned `.body-label` div; move via `style.transform` translate based on `project()`.
  - Hides on mouse-leave or when a modal/PBD is active.
- **Files/lines:** New CSS (~20 lines), new function `updateHoverLabel()` (~40 lines), add raycast hook to existing pointermove at line 2169.
- **Diff size:** ~80 lines added.
- **Cost:** M (~2h). **Lift:** H.
- **Verification:**
  - Hover Earth → "Earth · Planet"
  - Hover Moon → "Moon · Moon (orbiting Earth)"
  - Hover a dropped rock → "Test particle · Rock"
  - Disable while dragging (don't flicker).

### B.3 — Legend panel ("what am I looking at?")

- **Finding reference:** G4, G8 gaps
- **What:** A new collapsible panel (uses existing `.panel` + `data-collapsible` infra) listing:
  - **Orbits** (thin dotted blue ellipse)
  - **Trails** (fading swoosh matching body color)
  - **Probe trajectories** (Voyager 1 orange, Voyager 2 blue, Cassini yellow, New Horizons pink, JWST green)
  - **Asteroid belt** (gray cloud between Mars–Jupiter)
  - **Kuiper belt** (gray cloud past Neptune)
  - **Saturn's rings** (beige band)
  - **Moons** (small spheres near parent planet, tinted)
  - **Dropped rocks** (warm-gold spheres with trail)
- **Behavior:** Toggled by `L` key or a small `Legend` icon in the bottom icon-cluster. Off by default.
- **Files/lines:** New HTML panel (~40 lines), CSS uses existing tokens, keydown handler adds `L` case at line 2901.
- **Diff size:** ~90 lines added.
- **Cost:** M (~3h). **Lift:** H.
- **Verification:** Press `L` → legend opens. Swatches match probe colors defined at PROBE_DATA. Press `L` again or click `×` → closes. State persists via collapsible key.

### B.4 — Preview cards on time-jump and feature buttons

- **Finding reference:** G5, G9 gaps
- **What:** A lightweight hover-tooltip (desktop) / long-press (mobile) that shows a 1-2 sentence preview for each `.jumpBtn`.
- **Content:**
  - **Halley 1986:** "Halley's Comet at its 1986 perihelion — watch it swing past Earth."
  - **Voyager 1 launch:** "1977-09-05 — NASA's Voyager 1 mission begins its grand tour."
  - **Today:** "Jump to the current real-world date."
  - **J2000 epoch:** "2000-01-01 12:00 UTC — astronomy's reference date."
  - **Pale Blue Dot:** "20-second cinematic: zoom away from Earth with Carl Sagan's narration. Tap to exit."
  - **Drop a Rock:** "Sandbox mode — press Shift+click on an orbit plane to spawn a test particle that obeys Sun-gravity."
  - **Clear rocks:** "Remove all dropped rocks."
  - **Probes · off/on:** "Show trajectories of 5 real spacecraft (Voyager 1/2, Cassini, New Horizons, JWST)."
- **Behavior:** 500ms hover delay, positioned via data-attribute `data-preview`, fades with transform; respects `prefers-reduced-motion`.
- **Files/lines:** CSS for `.preview-tip::after` (~30 lines), JS hook (~40 lines) attached to all `.jumpBtn` elements.
- **Diff size:** ~80 lines.
- **Cost:** M (~2h). **Lift:** H.
- **Verification:** Each button shows correct preview on hover; no preview during rapid scrubbing; long-press fires preview on mobile without firing the click.

### B.5 — Probe legend + live readout

- **Finding reference:** G4 gap
- **What:** When Probes toggle is ON, render a footer strip listing each active probe:
  - Colored swatch
  - Name
  - Current distance from Earth (AU)
  - Light-time to Earth
- **Data source:** existing `probeObjects[name].sprite.position` + `PROBE_DATA`. Light-time = distance / c.
- **Files/lines:** New HTML strip (~20 lines), CSS (~30 lines), new `updateProbeLegend()` called from `updateHUD` every 120ms.
- **Diff size:** ~80 lines.
- **Cost:** M (~3h). **Lift:** H.
- **Verification:** Toggle Probes ON → strip appears with live-updating distances. Time-jump → distances change. Toggle OFF → strip hides.

### B.6 — Scale-toggle caption + HUD clarification (quick win)

- **Finding reference:** G1 gap
- **What:**
  - HUD "Scale" row says `compressed (log)` / `real (to-scale)` instead of raw `compressed` / `real`.
  - On scale-toggle click, briefly show a 3-second centered caption:
    - Compressed → "Orbits squeezed so all planets fit on screen"
    - Real → "Actual orbital distances — outer planets are very far. Scroll to zoom out."
- **Files/lines:** `index.html:696` (HUD row), `2789` (scale handler) + new CSS for the caption.
- **Diff size:** ~40 lines.
- **Cost:** S (<1h). **Lift:** M.
- **Verification:** Toggle → caption appears 3s, HUD updated text matches.

### B.7 — Speed slider reverse indicator (quick win)

- **Finding reference:** G10 gap
- **What:**
  - When slider is negative, prepend `◀` to the `#v-speed` readout and tint it accent-colored.
  - Add tick marks / label `◀ reverse` on the left of the speed scale.
  - Add a single sub-line hint under the scale: "drag left to reverse time."
- **Files/lines:** `index.html:706-709` (slider + scale), `updateHUD` speed-readout section.
- **Diff size:** ~25 lines.
- **Cost:** S (<1h). **Lift:** M.
- **Verification:** Drag slider to -2 → HUD shows `◀ 0.01 d/s`; scale label shows reverse tick; text hint visible under scale.

### B.8 — Help-panel completeness (quick win)

- **Finding reference:** G13 gap
- **What:** Add missing keyboard/interaction rows to the help panel:
  - `click body` → focus on it
  - `Esc` → exit overlay / rock mode / fly mode
  - `Shift+click` → drop a rock (in rock mode)
  - `Q / E` → fly up / down (in fly mode)
  - `L` → toggle legend (if B.3 shipped)
- **Files/lines:** `index.html:819-829`.
- **Diff size:** ~10 lines.
- **Cost:** S (~15 min). **Lift:** M.
- **Verification:** Visual inspection of help panel; every listed shortcut actually works.

### Track B deferred

Acknowledged but not in this plan (can be added later):
- P6 (first-body pulse ring) — duplicates B.1 + B.2
- P8 (info-panel reveal connector)
- P11 (visual distinction rocks/moons/asteroids)
- P12 (rename duplicate Today)
- P13 (Space-to-pause micro-hint)

---

## 5. Sequencing & Dependencies

**Recommended order** (assumes both tracks):

1. **Track A first (code quality):** A.1 → A.2 → A.3 in that order. These three are the largest risk-reducers.
2. **Quick UX wins concurrently:** B.6, B.7, B.8 can be interleaved with Track A — they don't touch the same code paths.
3. **A.4 → A.5 → A.6 → A.7 → A.8** — all Track A mid-priority fixes in dependency order.
4. **Track B core picks:** B.1 (coach card) → B.2 (hover labels) → B.4 (preview cards) → B.3 (legend panel) → B.5 (probe legend).

**Dependencies:**
- B.3 (legend panel) depends on B.2 (to reuse label-DOM pattern).
- B.5 (probe legend) depends on A.5 (unified probe registry — not strict, but avoids double work).
- B.8 (help panel) must be updated after B.3 ships so `L` is documented.

**Parallelizable:** B.6, B.7, B.8 are independent; A.2 and A.3 are independent of each other.

**Alternative "ship in one day" path** (~3h): A.1 + B.1 + B.2 + B.8 = biggest first-impression lift + biggest risk reduction. All other work can land later.

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scratch-vector aliasing (A.2) | Medium | Mid (visual glitch) | Use per-owner named scratches; verify with a 60s soak test |
| Probe-unification breaks focus (A.5) | Medium | Mid (camera dead-ends) | Keep `focusProbe` as thin wrapper initially; remove only after __test passes |
| Halley consolidation breaks comet motion (A.7) | Medium | High (visible sim error) | Run Category 11 regression from TEST-PLAN.md before merging |
| Coach card annoys returning users (B.1) | Low | Low (one-time irritation) | localStorage gate + escape to dismiss |
| Hover labels flicker during drag (B.2) | Medium | Low (visual polish) | Disable label updates while any pointer is down |
| Legend panel adds clutter on mobile (B.3) | Low | Low | Off by default; collapsible; mobile already has panel-collapse infrastructure |

## 7. Success Criteria

### Track A
- [ ] All four High-priority findings (B1, P1/P2, R1, A1) resolved with verification evidence
- [ ] Four Medium-priority findings (B2, B4, A2, R3) resolved
- [ ] Zero new console errors on normal usage
- [ ] All 82 prior-session ISC still pass (or updated if covered by changes)
- [ ] `__test` hook still returns valid data; version bumped
- [ ] Council re-score ≥ 4.2 / 5

### Track B
- [ ] First-time user on a fresh browser (cleared localStorage) can identify any visible body within 15 seconds of page load (using coach card + hover labels)
- [ ] Clicking a planet mesh focuses it (not just the pill row)
- [ ] Toggling Probes on shows a legend mapping lines → probe names
- [ ] Reverse-time is visibly discoverable without reading docs
- [ ] `L` key toggles legend panel
- [ ] Help panel lists every actual keyboard shortcut

## 8. Testing Strategy

- **Existing:** 82 ISC test plan at `tests/TEST-PLAN.md` — rerun after each track completes.
- **New manual tests:** 12 UX scenarios from B.1–B.8 verifications above.
- **Performance regression:** DevTools Performance recording during 30s drag + 60s high-speed sim, compare GC + frame time before/after A.2.
- **Visual smoke:** Screenshots at (a) default load, (b) mid-PBD, (c) rock-mode active, (d) probes on, (e) scale=real — compare before/after each change.

## 9. Out of scope (stated for clarity)

- Any new physics simulation work
- Any Three.js version bump
- Any texture replacements / visual restyling
- Adding new bodies (Pluto, dwarf planets, exoplanets)
- Any server/backend/build-step addition

## 10. Estimated totals

| Track | Items | Hours | Risk |
|---|---|---|---|
| A (code quality) | 8 | 4-6 | Mid on A.5 + A.7 |
| B (UX enhancements) | 8 | 10-12 | Low |
| **Total** | **16** | **14-18** | — |

**Minimum viable ship (biggest lift per hour):** A.1 + A.2 + B.1 + B.2 + B.8 ≈ 3-4 hours.

---

## 11. Approval gates

Before code changes begin, Yaron confirms:
1. Track A, Track B, or both?
2. Full plan or minimum viable ship?
3. Any item above to drop or re-prioritize?
