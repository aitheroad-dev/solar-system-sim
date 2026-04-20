// Polish 2 verification — default-collapse non-essential panels
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);

const results = [];
function rec(id, pass, note) { results.push({ id, pass, note: String(note).slice(0, 90) }); }

// First-visit: clear localStorage before page load
await ctx.clearCookies();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// ISC-17: help collapsed on first visit
const helpCollapsed = await page.evaluate(() => {
  const el = document.querySelector('[data-key="help"]');
  return { exists: !!el, collapsed: el?.classList.contains('collapsed') ?? null };
});
rec('17', helpCollapsed.collapsed === true, `help: ${JSON.stringify(helpCollapsed)}`);

// ISC-18: timeJumps collapsed on first visit
const tjCollapsed = await page.evaluate(() => {
  const el = document.querySelector('[data-key="timeJumps"]');
  return { exists: !!el, collapsed: el?.classList.contains('collapsed') ?? null };
});
rec('18', tjCollapsed.collapsed === true, `timeJumps: ${JSON.stringify(tjCollapsed)}`);

// ISC-20: hud NOT collapsed on first visit
const hudCollapsed = await page.evaluate(() => {
  const el = document.querySelector('[data-key="hud"]');
  return { exists: !!el, collapsed: el?.classList.contains('collapsed') ?? null };
});
rec('20', hudCollapsed.collapsed === false, `hud: ${JSON.stringify(hudCollapsed)}`);

// ISC-21: controls NOT collapsed on first visit
const ctlCollapsed = await page.evaluate(() => {
  const el = document.querySelector('[data-key="controls"]');
  return { exists: !!el, collapsed: el?.classList.contains('collapsed') ?? null };
});
rec('21', ctlCollapsed.collapsed === false, `controls: ${JSON.stringify(ctlCollapsed)}`);

// ISC-23: chevron expand on collapsed-by-default panel works
const expandRes = await page.evaluate(() => {
  const el = document.querySelector('[data-key="help"]');
  const btn = el?.querySelector('.panel-collapse');
  if (!btn) return { ok: false, reason: 'no chevron button' };
  const before = el.classList.contains('collapsed');
  btn.click();
  const after = el.classList.contains('collapsed');
  return { ok: before === true && after === false, before, after };
});
rec('23', expandRes.ok === true, `expand: ${JSON.stringify(expandRes)}`);

// ISC-19: returning visitor honors persisted state
// Simulate: set storage to "0" (explicitly NOT collapsed) for help, reload, expect NOT collapsed
await page.evaluate(() => localStorage.setItem('panel-help-collapsed', '0'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const returningHelp = await page.evaluate(() => {
  const el = document.querySelector('[data-key="help"]');
  return { collapsed: el?.classList.contains('collapsed'), storage: localStorage.getItem('panel-help-collapsed') };
});
rec('19', returningHelp.collapsed === false && returningHelp.storage === '0',
  `returning: ${JSON.stringify(returningHelp)}`);

// Print
let pass = 0;
for (const r of results) {
  console.log(`  ISC-${r.id}  ${r.pass ? 'PASS' : 'FAIL'}  ${r.note}`);
  if (r.pass) pass++;
}
console.log(`\nPOLISH-2: ${pass}/${results.length} PASS`);

await browser.close();
process.exit(pass === results.length ? 0 : 1);
