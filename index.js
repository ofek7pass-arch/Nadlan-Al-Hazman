require('dotenv').config();
const express = require('express');
const cron    = require('node-cron');
const fs      = require('fs');
const path    = require('path');

const yad2Scraper     = require('./scrapers/yad2');
const madlanScraper   = require('./scrapers/madlan');
const telegramScraper = require('./scrapers/telegram');
const { applyFilters } = require('./filters/filter');
const { isNew, save, getUnnotified, markNotified, getRecent } = require('./db/database');
const whatsapp = require('./notifiers/whatsapp');
const email    = require('./notifiers/email');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.json');
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

function loadConfig() {
  // data/config.json (Volume) קיים → השתמש בו; אחרת → ברירת מחדל
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
  return JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
}
function saveConfig(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ── CORE SCAN ────────────────────────────────────────────────
async function runScan() {
  const config = loadConfig();
  const { filters, sources } = config;
  console.log('[scan] מתחיל סריקה...');

  const scrapers = [];
  if (sources.yad2)    scrapers.push(yad2Scraper.scrape(filters));
  if (sources.madlan)  scrapers.push(madlanScraper.scrape(filters));
  if (sources.telegram) scrapers.push(telegramScraper.scrape(sources));

  const results = (await Promise.allSettled(scrapers))
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const filtered = applyFilters(results, filters);
  const newOnes  = filtered.filter(apt => isNew(apt.id));

  newOnes.forEach(apt => save(apt));
  console.log(`[scan] נמצאו ${results.length} תוצאות → ${filtered.length} אחרי פילטר → ${newOnes.length} חדשות`);
  return newOnes;
}

// ── DAILY DIGEST ─────────────────────────────────────────────
async function sendDailyDigest() {
  const config = loadConfig();
  const unnotified = getUnnotified();
  if (!unnotified.length) {
    console.log('[digest] אין דירות חדשות לשליחה');
    return;
  }
  console.log(`[digest] שולח ${unnotified.length} דירות...`);
  await Promise.all([
    whatsapp.sendDigest(unnotified, config),
    email.sendDigest(unnotified, config)
  ]);
  markNotified(unnotified.map(a => a.id));
}

// ── EXPRESS SERVER ────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET הגדרות
app.get('/api/settings', (req, res) => {
  res.json(loadConfig());
});

// POST שמירת הגדרות
app.post('/api/settings', (req, res) => {
  try {
    saveConfig(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET תוצאות אחרונות
app.get('/api/results', (req, res) => {
  res.json(getRecent(50));
});

// POST סריקה ידנית
app.post('/api/scan', async (req, res) => {
  try {
    const newOnes = await runScan();
    res.json({ found: newOnes.length, apartments: newOnes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET debug — מה הסריקה מחזירה לפני פילטר
app.get('/api/debug-scan', async (req, res) => {
  try {
    const config = loadConfig();
    const { filters, sources } = config;
    const scrapers = [];
    const wrap = (name, p) => p
      .then(r => ({ source: name, count: r.length, sample: r.slice(0, 2) }))
      .catch(e => ({ source: name, count: 0, error: e.message }));
    if (sources.yad2)     scrapers.push(wrap('יד2',   yad2Scraper.scrape(filters)));
    if (sources.madlan)   scrapers.push(wrap('מדלן',  madlanScraper.scrape(filters)));
    if (sources.telegram) scrapers.push(wrap('טלגרם', telegramScraper.scrape(sources)));
    const results = await Promise.allSettled(scrapers);
    res.json(results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET בדיקת Chromium + Puppeteer מהירה
app.get('/api/chrome-check', async (req, res) => {
  const { launchBrowser, getChromiumPath } = require('./scrapers/puppeteerHelper');
  const chromePath = getChromiumPath();
  let launched = false, title = null, err = null;
  try {
    const browser = await launchBrowser();
    launched = true;
    const page = await browser.newPage();
    await page.goto('about:blank', { timeout: 10000 });
    title = await page.title();
    await browser.close();
  } catch (e) { err = e.message; }
  res.json({ chromePath, launched, title, error: err });
});

// GET raw HTTP test — מה בדיוק מגיע מהשרתים (לאבחון)
app.get('/api/raw-test', async (req, res) => {
  const axios = require('axios');
  const config = loadConfig();
  const { filters } = config;
  const dealType = filters.dealType === 'buy' ? 'rent' : 'rent';
  const cityCode = '5000';
  const results = {};

  // test yad2 HTML scraping
  try {
    const params = new URLSearchParams({ city: cityCode, rooms: `${filters.rooms.min}-${filters.rooms.max}`, price: `${filters.price.min}-${filters.price.max}` });
    const url = `https://www.yad2.co.il/realestate/${dealType}?${params}`;
    const r = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'he-IL,he;q=0.9', 'Referer': 'https://www.yad2.co.il/' },
      timeout: 20000
    });
    const cheerio = require('cheerio');
    const $ = cheerio.load(r.data);
    const nextDataText = $('#__NEXT_DATA__').text();
    if (nextDataText) {
      const pp = JSON.parse(nextDataText)?.props?.pageProps || {};
      const ppKeys = Object.keys(pp);
      const feedItems = pp?.initialState?.feed?.feed_items || pp?.initialData?.feed?.feed_items || pp?.data?.feed?.feed_items || pp?.listings || [];
      results.yad2 = { status: r.status, hasNextData: true, pagePropsKeys: ppKeys, feedItemsCount: feedItems.length, sampleKeys: feedItems[0] ? Object.keys(feedItems[0]) : [] };
    } else {
      results.yad2 = { status: r.status, hasNextData: false, bodyPreview: r.data.slice(0, 200) };
    }
  } catch (e) {
    results.yad2 = { error: e.message, status: e.response?.status };
  }

  // test madlan graphql
  try {
    const r = await axios.post('https://www.madlan.co.il/api/graphql',
      { query: '{ __typename }' },
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json', 'Origin': 'https://www.madlan.co.il' }, timeout: 15000 }
    );
    results.madlan_gql = { status: r.status, preview: JSON.stringify(r.data).slice(0, 300) };
  } catch (e) {
    results.madlan_gql = { error: e.message, status: e.response?.status, preview: JSON.stringify(e.response?.data || '').slice(0, 200) };
  }

  // test madlan HTML
  try {
    const r = await axios.get(`https://www.madlan.co.il/for-rent/תל-אביב-יפו`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'he-IL,he;q=0.9' }, timeout: 15000
    });
    const cheerio = require('cheerio');
    const $ = cheerio.load(r.data);
    const hasNextData = !!$('#__NEXT_DATA__').text();
    const pp = hasNextData ? Object.keys(JSON.parse($('#__NEXT_DATA__').text())?.props?.pageProps || {}) : [];
    results.madlan_html = { status: r.status, hasNextData, pagePropsKeys: pp };
  } catch (e) {
    results.madlan_html = { error: e.message, status: e.response?.status };
  }

  res.json(results);
});

// POST שליחת דיג'סט ידנית (לבדיקה)
app.post('/api/send-digest', async (req, res) => {
  try {
    await sendDailyDigest();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SCHEDULER ────────────────────────────────────────────────
// סריקה כל 10 דקות
cron.schedule('*/10 * * * *', () => {
  runScan().catch(err => console.error('[cron scan]', err.message));
});

// דיג'סט יומי ב-19:30
cron.schedule('30 19 * * *', () => {
  sendDailyDigest().catch(err => console.error('[cron digest]', err.message));
}, { timezone: 'Asia/Jerusalem' });

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🏠 סוכן נדל"ן פועל על פורט ${PORT}`);
  console.log(`   ממשק: http://localhost:${PORT}`);
  runScan().catch(console.error);
});
