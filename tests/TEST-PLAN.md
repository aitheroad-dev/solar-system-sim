# Solar System Sim — Test Plan

**Target:** `http://localhost:8765/` served from `/Users/yaronkra/projects/solar-system-sim/index.html`
**Tool:** Playwright (headless Chromium) invoked via BrowserAgent subagent
**Verification strategy:** Query `window.__test` for internal JS state rather than relying on WebGL pixel screenshots. Use real DOM events for clicks and keyboard.

## Pre-flight

Every test begins with:
1. Fresh Playwright page, `goto("http://localhost:8765/")`
2. Wait 8 seconds for textures + scene build
3. `page.evaluate(() => window.__test.version)` should return `"1.0"` — confirms hook is live
4. `page.evaluate(() => window.__test.bodies())` — confirms scene built

If any pre-flight step fails, ABORT and report.

## Category 1 — Page load & baseline

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 1.1 | Page reaches idle | `waitForLoadState` + 8s sleep | no throw |
| 1.2 | No console errors | `page.on('console', …)` collector | empty errors list |
| 1.3 | All 9 core bodies exist | `__test.bodies().names` | includes Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune |
| 1.4 | Halley exists | `__test.bodies().hasHalley` | `true` |
| 1.5 | Earth exists | `__test.bodies().hasEarth` | `true` |
| 1.6 | Belts populated | `__test.belts()` | asteroids ≥ 1000, kuiper ≥ 1000 |
| 1.7 | `__test` hook version | `__test.version` | `"1.0"` |

## Category 2 — Core camera interactions

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 2.1 | Pointer drag changes azimuth | record az before/after mouse drag 100px right | az changed by >0.01 rad |
| 2.2 | Wheel zoom changes dist | dispatch wheel event with deltaY=200 | dist changed |
| 2.3 | Focus pill click triggers tween | click `[data-focus="Jupiter"]`, check within 100ms | `__test.camera().tweening === true` |
| 2.4 | Tween completes in ≤1.2s | poll until `tweening===false` | transition ≤ 1200ms |
| 2.5 | After settle, focus = "Jupiter" | `__test.camera().focus` | `"Jupiter"` |
| 2.6 | FOV returns to 45 after tween | `__test.camera().fov` | `45 ± 0.01` |

## Category 3 — Controls (existing features)

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 3.1 | Speed slider min → sim slow | set slider to `-3`, check `__test.sim().speedMultiplier` | `< 0.01` |
| 3.2 | Speed slider max → sim fast | set slider to `4`, check | `≥ 1000` |
| 3.3 | Pause toggle | click `#pauseBtn`, check `__test.sim().paused` | flips to `true` |
| 3.4 | Orbits toggle hides orbit lines | click `#orbitsBtn`, check `__test.orbits().anyVisible` | flips |
| 3.5 | Scale toggle flips scaleMode | click `#scaleBtn`, check `__test.sim().scaleMode` | toggles "compressed"↔"real" |
| 3.6 | Today button sets simDays | click `#todayBtn`, check `__test.sim().simDays` | ≈ `(now - J2000) / 86400000` |
| 3.7 | Shadows toggle | click `#shadowBtn`, check `__test.shadows().enabled` | toggles |

## Category 4 — Focus, search, keyboard

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 4.1 | Keyboard `3` focuses Venus | press `Digit3`, wait for settle | `__test.camera().focus === "Venus"` |
| 4.2 | Keyboard `4` focuses Earth | press `Digit4`, wait for settle | `focus === "Earth"` |
| 4.3 | `/` opens search overlay | press `Slash`, check `.searchOverlay.active` | class present |
| 4.4 | Typing "jup" filters to Jupiter | type in input, inspect `#searchResults li` | ≥ 1 result matching `/jupiter/i` |
| 4.5 | Enter on search focuses | press Enter | `focus` updates |
| 4.6 | Escape closes search | press Escape | overlay loses `.active` |

## Category 5 — Time jumps

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 5.1 | Halley 1986 button | click `[data-jump="halley1986"]`, read `__test.sim().simDays` | matches `daysSinceJ2000(1986-02-09)` ≈ `-5075` |
| 5.2 | Voyager 1 launch button | click, read | ≈ `-8154` |
| 5.3 | Today button | click, read | ≈ current epoch |
| 5.4 | J2000 button | click | simDays ≈ 0 |

## Category 6 — Pale Blue Dot cinematic

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 6.1 | Click PBD button activates | click `#pbdBtn`, wait 200ms | `__test.pbd().active === true` |
| 6.2 | Overlay gets `.active` class | `#pbdOverlay` class list | includes `active` |
| 6.3 | Camera focus snapped to Earth | `__test.camera().focus` | `"Earth"` |
| 6.4 | Quote visible after ~8s | wait 8s, check `.quote-in` | present |
| 6.5 | Skip button works | click `#pbdSkip` | `__test.pbd().active === false` |
| 6.6 | Camera restored after skip | compare pre-PBD and post-skip | focus/dist/az/polar within tolerance of pre-state |

