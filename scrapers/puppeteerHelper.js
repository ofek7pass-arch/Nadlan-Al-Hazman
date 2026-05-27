const { execSync } = require('child_process');

function getChromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const result = execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null',
      { encoding: 'utf8' }
    ).trim().split('\n')[0];
    if (result) return result;
  } catch {}
  // nixpacks nix store path fallback
  try {
    const storePath = execSync('ls /nix/store | grep chromium | head -1', { encoding: 'utf8' }).trim();
    if (storePath) return `/nix/store/${storePath}/bin/chromium`;
  } catch {}
  return '/usr/bin/chromium';
}

async function launchBrowser() {
  const puppeteer = require('puppeteer-core');
  const executablePath = getChromiumPath();
  console.log(`[puppeteer] chromium path: ${executablePath}`);
  return puppeteer.launch({
    executablePath,
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

module.exports = { launchBrowser, newStealthPage, getChromiumPath };
