const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 432, height: 768 } });
  p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => console.log('LOG', m.text()));
  await p.goto('http://127.0.0.1:8731/street.html?' + (process.argv[2] || ''));
  await p.waitForFunction(() => window.result, null, { timeout: 300000 });
  console.log((await p.evaluate(() => window.result)).join('\n'));
  await p.screenshot({ path: process.argv[3] || 'street.png' }); await b.close();
})();
