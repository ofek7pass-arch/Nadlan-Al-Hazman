function matches(apt, filters) {
  // מחיר — חובה: חייב להיות ידוע ובטווח
  if (!apt.price || apt.price <= 0) return false;
  if (apt.price < filters.price.min || apt.price > filters.price.max) return false;

  // חדרים — חובה: חייב להיות ידוע ובטווח
  if (!apt.rooms || apt.rooms <= 0) return false;
  if (apt.rooms < filters.rooms.min || apt.rooms > filters.rooms.max) return false;

  // גודל מ"ר — אופציונלי: רק אם ידוע, בודקים
  if (apt.size_sqm > 0 && filters.sizeSqm.max > 0) {
    if (apt.size_sqm < filters.sizeSqm.min || apt.size_sqm > filters.sizeSqm.max) return false;
  }

  return true;
}

function applyFilters(apartments, filters) {
  const before = apartments.length;
  const result = apartments.filter(apt => matches(apt, filters));
  console.log(`[filter] ${before} מודעות → ${result.length} אחרי פילטר קפדני`);
  return result;
}

module.exports = { applyFilters };
