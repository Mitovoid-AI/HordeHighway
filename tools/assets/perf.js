// Measure frame interval + renderer stats on the menu screen. usage: node perf.js <url>
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 432, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(process.argv[2]);
  await p.waitForFunction(() => !document.getElementById('play').disabled, null, { timeout: 300000 });
  const r = await p.evaluate(() => new Promise((res) => {
    const t = []; let last = performance.now();
    function f(now) { t.push(now - last); last = now; if (t.length < 8) requestAnimationFrame(f); else res(t); }
    requestAnimationFrame(f);
  }));
  const s = await p.evaluate(() => window.__hh.stats());
  console.log('frame ms', r.map(Math.round).join(' '), 'draw', s.drawCalls, 'tris', s.triangles, 'errors', errs);
  await b.close();
})();
