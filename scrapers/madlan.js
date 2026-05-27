const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9',
  'Referer': 'https://www.madlan.co.il/'
};

async function scrape(filters) {
  const dealType = filters.dealType === 'buy' ? 'for-sale' : 'for-rent';
  const city = encodeURIComponent(filters.cityName || 'תל אביב');
  const url = `https://www.madlan.co.il/api/v2/listings?dealType=${dealType}&city=${city}&rooms=${filters.rooms.min}-${filters.rooms.max}&price=${filters.price.min}-${filters.price.max}`;

  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const items = data?.listings || data?.data?.listings || [];
    return items.map(item => ({
      id: `madlan_${item.id || item.listingId}`,
      source: 'מדלן',
      address: [item.street, item.houseNumber, item.city?.text || item.city].filter(Boolean).join(' '),
      price: parseInt(item.price) || 0,
      rooms: parseFloat(item.rooms) || 0,
      size_sqm: parseInt(item.squareMeter || item.size) || 0,
      url: `https://www.madlan.co.il/listing/${item.id || item.listingId}`,
      image_url: item.images?.[0]?.url || item.media?.[0]?.url || '',
      description: item.description || '',
      raw: item
    }));
  } catch (err) {
    console.error('[madlan] שגיאת סריקה:', err.message);
    return [];
  }
}

module.exports = { scrape };
