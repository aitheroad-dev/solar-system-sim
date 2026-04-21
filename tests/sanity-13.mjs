// Browser sanity-check for the 13 shipped UX ISCs.
// Defensive: every assertion bounded, never relies on hover-resolution loops.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(5000);

const consoleErrors = [];
const pageErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e.message)));

const results = [];
const rec = (id, pass, note) => results.push({ id, pass, note: String(note).slice(0, 100) });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  // Suppress First Click Wonder so ISC-4 (Earth hover at canvas center) isn't
  // disturbed by the FCW-triggered Saturn camera tween.
  localStorage.setItem('sss.v1.first_click_played', '1');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

// ISC-1: page loads, no console errors
rec('1', consoleErrors.length === 0 && pageErrors.length === 0,
  `console=${consoleErrors.length} page=${pageErrors.length}`);

// ISC-2: coach card stays hidden on initial load (First Click Wonder is now
// the first-run welcome experience; coach card is only reachable via the help
// affordance, never auto-shown).
{
  const c = await page.evaluate(() => {
    const el = document.getElementById('coach-card');
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    return { exists: true, hidden: el.hidden, opacity: cs.opacity, display: cs.display, visibleClass: el.classList.contains('visible') };
  });
  rec('2', c.exists && (c.hidden === true || parseFloat(c.opacity) === 0 || c.visibleClass === false),
    JSON.stringify(c));
}

// ISC-3: coach card transitions to opacity 0 after dismiss
{
  await page.evaluate(() => {
    const btn = document.querySelector('#coach-card .coach-dismiss, #coach-card button, [data-coach-dismiss]');
    if (btn) btn.click();
    else {
      // try clicking the card itself
      const el = document.getElementById('coach-card');
      el?.click();
    }
  });
  await page.waitForTimeout(800);
  const c = await page.evaluate(() => {
    const el = document.getElementById('coach-card');
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    return { opacity: cs.opacity, hidden: el.hidden, visibleClass: el.classList.contains('visible') };
  });
  rec('3', parseFloat(c.opacity) === 0 || c.hidden === true || c.visibleClass === false,
    JSON.stringify(c));
}

// ISC-4: hovering Earth produces label "Earth"
{
  // Move pointer over the canvas center, then to where Earth is.
  // Simpler: use __test API to find Earth's screen position OR just grab the label DOM after triggering hover.
  // Strategy: dispatch a synthetic pointermove over canvas at a position that should hit Earth.
  // First focus Earth so we know where it is, then unfocus and dispatch pointermove there.
  const earth = await page.evaluate(() => {
    const r = window.__test?.bodies?.();
    return { hasEarth: r?.hasEarth, version: window.__test?.version };
  });
  if (!earth.hasEarth) {
    rec('4', false, `__test.bodies returned ${JSON.stringify(earth)}`);
  } else {
    // Click the Earth focus pill, wait for tween, read its screen position, dispatch hover at that point
    await page.evaluate(() => {
      const pill = document.querySelector('[data-focus="Earth"]');
      pill?.click();
    });
    await page.waitForTimeout(1500);
    const labelText = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // Dispatch a pointermove right at canvas center where Earth (focused) should be
      c.dispatchEvent(new PointerEvent('pointermove', { clientX: cx, clientY: cy, bubbles: true, isPrimary: true }));
      return new Promise(resolve => {
        setTimeout(() => {
          const lbl = document.getElementById('body-label');
          resolve({ text: lbl?.textContent ?? null, visible: lbl?.classList.contains('visible') ?? false });
        }, 300);
      });
    });
    rec('4', /Earth/i.test(labelText.text || ''), `label=${JSON.stringify(labelText)}`);
  }
}

// ISC-5: hovering Moon produces label "Moon" — Moon has no focus pill,
// scan a grid around screen center (Earth is focused) to find Moon's hover point.
{
  const labelText = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const lbl = document.getElementById('body-label');
    // Scan a 200x200 grid around Earth in 10px steps
    return new Promise(resolve => {
      let i = 0;
      const positions = [];
      for (let dx = -100; dx <= 100; dx += 10) {
        for (let dy = -100; dy <= 100; dy += 10) {
          positions.push([cx + dx, cy + dy]);
        }
      }
      function tryNext() {
        if (i >= positions.length) {
          resolve({ text: lbl?.textContent ?? null, visible: lbl?.classList.contains('visible') ?? false, scanned: i });
          return;
        }
        const [px, py] = positions[i++];
        c.dispatchEvent(new PointerEvent('pointermove', { clientX: px, clientY: py, bubbles: true, isPrimary: true }));
        setTimeout(() => {
          if (/Moon/i.test(lbl?.textContent || '')) {
            resolve({ text: lbl.textContent, visible: lbl.classList.contains('visible'), scanned: i, hit: [px, py] });
          } else {
            tryNext();
          }
        }, 20);
      }
      tryNext();
    });
  });
  rec('5', /Moon/i.test(labelText.text || ''), `label=${JSON.stringify(labelText)}`);
}

