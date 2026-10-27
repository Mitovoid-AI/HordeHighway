// HTML5 smoke test: menu -> PLAY -> autopilot run; screenshots + console errors + stats.
// usage: node smoke.js <url> <outPrefix> [seconds]
const { chromium } = require('playwright');
(async () => {
  const [,, url, out, secs = '40'] = process.argv;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 1 });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto(url);
  await p.waitForFunction(() => document.getElementById('play') && !document.getElementById('play').disabled, null, { timeout: 180000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out + '-menu.png', timeout: 120000 });
  await p.click('#play');
  const t0 = Date.now();
  let shots = 0, held = null; const fired = {};
  const stats = [];
  while (Date.now() - t0 < Number(secs) * 1000) {
    const s = await p.evaluate(() => window.__hh.stats());
    stats.push(s);
    if (s.state !== 'playing') break;
    // Autopilot: head for the better gate of the next pair, else stay centred.
    let target = 0;
    const next = s.gates.filter((g) => !g.used && g.z < s.z).sort((a, c) => c.z - a.z)[0];
    if (next) {
      const val = (g) => { const n = +g.slice(1); return g[0] === '+' ? s.count + n : g[0] === '×' ? s.count * n : g[0] === '-' ? s.count - n : Math.floor(s.count / n); };
      target = val(next.sides[0]) >= val(next.sides[1]) ? -2.5 : 2.5;
    }
    const want = Math.abs(target - s.x) < 0.4 ? null : target < s.x ? 'ArrowLeft' : 'ArrowRight';
    if (want !== held) { if (held) await p.keyboard.up(held); if (want) await p.keyboard.down(want); held = want; }
    const el = Date.now() - t0;
    if (process.env.SKILLS && !fired.inferno && el > Number(secs) * 300) { fired.inferno = 1; await p.keyboard.press('Digit3'); await p.waitForTimeout(2500); await p.screenshot({ path: out + '-inferno.png', timeout: 120000 }); }
    if (process.env.SKILLS && !fired.shock && el > Number(secs) * 600) { fired.shock = 1; await p.keyboard.press('Digit2'); await p.waitForTimeout(300); await p.screenshot({ path: out + '-shock.png', timeout: 120000 }); }
    if (shots < 4 && el > (shots + 1) * (Number(secs) * 1000 / 5)) { await p.screenshot({ path: `${out}-run${shots}.png`, timeout: 120000 }); shots++; }
    await p.waitForTimeout(100);
  }
  if (held) await p.keyboard.up(held);
  const last = stats[stats.length - 1];
  await p.screenshot({ path: out + '-end.png', timeout: 120000 });
  const maxDraw = Math.max(...stats.map((s) => s.drawCalls)), maxTris = Math.max(...stats.map((s) => s.triangles));
  console.log(JSON.stringify({ state: last.state, z: Math.round(last.z), count: last.count, kills: last.kills, weapon: last.weapon,
    gatesUsed: last.gates.filter((g) => g.used).length, physics: last.physics, maxDrawCalls: maxDraw, maxTriangles: maxTris, errors }, null, 1));
  await b.close();
})();
