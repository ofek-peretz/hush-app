// Shoot every page build_assets.py wrote, at the size its <meta name="size"> declares.
// node brand/social/shoot_sized.mjs <dir>   (needs puppeteer-core and a local Chrome)
import puppeteer from 'puppeteer-core';
import { readdirSync, readFileSync } from 'node:fs';

const dir = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.html')).sort()) {
  const m = readFileSync(`${dir}/${f}`, 'utf8').match(/name="size" content="(\d+)x(\d+)"/);
  if (!m) continue;
  await page.setViewport({ width: +m[1], height: +m[2], deviceScaleFactor: 1 });
  await page.goto(`file:///${dir}/${f}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${dir}/${f.replace('.html', '.png')}` });
  console.log(f);
}
await browser.close();
