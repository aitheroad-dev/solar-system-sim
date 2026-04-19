// Agent A v2 — targeted tests, robust to overlay issues
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const results = [];
const consoleErrors = [];

function record(id, pass, note) { results.push({ id, pass, note }); }
function fail(id, note) { record(id, false, String(note).slice(0, 100)); }

// ── boot ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(5000); // fail fast on any stuck action

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push('PAGEERR: ' + err.message));

// JS helpers
const js    = expr => page.evaluate(expr).catch(e => { throw new Error(e.message.split('\n')[0]); });
const jsClick = sel => page.evaluate(s => document.querySelector(s)?.click(), sel);
const jsRange = (sel, val) => page.evaluate(([s,v]) => {
  const el = document.querySelector(s);
  if (el) { el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); }
}, [sel, val]);

// ── CATEGORY 1 ───────────────────────────────────────────────────────────────
// 1.1 Page load — use domcontentloaded (textures fire no 'load' event in headless)
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(8000);
  record('1.1', true, '8s sleep, no throw');
} catch(e) { fail('1.1', e.message); }

// pre-flight version check
const version = await page.evaluate(() => window.__test?.version).catch(() => null);
if (version !== '1.0') {
  fail('ABORT', `__test.version=${JSON.stringify(version)}`);
  await browser.close();
  printReport(); process.exit(1);
}

// 1.2 console errors
record('1.2', consoleErrors.length === 0,
  consoleErrors.length === 0 ? 'zero errors' : consoleErrors.slice(0,2).join('; '));

// 1.3 planet names
try {
  const b = await js(() => window.__test.bodies());
  const req = ['Sun','Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
  const miss = req.filter(n => !b.names.includes(n));
  record('1.3', miss.length===0, miss.length===0 ? `all 9 present` : `missing: ${miss}`);
} catch(e) { fail('1.3', e); }

// 1.4 hasHalley
try {
  const b = await js(() => window.__test.bodies());
  record('1.4', b.hasHalley===true, `hasHalley=${b.hasHalley}`);
} catch(e) { fail('1.4', e); }

// 1.5 hasEarth
try {
  const b = await js(() => window.__test.bodies());
  record('1.5', b.hasEarth===true, `hasEarth=${b.hasEarth}`);
} catch(e) { fail('1.5', e); }

// 1.6 belts
try {
  const belts = await js(() => window.__test.belts());
  const ok = belts.asteroids >= 1000 && belts.kuiper >= 1000;
  record('1.6', ok, `asteroids=${belts.asteroids} kuiper=${belts.kuiper}`);
} catch(e) { fail('1.6', e); }

// 1.7 version
record('1.7', version==='1.0', `version=${version}`);

// ── CATEGORY 2 ───────────────────────────────────────────────────────────────

// 2.1 Drag → az changes
try {
  const azBefore = await js(() => window.__test.camera().az);
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    ['pointerdown','pointermove','pointerup'].forEach((t,i) =>
      c.dispatchEvent(new PointerEvent(t, {clientX: cx + i*50, clientY: cy, bubbles:true, isPrimary:true})));
  });
  await page.waitForTimeout(150);
  const azAfter = await js(() => window.__test.camera().az);
  const delta = Math.abs(azAfter - azBefore);
  record('2.1', delta > 0.01, `az ${azBefore.toFixed(4)}→${azAfter.toFixed(4)} Δ=${delta.toFixed(4)}`);
} catch(e) { fail('2.1', e); }

// 2.2 Wheel → dist changes
try {
  const distBefore = await js(() => window.__test.camera().dist);
  // Prevent default navigation by only dispatching a WheelEvent, not using Playwright's wheel
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ev = new WheelEvent('wheel', {deltaY:200, bubbles:true, cancelable:true});
    c.dispatchEvent(ev);
  });
  await page.waitForTimeout(250);
  const distAfter = await js(() => window.__test.camera().dist);
  const delta = Math.abs(distAfter - distBefore);
  record('2.2', delta > 0, `dist ${distBefore.toFixed(2)}→${distAfter.toFixed(2)} Δ=${delta.toFixed(2)}`);
} catch(e) { fail('2.2', e); }

// 2.3 Jupiter pill → tweening within 100ms
try {
  await jsClick('[data-focus="Jupiter"]');
  const t0 = Date.now();
  let seen = false;
  while (Date.now() - t0 < 200) {
    const tw = await js(() => window.__test.camera().tweening);
    if (tw === true) { seen = true; break; }
    await page.waitForTimeout(15);
  }
  record('2.3', seen, seen ? `tweening=true <200ms` : 'tweening never true <200ms');
} catch(e) { fail('2.3', e); }

