const axios   = require('axios');
const cheerio = require('cheerio');
const { launchBrowser, newStealthPage } = require('./puppeteerHelper');

function buildUrl(filters) {
  const type = filters.dealType === 'buy' ? 'for-sale' : 'for-rent';
  const city = encodeURIComponent(filters.cityName || 'תל אביב יפו');
  return `https://www.madlan.co.il/${type}/${city}?rooms=${filters.rooms.min}-${filters.rooms.max}&price=${filters.price.min}-${filters.price.max}`;
}

function extractListings(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return (
    obj?.listings?.items       ||
    obj?.initialData?.listings?.items ||
    obj?.data?.listings?.items ||
    obj?.listingsFeed?.items   ||
    obj?.listingItems          ||
    obj?.items                 ||
    []
  );
}

function mapListing(l, cityName) {
  return {
    id:          `madlan_${l.id || l.listingId}`,
    source:      'מדלן',
    address:     [l.street, l.houseNum, l.cityName || cityName].filter(Boolean).join(' '),
    price:       parseInt(l.price) || 0,
    rooms:       parseFloat(l.rooms) || 0,
    size_sqm:    parseInt(l.squareMeter || l.size) || 0,
    url:         `https://www.madlan.co.il/listing/${l.id || l.listingId}`,
    image_url:   l.images?.[0]?.url || '',
    description: l.description || '',
    raw:         l,
  };
}

async function tryHTML(url) {
  const { data, status } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9',
    },
    timeout: 20000,
  });
  const $ = cheerio.load(data);
  const raw = $('#__NEXT_DATA__').text();
  if (!raw) throw new Error('no-next-data');
  const pp = JSON.parse(raw)?.props?.pageProps || {};
  const listings = extractListings(pp);
  if (!listings.length) throw new Error(`empty. pageProps: ${Object.keys(pp).join(',')}`);
  return listings.map(i => i.listing || i);
}

async function tryPuppeteer(url, cityName) {
  const browser = await launchBrowser();
  try {
    const page = await newStealthPage(browser);

    // יירוט כל תגובות JSON
    const captured = [];
    page.on('response', async (resp) => {
      try {
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('json') && resp.status() === 200) {
          const json = await resp.json();
          captured.push({ url: resp.url(), json });
        }
      } catch {}
    });

    console.log(`[madlan/puppet] navigating: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
    console.log(`[madlan/puppet] title: ${await page.title()}`);

    // ניסיון 1: __NEXT_DATA__
    const nextRaw = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : null;
    });
    if (nextRaw) {
      const pp = JSON.parse(nextRaw)?.props?.pageProps || {};
      const raw = extractListings(pp);
      if (raw.length) {
        console.log(`[madlan/puppet] ${raw.length} מודעות מ-__NEXT_DATA__`);
        return raw.map(i => i.listing || i);
      }
      console.warn('[madlan/puppet] __NEXT_DATA__ ריק. מפתחות:', Object.keys(pp).join(','));
    }

    // ניסיון 2: API calls שנלכדו
    for (const { url: apiUrl, json } of captured) {
      const raw = extractListings(json?.data || json);
      if (raw.length) {
        console.log(`[madlan/puppet] ${raw.length} מודעות מ-${apiUrl}`);
        return raw.map(i => i.listing || i);
      }
    }

    console.warn('[madlan/puppet] 0 תוצאות. APIs שנלכדו:', captured.map(c => c.url).join(', ').slice(0, 300));
    return [];
  } finally {
    await browser.close();
  }
}

async function scrape(filters) {
  const url = buildUrl(filters);
  console.log(`[madlan] URL: ${url}`);

  try {
    const raw = await tryHTML(url);
    console.log(`[madlan] HTML הצליח: ${raw.length} מודעות`);
    return raw.map(l => mapListing(l, filters.cityName));
  } catch (htmlErr) {
    console.warn(`[madlan] HTML נכשל (${htmlErr.message}) — Puppeteer`);
    try {
      const raw = await tryPuppeteer(url, filters.cityName);
      console.log(`[madlan] Puppeteer: ${raw.length} מודעות`);
      return raw.map(l => mapListing(l, filters.cityName));
    } catch (pErr) {
      console.error('[madlan] Puppeteer נכשל:', pErr.message);
      return [];
    }
  }
}

module.exports = { scrape };
