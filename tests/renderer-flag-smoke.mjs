// Phase 1b smoke: verify the ?renderer=webgpu URL flag wires up the WebGPU
// backend without crashing, and that the default (no flag) stays on WebGL.
// Playwright/Chromium ships a WebGPU-capable build, so both paths are testable
// in CI even though end users still split across WebGL and WebGPU in the wild.

import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/index.html';

const results = [];
const rec = (id, ok, detail = '') => {
  results.push({ id, ok, detail });
  console.log(`  ${id}\t${ok ? 'PASS' : 'FAIL'}\t${detail}`);
};

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer']
});

async function probe(url, { expectRenderer, label }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.addInitScript(() => {
    localStorage.setItem('sss.v1.mission_hint_seen', '1');
    localStorage.setItem('sss.v1.first_click_played', '1');
  });

  let bootError = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(
      () => window.__test && window.__test.version === '1.0',
      { timeout: 15000 }
    );
    await page.waitForTimeout(3500);
  } catch (e) {
    bootError = e.message;
  }

  const testState = bootError ? null : await page.evaluate(() => ({
    rendererType: window.__test?.rendererType,
    version: window.__test?.version,
    bodyCount: window.__test?.bodies?.().total,
    canvasVisible: !!document.getElementById('canvas')?.getClientRects().length
  }));

  await ctx.close();

  const errDetail = pageErrors.length ? ` firstPageErr="${pageErrors[0].slice(0, 160)}"` : '';
  const sig = `${label} state=${JSON.stringify(testState)} pageErrors=${pageErrors.length} consoleErrors=${consoleErrors.length}${errDetail}${bootError ? ` boot=${bootError}` : ''}`;
  return { testState, pageErrors, consoleErrors, bootError, sig };
}

// RF-1: default URL boots on WebGL
{
  const r = await probe(BASE, { expectRenderer: 'webgl', label: 'default' });
  rec('RF-1', !r.bootError && r.testState?.rendererType === 'webgl', r.sig);
}

// RF-2: default boots with zero uncaught errors
{
  const r = await probe(BASE, { expectRenderer: 'webgl', label: 'default-errors' });
  rec('RF-2', !r.bootError && r.pageErrors.length === 0, r.sig);
}

// RF-3: default scene has bodies populated
{
  const r = await probe(BASE, { expectRenderer: 'webgl', label: 'default-bodies' });
  rec('RF-3', !r.bootError && r.testState?.bodyCount >= 9, r.sig);
}

// RF-4: ?renderer=webgpu flag boots on WebGPU
{
  const r = await probe(`${BASE}?renderer=webgpu`, { expectRenderer: 'webgpu', label: 'webgpu' });
  rec('RF-4', !r.bootError && r.testState?.rendererType === 'webgpu', r.sig);
}

// RF-5: WebGPU path doesn't throw uncaught page errors
{
  const r = await probe(`${BASE}?renderer=webgpu`, { expectRenderer: 'webgpu', label: 'webgpu-errors' });
  rec('RF-5', !r.bootError && r.pageErrors.length === 0, r.sig);
}

// RF-6: WebGPU path also populates bodies
{
  const r = await probe(`${BASE}?renderer=webgpu`, { expectRenderer: 'webgpu', label: 'webgpu-bodies' });
  rec('RF-6', !r.bootError && r.testState?.bodyCount >= 9, r.sig);
}

// RF-7: unrecognized flag value falls through to WebGL
{
  const r = await probe(`${BASE}?renderer=garbage`, { expectRenderer: 'webgl', label: 'garbage-flag' });
  rec('RF-7', !r.bootError && r.testState?.rendererType === 'webgl', r.sig);
}

await browser.close();

const passed = results.filter(r => r.ok).length;
console.log(`\nRENDERER-FLAG: ${passed}/${results.length} PASS`);
process.exit(passed === results.length ? 0 : 1);
