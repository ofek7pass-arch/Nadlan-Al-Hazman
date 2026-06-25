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
const { haversineKm, baseCoords } = require('./geo');

// ── הגדרות ──────────────────────────────────────────────────────
const CHROME       = 'C:\\Users\\OfekPass\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const RAILWAY_URL  = (process.env.RAILWAY_URL || 'https://nadlan-al-hazman-production.up.railway.app').replace(/\/$/, '');

// תתי-אזורים ביד2 לסריקה (ניתן להרחיב). 52 = אזור גדרה-יבנה (כולל גן יבנה).
// כל אזור: { slug: region-slug ל-URL, area: קוד תת-אזור }
const YAD2_AREAS = [
  { slug: 'south', area: '52' }, // גדרה, יבנה, גן יבנה, בני עי"ש והסביבה
];

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
function sendToRailway(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
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
function buildUrl(areaDef, filters, page = 1) {
  const p = new URLSearchParams({
    area:     areaDef.area,
    minRooms: filters.rooms?.min ?? 2,
    maxRooms: filters.rooms?.max ?? 7,
    minPrice: filters.price?.min ?? 3000,
    maxPrice: filters.price?.max ?? 10000,
    page,
  });
  if (filters.sizeSqm?.min > 0) p.set('minSquareMeter', filters.sizeSqm.min);
  if (filters.sizeSqm?.max > 0) p.set('maxSquareMeter', filters.sizeSqm.max);
  return `https://www.yad2.co.il/realestate/rent/${areaDef.slug}?${p}`;
}

function extractApartments(feed) {
  const items = [
    ...(feed.private || []),
    ...(feed.agency  || []),
    ...(feed.platinum || []),
    ...(feed.booster  || []),
    ...((feed.yad1?.listingsByTiersMatch) || []),
  ];
  return items.map(a => {
    const c = a.address?.coords || {};
    return {
      id:          `yad2_${a.token || a.orderId}`,
      source:      'יד2',
      address:     [a.address?.street?.text, a.address?.house?.number, a.address?.city?.text].filter(Boolean).join(' '),
      price:       parseInt(a.price) || 0,
      rooms:       parseFloat(a.additionalDetails?.roomsCount) || 0,
      size_sqm:    parseInt(a.additionalDetails?.squareMeter) || 0,
      url:         `https://www.yad2.co.il/item/${a.token || a.orderId}`,
      image_url:   a.metaData?.coverImage || '',
      description: a.additionalDetails?.property?.text || '',
      lat:         c.lat,
      lon:         c.lon,
      raw:         { property_group: a.additionalDetails?.property?.text, tags: a.tags || [] },
    };
  });
}

// טוען עמוד יד2 בודד; מנסה שוב אם ShieldSquare חוסם (אין __NEXT_DATA__)
async function loadPage(browser, url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
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
      if (result) return result;
      console.warn(`[yad2] ניסיון ${i}/${attempts}: ShieldSquare challenge, מנסה שוב...`);
    } catch (e) {
      console.warn(`[yad2] ניסיון ${i}/${attempts} נכשל: ${e.message}`);
    } finally {
      await page.close();
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}

async function scrapeArea(browser, areaDef, filters) {
  const areaApts = [];
  let totalPages = 1;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const url = buildUrl(areaDef, filters, pageNum);
    const result = await loadPage(browser, url);
    if (!result) {
      console.warn(`[yad2] אזור ${areaDef.area} עמוד ${pageNum}: נכשל`);
      if (pageNum === 1) return null; // האזור כולו נכשל
      break;
    }
    if (pageNum === 1 && result.pagination?.totalPages) {
      totalPages = Math.min(result.pagination.totalPages, 10);
      console.log(`[yad2] אזור ${areaDef.area}: ${result.pagination.total} מודעות, ${totalPages} עמודים`);
    }
    areaApts.push(...extractApartments(result.feed));
  }
  return areaApts;
}

// סורק את כל האזורים. מחזיר { apts, ok } — ok=false אם אף אזור לא נסרק
async function scrapeYad2(browser, filters) {
  const all = [];
  let anyOk = false;
  for (const areaDef of YAD2_AREAS) {
    const apts = await scrapeArea(browser, areaDef, filters);
    if (apts !== null) { anyOk = true; all.push(...apts); }
  }
  return { apts: all, ok: anyOk };
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

  const filters = settings.filters;
  const radiusKm = filters.radiusKm || 0;
  const base = baseCoords(filters.cityName);

  // סינון רדיוס: מודעה בתוך radiusKm מעיר הבסיס (אם יש קואורדינטות לשתיהן)
  function withinRadius(apt) {
    if (!base || !radiusKm) return true;          // אין רדיוס מוגדר → לא מסננים
    if (apt.lat == null || apt.lon == null) return true; // אין קואורדינטות → לא מסננים החוצה
    return haversineKm(base.lat, base.lon, apt.lat, apt.lon) <= radiusKm;
  }

  const apartments = [];
  const scannedSources = [];

  // ── יד2 (Puppeteer + Chrome) ──
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: path.join(__dirname, 'chrome-profile'),
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const { apts, ok } = await scrapeYad2(browser, filters);
    if (ok) {
      const inRadius = apts.filter(withinRadius);
      apartments.push(...inRadius);
      scannedSources.push('יד2');
      console.log(`[yad2] ${apts.length} מודעות → ${inRadius.length} ברדיוס`);
    } else {
      console.warn('[yad2] כל האזורים נכשלו — לא מסמן כנסרק (לא נמחק מ-DB)');
    }
  } catch (e) {
    console.error('[yad2] שגיאה:', e.message);
  } finally {
    await browser.close();
  }

  // ── מדלן (GraphQL) — כבר מסונן לרדיוס בתוך madlan.scrape ──
  try {
    const madlanApts = await madlan.scrape(filters);
    apartments.push(...madlanApts);
    scannedSources.push('מדלן');
  } catch (e) {
    console.error('[madlan] שגיאה:', e.message);
  }

  // העשרת כל מודעה במרחק מעיר הבסיס (למיון בטאב — הקרובות קודם)
  if (base) {
    apartments.forEach(a => {
      if (a.lat != null && a.lon != null) {
        a.distance_km = Math.round(haversineKm(base.lat, base.lon, a.lat, a.lon) * 10) / 10;
      }
    });
  }

  console.log(`[scraper] סה"כ ${apartments.length} מודעות (מקורות שנסרקו: ${scannedSources.join(', ') || '—'})`);

  // שלח ל-Railway (כולל אילו מקורות נסרקו — לתיקוף/מחיקת שנעלמו)
  try {
    const result = await sendToRailway({ apartments, scannedSources });
    console.log(`[scraper] Railway: ${result.saved} חדשות, ${result.removed} הוסרו`);
  } catch (e) {
    console.error('[scraper] שגיאה בשליחה ל-Railway:', e.message);
  }
}

main().catch(err => { console.error('[scraper] שגיאה:', err.message); process.exit(1); });
