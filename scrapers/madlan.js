const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'he-IL,he;q=0.9',
  'Origin': 'https://www.madlan.co.il',
  'Referer': 'https://www.madlan.co.il/',
  'Content-Type': 'application/json',
};

const GQL_QUERY = `
query searchListings($filters: SearchListingsFilters!, $paging: PagingInput) {
  searchListings(filters: $filters, paging: $paging) {
    listings {
      id
      price
      rooms
      squareMeter
      street
      houseNum
      cityName
      description
      monthlyTax
      dealType
      images { url }
      additionalInfo { key value }
    }
    totalCount
  }
}`;

async function scrapeGraphQL(filters) {
  const dealType = filters.dealType === 'buy' ? 'SALE' : 'RENT';
  const variables = {
    filters: {
      dealType,
      cityName: filters.cityName || 'תל אביב יפו',
      rooms:    { min: filters.rooms.min,  max: filters.rooms.max  },
      price:    { min: filters.price.min,  max: filters.price.max  },
    },
    paging: { pageNum: 1, pageSize: 40 },
  };
  if (filters.sizeSqm?.max > 0) {
    variables.filters.squareMeter = { min: filters.sizeSqm.min, max: filters.sizeSqm.max };
  }

  const { data } = await axios.post(
    'https://www.madlan.co.il/api/graphql',
    { query: GQL_QUERY, variables },
    { headers: HEADERS, timeout: 20000 }
  );

  const listings = data?.data?.searchListings?.listings || [];
  console.log(`[madlan/gql] ${listings.length} פריטים`);
  return listings;
}

async function scrapeHTML(filters) {
  const dealType = filters.dealType === 'buy' ? 'for-sale' : 'for-rent';
  const city = encodeURIComponent(filters.cityName || 'תל אביב');
  const url = `https://www.madlan.co.il/${dealType}/${city}?rooms=${filters.rooms.min}-${filters.rooms.max}&price=${filters.price.min}-${filters.price.max}`;

  const { data, status } = await axios.get(url, {
    headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Content-Type': undefined },
    timeout: 20000
  });
  console.log(`[madlan/html] HTTP ${status}, ${data.length} תווים`);

  const $ = cheerio.load(data);
  const nextDataText = $('#__NEXT_DATA__').text();
  if (!nextDataText) throw new Error('אין __NEXT_DATA__');

  const pp = JSON.parse(nextDataText)?.props?.pageProps || {};

  const listings =
    pp?.listings?.items ||
    pp?.initialData?.listings?.items ||
    pp?.data?.listings?.items ||
    pp?.listingsFeed?.items ||
    pp?.listingItems ||
    [];

  if (!listings.length) {
    const keys = Object.keys(pp);
    console.warn('[madlan/html] לא נמצאו מודעות. מפתחות pageProps:', keys.join(', '));
  }
  console.log(`[madlan/html] ${listings.length} פריטים`);
  return listings.map(item => item.listing || item);
}

async function scrape(filters) {
  let rawListings = [];

  try {
    rawListings = await scrapeGraphQL(filters);
  } catch (err) {
    console.warn('[madlan] GraphQL נכשל:', err.message, '— מנסה HTML');
    try {
      rawListings = await scrapeHTML(filters);
    } catch (err2) {
      console.error('[madlan] HTML גם נכשל:', err2.message);
      return [];
    }
  }

  return rawListings.map(l => ({
    id:          `madlan_${l.id || l.listingId}`,
    source:      'מדלן',
    address:     [l.street, l.houseNum, l.cityName || filters.cityName].filter(Boolean).join(' '),
    price:       parseInt(l.price) || 0,
    rooms:       parseFloat(l.rooms) || 0,
    size_sqm:    parseInt(l.squareMeter || l.size) || 0,
    url:         `https://www.madlan.co.il/listing/${l.id || l.listingId}`,
    image_url:   l.images?.[0]?.url || '',
    description: l.description || '',
    raw:         l,
  }));
}

module.exports = { scrape };
