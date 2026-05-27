const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9',
  'Referer': 'https://www.madlan.co.il/',
};

async function scrape(filters) {
  const dealType = filters.dealType === 'buy' ? 'for-sale' : 'for-rent';
  const city = encodeURIComponent(filters.cityName || 'תל אביב');
  const url = `https://www.madlan.co.il/${dealType}/${city}?rooms=${filters.rooms.min}-${filters.rooms.max}&price=${filters.price.min}-${filters.price.max}`;

  try {
    const { data, status } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    console.log(`[madlan] HTTP ${status}, ${data.length} תווים`);

    const $ = cheerio.load(data);
    const nextDataText = $('#__NEXT_DATA__').text();

    if (!nextDataText) {
      console.error('[madlan] לא נמצא __NEXT_DATA__ — כנראה חסום');
      return [];
    }

    const nextData = JSON.parse(nextDataText);
    const pp = nextData?.props?.pageProps || {};

    // מדלן משתמש במבנה שונה — ננסה כמה נתיבים
    const listings =
      pp?.listings?.items ||
      pp?.initialData?.listings?.items ||
      pp?.data?.listings ||
      pp?.listingItems ||
      [];

    console.log(`[madlan] ${listings.length} פריטים נמצאו`);

    return listings.map(item => {
      const l = item.listing || item;
      return {
        id: `madlan_${l.id || l.listingId}`,
        source: 'מדלן',
        address: [l.street, l.houseNum, l.cityName || filters.cityName].filter(Boolean).join(' '),
        price: parseInt(l.price) || 0,
        rooms: parseFloat(l.rooms) || 0,
        size_sqm: parseInt(l.squareMeter || l.size) || 0,
        url: `https://www.madlan.co.il/listing/${l.id || l.listingId}`,
        image_url: l.images?.[0]?.url || '',
        description: l.description || '',
        raw: l
      };
    });
  } catch (err) {
    console.error('[madlan] שגיאת סריקה:', err.message);
    return [];
  }
}

module.exports = { scrape };
