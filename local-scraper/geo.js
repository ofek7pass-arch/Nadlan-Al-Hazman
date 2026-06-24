/**
 * עזרי גאוגרפיה — מרחק בין נקודות + קואורדינטות ערי בסיס.
 * משמש לסינון רדיוס (radiusKm) סביב עיר הבסיס.
 */

// קואורדינטות מרכז ערים (lat, lon). עיר הבסיס נלקחת מ-filters.cityName.
const CITY_COORDS = {
  'גדרה':        { lat: 31.8136, lon: 34.7780 },
  'תל אביב':     { lat: 32.0853, lon: 34.7818 },
  'תל אביב יפו': { lat: 32.0853, lon: 34.7818 },
  'ירושלים':     { lat: 31.7683, lon: 35.2137 },
  'חיפה':        { lat: 32.7940, lon: 34.9896 },
  'באר שבע':     { lat: 31.2518, lon: 34.7913 },
  'ראשון לציון': { lat: 31.9730, lon: 34.8066 },
  'פתח תקווה':   { lat: 32.0840, lon: 34.8878 },
  'אשדוד':       { lat: 31.8040, lon: 34.6550 },
  'אשקלון':      { lat: 31.6688, lon: 34.5715 },
  'נתניה':       { lat: 32.3215, lon: 34.8532 },
  'רחובות':      { lat: 31.8928, lon: 34.8113 },
  'נס ציונה':    { lat: 31.9293, lon: 34.7986 },
  'יבנה':        { lat: 31.8780, lon: 34.7397 },
  'גן יבנה':     { lat: 31.7869, lon: 34.7058 },
  'רמלה':        { lat: 31.9290, lon: 34.8667 },
  'לוד':         { lat: 31.9514, lon: 34.8953 },
  'מודיעין':     { lat: 31.8983, lon: 35.0104 },
  'הרצליה':      { lat: 32.1624, lon: 34.8443 },
  'כפר סבא':     { lat: 32.1750, lon: 34.9070 },
  'רעננה':       { lat: 32.1848, lon: 34.8713 },
};

// מרחק בק"מ בין שתי נקודות (Haversine)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// קואורדינטות עיר הבסיס לפי שם (null אם לא ידוע → אין סינון רדיוס)
function baseCoords(cityName) {
  return CITY_COORDS[(cityName || '').trim()] || null;
}

module.exports = { haversineKm, baseCoords, CITY_COORDS };