// ISC-6: pressing 'L' opens legend panel
{
  // Ensure starting state: legend is hidden by HTML attribute
  const before = await page.evaluate(() => document.getElementById('legendPanel')?.hasAttribute('hidden'));
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', code: 'KeyL', bubbles: true }));
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.getElementById('legendPanel')?.hasAttribute('hidden'));
  rec('6', before === true && after === false, `before=${before} after=${after}`);
}

// ISC-7: pressing 'L' a second time closes legend
{
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', code: 'KeyL', bubbles: true }));
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.getElementById('legendPanel')?.hasAttribute('hidden'));
  rec('7', after === true, `hidden after second L=${after}`);
}

// ISC-8: hovering Halley 1986 button surfaces preview tooltip
{
  const r = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-preview]'));
    const halley = btns.find(b => /halley|1986/i.test(b.textContent || '') || /halley|1986/i.test(b.dataset.preview || ''));
    if (!halley) return { ok: false, reason: 'no Halley button found', count: btns.length };
    halley.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    halley.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return new Promise(resolve => {
      setTimeout(() => {
        const tip = document.getElementById('preview-tip');
        resolve({
          ok: !!tip && (tip.classList.contains('visible') || getComputedStyle(tip).opacity > 0),
          tipText: tip?.textContent?.slice(0, 60),
          tipVisible: tip?.classList.contains('visible'),
        });
      }, 800);
    });
  });
  rec('8', r.ok === true, JSON.stringify(r));
}

// ISC-9: hovering Pale Blue Dot button surfaces preview tooltip
{
  const r = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-preview]'));
    const pbd = btns.find(b => /pale blue|pbd/i.test(b.textContent || '') || /pale|pbd/i.test(b.dataset.preview || ''));
    if (!pbd) return { ok: false, reason: 'no PBD button found', count: btns.length };
    pbd.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    pbd.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    return new Promise(resolve => {
      setTimeout(() => {
        const tip = document.getElementById('preview-tip');
        resolve({
          ok: !!tip && (tip.classList.contains('visible') || getComputedStyle(tip).opacity > 0),
          tipText: tip?.textContent?.slice(0, 60),
          tipVisible: tip?.classList.contains('visible'),
        });
      }, 800);
    });
  });
  rec('9', r.ok === true, JSON.stringify(r));
}

// ISC-10: speed slider at negative value renders reverse-time triangle indicator
{
  await page.evaluate(() => {
    const s = document.getElementById('speed');
    if (s) { s.value = '-2'; s.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    // Look for a reverse indicator — any element that contains '◄' or '⏪' or has a class with 'reverse'
    const all = Array.from(document.querySelectorAll('*'));
    const candidates = all.filter(el => {
      const t = el.textContent || '';
      return el.children.length === 0 && (/[◄⏪◀⯇]/.test(t) || /reverse/i.test(el.className?.toString?.() || ''));
    });
    const visible = candidates.filter(el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0;
    });
    return { count: candidates.length, visibleCount: visible.length, sample: visible[0]?.outerHTML?.slice(0, 120) };
  });
  rec('10', r.visibleCount > 0, JSON.stringify(r));
}

// ISC-11: speed slider at negative value makes sim days decrease
{
  await page.evaluate(() => {
    const s = document.getElementById('speed');
    if (s) { s.value = '-3'; s.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  const before = await page.evaluate(() => window.__test?.sim()?.simDays);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.__test?.sim()?.simDays);
  rec('11', after < before, `simDays ${before?.toFixed(2)} → ${after?.toFixed(2)} delta=${(after - before).toFixed(4)}`);
  // restore
  await page.evaluate(() => {
    const s = document.getElementById('speed');
    if (s) { s.value = '0'; s.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}

// ISC-12: toggling probes ON populates probe-readout strip with non-empty text
{
  // Find probes button
  const r = await page.evaluate(() => {
    const btn = document.getElementById('probesBtn') ||
                Array.from(document.querySelectorAll('button')).find(b => /probe/i.test(b.textContent || ''));
    if (!btn) return { ok: false, reason: 'no probes button' };
    btn.click();
    return { ok: true, btnText: btn.textContent };
  });
  if (!r.ok) {
    rec('12', false, JSON.stringify(r));
  } else {
    await page.waitForTimeout(800);
    const strip = await page.evaluate(() => {
      const el = document.getElementById('probeLegend');
      if (!el) return { exists: false };
      const cs = getComputedStyle(el);
      const visible = el.classList.contains('visible') && cs.display !== 'none' && cs.visibility !== 'hidden';
      return { sel: '#probeLegend', exists: true, visible, textLen: (el.textContent || '').trim().length, sample: (el.textContent || '').trim().slice(0, 60) };
    });
    rec('12', strip.exists && strip.visible && strip.textLen > 0, JSON.stringify(strip));
  }
}

// ISC-13: window.__test.version === "1.0"
{
  const v = await page.evaluate(() => window.__test?.version);
  rec('13', v === '1.0', `version=${JSON.stringify(v)}`);
}

let pass = 0;
for (const r of results) {
  console.log(`ISC-${r.id}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.note}`);
  if (r.pass) pass++;
}
console.log(`\nBASELINE: ${pass}/${results.length} PASS`);

await browser.close();
process.exit(pass === results.length ? 0 : 1);
