const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 128, height: 128, deviceScaleFactor: 2 }); // 2x for crispness
  await page.goto('file://' + path.join(__dirname, 'icon-src.html'));
  await new Promise(r => setTimeout(r, 300));
  // screenshot at physical 256x256, then we'll resize with PIL
  await page.screenshot({
    path: path.join(__dirname, 'icon-raw-256.png'),
    type: 'png',
    clip: { x: 0, y: 0, width: 128, height: 128 }
  });
  console.log('✓ icon-raw-256.png (256x256 physical due to deviceScaleFactor=2)');
  await browser.close();
})();
