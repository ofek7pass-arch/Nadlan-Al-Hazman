const axios  = require('axios');
const cheerio = require('cheerio');
const { launchBrowser, newStealthPage } = require('./puppeteerHelper');

const CITY_CODES = {
  'תל אביב': '5000', 'ירושלים': '3000', 'חיפה': '4000', 'באר שבע': '70',
  'רמת גן': '8600', 'גבעתיים': '6300', 'פתח תקווה': '7900', 'ראשון לציון': '8300',
  'נס ציונה': '7400', 'רחובות': '8100', 'הרצליה': '6600', 'כפר סבא': '7100',
  'רעננה': '8400', 'נתניה': '7500', 'חולון': '6700', 'בת ים': '290',
  'אשדוד': '70', 'אשקלון': '60', 'מודיעין': '1200', 'רמת השרון': '8700',
  'הוד השרון': '390', 'יהוד': '430', 'לוד': '7200', 'רמלה': '8200',
  'נהריה': '7300', 'עכו': '7700', 'טבריה': '5100', 'צפת': '9700',
  'קריית שמונה': '2400', 'אילת': '200', 'גדרה': '6900', 'יבנה': '7600',
  'רמלה': '8200', 'לוד': '7200', 'קריית מלאכי': '9900', 'אשדוד': '70',
  'קריית גת': '9800', 'בית שמש': '9000', 'אלעד': '1300', 'קריית אונו': '8500',
  'אור יהודה': '290', 'בני ברק': '6200', 'רהט': '8800',
};

function buildUrl(filters) {
  const type = filters.dealType === 'buy' ? 'forsale' : 'rent';
  const cityCode = CITY_CODES[filters.cityName];
  const base = new URLSearchParams({
    rooms:       `${filters.rooms.min}-${filters.rooms.max}`,
    price:       `${filters.price.min}-${filters.price.max}`,
    squareMeter: `${filters.sizeSqm?.min || 0}-${filters.sizeSqm?.max || 300}`,
  });
  if (cityCode) base.set('city', cityCode);
  return `https://www.yad2.co.il/realestate/${type}?${base}`;
}

function extractItems(pp) {
  return (
    pp?.initialState?.feed?.feed_items ||
    pp?.initialData?.feed?.feed_items   ||
    pp?.data?.feed?.feed_items          ||
    pp?.listings                        ||
    []
  );
}

function parseItems(items) {
  return items
    .filter(i => i.type === 'ad' || i.orderId || i.id)
    .map(i => ({
      id:          `yad2_${i.id || i.orderId}`,
      source:      'יד2',
      address:     [i.street, i.StreetNumber, i.city].filter(Boolean).join(' '),
      price:       parseInt(i.price) || 0,
      rooms:       parseFloat(i.rooms) || 0,
      size_sqm:    parseInt(i.squaremeter || i.squareMeter) || 0,
      url:         `https://www.yad2.co.il/item/${i.id || i.orderId}`,
      image_url:   i.images?.[0]?.src || i.mainImage || '',
      description: i.info_text || i.infoText || '',
      raw:         i,
    }));
}

// ניסיון HTML מהיר (עובד רק ב-IP שאינו חסום)
async function tryHTML(url) {
  const { data, status } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9',
      'Referer': 'https://www.yad2.co.il/',
    },
    timeout: 15000,
  });
  if (data.includes('אבטחת אתר')) throw new Error('security-challenge');
  const $ = cheerio.load(data);
  const raw = $('#__NEXT_DATA__').text();
  if (!raw) throw new Error('no-next-data');
  const pp = JSON.parse(raw)?.props?.pageProps || {};
  const items = extractItems(pp);
  if (!items.length) {
    const keys = Object.keys(pp);
    throw new Error(`empty-feed. pageProps keys: ${keys.join(',')}`);
  }
  return parseItems(items);
}

// Puppeteer עם stealth — עוקף את אבטחת יד2
async function tryPuppeteer(url) {
  const browser = await launchBrowser();
  try {
    const page = await newStealthPage(browser);

    // יירוט תגובות ה-API הפנימי של יד2
    const captured = [];
    page.on('response', async (resp) => {
      try {
        const u = resp.url();
        if (u.includes('feed-search') || u.includes('feed_items') || (u.includes('gw.yad2.co.il') && resp.status() === 200)) {
          const ct = resp.headers()['content-type'] || '';
          if (ct.includes('json')) {
            const json = await resp.json();
            captured.push(json);
          }
        }
      } catch {}
    });

    console.log(`[yad2/puppet] navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });

    const title = await page.title();
    console.log(`[yad2/puppet] title: ${title}`);

    // ניסיון 1: __NEXT_DATA__
    const nextRaw = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : null;
    });

    if (nextRaw) {
      const pp = JSON.parse(nextRaw)?.props?.pageProps || {};
      const items = extractItems(pp);
      if (items.length) {
        console.log(`[yad2/puppet] ${items.length} פריטים מ-__NEXT_DATA__`);
        return parseItems(items);
      }
      console.warn('[yad2/puppet] __NEXT_DATA__ ריק. מפתחות:', Object.keys(pp).join(','));
    }

    // ניסיון 2: captured API calls
    for (const json of captured) {
      const items = extractItems(json?.data || json?.props?.pageProps || json);
      if (items.length) {
        console.log(`[yad2/puppet] ${items.length} פריטים מ-API intercept`);
        return parseItems(items);
      }
    }

    console.warn('[yad2/puppet] 0 תוצאות. captured API calls:', captured.length);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrape(filters) {
  const url = buildUrl(filters);
  console.log(`[yad2] URL: ${url}`);

  try {
    const items = await tryHTML(url);
    console.log(`[yad2] HTML הצליח: ${items.length} מודעות`);
    return items;
  } catch (err) {
    if (err.message !== 'security-challenge') {
      console.warn(`[yad2] HTML נכשל: ${err.message}`);
    } else {
      console.log('[yad2] security challenge — עובר ל-Puppeteer');
    }
    try {
      const items = await tryPuppeteer(url);
      console.log(`[yad2] Puppeteer הצליח: ${items.length} מודעות`);
      return items;
    } catch (pErr) {
      console.error('[yad2] Puppeteer נכשל:', pErr.message);
      return [];
    }
  }
}

module.exports = { scrape };
