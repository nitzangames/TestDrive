const puppeteer = require('/usr/local/lib/node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[error] ${err.message}`));

  await page.goto('http://127.0.0.1:8086/', { waitUntil: 'load', timeout: 60000 });

  try {
    await page.waitForSelector('#start-btn', { timeout: 60000 });
  } catch (e) {
    console.log('Start button never appeared; capturing what we have.');
    await page.screenshot({ path: '/tmp/td-boot-stuck.png' });
    console.log('=== Console logs so far ===');
    for (const l of logs) console.log(l);
    await browser.close();
    return;
  }
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: '/tmp/td-menu.png' });

  await page.evaluate(() => document.getElementById('start-btn').click());
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/td-drive-1s.png' });

  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/td-drive-5s.png' });

  // Dump spawn info + a few road segments near spawn for diagnosis.
  const diag = await page.evaluate(() => {
    const g = window.__diag;
    if (!g) return { error: 'no __diag' };
    return {
      spawn: g.spawn,
      nodeCount: g.nodeCount,
      edgeCount: g.edgeCount,
      spawnNodeEdges: g.spawnNodeEdges,
      car: g.getCar(),
      cam: g.getCam(),
      activeRoads: g.activeRoads(),
    };
  });

  console.log('=== Console logs ===');
  for (const l of logs) console.log(l);
  console.log('=== Diag ===');
  console.log(JSON.stringify(diag, null, 2));

  await browser.close();
})();
