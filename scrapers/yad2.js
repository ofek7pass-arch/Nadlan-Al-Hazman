const axios = require('axios');

const CITY_CODES = {
  'תל אביב': '5000', 'ירושלים': '3000', 'חיפה': '4000', 'באר שבע': '70',
  'רמת גן': '8600', 'גבעתיים': '6300', 'פתח תקווה': '7900', 'ראשון לציון': '8300',
  'נס ציונה': '7400', 'רחובות': '8100', 'הרצליה': '6600', 'כפר סבא': '7100',
  'רעננה': '8400', 'נתניה': '7500', 'חולון': '6700', 'בת ים': '290',
  'אשדוד': '70', 'אשקלון': '60', 'מודיעין': '1200', 'רמת השרון': '8700',
  'הוד השרון': '390', 'יהוד': '430', 'לוד': '7200', 'רמלה': '8200',
  'נהריה': '7300', 'עכו': '7700', 'טבריה': '5100', 'צפת': '9700',
  'קריית שמונה': '2400', 'אילת': '200'
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  'Origin': 'https://www.yad2.co.il',
  'Referer': 'https://www.yad2.co.il/',
  'mobile-app': 'false',
};

async function scrape(filters) {
  const dealType = filters.dealType === 'buy' ? 'forsale' : 'rent';
  const cityCode = CITY_CODES[filters.cityName] || '5000';

  const params = new URLSearchParams({
    city: cityCode,
    rooms: `${filters.rooms.min}-${filters.rooms.max}`,
    price: `${filters.price.min}-${filters.price.max}`,
    squareMeter: `${filters.sizeSqm?.min || 0}-${filters.sizeSqm?.max || 300}`,
    page: 1,
  });

  const url = `https://gw.yad2.co.il/feed-search/realestate/${dealType}?${params}`;
  console.log(`[yad2] GET ${url}`);

  try {
    const { data, status } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    console.log(`[yad2] HTTP ${status}`);

    const feedItems =
      data?.data?.feed?.feed_items ||
      data?.feed?.feed_items ||
      data?.feed_items ||
      [];

    const ads = feedItems.filter(item => item.type === 'ad' || item.orderId);
    console.log(`[yad2] ${feedItems.length} פריטים, ${ads.length} מודעות`);

    return ads.map(item => ({
      id:          `yad2_${item.id || item.orderId}`,
      source:      'יד2',
      address:     [item.street, item.StreetNumber, item.city].filter(Boolean).join(' '),
      price:       parseInt(item.price) || 0,
      rooms:       parseFloat(item.rooms) || 0,
      size_sqm:    parseInt(item.squaremeter || item.squareMeter) || 0,
      url:         `https://www.yad2.co.il/item/${item.id || item.orderId}`,
      image_url:   item.images?.[0]?.src || item.mainImage || '',
      description: item.info_text || item.infoText || '',
      raw:         item,
    }));
  } catch (err) {
    console.error('[yad2] שגיאת סריקה:', err.response?.status, err.message);
    return [];
  }
}

module.exports = { scrape };
