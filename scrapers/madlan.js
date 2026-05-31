const axios = require('axios');

const GQL_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'he-IL,he;q=0.9',
  'Origin': 'https://www.madlan.co.il',
  'Referer': 'https://www.madlan.co.il/',
};

const SEARCH_QUERY = `
query Search($q: SearchBulletinQueryInput!) {
  searchBulletinWithUserPreferences(searchQuery: $q) {
    total
    bulletins {
      id price beds area address dealType buildingType propertyType description
      structuredAddress { city streetName streetNumber text }
      images { url }
    }
  }
}`;

async function fetchPage(filters, offset) {
  const { data } = await axios.post(
    'https://www.madlan.co.il/api3',
    {
      query: SEARCH_QUERY,
      variables: {
        q: {
          limit: 200,
          offset,
          userPreferences: {
            location: [],
            attributes: [
              { operator: 'RANGE', field: 'price', intent: 'MUST',
                value: [filters.price.min, filters.price.max] },
              { operator: 'RANGE', field: 'beds',  intent: 'MUST',
                value: [filters.rooms.min, filters.rooms.max] },
            ],
          },
        },
      },
    },
    { headers: GQL_HEADERS, timeout: 20000 }
  );
  return data?.data?.searchBulletinWithUserPreferences || { total: 0, bulletins: [] };
}

function isCity(bulletin, cityName) {
  if (!cityName) return true;
  const addr = bulletin.address || '';
  const parts = addr.split(', ');
  const city = parts[parts.length - 1] || '';
  return city.includes(cityName) || city === cityName;
}

async function scrape(filters) {
  const cityName = filters.cityName || '';
  let total = null;
  let offset = 0;
  const matched = [];

  while (true) {
    if (total !== null && offset >= total) break;

    let page;
    try {
      page = await fetchPage(filters, offset);
    } catch (err) {
      console.error('[madlan] שגיאת GraphQL:', err.message);
      break;
    }

    if (total === null) {
      total = page.total;
      console.log(`[madlan] סה"כ תוצאות לאומי: ${total}`);
    }

    const hits = page.bulletins.filter(b => b.dealType === 'unitRent' && isCity(b, cityName));
    matched.push(...hits);
    offset += 200;

    if (offset % 1000 === 0) console.log(`[madlan] סרקנו ${offset}/${total}, נמצאו ${matched.length} ב-${cityName}`);
  }

  console.log(`[madlan] סיום: ${matched.length} מודעות ב-${cityName}`);

  return matched.map(b => ({
    id:          `madlan_${b.id}`,
    source:      'מדלן',
    address:     b.address || [b.structuredAddress?.streetName, b.structuredAddress?.streetNumber, b.structuredAddress?.city].filter(Boolean).join(' '),
    price:       parseInt(b.price) || 0,
    rooms:       parseFloat(b.beds) || 0,
    size_sqm:    parseInt(b.area) || 0,
    url:         `https://www.madlan.co.il/listing/${b.id}`,
    image_url:   b.images?.[0]?.url || '',
    description: b.description || '',
    raw:         b,
  }));
}

module.exports = { scrape };
