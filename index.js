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
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
  if (!fs.existsSync(CONFIG_PATH)) return defaults;

  // ממזגים מעל ברירת המחדל — כך notifications (נמענים) לעולם לא נעלמים
  // גם אם הממשק שמר רק sources+filters.
  const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    ...defaults,
    ...saved,
    notifications: { ...defaults.notifications, ...(saved.notifications || {}) },
  };
}
function saveConfig(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ── CORE SCAN ────────────────────────────────────────────────
// יד2 ומדלן נסרקים ע"י הסקריפט המקומי (IP ישראלי) ונכנסים דרך /api/ingest.
// כאן רץ רק טלגרם — קל ועובד מ-Railway.
async function runScan() {
  const config = loadConfig();
  const { filters, sources } = config;
  console.log('[scan] מתחיל סריקת טלגרם...');

  let results = [];
  if (sources.telegram) {
    try {
      results = await telegramScraper.scrape(sources);
    } catch (err) {
      console.error('[scan] טלגרם נכשל:', err.message);
    }
  }

  const filtered = applyFilters(results, filters);
  const newOnes  = filtered.filter(apt => isNew(apt.id));

  newOnes.forEach(apt => save(apt));
  console.log(`[scan] טלגרם: ${results.length} תוצאות → ${filtered.length} אחרי פילטר → ${newOnes.length} חדשות`);
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
  const [waOk, emailOk] = await Promise.all([
    whatsapp.sendDigest(unnotified, config),
    email.sendDigest(unnotified, config)
  ]);
  // מסמנים כנשלח רק אם לפחות ערוץ אחד הצליח — אחרת ננסה שוב בדיג'סט הבא
  if (waOk || emailOk) {
    markNotified(unnotified.map(a => a.id));
    console.log(`[digest] סומן כנשלח (WhatsApp=${waOk}, מייל=${emailOk})`);
  } else {
    console.warn('[digest] שתי השליחות נכשלו — לא מסמן כנשלח, ננסה שוב');
  }
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

// POST קבלת תוצאות מהסקריפט המקומי (יד2)
app.post('/api/ingest', (req, res) => {
  try {
    const apartments = req.body;
    if (!Array.isArray(apartments)) return res.status(400).json({ error: 'expected array' });
    const config = loadConfig();
    const { applyFilters } = require('./filters/filter');
    const filtered = applyFilters(apartments, config.filters);
    const newOnes = filtered.filter(apt => isNew(apt.id));
    newOnes.forEach(apt => save(apt));
    console.log(`[ingest] קיבלנו ${apartments.length} → ${filtered.length} פילטר → ${newOnes.length} חדשות`);
    res.json({ received: apartments.length, filtered: filtered.length, saved: newOnes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET בדיקת תצורת התראות — בוליאני בלבד, ללא ערכים, ללא שליחה
app.get('/api/notif-check', async (req, res) => {
  const config = loadConfig();
  const axios = require('axios');

  // בדיקת חיבוריות Green API מ-Railway (HTTP, ללא שליחת הודעה)
  let whatsappState = null;
  const iid = process.env.GREEN_API_INSTANCE_ID, tok = process.env.GREEN_API_TOKEN;
  if (iid && tok) {
    const host = process.env.GREEN_API_URL || 'https://7107.api.greenapi.com';
    try {
      const r = await axios.get(`${host}/waInstance${iid}/getStateInstance/${tok}`, { timeout: 10000 });
      whatsappState = `${host} → ${r.data?.stateInstance || JSON.stringify(r.data)}`;
    } catch (e) {
      whatsappState = `${host} → ERR ${e.response?.status || e.code}`;
    }
  }

  res.json({
    version: 'self-test-9',
    env: {
      GREEN_API_INSTANCE_ID: !!iid,
      GREEN_API_TOKEN:       !!tok,
      EMAIL_USER:            !!process.env.EMAIL_USER,
      EMAIL_PASS:            !!process.env.EMAIL_PASS,
    },
    whatsappState,
    recipients: (config.notifications?.recipients || []).map(r => ({ name: r.name, enabled: r.enabled !== false, hasPhone: !!r.phone, hasEmail: !!r.email })),
    unnotifiedCount: getUnnotified().length,
  });
});

// POST שליחת דיג'סט ידנית (לבדיקה)
app.post('/api/send-digest', async (req, res) => {
  try {
    // ?self=1 — בדיקת Brevo: מייל ל-ofek7pass בלבד, מחזיר שגיאה אמיתית אם יש
    if (req.query.self === '1') {
      const axios = require('axios');
      if (!process.env.BREVO_API_KEY) {
        return res.json({ ok: false, mode: 'self-test', error: 'BREVO_API_KEY חסר ב-Railway' });
      }
      try {
        const r = await axios.post('https://api.brevo.com/v3/smtp/email', {
          sender: { name: 'סוכן נדל"ן', email: process.env.EMAIL_USER || 'ofek7pass@gmail.com' },
          to: [{ email: 'ofek7pass@gmail.com' }],
          subject: '🏠 בדיקת סוכן נדל"ן',
          htmlContent: '<div dir="rtl">אם קיבלת מייל זה — מנגנון המייל (Brevo) עובד ✓</div>',
        }, { headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' }, timeout: 15000 });
        return res.json({ ok: true, mode: 'self-test', messageId: r.data?.messageId });
      } catch (e) {
        return res.json({ ok: false, mode: 'self-test', status: e.response?.status, error: JSON.stringify(e.response?.data) || e.message });
      }
    }
    await sendDailyDigest();
    res.json({ ok: true, mode: 'full' });
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
