const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [,, glb, models, outDir] = process.argv;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://127.0.0.1:8731/bake.html?g=${glb}&m=${models}`);
  await p.waitForFunction(() => window.result, null, { timeout: 600000 });
  const r = await p.evaluate(() => window.result);
  fs.mkdirSync(outDir, { recursive: true });
  const meta = {};
  for (const [name, d] of Object.entries(r)) {
    for (const [k, url] of Object.entries(d.views)) fs.writeFileSync(`${outDir}/${name}_${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
    meta[name] = { min: d.min, max: d.max, zFront: d.zFront };
  }
  fs.writeFileSync(`${outDir}/meta.json`, JSON.stringify(meta, null, 1));
  console.log(JSON.stringify(meta));
  await b.close();
})();
