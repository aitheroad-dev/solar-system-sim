// four-features-smoke.mjs — covers the four new features:
//   1. Slingshot Challenge chip + panel
//   2. First Click Wonder cursor
//   3. True-Scale Walk mode (KeyW enter / Escape exit)
//   4. Sky Events panel (3 rows)
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const results = [];
function rec(id, pass, note) { results.push({ id, pass, note: String(note).slice(0, 140) }); }

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(12000);

const consoleErrors = [];
const pageErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e.message)));

// First-visit path — clear localStorage then reload
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);

// pre-flight version check
const version = await page.evaluate(() => window.__test?.version).catch(() => null);
if (version !== '1.0') {
  console.log(`ABORT: __test.version=${JSON.stringify(version)}`);
  await browser.close();
  process.exit(1);
}

// --- 1. Slingshot Challenge ---

// Chip visible in HUD
{
  const r = await page.evaluate(() => {
    const el = document.getElementById('slingshotChip');
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    return { exists: true, text: el.textContent, visible: cs.display !== 'none' && cs.visibility !== 'hidden', pulse: el.classList.contains('pulse') };
  });
  rec('SS-1', r.exists && r.visible && /mission/i.test(r.text || ''), JSON.stringify(r));
}

// Click opens panel with 4 controls
{
  const r = await page.evaluate(() => {
    document.getElementById('slingshotChip')?.click();
    return new Promise(resolve => setTimeout(() => {
      const panel = document.getElementById('slingshotPanel');
      const open = panel?.classList.contains('open');
      const hasLaunch = !!document.getElementById('slingLaunch');
      const hasTarget = !!document.getElementById('slingTarget');
      const hasAngle  = !!document.getElementById('slingAngle');
      const hasSpeed  = !!document.getElementById('slingSpeed');
      resolve({ open, hasLaunch, hasTarget, hasAngle, hasSpeed });
    }, 200));
  });
  rec('SS-2', r.open && r.hasLaunch && r.hasTarget && r.hasAngle && r.hasSpeed, JSON.stringify(r));
}

// Close via Close button
{
  await page.evaluate(() => document.getElementById('slingClose')?.click());
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({
    open: document.getElementById('slingshotPanel')?.classList.contains('open')
  }));
  rec('SS-3', r.open === false, JSON.stringify(r));
}

// --- 2. First Click Wonder ---

// Cursor appeared during animation — because we just reloaded with fresh localStorage
// the animation fires after ~1.6s post body-init. By the 10s wait above the cursor
// may have fired and been removed. We test by clearing storage, reloading, and
// sampling DOM soon after first-click flag absence.
{
  // Reload fresh; bodies need ~3-5s to build, then 1600ms delay before animation.
  // We sample a few times in the 5-13s window to catch the cursor.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  let sawCursor = false;
  let flagSeen = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(1500);
    const snapshot = await page.evaluate(() => ({
      present: !!document.querySelector('[data-testid="first-click-cursor"]'),
      flag:    localStorage.getItem('sss.v1.first_click_played')
    }));
    if (snapshot.present) sawCursor = true;
    if (snapshot.flag) flagSeen = snapshot.flag;
    if (sawCursor && flagSeen) break;
  }
  rec('FC-1', sawCursor === true, `sawCursor=${sawCursor}`);
  rec('FC-2', flagSeen === '1', `flag=${flagSeen}`);
}

// Set flag → cursor absent on next load
{
  await page.evaluate(() => localStorage.setItem('sss.v1.first_click_played', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => ({
    cursor: !!document.querySelector('[data-testid="first-click-cursor"]')
  }));
  rec('FC-3', r.cursor === false, JSON.stringify(r));
}

// --- 3. True-Scale Walk mode ---

{
  // Make sure no existing test instrumentation state is polluted: fresh reload already done.
  const before = await page.evaluate(() => ({ loops: window.__test?.activeLoops }));
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'W', code: 'KeyW', bubbles: true }));
  });
  await page.waitForTimeout(400);
  const entered = await page.evaluate(() => {
    const hud = document.getElementById('walkHud');
    return {
      hudActive: hud?.classList.contains('active'),
      walkActive: window.__test?.walk?.().active,
      loops: window.__test?.activeLoops
    };
  });
  rec('W-1', entered.hudActive === true && entered.walkActive === true, JSON.stringify(entered));
  rec('W-2', entered.loops === (before.loops + 1), `before=${before.loops} after=${entered.loops}`);

  // Escape exits
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  });
  await page.waitForTimeout(400);
  const exited = await page.evaluate(() => ({
    hudActive: document.getElementById('walkHud')?.classList.contains('active'),
    walkActive: window.__test?.walk?.().active,
    loops: window.__test?.activeLoops
  }));
  rec('W-3', exited.hudActive === false && exited.walkActive === false, JSON.stringify(exited));
  rec('W-4', exited.loops === 1, `activeLoops after exit=${exited.loops}`);
}

// --- 4. Sky Events panel ---

{
  const r = await page.evaluate(() => {
    const panel = document.getElementById('skyEventsPanel');
    const rowC = document.getElementById('skyRowConjunction');
    const rowT = document.getElementById('skyRowTransit');
    const rowE = document.getElementById('skyRowEclipse');
    return {
      hasPanel: !!panel,
      textC: (rowC?.textContent || '').trim(),
      textT: (rowT?.textContent || '').trim(),
      textE: (rowE?.textContent || '').trim()
    };
  });
  rec('SE-1', r.hasPanel === true, `panel=${r.hasPanel}`);
  rec('SE-2', /conjunction|no conjunction/i.test(r.textC), `rowC=${r.textC.slice(0,80)}`);
  rec('SE-3', /transit|no inner-planet/i.test(r.textT), `rowT=${r.textT.slice(0,80)}`);
  rec('SE-4', /eclipse|no solar eclipse/i.test(r.textE), `rowE=${r.textE.slice(0,80)}`);
}

// --- Console errors ---
rec('Z-1', consoleErrors.length === 0 && pageErrors.length === 0,
    `console=${consoleErrors.length} page=${pageErrors.length}${consoleErrors[0] ? ': ' + consoleErrors[0].slice(0, 100) : ''}`);

let pass = 0;
for (const r of results) {
  console.log(`  ${r.id}\t${r.pass ? 'PASS' : 'FAIL'}\t${r.note}`);
  if (r.pass) pass++;
}
console.log(`\nFOUR-FEATURES: ${pass}/${results.length} PASS`);

await browser.close();
process.exit(pass === results.length ? 0 : 1);
