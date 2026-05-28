const puppeteer = require('puppeteer');
const path = require('path');

const shots = [
  { file: 'shot1.html', out: 'screenshot-1-tab-titles.png' },
  { file: 'shot2.html', out: 'screenshot-2-now-playing.png' },
  { file: 'shot3.html', out: 'screenshot-3-stats.png' },
  { file: 'shot4.html', out: 'screenshot-4-options.png' },
  { file: 'shot5.html', out: 'screenshot-5-overlay.png' },
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  for (const s of shots) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(__dirname, s.file));
    await new Promise(r => setTimeout(r, 300));
    const outPath = path.join(__dirname, s.out);
    await page.screenshot({ path: outPath, type: 'png', clip: { x:0, y:0, width:1280, height:800 } });
    console.log('✓', s.out);
    await page.close();
  }
  await browser.close();
})();