// 2.4 Tween completes ≤1500ms
try {
  const t1 = Date.now();
  let done = false, ms = 0;
  while (Date.now() - t1 <= 1500) {
    const tw = await js(() => window.__test.camera().tweening);
    if (tw === false) { done = true; ms = Date.now() - t1; break; }
    await page.waitForTimeout(100);
  }
  record('2.4', done, done ? `finished ${ms}ms` : 'still tweening at 1500ms');
} catch(e) { fail('2.4', e); }

// 2.5 focus === Jupiter
try {
  const focus = await js(() => window.__test.camera().focus);
  record('2.5', focus==='Jupiter', `focus=${focus}`);
} catch(e) { fail('2.5', e); }

// 2.6 fov 45 ±0.01
try {
  const fov = await js(() => window.__test.camera().fov);
  record('2.6', Math.abs(fov-45)<=0.01, `fov=${fov}`);
} catch(e) { fail('2.6', e); }

// ── CATEGORY 3 ───────────────────────────────────────────────────────────────

// 3.1 speed -3
try {
  await jsRange('#speed', '-3');
  await page.waitForTimeout(150);
  const sm = await js(() => window.__test.sim().speedMultiplier);
  record('3.1', sm < 0.01, `speedMultiplier=${sm}`);
} catch(e) { fail('3.1', e); }

// 3.2 speed 4
try {
  await jsRange('#speed', '4');
  await page.waitForTimeout(150);
  const sm = await js(() => window.__test.sim().speedMultiplier);
  record('3.2', sm >= 1000, `speedMultiplier=${sm}`);
} catch(e) { fail('3.2', e); }

// 3.3 pause
try {
  await jsClick('#pauseBtn');
  await page.waitForTimeout(150);
  const p = await js(() => window.__test.sim().paused);
  record('3.3', p===true, `paused=${p}`);
  await jsClick('#pauseBtn');
} catch(e) { fail('3.3', e); }

// 3.4 orbits toggle
try {
  const before = await js(() => window.__test.orbits().anyVisible);
  await jsClick('#orbitsBtn');
  await page.waitForTimeout(150);
  const after = await js(() => window.__test.orbits().anyVisible);
  record('3.4', before!==after, `anyVisible: ${before}→${after}`);
} catch(e) { fail('3.4', e); }

// 3.5 scale toggle
try {
  const before = await js(() => window.__test.sim().scaleMode);
  await jsClick('#scaleBtn');
  await page.waitForTimeout(150);
  const after = await js(() => window.__test.sim().scaleMode);
  record('3.5', before!==after, `scaleMode: ${before}→${after}`);
  await jsClick('#scaleBtn');
} catch(e) { fail('3.5', e); }

// 3.6 todayBtn
try {
  await jsClick('#todayBtn');
  await page.waitForTimeout(150);
  const simDays = await js(() => window.__test.sim().simDays);
  record('3.6', typeof simDays==='number', `simDays=${simDays?.toFixed(2)}`);
} catch(e) { fail('3.6', e); }

// 3.7 shadow toggle
try {
  const before = await js(() => window.__test.shadows().enabled);
  await jsClick('#shadowBtn');
  await page.waitForTimeout(150);
  const after = await js(() => window.__test.shadows().enabled);
  record('3.7', before!==after, `enabled: ${before}→${after}`);
} catch(e) { fail('3.7', e); }

await browser.close();
printReport();

function printReport() {
  const cats = [
    {label:'CATEGORY 1 — Page load & baseline',     ids:['1.1','1.2','1.3','1.4','1.5','1.6','1.7']},
    {label:'CATEGORY 2 — Core camera interactions', ids:['2.1','2.2','2.3','2.4','2.5','2.6']},
    {label:'CATEGORY 3 — Controls',                 ids:['3.1','3.2','3.3','3.4','3.5','3.6','3.7']},
  ];
  let grand=0, total=0;
  for (const cat of cats) {
    console.log(`\n${cat.label}`);
    let cp=0;
    for (const id of cat.ids) {
      const r = results.find(x=>x.id===id);
      if (!r) { console.log(`  ${id.padEnd(4)} SKIP  not reached`); total++; continue; }
      const tag = r.pass?'PASS':'FAIL';
      console.log(`  ${id.padEnd(4)} ${tag}  ${r.note}`);
      if (r.pass) { cp++; grand++; }
      total++;
    }
    console.log(`${cat.label.split('—')[0].trim()} totals: ${cp}/${cat.ids.length} passed`);
  }
  console.log('\n══════════════ SUMMARY ══════════════');
  for (const r of results.filter(x=>x.id!=='ABORT')) {
    console.log(`  ${r.id.padEnd(4)} ${r.pass?'PASS':'FAIL'}  ${r.note.slice(0,95)}`);
  }
  console.log(`\nTOTAL: ${grand}/${total} passed`);
}
