/** Screenshot a harness html via headless Chrome: node shot.js <in.html> <out.png> [WxH] */
const { execFileSync } = require('child_process');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const html = path.resolve(process.argv[2]);
const png = path.resolve(process.argv[3]);
const size = process.argv[4] || '1420,560';
execFileSync(CHROME, [
  '--headless=new',
  '--disable-gpu',
  `--window-size=${size}`,
  `--screenshot=${png}`,
  'file:///' + html.split(path.sep).join('/'),
], { stdio: 'ignore' });
console.log('shot', png);