## Category 7 — Drop a Rock sandbox (REAL)

The critical test of "it actually works" — rocks must be in the JS scene, not just DOM buttons firing.

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 7.1 | Enter rock mode | click `#rockBtn`, check `__test.sim().rockMode` | `true` |
| 7.2 | Hint bar visible | `#rockHint` class | includes `active` |
| 7.3 | Spawn 1 rock via `__test.actions.spawnRockAt(80, 0, 0)` | call action | returns `{ok:true, before:0, after:1}` |
| 7.4 | Spawn 2 more | two more `spawnRockAt` calls with different coords | `__test.rocks().count === 3` |
| 7.5 | Rocks have non-zero velocity | inspect `__test.rocks().items[0].vel` | magnitude > 0 |
| 7.6 | After 2s (real time), positions moved | record `pos` at t=0, wait 2s, read again | difference > 0.1 units |
| 7.7 | Clear rocks empties array | click `#rockClearBtn` | `__test.rocks().count === 0` |
| 7.8 | Exit rock mode | click `#rockBtn` again | `rockMode === false` |

## Category 8 — Spacecraft trajectories

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 8.1 | Probes toggle on | click `#probesBtn`, check | `__test.probes().visible === true` |
| 8.2 | At least 4 probe lines visible | `__test.probes().mapping` | ≥ 4 entries with `lineVisible === true` |
| 8.3 | Set simDays to Today, all active probes shown | `page.evaluate(() => __test.sim())` after today click | Voyager 1, Voyager 2, New Horizons, JWST sprites visible |
| 8.4 | JWST position is near-Earth anti-sun | compare JWST `spritePos` to Earth position | angular separation < 1 degree from anti-sun ray |
| 8.5 | Jump to J2000 hides all probes | click J2000 | all probe sprites invisible (simDays < launches) |
| 8.6 | Toggle probes off hides lines | click probes button again | mapping entries `lineVisible === false` |

## Category 9 — Free-fly camera

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 9.1 | V toggles flyMode on | press `KeyV` | `__test.camera().flyMode === true` |
| 9.2 | HUD shows "(fly mode)" | `#v-focus` textContent | matches `/fly/` |
| 9.3 | V toggles off | press `KeyV` again | `flyMode === false` |

## Category 10 — Edge cases / cross-feature

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 10.1 | ROCK_MAX=30 enforced | spawn 35 rocks via loop | `rocks.count === 30` |
| 10.2 | Pause freezes rocks | spawn rock, pause, record pos, wait 1s, compare | position delta < 0.05 |
| 10.3 | Scale toggle doesn't crash during rocks | spawn 3 rocks, toggle scale twice | no errors, `rocks.count === 3` |
| 10.4 | Focus-pull interrupted mid-tween | click Jupiter, within 300ms click Saturn | final `focus === "Saturn"`, no throw |
| 10.5 | PBD during fly mode | enter fly, try PBD | no throw, PBD state consistent |
| 10.6 | Escape closes rock mode | enter rock mode, press Escape | rockMode === false |

## Category 11 — Regression (pre-existing features)

| # | Check | Method | Pass if |
|---|-------|--------|---------|
| 11.1 | Moon count matches BODIES+MOONS | `__test.bodies().moons` | ≥ 9 (Moon + 8 named) |
| 11.2 | Halley active | `__test.bodies().hasHalley` | `true` |
| 11.3 | Belts populated | `__test.belts()` | both ≥ 1000 |
| 11.4 | Orbits exist | `__test.orbits().count` | ≥ 8 |
| 11.5 | Earth texture loaded | `__test.bodies().hasEarth` + inspect material via evaluate | material.map truthy |
| 11.6 | Saturn has ring | search for child Mesh with RingGeometry | present |

## Execution model

**Parallel BrowserAgent run:** 4 agents, each a fresh Playwright page, covering disjoint categories:

- **Agent A:** Categories 1, 2, 3
- **Agent B:** Categories 4, 5
- **Agent C:** Categories 6, 7 (PBD + Drop-a-Rock — the big verifications)
- **Agent D:** Categories 8, 9, 10, 11

Each agent reports a structured table of checks with PASS/FAIL + one-line evidence. Aggregator composes the final report.

## Reporting format

```
CATEGORY N — name
  N.X  check name           PASS/FAIL   evidence
  ...
CATEGORY totals: X/Y passed
```

Final report sections:
1. Summary (X/82 ISC passed)
2. Full table
3. Any failures with suggested fix
4. Recommendations beyond testing scope
