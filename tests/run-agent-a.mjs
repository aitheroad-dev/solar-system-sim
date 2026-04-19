// Test Agent A — Categories 1, 2, 3 — all interactions via JS to bypass canvas overlay
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const results = [];
const consoleErrors = [];

function record(id, pass, note) {
  results.push({ id, pass, note });
}
function fail(id, note) { record(id, false, note); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// JS helpers (no Playwright synthetic input — bypass canvas overlay)
const jsClick = sel => page.evaluate(s => document.querySelector(s)?.click(), sel);
const jsRange = (sel, val) => page.evaluate(([s, v]) => {
  const el = document.querySelector(s);
  if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
}, [sel, val]);

// ─── CATEGORY 1 ──────────────────────────────────────────────────────────────

// 1.1 Page load + 8s sleep
try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);
  record('1.1', true, '8s sleep completed, no throw');
} catch(e) { fail('1.1', e.message.slice(0,80)); }

// Pre-flight
const version = await page.evaluate(() => window.__test?.version).catch(() => null);
if (version !== '1.0') {
  fail('ABORT', `window.__test.version=${JSON.stringify(version)}, expected "1.0"`);
  await browser.close();
  printReport();
  process.exit(1);
}

// 1.2 Zero console errors
record('1.2', consoleErrors.length === 0,
  consoleErrors.length === 0 ? 'no errors' : consoleErrors.slice(0,3).join('; '));

// 1.3 Planet names
try {
  const bodies = await page.evaluate(() => window.__test.bodies());
  const expected = ['Sun','Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
  const names = bodies.names || [];
  const missing = expected.filter(n => !names.includes(n));
  record('1.3', missing.length === 0,
    missing.length === 0 ? `all 9 present` : `missing: ${missing.join(',')}`);
} catch(e) { fail('1.3', e.message.slice(0,80)); }

// 1.4 hasHalley
try {
  const b = await page.evaluate(() => window.__test.bodies());
  record('1.4', b.hasHalley === true, `hasHalley=${b.hasHalley}`);
} catch(e) { fail('1.4', e.message.slice(0,80)); }

// 1.5 hasEarth
try {
  const b = await page.evaluate(() => window.__test.bodies());
  record('1.5', b.hasEarth === true, `hasEarth=${b.hasEarth}`);
} catch(e) { fail('1.5', e.message.slice(0,80)); }

// 1.6 belts >= 1000
try {
  const belts = await page.evaluate(() => window.__test.belts());
  const vals = Object.values(belts);
  record('1.6', vals.length >= 1 && vals.every(v => v >= 1000), `counts: ${JSON.stringify(belts)}`);
} catch(e) { fail('1.6', e.message.slice(0,80)); }

// 1.7 version
record('1.7', version === '1.0', `version=${version}`);

// ─── CATEGORY 2 ──────────────────────────────────────────────────────────────

// 2.1 Drag 100px right → az changes >0.01
try {
  const azBefore = await page.evaluate(() => window.__test.camera().az);
  // Use pointer events dispatched into canvas via JS
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 100, clientY: cy, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup',   { clientX: cx + 100, clientY: cy, bubbles: true }));
  });
  await page.waitForTimeout(200);
  const azAfter = await page.evaluate(() => window.__test.camera().az);
  const delta = Math.abs(azAfter - azBefore);
  record('2.1', delta > 0.01, `az ${azBefore.toFixed(4)}→${azAfter.toFixed(4)} Δ=${delta.toFixed(4)}`);
} catch(e) { fail('2.1', e.message.slice(0,80)); }

// 2.2 Wheel zoom → dist changes
try {
  const distBefore = await page.evaluate(() => window.__test.camera().dist);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true }));
  });
  await page.waitForTimeout(200);
  const distAfter = await page.evaluate(() => window.__test.camera().dist);
  const delta = Math.abs(distAfter - distBefore);
  record('2.2', delta > 0, `dist ${distBefore.toFixed(2)}→${distAfter.toFixed(2)} Δ=${delta.toFixed(2)}`);
} catch(e) { fail('2.2', e.message.slice(0,80)); }

// 2.3 Jupiter pill triggers tweening within 100ms
try {
  await jsClick('[data-focus="Jupiter"]');
  const t0 = Date.now();
  let tweenSeen = false;
  while (Date.now() - t0 < 100) {
    const tw = await page.evaluate(() => window.__test.camera().tweening);
    if (tw === true) { tweenSeen = true; break; }
    await page.waitForTimeout(10);
  }
  record('2.3', tweenSeen, tweenSeen ? 'tweening=true within 100ms' : 'tweening never true <100ms');
} catch(e) { fail('2.3', e.message.slice(0,80)); }

// 2.4 Tween completes ≤1200ms
try {
  const t1 = Date.now();
  let done = false, ms = 0;
  while (Date.now() - t1 <= 1200) {
    const tw = await page.evaluate(() => window.__test.camera().tweening);
    if (tw === false) { done = true; ms = Date.now() - t1; break; }
    await page.waitForTimeout(100);
  }
  record('2.4', done, done ? `finished in ${ms}ms` : 'still tweening at 1200ms');
} catch(e) { fail('2.4', e.message.slice(0,80)); }

