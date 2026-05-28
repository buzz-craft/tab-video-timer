const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'promo-small.html'));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({
    path: path.join(__dirname, 'promo-small.png'),
    type: 'png',
    clip: { x: 0, y: 0, width: 440, height: 280 }
  });
  console.log('✓ promo-small.png');
  await browser.close();
})();
