const { chromium } = require('playwright');
(async () => {
  const [,, port, models, out] = process.argv;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto(`http://127.0.0.1:${port}/index.html?m=${models}&g=${process.argv[5]||""}`);
  await p.waitForFunction(() => window.done, null, { timeout: 120000 });
  await p.screenshot({ path: out }); await b.close();
})();
