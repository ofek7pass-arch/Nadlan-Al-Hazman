const axios = require('axios');
const cheerio = require('cheerio');

// סריקת ערוצי טלגרם ציבוריים דרך t.me/s/<channel>
// לא דורש bot token — HTTP scraping של עמוד הווב הציבורי

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'he-IL,he;q=0.9'
};

// מילות מפתח שמעידות על מודעת דירה
const REAL_ESTATE_KEYWORDS = [
  'דירה', 'להשכרה', 'למכירה', 'חדרים', 'חדר', 'מ"ר', 'מטר', 'שכירות',
  'קניה', 'נכס', 'דירות', 'בית', 'קוטג', 'דופלקס', 'מרפסת', 'חניה', '₪'
];

function isRealEstatePost(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return REAL_ESTATE_KEYWORDS.some(kw => text.includes(kw));
}

function extractPrice(text) {
  const match = text.match(/(\d[\d,]+)\s*₪/);
  if (match) return parseInt(match[1].replace(/,/g, ''));
  const match2 = text.match(/(\d[\d,]+)\s*שקל/);
  if (match2) return parseInt(match2[1].replace(/,/g, ''));
  return 0;
}

function extractRooms(text) {
  const match = text.match(/(\d(?:\.\d)?)\s*חד/);
  return match ? parseFloat(match[1]) : 0;
}

function extractSize(text) {
  const match = text.match(/(\d+)\s*מ["מ]ר/);
  return match ? parseInt(match[1]) : 0;
}

async function scrapeChannel(channelUsername) {
  const username = channelUsername.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
  const url = `https://t.me/s/${username}`;

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(data);
    const results = [];

    $('.tgme_widget_message').each((_, el) => {
      const text = $(el).find('.tgme_widget_message_text').text().trim();
      if (!isRealEstatePost(text)) return;

      const msgId = $(el).attr('data-post') || '';
      const image = $(el).find('.tgme_widget_message_photo_wrap').attr('style') || '';
      const imageMatch = image.match(/url\(['"]?([^'"]+)['"]?\)/);

      results.push({
        id: `tg_${username}_${msgId}`,
        source: `טלגרם @${username}`,
        address: '',
        price: extractPrice(text),
        rooms: extractRooms(text),
        size_sqm: extractSize(text),
        url: `https://t.me/${username}/${msgId.split('/')[1] || ''}`,
        image_url: imageMatch ? imageMatch[1] : '',
        description: text.slice(0, 500),
        raw: { channel: username, text }
      });
    });

    return results;
  } catch (err) {
    console.error(`[telegram] שגיאה בסריקת ${channelUsername}:`, err.message);
    return [];
  }
}

async function scrape(filters) {
  const channels = filters.telegramChannels || [];
  if (!channels.length) return [];

  const all = await Promise.all(channels.map(ch => scrapeChannel(ch)));
  return all.flat();
}

module.exports = { scrape };
