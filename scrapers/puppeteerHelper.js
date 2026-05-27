const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '/usr/bin/chromium';

async function launchBrowser() {
  const puppeteer = require('puppeteer-core');
  console.log(`[puppeteer] launching chromium: ${CHROMIUM_PATH}`);
  return puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,768',
    ],
    headless: true,
  });
}

async function newStealthPage(browser) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });
  return page;
}

module.exports = { launchBrowser, newStealthPage, CHROMIUM_PATH };
