const axios = require('axios');

// מיפוי ערים לקודי יד2
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
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
  'Referer': 'https://www.yad2.co.il/',
  'Origin': 'https://www.yad2.co.il'
};

async function scrape(filters) {
  const dealType = filters.dealType === 'rent' ? 'rent' : 'forsale';
  const cityCode = CITY_CODES[filters.cityName] || '5000';

  const params = {
    city: cityCode,
    rooms: `${filters.rooms.min}-${filters.rooms.max}`,
    price: `${filters.price.min}-${filters.price.max}`,
    squaremeter: `${filters.sizeSqm.min}-${filters.sizeSqm.max}`,
    forceLdLoad: true
  };

  const url = `https://gw.yad2.co.il/feed-search-legacy/realestate/${dealType}`;

  try {
    const { data } = await axios.get(url, { headers: HEADERS, params, timeout: 15000 });
    const items = data?.data?.feed?.feed_items || [];
    return items
      .filter(item => item.type === 'ad')
      .map(item => ({
        id: `yad2_${item.id}`,
        source: 'יד2',
        address: [item.street, item.StreetNumber, item.city].filter(Boolean).join(' '),
        price: parseInt(item.price) || 0,
        rooms: parseFloat(item.rooms) || 0,
        size_sqm: parseInt(item.squaremeter) || 0,
        url: `https://www.yad2.co.il/item/${item.id}`,
        image_url: item.images?.[0]?.src || '',
        description: item.info_text || '',
        raw: item
      }));
  } catch (err) {
    console.error('[yad2] שגיאת סריקה:', err.message);
    return [];
  }
}

module.exports = { scrape };
