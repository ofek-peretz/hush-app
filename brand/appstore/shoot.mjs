// Shoot every page build_slides.py wrote: node brand/appstore/shoot.mjs <dir>
// Needs puppeteer-core and a local Chrome.
import puppeteer from 'puppeteer-core';
import { readdirSync } from 'node:fs';

const dir = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.html')).sort()) {
  const watch = f.startsWith('watch');
  await page.setViewport({ width: watch ? 396 : 1284, height: watch ? 484 : 2778, deviceScaleFactor: 1 });
  await page.goto(`file:///${dir}/${f}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${dir}/${f.replace('.html', '.png')}` });
  console.log(f);
}
await browser.close();
