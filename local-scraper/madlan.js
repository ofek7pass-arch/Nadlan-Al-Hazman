/**
 * מדלן — חילוץ דרך GraphQL API (api3)
 * רץ מקומית עם IP ישראלי. מחזיר מערך דירות מנורמל.
 */
const https = require('https');

const GQL_HEADERS = {
  'Content-Type':    'application/json',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'he-IL,he;q=0.9',
  'Origin':          'https://www.madlan.co.il',
  'Referer':         'https://www.madlan.co.il/',
};

const SEARCH_QUERY = `
query Search($q: SearchBulletinQueryInput!) {
  searchBulletinWithUserPreferences(searchQuery: $q) {
    total
    bulletins {
      id price beds area address dealType buildingType propertyType description
      parking
      extendedAmenities { name }
      structuredAddress { city streetName streetNumber text }
      images { imageUrl }
    }
  }
}`;

// מיפוי slugs של מדלן ↔ שמות נוחויות בעברית (שתואמים ל-AMENITY_KEYWORDS בפילטר)
const AMENITY_SLUG_HEB = {
  'elevator':      'מעלית',
  'parking':       'חניה',
  'garage':        'חניה',
  'secure-room':   'ממ"ד',
  'mamak':         'ממ"ד',
  'miklat':        'ממ"ד',
  'balcony-areas': 'מרפסת',
  'garden-areas':  'חצר',
  'warehouse-areas': 'מחסן',
};

function buildTags(bulletin) {
  const tags = [];
  if (bulletin.parking) tags.push({ name: 'חניה' });
  (bulletin.extendedAmenities || []).forEach(a => {
    const heb = AMENITY_SLUG_HEB[a.name];
    if (heb && !tags.some(t => t.name === heb)) tags.push({ name: heb });
  });
  return tags;
}

function gqlPage(filters, offset) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      query: SEARCH_QUERY,
      variables: {
        q: {
          limit: 200,
          offset,
          userPreferences: {
            location: [],
            attributes: [
              { operator: 'RANGE', field: 'price', intent: 'MUST', value: [filters.price.min, filters.price.max] },
              { operator: 'RANGE', field: 'beds',  intent: 'MUST', value: [filters.rooms.min, filters.rooms.max] },
            ],
          },
        },
      },
    });
    const req = https.request({
      hostname: 'www.madlan.co.il', path: '/api3', method: 'POST',
      headers: { ...GQL_HEADERS, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)?.data?.searchBulletinWithUserPreferences || { total: 0, bulletins: [] }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function isCity(bulletin, cityName) {
  if (!cityName) return true;
  const addr = bulletin.address || '';
  const city = addr.split(', ').slice(-1)[0] || '';
  return city === cityName || city.startsWith(cityName + ' ');
}

async function scrape(filters) {
  const cityName = filters.cityName || '';
  let total = null, offset = 0;
  const matched = [];

  while (true) {
    if (total !== null && offset >= total) break;

    let page;
    try {
      page = await gqlPage(filters, offset);
    } catch (err) {
      console.error('[madlan] שגיאת GraphQL:', err.message);
      break;
    }

    if (total === null) {
      total = page.total;
      console.log(`[madlan] סה"כ ארצי: ${total}`);
    }

    const hits = page.bulletins.filter(b => b.dealType === 'unitRent' && isCity(b, cityName));
    matched.push(...hits);
    offset += 200;
  }

  console.log(`[madlan] נמצאו ${matched.length} שכירות ב-${cityName}`);

  return matched.map(b => ({
    id:          `madlan_${b.id}`,
    source:      'מדלן',
    address:     b.address || '',
    price:       parseInt(b.price) || 0,
    rooms:       parseFloat(b.beds) || 0,
    size_sqm:    parseInt(b.area) || 0,
    url:         `https://www.madlan.co.il/listing/${b.id}`,
    image_url:   b.images?.[0]?.imageUrl || '',
    description: b.description || '',
    raw:         { property_group: b.propertyType || b.buildingType || '', tags: [] },
  }));
}

module.exports = { scrape };
