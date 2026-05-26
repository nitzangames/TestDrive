// Renders mockups/render-c.html via headless Chrome and saves the
// 512×512 viewport as thumbnail.png in the project root.
//
// Requires the dev server to be running (port 8086) and the global
// puppeteer install at /usr/local/bin/puppeteer.

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'thumbnail.png');
const url = 'http://localhost:8086/mockups/render-c.html';

const browser = await puppeteer.launch({ headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  // Wait for the render loop's "ready" signal.
  await page.waitForFunction('window.__rendered === true', { timeout: 10_000 });
  // Tiny extra delay so the final frame settles.
  await new Promise(r => setTimeout(r, 120));
  await page.screenshot({ path: outPath, type: 'png', omitBackground: false });
  console.log(`wrote ${outPath}`);
} finally {
  await browser.close();
}
