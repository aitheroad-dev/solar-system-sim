import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

function log(tag, ok, note) {
  console.log(`  ${tag.padEnd(8)} ${ok ? 'PASS' : 'FAIL'}  ${note}`);
}

try {
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);

  // Coach card present + eventually visible
  const coachExists = await page.$('#coach-card') !== null;
  log('B.1.1', coachExists, 'coach-card element exists');
  await page.waitForTimeout(1500); // wait past 800ms fade-in
  const coachVisible = await page.evaluate(() => {
    const c = document.getElementById('coach-card');
    return c && !c.hidden && c.classList.contains('visible');
  });
  log('B.1.2', coachVisible, `coach visible=${coachVisible}`);

  // Dismiss via click; localStorage set
  await page.evaluate(() => document.querySelector('#coach-card .coach-close').click());
  await page.waitForTimeout(800);
  const dismissed = await page.evaluate(() => localStorage.getItem('coach-dismissed') === '1');
  log('B.1.3', dismissed, `coach-dismissed=${dismissed}`);

  // Body label element present
  const labelExists = await page.$('#body-label') !== null;
  log('B.2.1', labelExists, 'body-label element exists');

  // Preview tip element present, data-preview on jumpBtns
  const tipExists = await page.$('#preview-tip') !== null;
  log('B.4.1', tipExists, 'preview-tip element exists');
  const previewCount = await page.evaluate(() => document.querySelectorAll('[data-preview]').length);
  log('B.4.2', previewCount >= 8, `[data-preview] count=${previewCount}`);

  // Legend panel element + L toggles
  const legendExists = await page.$('#legendPanel') !== null;
  log('B.3.1', legendExists, 'legendPanel exists');
  const legendHiddenAtStart = await page.evaluate(() => document.getElementById('legendPanel').hidden);
  log('B.3.2', legendHiddenAtStart, `legend hidden at start=${legendHiddenAtStart}`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' })));
  await page.waitForTimeout(200);
  const legendShownAfterL = await page.evaluate(() => !document.getElementById('legendPanel').hidden);
  log('B.3.3', legendShownAfterL, `legend shown after L=${legendShownAfterL}`);

  // Probe legend element
  const probeLegExists = await page.$('#probeLegend') !== null;
  log('B.5.1', probeLegExists, 'probeLegend element exists');
  // Toggle probes on → strip becomes visible
  await page.evaluate(() => document.getElementById('probesBtn').click());
  await page.waitForTimeout(500);
  const stripVisible = await page.evaluate(() => document.getElementById('probeLegend').classList.contains('visible'));
  log('B.5.2', stripVisible, `strip visible after probes on=${stripVisible}`);

  // Scale caption appears on toggle
  await page.evaluate(() => document.getElementById('scaleBtn').click());
  await page.waitForTimeout(100);
  const captionVisible = await page.evaluate(() => document.getElementById('scale-caption').classList.contains('visible'));
  log('B.6.1', captionVisible, `scale-caption visible=${captionVisible}`);

  // HUD v-scale text
  const scaleText = await page.evaluate(() => document.getElementById('v-scale').textContent);
  log('B.6.2', /real \(to-scale\)/.test(scaleText), `v-scale text='${scaleText}'`);

  // Reverse speed: slider -2 → v-speed prefixed with ◀
  await page.evaluate(() => {
    const s = document.getElementById('speed');
    s.value = '-2';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const vSpeedTxt = await page.evaluate(() => document.getElementById('v-speed').textContent);
  log('B.7.1', /◀/.test(vSpeedTxt), `v-speed='${vSpeedTxt}'`);
  const hasReverseCls = await page.evaluate(() => document.getElementById('v-speed').classList.contains('reverse'));
  log('B.7.2', hasReverseCls, `v-speed has .reverse=${hasReverseCls}`);

  // Help panel has new rows
  const helpText = await page.evaluate(() => document.querySelector('.panel.help').textContent);
  const helpMentions = ['Esc', 'Q', 'E', 'L', 'Shift'].every(w => helpText.includes(w));
  log('B.8.1', helpMentions, `help panel mentions all new keys=${helpMentions}`);

  // __test.animate exposed (A.3)
  const animErrors = await page.evaluate(() => window.__test.animate && window.__test.animate().errorCount);
  log('A.3.1', animErrors === 0, `__test.animate.errorCount=${animErrors}`);

  // Probes registered in bodyObjects (A.5)
  const probeInBodyObj = await page.evaluate(() => {
    const names = Object.keys(window.__test).length > 0 ? window.__test.bodies().names : [];
    return names.includes('Voyager 1') && names.includes('JWST');
  });
  log('A.5.1', probeInBodyObj, `probes in bodyObjects=${probeInBodyObj}`);

  // Halley motion (A.7): simDays jump, Halley still has position (check via focus)
  const halleyStillWorks = await page.evaluate(() => window.__test.bodies().hasHalley === true);
  log('A.7.1', halleyStillWorks, `hasHalley after consolidation=${halleyStillWorks}`);

  console.log(`\nConsole errors: ${errors.length}`);
  if (errors.length) errors.slice(0,5).forEach(e => console.log('  ' + e.slice(0,140)));

} catch (e) {
  console.error('SMOKE ERROR:', e.message);
} finally {
  await browser.close();
}
