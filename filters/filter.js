function matches(apt, filters) {
  if (filters.price.min && apt.price && apt.price < filters.price.min) return false;
  if (filters.price.max && apt.price && apt.price > filters.price.max) return false;
  if (filters.rooms.min && apt.rooms && apt.rooms < filters.rooms.min) return false;
  if (filters.rooms.max && apt.rooms && apt.rooms > filters.rooms.max) return false;
  if (filters.sizeSqm.min && apt.size_sqm && apt.size_sqm < filters.sizeSqm.min) return false;
  if (filters.sizeSqm.max && apt.size_sqm && apt.size_sqm > filters.sizeSqm.max) return false;
  return true;
}

function applyFilters(apartments, filters) {
  return apartments.filter(apt => matches(apt, filters));
}

module.exports = { applyFilters };
