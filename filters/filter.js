// מיפוי סוגי נכס — עברית ↔ ערכי Raw
const PROPERTY_TYPE_KEYWORDS = {
  'דירה':        ['apartment', 'flat', 'דירה'],
  'בית פרטי':   ['house', 'private', 'cottage_private', 'בית פרטי', 'בית'],
  'דו משפחתי':  ['semi', 'semi_detached', 'דו משפחתי'],
  'דופלקס':     ['duplex', 'דופלקס'],
  "קוטג'":      ['cottage', 'קוטג'],
  'דירת גן':    ['garden', 'garden_apartment', 'דירת גן'],
};

// מיפוי נוחויות — מילות מפתח בטקסט
const AMENITY_KEYWORDS = {
  'ממ"ד':   ['ממד', 'ממ"ד', 'מרחב מוגן'],
  'חצר':    ['חצר', 'גינה'],
  'מרפסת':  ['מרפסת'],
  'מעלית':  ['מעלית'],
  'חניה':   ['חניה', 'חנייה', 'parking'],
};

function getPropertyType(apt) {
  const raw = apt.raw || {};
  const rawType = (raw.property_group || raw.propertyType || raw.propertyGroup || '').toString().toLowerCase();
  const desc = (apt.description || '').toLowerCase();

  for (const [heb, keywords] of Object.entries(PROPERTY_TYPE_KEYWORDS)) {
    if (keywords.some(k => rawType.includes(k.toLowerCase()) || desc.includes(k.toLowerCase()))) {
      return heb;
    }
  }
  return null;
}

function hasAmenity(apt, amenity) {
  const keywords = AMENITY_KEYWORDS[amenity] || [amenity];
  const raw = apt.raw || {};
  const searchIn = [
    apt.description || '',
    JSON.stringify(raw.additional_info_items || []),
    JSON.stringify(raw.additionalInfo || []),
    JSON.stringify(raw.features || []),
  ].join(' ').toLowerCase();

  return keywords.some(k => searchIn.includes(k.toLowerCase()));
}

function matches(apt, filters) {
  // ── מחיר — חובה
  if (!apt.price || apt.price <= 0) return false;
  if (apt.price < filters.price.min || apt.price > filters.price.max) return false;

  // ── חדרים — חובה
  if (!apt.rooms || apt.rooms <= 0) return false;
  if (apt.rooms < filters.rooms.min || apt.rooms > filters.rooms.max) return false;

  // ── גודל מ"ר — אופציונלי
  if (apt.size_sqm > 0 && filters.sizeSqm?.max > 0) {
    if (apt.size_sqm < filters.sizeSqm.min || apt.size_sqm > filters.sizeSqm.max) return false;
  }

  // ── סוג נכס — אם המשתמש בחר, חייב להתאים (אם הצלחנו לנתח)
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    const aptType = getPropertyType(apt);
    if (aptType && !filters.propertyTypes.includes(aptType)) return false;
  }

  // ── נוחויות — כל נוחות שסומנה חייבת להופיע
  if (filters.amenities && filters.amenities.length > 0) {
    for (const amenity of filters.amenities) {
      if (!hasAmenity(apt, amenity)) return false;
    }
  }

  // ── עיר — אם יש כתובת, חייבת להכיל את שם העיר הבסיסית
  if (filters.cityName && apt.address) {
    const addr = apt.address.toLowerCase();
    const city = filters.cityName.toLowerCase();
    if (!addr.includes(city) && apt.source !== 'יד2' && apt.source !== 'מדלן') {
      // ביד2 ומדלן העיר מגיעה מהפרמטר של הסריקה, לא צריך לבדוק שוב
      return false;
    }
  }

  return true;
}

function applyFilters(apartments, filters) {
  const before = apartments.length;
  const result = apartments.filter(apt => matches(apt, filters));
  console.log(`[filter] ${before} מודעות → ${result.length} עוברות פילטר`);
  return result;
}

module.exports = { applyFilters };
