const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'apartments.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS apartments (
    id         TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    address    TEXT,
    price      INTEGER,
    rooms      REAL,
    size_sqm   INTEGER,
    url        TEXT,
    image_url  TEXT,
    description TEXT,
    raw_data   TEXT,
    lat         REAL,
    lon         REAL,
    distance_km REAL,
    found_at   TEXT DEFAULT (datetime('now','localtime')),
    last_seen  TEXT DEFAULT (datetime('now','localtime')),
    notified   INTEGER DEFAULT 0
  );
`);

// מיגרציות ל-DB קיים — הוספת עמודות אם חסרות
for (const col of ['last_seen TEXT', 'lat REAL', 'lon REAL', 'distance_km REAL']) {
  try { db.exec(`ALTER TABLE apartments ADD COLUMN ${col}`); } catch (e) { /* כבר קיים */ }
}

function isNew(id) {
  return !db.prepare('SELECT 1 FROM apartments WHERE id = ?').get(id);
}

// upsert — מוסיף חדש, או מעדכן מחיר/פרטים + last_seen אם כבר קיים
function save(apt) {
  db.prepare(`
    INSERT INTO apartments (id, source, address, price, rooms, size_sqm, url, image_url, description, raw_data, lat, lon, distance_km, last_seen)
    VALUES (@id, @source, @address, @price, @rooms, @size_sqm, @url, @image_url, @description, @raw_data, @lat, @lon, @distance_km, datetime('now','localtime'))
    ON CONFLICT(id) DO UPDATE SET
      price       = excluded.price,
      rooms       = excluded.rooms,
      size_sqm    = excluded.size_sqm,
      address     = excluded.address,
      url         = excluded.url,
      image_url   = excluded.image_url,
      description = excluded.description,
      raw_data    = excluded.raw_data,
      lat         = excluded.lat,
      lon         = excluded.lon,
      distance_km = excluded.distance_km,
      last_seen   = datetime('now','localtime')
  `).run({
    ...apt,
    lat: apt.lat ?? null,
    lon: apt.lon ?? null,
    distance_km: apt.distance_km ?? null,
    raw_data: JSON.stringify(apt.raw || {}),
  });
}

// מחיקת מודעות שנעלמו: ממקורות שנסרקו בהצלחה, מודעות שלא נראו בסריקה הנוכחית
function removeStaleBySources(sources, seenIds) {
  if (!sources || !sources.length) return 0;
  const srcPlaceholders = sources.map(() => '?').join(',');
  let sql = `DELETE FROM apartments WHERE source IN (${srcPlaceholders})`;
  const params = [...sources];
  if (seenIds.length) {
    sql += ` AND id NOT IN (${seenIds.map(() => '?').join(',')})`;
    params.push(...seenIds);
  }
  return db.prepare(sql).run(...params).changes;
}

function getUnnotified() {
  return db.prepare("SELECT * FROM apartments WHERE notified = 0 ORDER BY found_at DESC").all();
}

function markNotified(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE apartments SET notified = 1 WHERE id IN (${placeholders})`).run(...ids);
}

// כל המודעות הפעילות — ממוין לפי מרחק (הקרובות קודם), ואז מחיר. ללא תקרה מלאכותית.
function getRecent(limit = 500) {
  return db.prepare(`
    SELECT * FROM apartments
    ORDER BY (distance_km IS NULL), distance_km ASC, price ASC
    LIMIT ?
  `).all(limit);
}

module.exports = { isNew, save, getUnnotified, markNotified, getRecent, removeStaleBySources };
