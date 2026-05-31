/**
 * סקריפט מקומי — יד2 גדרה
 * רץ על המחשב עם Chrome ישראלי, שולח תוצאות ל-Railway
 *
 * הרצה: node scraper.js
 * הגדר RAILWAY_URL בקובץ .env
 */

const puppeteer = require('puppeteer-core');
const https     = require('https');
const path      = require('path');
const fs        = require('fs');
const madlan    = require('./madlan');

// ── הגדרות ──────────────────────────────────────────────────────
const CHROME       = 'C:\\Users\\OfekPass\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const RAILWAY_URL  = (process.env.RAILWAY_URL || 'https://nadlan-al-hazman-production.up.railway.app').replace(/\/$/, '');
const CITY_CODE    = '2550';
const AREA         = '52';
const AREA_SLUG    = 'south';

// ── fetch settings מ-Railway ────────────────────────────────────
function fetchSettings() {
  return new Promise((resolve, reject) => {
    https.get(`${RAILWAY_URL}/api/settings`, { headers: { Accept: 'application/json' } }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

// ── שליחת תוצאות ל-Railway ──────────────────────────────────────
function sendToRailway(apartments) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(apartments);
    const u = new URL(`${RAILWAY_URL}/api/ingest`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── סריקת דף יד2 ────────────────────────────────────────────────
function buildUrl(filters, page = 1) {
  const p = new URLSearchParams({
    area:     AREA,
    city:     CITY_CODE,
    minRooms: filters.rooms?.min ?? 2,
    maxRooms: filters.rooms?.max ?? 7,
    minPrice: filters.price?.min ?? 3000,
    maxPrice: filters.price?.max ?? 10000,
    page,
  });
  if (filters.sizeSqm?.min > 0) p.set('minSquareMeter', filters.sizeSqm.min);
  if (filters.sizeSqm?.max > 0) p.set('maxSquareMeter', filters.sizeSqm.max);
  return `https://www.yad2.co.il/realestate/rent/${AREA_SLUG}?${p}`;
}

function extractApartments(feed) {
  const items = [
    ...(feed.private || []),
    ...(feed.agency  || []),
    ...(feed.platinum || []),
    ...(feed.booster  || []),
    ...((feed.yad1?.listingsByTiersMatch) || []),
  ];
  return items.map(a => ({
    id:          `yad2_${a.token || a.orderId}`,
    source:      'יד2',
    address:     [a.address?.street?.text, a.address?.house?.number, a.address?.city?.text].filter(Boolean).join(' '),
    price:       parseInt(a.price) || 0,
    rooms:       parseFloat(a.additionalDetails?.roomsCount) || 0,
    size_sqm:    parseInt(a.additionalDetails?.squareMeter) || 0,
    url:         `https://www.yad2.co.il/item/${a.token || a.orderId}`,
    image_url:   a.metaData?.coverImage || '',
    description: a.additionalDetails?.property?.text || '',
    raw:         { property_group: a.additionalDetails?.property?.text, tags: a.tags || [] },
  }));
}

async function scrapeAllPages(browser, filters) {
  const allApts = [];
  let totalPages = 1;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const url = buildUrl(filters, pageNum);
    console.log(`[yad2] עמוד ${pageNum}/${totalPages}: ${url}`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const result = await page.evaluate(() => {
        const nd = document.getElementById('__NEXT_DATA__');
        if (!nd) return null;
        const d = JSON.parse(nd.textContent);
        const pp = d?.props?.pageProps || {};
        return { feed: pp.feed || {}, pagination: pp.feed?.pagination };
      });

      if (!result) {
        console.warn(`[yad2] עמוד ${pageNum}: אין __NEXT_DATA__`);
        break;
      }

      if (pageNum === 1 && result.pagination?.totalPages) {
        totalPages = Math.min(result.pagination.totalPages, 10); // מקסימום 10 עמודים
        console.log(`[yad2] סה"כ עמודים: ${totalPages}, מודעות: ${result.pagination.total}`);
      }

      const apts = extractApartments(result.feed);
      allApts.push(...apts);
      console.log(`[yad2] עמוד ${pageNum}: ${apts.length} מודעות`);
    } finally {
      await page.close();
    }
  }

  return allApts;
}

// ── main ─────────────────────────────────────────────────────────
async function main() {
  console.log(`[scraper] מתחיל סריקה — ${new Date().toLocaleString('he-IL')}`);

  // טען הגדרות מ-Railway
  let settings;
  try {
    settings = await fetchSettings();
    console.log('[scraper] הגדרות נטענו מ-Railway');
  } catch (e) {
    console.error('[scraper] לא הצלחתי לטעון הגדרות:', e.message);
    process.exit(1);
  }

  const apartments = [];

  // ── יד2 (Puppeteer + Chrome) ──
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const yad2Apts = await scrapeAllPages(browser, settings.filters);
    apartments.push(...yad2Apts);
  } catch (e) {
    console.error('[yad2] שגיאה:', e.message);
  } finally {
    await browser.close();
  }

  // ── מדלן (GraphQL) ──
  try {
    const madlanApts = await madlan.scrape(settings.filters);
    apartments.push(...madlanApts);
  } catch (e) {
    console.error('[madlan] שגיאה:', e.message);
  }

  if (!apartments.length) {
    console.log('[scraper] לא נמצאו מודעות');
    return;
  }
  console.log(`[scraper] סה"כ ${apartments.length} מודעות (יד2 + מדלן)`);

  // שלח ל-Railway
  try {
    const result = await sendToRailway(apartments);
    console.log(`[scraper] נשלחו ${apartments.length} → Railway: ${result.saved} חדשות נשמרו`);
  } catch (e) {
    console.error('[scraper] שגיאה בשליחה ל-Railway:', e.message);
  }
}

main().catch(err => { console.error('[scraper] שגיאה:', err.message); process.exit(1); });
