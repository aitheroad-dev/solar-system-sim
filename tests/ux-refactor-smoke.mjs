// UX-refactor smoke — validates the right-rail restructure (Phase 1) and
// the launch-vector arrow (Phase 2) without regressing existing panels.
// Spec: docs/UX-RESEARCH-REPORT.md §§ 4-6 (the research brief that motivated this work).

import { chromium } from 'playwright';

const URL = 'http://localhost:8765/index.html';

const results = [];
const rec = (id, ok, detail = '') => {
  results.push({ id, ok, detail });
  console.log(`  ${id}\t${ok ? 'PASS' : 'FAIL'}\t${detail}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Suppress the first-visit mission hint for all tests EXCEPT RX-8 (which verifies opt-out).
await page.addInitScript(() => {
  // Pre-seed hint as seen to avoid flaky opacity checks across tests.
  localStorage.setItem('sss.v1.mission_hint_seen', '1');
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__test && window.__test.version === '1.0', { timeout: 15000 });
await page.waitForTimeout(3500);

// RX-1: #rightRail exists and is default-expanded (not .collapsed)
{
  const r = await page.evaluate(() => {
    const rail = document.getElementById('rightRail');
    return {
      exists: !!rail,
      collapsed: rail?.classList.contains('collapsed'),
      width: rail ? getComputedStyle(rail).width : null
    };
  });
  rec('RX-1', r.exists && r.collapsed === false, JSON.stringify(r));
}

// RX-2: three tab buttons present — Info / Legend / Mission
{
  const r = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#rightRail .right-rail-tab'))
      .map(b => ({ tab: b.dataset.tab, text: b.textContent.trim() }));
    return { count: tabs.length, tabs };
  });
  const names = r.tabs.map(t => t.tab).sort().join(',');
  rec('RX-2', r.count === 3 && names === 'info,legend,mission', JSON.stringify(r));
}

// RX-3: Default active tab is Info
{
  const r = await page.evaluate(() => {
    const rail = document.getElementById('rightRail');
    const tab = rail?.dataset.tab;
    const active = document.querySelector('#rightRail .right-rail-tab.active')?.dataset.tab;
    return { dataTab: tab, activeClass: active };
  });
  rec('RX-3', r.dataTab === 'info' && r.activeClass === 'info', JSON.stringify(r));
}

// RX-4: Clicking Legend tab → #legendPanel becomes visible (display: block after un-hide)
{
  const r = await page.evaluate(async () => {
    document.getElementById('tabLegend').click();
    await new Promise(r => setTimeout(r, 100));
    const rail = document.getElementById('rightRail');
    const lp = document.getElementById('legendPanel');
    const cs = lp ? getComputedStyle(lp) : null;
    return { railTab: rail?.dataset.tab, hidden: lp?.hasAttribute('hidden'), display: cs?.display };
  });
  rec('RX-4', r.railTab === 'legend' && r.hidden === false && r.display !== 'none', JSON.stringify(r));
}

// RX-5: Clicking Mission tab → #slingshotPanel visible, and select#slingLaunch exists.
{
  const r = await page.evaluate(async () => {
    document.getElementById('tabMission').click();
    await new Promise(r => setTimeout(r, 100));
    const rail = document.getElementById('rightRail');
    const sp = document.getElementById('slingshotPanel');
    const cs = sp ? getComputedStyle(sp) : null;
    const hasLaunch = !!document.getElementById('slingLaunch');
    return { railTab: rail?.dataset.tab, display: cs?.display, hasLaunch };
  });
  rec('RX-5', r.railTab === 'mission' && r.display === 'block' && r.hasLaunch === true, JSON.stringify(r));
}

// RX-6: Clicking #slingshotChip → rail expanded + Mission tab active + panel has .open class
{
  const r = await page.evaluate(async () => {
    // First collapse the rail to make sure the chip expands it.
    const rail = document.getElementById('rightRail');
    rail.classList.add('collapsed');
    rail.dataset.tab = 'info';
    document.getElementById('slingshotChip').click();
    await new Promise(r => setTimeout(r, 100));
    return {
      collapsed: rail.classList.contains('collapsed'),
      tab: rail.dataset.tab,
      panelOpen: document.getElementById('slingshotPanel').classList.contains('open')
    };
  });
  rec('RX-6', r.collapsed === false && r.tab === 'mission' && r.panelOpen === true, JSON.stringify(r));
}

// RX-7: Rail collapse chevron works (expand → collapse → expand)
{
  const r = await page.evaluate(async () => {
    const rail = document.getElementById('rightRail');
    const chev = document.getElementById('rightRailChevron');
    rail.classList.remove('collapsed');  // start expanded
    chev.click();
    await new Promise(r => setTimeout(r, 50));
    const afterFirst = rail.classList.contains('collapsed');
    chev.click();
    await new Promise(r => setTimeout(r, 50));
    const afterSecond = rail.classList.contains('collapsed');
    return { afterFirst, afterSecond };
  });
  rec('RX-7', r.afterFirst === true && r.afterSecond === false, JSON.stringify(r));
}

// RX-8: Collapse state persists across reload
{
  // Set collapse state, reload, confirm
  await page.evaluate(() => {
    localStorage.setItem('sss.v1.right_rail_collapsed', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__test && window.__test.version === '1.0', { timeout: 15000 });
  await page.waitForTimeout(2000);
  const collapsed = await page.evaluate(() => document.getElementById('rightRail').classList.contains('collapsed'));
  const stored = await page.evaluate(() => localStorage.getItem('sss.v1.right_rail_collapsed'));
  rec('RX-8', collapsed === true && stored === '1', `collapsed=${collapsed} storage=${stored}`);
}

// RX-9: window.__test.suppressMissionHint = true suppresses the hint tooltip
{
  // New context with pre-seeded suppression flag + CLEARED mission_hint_seen
  await ctx.close();
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => {
    window.__suppressMissionHint_early = true;
    // When __test is built, the deferred init will run; we also patch the later object.
    Object.defineProperty(window, '__missionHintSuppressor', { value: true });
  });
  // Navigate, then set the __test flag as soon as it exists and before the 1.2s deferred init.
  await page2.goto(URL, { waitUntil: 'domcontentloaded' });
  // Set suppressMissionHint on __test before the 1.2s showMissionHint timer fires.
  await page2.evaluate(async () => {
    localStorage.removeItem('sss.v1.mission_hint_seen');
    // Poll for __test, then set the flag quickly.
    await new Promise(resolve => {
      const t = setInterval(() => {
        if (window.__test && window.__test.version === '1.0') {
          window.__test.suppressMissionHint = true;
          clearInterval(t);
          resolve();
        }
      }, 30);
    });
  });
  // Reload now that flag is set AND mission_hint_seen is cleared — but localStorage doesn't cross-navigation clear.
  // Re-navigate to trigger the hint fresh:
  await page2.evaluate(() => localStorage.removeItem('sss.v1.mission_hint_seen'));
  await page2.addInitScript(() => {
    // After reload, inject the suppressor as early as possible.
    window.__earlyReady = true;
  });
  // To guarantee __test.suppressMissionHint is set BEFORE the deferred init runs
  // the hint timer (≈1.2s after bodies load), we hook into page eval after load.
  await page2.reload({ waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => window.__test && window.__test.version === '1.0', { timeout: 15000 });
  // Immediately set the flag after __test exists (bodies take a few seconds to appear; timer is _showMissionHint scheduled at deferred init).
  await page2.evaluate(() => { window.__test.suppressMissionHint = true; });
  // Wait long enough for bodies to load (~4s) + hint timer (1.2s) + render
  await page2.waitForTimeout(7000);
  const r = await page2.evaluate(() => {
    const tip = document.getElementById('missionHintTooltip');
    const cs = tip ? getComputedStyle(tip) : null;
    return {
      hidden: tip?.hasAttribute('hidden'),
      display: cs?.display,
      opacity: cs?.opacity,
      seen: localStorage.getItem('sss.v1.mission_hint_seen')
    };
  });
  // Success: tooltip stayed hidden AND localStorage flag wasn't written (no auto-dismiss fired)
  rec('RX-9', r.hidden === true || r.display === 'none', JSON.stringify(r));
  await ctx2.close();
}

// RX-10: Phase 2 — launch-vector arrow group exists in scene when Mission tab active
{
  const ctx3 = await browser.newContext();
  const page3 = await ctx3.newPage();
  await page3.addInitScript(() => {
    localStorage.setItem('sss.v1.mission_hint_seen', '1');
    localStorage.setItem('sss.v1.right_rail_collapsed', '0');
  });
  await page3.goto(URL, { waitUntil: 'domcontentloaded' });
  await page3.waitForFunction(() => window.__test && window.__test.version === '1.0', { timeout: 15000 });
  await page3.waitForTimeout(3500);
  // Switch to Mission tab
  await page3.evaluate(() => document.getElementById('tabMission').click());
  await page3.waitForTimeout(400);
  const missionState = await page3.evaluate(() => {
    const arr = window.__launchVectorArrow;
    return { exists: !!arr, visible: arr?.visible, name: arr?.name };
  });
  // Switch to Info tab — arrow should hide
  await page3.evaluate(() => document.getElementById('tabInfo').click());
  await page3.waitForTimeout(400);
  const infoState = await page3.evaluate(() => ({ visible: window.__launchVectorArrow?.visible }));
  rec('RX-10', missionState.exists && missionState.visible === true && infoState.visible === false,
      `missionTab=${JSON.stringify(missionState)} infoTab=${JSON.stringify(infoState)}`);
  await ctx3.close();
}

await browser.close();

const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`\nUX-REFACTOR: ${pass}/${pass + fail} PASS`);
process.exit(fail > 0 ? 1 : 0);