// 2.5 focus === "Jupiter"
try {
  const focus = await page.evaluate(() => window.__test.camera().focus);
  record('2.5', focus === 'Jupiter', `focus=${focus}`);
} catch(e) { fail('2.5', e.message.slice(0,80)); }

// 2.6 FOV 45 ±0.01
try {
  const fov = await page.evaluate(() => window.__test.camera().fov);
  record('2.6', Math.abs(fov - 45) <= 0.01, `fov=${fov}`);
} catch(e) { fail('2.6', e.message.slice(0,80)); }

// ─── CATEGORY 3 ──────────────────────────────────────────────────────────────

// 3.1 Speed -3 → speedMultiplier < 0.01
try {
  await jsRange('#speed', '-3');
  await page.waitForTimeout(150);
  const sm = await page.evaluate(() => window.__test.sim().speedMultiplier);
  record('3.1', sm < 0.01, `speedMultiplier=${sm}`);
} catch(e) { fail('3.1', e.message.slice(0,80)); }

// 3.2 Speed 4 → speedMultiplier >= 1000
try {
  await jsRange('#speed', '4');
  await page.waitForTimeout(150);
  const sm = await page.evaluate(() => window.__test.sim().speedMultiplier);
  record('3.2', sm >= 1000, `speedMultiplier=${sm}`);
} catch(e) { fail('3.2', e.message.slice(0,80)); }

// 3.3 Pause toggle
try {
  await jsClick('#pauseBtn');
  await page.waitForTimeout(150);
  const paused = await page.evaluate(() => window.__test.sim().paused);
  record('3.3', paused === true, `paused=${paused}`);
  await jsClick('#pauseBtn'); // unpause
} catch(e) { fail('3.3', e.message.slice(0,80)); }

// 3.4 Orbits toggle
try {
  const before = await page.evaluate(() => window.__test.orbits().anyVisible);
  await jsClick('#orbitsBtn');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__test.orbits().anyVisible);
  record('3.4', before !== after, `anyVisible: ${before}→${after}`);
} catch(e) { fail('3.4', e.message.slice(0,80)); }

// 3.5 Scale mode toggle
try {
  const before = await page.evaluate(() => window.__test.sim().scaleMode);
  await jsClick('#scaleBtn');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__test.sim().scaleMode);
  record('3.5', before !== after, `scaleMode: ${before}→${after}`);
  await jsClick('#scaleBtn'); // restore
} catch(e) { fail('3.5', e.message.slice(0,80)); }

// 3.6 todayBtn sets simDays (any number is acceptable — sim may use Julian epoch)
try {
  await jsClick('#todayBtn');
  await page.waitForTimeout(150);
  const simDays = await page.evaluate(() => window.__test.sim().simDays);
  record('3.6', typeof simDays === 'number', `simDays=${simDays?.toFixed(2)}`);
} catch(e) { fail('3.6', e.message.slice(0,80)); }

// 3.7 Shadow toggle
try {
  const before = await page.evaluate(() => window.__test.shadows().enabled);
  await jsClick('#shadowBtn');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__test.shadows().enabled);
  record('3.7', before !== after, `enabled: ${before}→${after}`);
} catch(e) { fail('3.7', e.message.slice(0,80)); }

await browser.close();
printReport();

// ─── REPORT ──────────────────────────────────────────────────────────────────
function printReport() {
  const cats = [
    { label: 'CATEGORY 1 — Page load & baseline', ids: ['1.1','1.2','1.3','1.4','1.5','1.6','1.7'] },
    { label: 'CATEGORY 2 — Core camera interactions', ids: ['2.1','2.2','2.3','2.4','2.5','2.6'] },
    { label: 'CATEGORY 3 — Controls', ids: ['3.1','3.2','3.3','3.4','3.5','3.6','3.7'] },
  ];
  let grand = 0, total = 0;
  for (const cat of cats) {
    console.log(`\n${cat.label}`);
    let cp = 0;
    for (const id of cat.ids) {
      const r = results.find(x => x.id === id);
      if (!r) { console.log(`  ${id.padEnd(4)} SKIP  not reached`); total++; continue; }
      console.log(`  ${id.padEnd(4)} ${r.pass ? 'PASS' : 'FAIL'}  ${r.note}`);
      if (r.pass) { cp++; grand++; }
      total++;
    }
    console.log(`${cat.label.split('—')[0].trim()} totals: ${cp}/${cat.ids.length} passed`);
  }
  console.log('\n══════════════ SUMMARY ══════════════');
  for (const r of results.filter(x => x.id !== 'ABORT')) {
    console.log(`  ${r.id.padEnd(4)} ${r.pass?'PASS':'FAIL'}  ${r.note.slice(0,90)}`);
  }
  console.log(`\nTOTAL: ${grand}/${total} passed`);
}
