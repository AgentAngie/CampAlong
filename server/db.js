// Simple JSON-backed database — no native dependencies required
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PATHS = {
  watchlist: path.join(DATA_DIR, 'watchlist.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  alertsSent: path.join(DATA_DIR, 'alerts-sent.json'),
  cache: path.join(DATA_DIR, 'campground-cache.json'),
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Settings ──────────────────────────────────────────────────────────────

function getSettings() {
  return readJson(PATHS.settings, {});
}

function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  writeJson(PATHS.settings, s);
}

// ─── Watchlist ─────────────────────────────────────────────────────────────

let _nextId = null;

function getNextId(list) {
  return list.length > 0 ? Math.max(...list.map(i => i.id)) + 1 : 1;
}

function getWatchlist() {
  return readJson(PATHS.watchlist, []).filter(i => i.active !== false);
}

function addToWatchlist(item) {
  const list = readJson(PATHS.watchlist, []);
  const id = getNextId(list);
  list.push({
    id,
    campground_id: item.campground_id,
    campground_name: item.campground_name,
    date_start: item.date_start,
    date_end: item.date_end,
    min_nights: item.min_nights || 1,
    preferences: item.preferences || {},
    source: item.source || 'recreation.gov',
    active: true,
    created_at: new Date().toISOString(),
  });
  writeJson(PATHS.watchlist, list);
  return id;
}

function removeFromWatchlist(id) {
  const list = readJson(PATHS.watchlist, []);
  const idx = list.findIndex(i => String(i.id) === String(id));
  if (idx !== -1) {
    list[idx].active = false;
    writeJson(PATHS.watchlist, list);
  }
}

// ─── Alert deduplication ───────────────────────────────────────────────────

function _alertKey(campgroundId, siteId, dates) {
  return `${campgroundId}|${siteId}|${JSON.stringify(dates)}`;
}

function wasAlertSent(campgroundId, siteId, dates) {
  const sent = readJson(PATHS.alertsSent, {});
  return !!sent[_alertKey(campgroundId, siteId, dates)];
}

function recordAlert(watchlistId, campgroundId, siteId, siteName, dates) {
  const sent = readJson(PATHS.alertsSent, {});
  sent[_alertKey(campgroundId, siteId, dates)] = {
    watchlistId, campgroundId, siteId, siteName,
    dates, sentAt: new Date().toISOString(),
  };
  writeJson(PATHS.alertsSent, sent);
}

// ─── Campground cache (1 hour TTL) ─────────────────────────────────────────

const db = {
  // Minimal compat shim used in recreation-gov.js
  prepare: (sql) => ({
    get: (...args) => {
      if (sql.includes('campground_cache')) {
        const [id] = args;
        const cache = readJson(PATHS.cache, {});
        const entry = cache[String(id)];
        if (!entry) return undefined;
        const age = Date.now() - new Date(entry.cachedAt).getTime();
        return age < 3600000 ? { data: entry.data } : undefined;
      }
      return undefined;
    },
    run: (...args) => {
      if (sql.includes('campground_cache')) {
        // INSERT OR REPLACE pattern: args are (campground_id, data)
        const [id, data] = args;
        const cache = readJson(PATHS.cache, {});
        cache[String(id)] = { data, cachedAt: new Date().toISOString() };
        writeJson(PATHS.cache, cache);
      }
    },
  }),
};

function countAlertsSent() {
  return Object.keys(readJson(PATHS.alertsSent, {})).length;
}

module.exports = { db, getSettings, setSetting, getWatchlist, addToWatchlist, removeFromWatchlist, wasAlertSent, recordAlert, countAlertsSent };
