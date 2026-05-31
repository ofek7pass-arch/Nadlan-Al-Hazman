// מיפוי סוגי נכס — עברית ↔ ערכי Raw
const PROPERTY_TYPE_KEYWORDS = {
  'דירה':        ['apartment', 'flat', 'דירה'],
  'בית פרטי':   ['house', 'private', 'cottage_private', 'בית פרטי', 'בית'],
  'דו משפחתי':  ['semi', 'semi_detached', 'דו משפחתי'],
  'דופלקס':     ['duplex', 'דופלקס'],
  "קוטג'":      ['cottage', 'קוטג'],
  'דירת גן':    ['garden', 'garden_apartment', 'דירת גן'],
  // סוגים נוספים — מזוהים כדי שיידחו אם המשתמש לא בחר בהם:
  'יחידת דיור': ['יחידת דיור'],
  'פנטהאוז':    ['פנטהאוז', 'penthouse'],
  'מרתף':       ['מרתף', 'פרטר'],
  'סטודיו':     ['סטודיו', 'לופט'],
};

// מיפוי נוחויות — מילות מפתח בטקסט
const AMENITY_KEYWORDS = {
  'ממ"ד':   ['ממד', 'ממ"ד', 'מרחב מוגן'],
  'חצר':    ['חצר', 'גינה'],
  'מרפסת':  ['מרפסת'],
  'מעלית':  ['מעלית'],
  'חניה':   ['חניה', 'חנייה', 'parking'],
};

// בודק אם הנכס תואם לאחד מסוגי הנכס שהמשתמש בחר.
// מטפל בערכים מאוחדים כמו "בית פרטי/ קוטג'" — שייכלל גם תחת "קוטג'".
function matchesPropertyType(apt, selectedTypes) {
  const raw = apt.raw || {};
  const haystack = (
    (raw.property_group || raw.propertyType || raw.propertyGroup || '') + ' ' + (apt.description || '')
  ).toLowerCase().trim();

  if (!haystack) return true; // אין מידע על סוג הנכס — לא דוחים

  const typeMatches = (typeName) => {
    const keywords = PROPERTY_TYPE_KEYWORDS[typeName] || [typeName];
    return keywords.some(k => haystack.includes(k.toLowerCase()));
  };

  // אם אחד מהסוגים שביקש המשתמש מופיע — עובר
  if (selectedTypes.some(typeMatches)) return true;

  // אם זוהה סוג ידוע אחר (שלא ביקש) — דוחים. אם לא זוהה דבר — לא דוחים.
  const anyKnownType = Object.keys(PROPERTY_TYPE_KEYWORDS).some(typeMatches);
  return !anyKnownType;
}

function hasAmenity(apt, amenity) {
  const keywords = AMENITY_KEYWORDS[amenity] || [amenity];
  const raw = apt.raw || {};
  const searchIn = [
    apt.description || '',
    JSON.stringify(raw.additional_info_items || []),
    JSON.stringify(raw.additionalInfo || []),
    JSON.stringify(raw.features || []),
    JSON.stringify(raw.tags || []),
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

  // ── סוג נכס — חובה (אם נבחר)
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    if (!matchesPropertyType(apt, filters.propertyTypes)) return false;
  }

  // ── נוחויות — בונוס בלבד, לא תנאי מחייב.
  // מסמנים אילו נוחויות מבוקשות זוהו (לתצוגה/דירוג), אך לא דוחים על היעדרן.
  if (filters.amenities && filters.amenities.length > 0) {
    apt.matchedAmenities = filters.amenities.filter(amenity => hasAmenity(apt, amenity));
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
