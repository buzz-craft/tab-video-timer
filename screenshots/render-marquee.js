const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 560, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'promo-marquee.html'));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({
    path: path.join(__dirname, 'promo-marquee.png'),
    type: 'png',
    clip: { x: 0, y: 0, width: 1400, height: 560 }
  });
  console.log('✓ promo-marquee.png');
  await browser.close();
})();
