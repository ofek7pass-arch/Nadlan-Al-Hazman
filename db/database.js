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
    notified   INTEGER DEFAULT 0
  );
`);

function isNew(id) {
  return !db.prepare('SELECT 1 FROM apartments WHERE id = ?').get(id);
}

function save(apt) {
  db.prepare(`
    INSERT OR IGNORE INTO apartments (id, source, address, price, rooms, size_sqm, url, image_url, description, raw_data)
    VALUES (@id, @source, @address, @price, @rooms, @size_sqm, @url, @image_url, @description, @raw_data)
  `).run({
    ...apt,
    raw_data: JSON.stringify(apt.raw || {})
  });
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

module.exports = { isNew, save, getUnnotified, markNotified, getRecent };
