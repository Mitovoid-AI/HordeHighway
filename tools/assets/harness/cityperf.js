const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const qs of process.argv.slice(2)) {
    const p = await b.newPage();
    p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto('http://127.0.0.1:8731/city.html?' + qs);
    await p.waitForFunction(() => window.result, null, { timeout: 300000 });
    console.log(qs, '=>', await p.evaluate(() => window.result));
    await p.close();
  }
  await b.close();
})();
