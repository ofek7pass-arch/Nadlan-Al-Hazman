const axios = require('axios');

const INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const API_TOKEN   = process.env.GREEN_API_TOKEN;
// כתובת ה-host הספציפית לאינסטנס (greenapi.com — לא api.green-api.com שחסום מ-Railway).
// כתובת קבועה ומוכחת (כמו הסוכן האישי). ניתן לעקוף עם GREEN_API_URL.
const API_HOST    = process.env.GREEN_API_URL || 'https://7107.api.greenapi.com';
const BASE_URL    = `${API_HOST}/waInstance${INSTANCE_ID}`;

// מחזיר טלפונים של נמענים מסומנים (enabled). תומך גם במבנה הישן (phones[]).
function enabledPhones(config) {
  const n = config.notifications || {};
  if (Array.isArray(n.recipients)) {
    return n.recipients.filter(r => r.enabled !== false && r.phone).map(r => r.phone);
  }
  return n.phones || [];
}

// המרת מספר ישראלי לפורמט chatId של Green API
function toChatId(phone) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('972') ? digits : '972' + digits.replace(/^0/, '');
  return `${normalized}@c.us`;
}

async function sendMessage(phone, text) {
  if (!INSTANCE_ID || !API_TOKEN) {
    console.warn('[whatsapp] GREEN_API_INSTANCE_ID או GREEN_API_TOKEN חסרים ב-.env');
    return;
  }
  try {
    await axios.post(`${BASE_URL}/sendMessage/${API_TOKEN}`, {
      chatId: toChatId(phone),
      message: text
    });
    console.log(`[whatsapp] נשלח ל-${phone}`);
    return true;
  } catch (err) {
    console.error(`[whatsapp] שגיאה בשליחה ל-${phone}:`, err.response?.status || err.message);
    return false;
  }
}

async function sendDigest(apartments, config) {
  if (!apartments.length) return;

  const lines = apartments.map((apt, i) =>
    `${i + 1}. *${apt.address || 'כתובת לא ידועה'}*\n` +
    `   ${apt.rooms ? apt.rooms + ' חד׳' : ''} ${apt.size_sqm ? '| ' + apt.size_sqm + ' מ"ר' : ''}\n` +
    `   💰 ${apt.price ? apt.price.toLocaleString('he-IL') + ' ₪' : 'מחיר לא צוין'}\n` +
    `   🔗 ${apt.url}`
  );

  const text =
    `🏠 *סוכן נדל"ן — סיכום יומי*\n` +
    `נמצאו *${apartments.length}* דירות מתאימות:\n\n` +
    lines.join('\n\n');

  const phones = enabledPhones(config);
  if (!phones.length) return false;
  const results = await Promise.all(phones.map(phone => sendMessage(phone, text)));
  return results.some(Boolean);
}

module.exports = { sendDigest, sendMessage };
