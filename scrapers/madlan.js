const axios   = require('axios');
const cheerio = require('cheerio');
const { execSync } = require('child_process');

// מציאת נתיב Chromium (nixpacks מתקין ב-PATH)
function getChromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    return execSync('which chromium || which chromium-browser || which google-chrome-stable || which google-chrome', { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    return '/usr/bin/chromium-browser';
  }
}

async function scrapeWithPuppeteer(url) {
  const puppeteer = require('puppeteer-core');
  const executablePath = getChromiumPath();
  console.log(`[madlan/puppet] chromium: ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9' });

    // יירוט תגובות ה-API של מדלן
    const apiData = [];
    page.on('response', async (response) => {
      const reqUrl = response.url();
      if ((reqUrl.includes('/api/') || reqUrl.includes('graphql') || reqUrl.includes('listings')) && response.status() === 200) {
        try {
          const ct = response.headers()['content-type'] || '';
          if (ct.includes('json')) {
            const json = await response.json();
            apiData.push({ url: reqUrl, data: json });
          }
        } catch {}
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // ניסיון 1: חפש __NEXT_DATA__
    const nextDataText = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : null;
    });

    if (nextDataText) {
      const pp = JSON.parse(nextDataText)?.props?.pageProps || {};
      const listings =
        pp?.listings?.items ||
        pp?.initialData?.listings?.items ||
        pp?.data?.listings?.items ||
        pp?.listingsFeed?.items ||
        pp?.listingItems ||
        [];
      if (listings.length) {
        console.log(`[madlan/puppet] נמצאו ${listings.length} מודעות מ-__NEXT_DATA__`);
        return listings.map(item => item.listing || item);
      }
      console.warn('[madlan/puppet] __NEXT_DATA__ קיים אבל ריק. מפתחות:', Object.keys(pp).join(', '));
    }

    // ניסיון 2: נתוני API שנלכדו
    for (const { data } of apiData) {
      const listings =
        data?.data?.searchListings?.listings ||
        data?.listings?.items ||
        data?.data?.listings ||
        data?.items ||
        [];
      if (listings.length) {
        console.log(`[madlan/puppet] נמצאו ${listings.length} מודעות מ-API intercept`);
        return listings;
      }
    }

    console.warn('[madlan/puppet] לא נמצאו מודעות. API calls שנלכדו:', apiData.map(a => a.url));
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeHTML(url) {
  const { data, status } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9',
    },
    timeout: 20000,
  });
  console.log(`[madlan/html] HTTP ${status}, ${data.length} תווים`);

  const $ = cheerio.load(data);
  const nextDataText = $('#__NEXT_DATA__').text();
  if (!nextDataText) throw new Error('אין __NEXT_DATA__');

  const pp = JSON.parse(nextDataText)?.props?.pageProps || {};
  const listings =
    pp?.listings?.items ||
    pp?.initialData?.listings?.items ||
    pp?.data?.listings?.items ||
    pp?.listingsFeed?.items ||
    pp?.listingItems ||
    [];

  if (!listings.length) {
    throw new Error(`pageProps ריק. מפתחות: ${Object.keys(pp).join(', ')}`);
  }
  return listings.map(item => item.listing || item);
}

function buildUrl(filters) {
  const dealType = filters.dealType === 'buy' ? 'for-sale' : 'for-rent';
  const city = encodeURIComponent(filters.cityName || 'תל אביב יפו');
  return `https://www.madlan.co.il/${dealType}/${city}?rooms=${filters.rooms.min}-${filters.rooms.max}&price=${filters.price.min}-${filters.price.max}`;
}

async function scrape(filters) {
  const url = buildUrl(filters);
  let rawListings = [];

  // ניסיון ראשון: HTML סטטי (מהיר)
  try {
    rawListings = await scrapeHTML(url);
    console.log(`[madlan] HTML הצליח: ${rawListings.length} מודעות`);
  } catch (htmlErr) {
    console.warn(`[madlan] HTML נכשל (${htmlErr.message}) — מנסה Puppeteer`);
    try {
      rawListings = await scrapeWithPuppeteer(url);
    } catch (puppetErr) {
      console.error('[madlan] Puppeteer נכשל:', puppetErr.message);
      return [];
    }
  }

  return rawListings.map(l => ({
    id:          `madlan_${l.id || l.listingId}`,
    source:      'מדלן',
    address:     [l.street, l.houseNum, l.cityName || filters.cityName].filter(Boolean).join(' '),
    price:       parseInt(l.price) || 0,
    rooms:       parseFloat(l.rooms) || 0,
    size_sqm:    parseInt(l.squareMeter || l.size) || 0,
    url:         `https://www.madlan.co.il/listing/${l.id || l.listingId}`,
    image_url:   l.images?.[0]?.url || '',
    description: l.description || '',
    raw:         l,
  }));
}

module.exports = { scrape };
