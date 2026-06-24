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
    found_at   TEXT DEFAULT (datetime('now','localtime')),
    last_seen  TEXT DEFAULT (datetime('now','localtime')),
    notified   INTEGER DEFAULT 0
  );
`);

// מיגרציה ל-DB קיים — הוספת last_seen אם חסר
try { db.exec(`ALTER TABLE apartments ADD COLUMN last_seen TEXT`); } catch (e) { /* כבר קיים */ }

function isNew(id) {
  return !db.prepare('SELECT 1 FROM apartments WHERE id = ?').get(id);
}

// upsert — מוסיף חדש, או מעדכן מחיר/פרטים + last_seen אם כבר קיים
function save(apt) {
  db.prepare(`
    INSERT INTO apartments (id, source, address, price, rooms, size_sqm, url, image_url, description, raw_data, last_seen)
    VALUES (@id, @source, @address, @price, @rooms, @size_sqm, @url, @image_url, @description, @raw_data, datetime('now','localtime'))
    ON CONFLICT(id) DO UPDATE SET
      price       = excluded.price,
      rooms       = excluded.rooms,
      size_sqm    = excluded.size_sqm,
      address     = excluded.address,
      image_url   = excluded.image_url,
      description = excluded.description,
      raw_data    = excluded.raw_data,
      last_seen   = datetime('now','localtime')
  `).run({ ...apt, raw_data: JSON.stringify(apt.raw || {}) });
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

function getRecent(limit = 20) {
  return db.prepare("SELECT * FROM apartments ORDER BY found_at DESC LIMIT ?").all(limit);
}

module.exports = { isNew, save, getUnnotified, markNotified, getRecent, removeStaleBySources };
