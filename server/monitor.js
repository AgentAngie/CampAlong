const cron = require('node-cron');
const { getWatchlist, wasAlertSent, recordAlert, getSettings } = require('./db');
const { getPreferences, matchSiteToPreferences, normalizeRecGovAvailSite, normalizeReserveCASite } = require('./preferences');
const { recordCancellations } = require('./patterns');
const { sendEmailAlert, sendSMSAlert } = require('./alerts');

// Lazy-load source clients to avoid circular deps
const recGov    = () => require('./recreation-gov');
const reserveCA = () => require('./reserve-california');

let monitorTask   = null;
let isRunning     = false;
let lastCheckTime = null;
let checksToday   = 0;
let _checkDate    = null;
let availableNow  = 0;

// ── Per-campground check ──────────────────────────────────────────────────────

async function checkCampground(watchItem) {
  const source = watchItem.source || 'recreation.gov';
  console.log(`[Monitor] Checking "${watchItem.campground_name}" [${source}]`);

  // ── 1. Fetch availability ─────────────────────────────────────────────────
  let available;
  try {
    if (source === 'reserve-california') {
      const rc   = reserveCA();
      const grid = await rc.getAvailability(watchItem.campground_id, watchItem.date_start, watchItem.date_end, watchItem.min_nights || 1);
      available  = rc.findAvailableSites(grid, watchItem.date_start, watchItem.date_end, watchItem.min_nights || 1);
    } else {
      const rg    = recGov();
      const sites = await rg.getAvailability(watchItem.campground_id, watchItem.date_start, watchItem.date_end);
      available   = rg.findAvailableSites(sites, watchItem.date_start, watchItem.date_end, watchItem.min_nights || 1);
    }
  } catch (err) {
    console.error(`[Monitor]   → fetch error: ${err.message}`);
    throw err;
  }

  if (available.length === 0) {
    console.log(`[Monitor]   → no available sites`);
    return { campground: watchItem.campground_name, found: 0, alerted: 0 };
  }

  // ── 2. Apply global preference profile + per-watchlist overrides ──────────
  const globalPrefs = getPreferences();
  const watchPrefs  = watchItem.preferences || {};

  // Merge: watchlist per-site overrides take precedence
  const effectivePrefs = {
    ...globalPrefs,
    minOccupants: Math.max(globalPrefs.minOccupants || 1, watchPrefs.minOccupants || 1),
  };

  // Run preference matching — annotate each site with matchReasons
  const matched = available
    .map(site => {
      const normalized = source === 'reserve-california'
        ? normalizeReserveCASite(site._rawUnit || { Name: site.siteName, Loop: site.loop, UnitTypeName: site.siteType, MaxOccupancy: site.maxOccupants }, watchItem.campground_name)
        : normalizeRecGovAvailSite(site, watchItem.campground_name);

      const { matchReasons, mismatchReasons, passes } = matchSiteToPreferences(normalized, effectivePrefs);
      return { ...site, matchReasons, mismatchReasons, _passes: passes };
    })
    .filter(s => s._passes);

  if (matched.length === 0) {
    console.log(`[Monitor]   → ${available.length} site(s) found but none match preference profile`);
    return { campground: watchItem.campground_name, found: available.length, alerted: 0 };
  }

  // ── 3. Filter to genuinely NEW openings (not already alerted) ─────────────
  const newSites = matched.filter(site => {
    const dates = site.availableWindows.map(w => w.start);
    return !wasAlertSent(watchItem.campground_id, site.siteId, dates);
  });

  if (newSites.length === 0) {
    console.log(`[Monitor]   → ${matched.length} matching site(s) but already alerted`);
    return { campground: watchItem.campground_name, found: matched.length, alerted: 0 };
  }

  console.log(`[Monitor]   → ${newSites.length} NEW matching site(s)! Sending alerts…`);
  if (newSites[0].matchReasons?.length) {
    console.log(`[Monitor]   → Match reasons: ${newSites[0].matchReasons.join(', ')}`);
  }

  // ── 4. Send alerts ────────────────────────────────────────────────────────
  const [emailRes, smsRes] = await Promise.allSettled([
    sendEmailAlert(newSites, watchItem),
    sendSMSAlert(newSites, watchItem),
  ]);
  if (emailRes.status === 'rejected') console.error('[Monitor] Email error:', emailRes.reason?.message);
  if (smsRes.status   === 'rejected') console.error('[Monitor] SMS error:',   smsRes.reason?.message);

  // ── 5. Record deduplication + patterns ───────────────────────────────────
  for (const site of newSites) {
    const dates = site.availableWindows.map(w => w.start);
    recordAlert(watchItem.id, watchItem.campground_id, site.siteId, site.siteName, dates);
  }
  recordCancellations(watchItem.campground_id, source, watchItem.campground_name, newSites);

  return { campground: watchItem.campground_name, found: matched.length, alerted: newSites.length };
}

// ── Full watchlist scan ───────────────────────────────────────────────────────

async function checkAllWatchlist() {
  if (isRunning) {
    console.log('[Monitor] Previous check still running — skipping');
    return [];
  }

  isRunning     = true;
  lastCheckTime = new Date().toISOString();
  const today = new Date().toDateString();
  if (_checkDate !== today) { checksToday = 0; _checkDate = today; }
  checksToday++;
  const watchlist = getWatchlist();

  if (watchlist.length === 0) { isRunning = false; return []; }

  console.log(`\n[Monitor] ── Checking ${watchlist.length} campground(s) at ${lastCheckTime} ──`);
  const results = [];

  for (const item of watchlist) {
    try {
      results.push(await checkCampground(item));
    } catch (err) {
      console.error(`[Monitor] Error for "${item.campground_name}":`, err.message);
      results.push({ campground: item.campground_name, error: err.message });
    }
    await new Promise(r => setTimeout(r, 2500)); // polite delay
  }

  isRunning    = false;
  availableNow = results.reduce((s, r) => s + (r.found || 0), 0);
  console.log('[Monitor] ── Done ──\n');
  return results;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function startMonitoring() {
  const settings = getSettings();
  const interval = Math.max(1, settings.checkIntervalMinutes || 5);
  console.log(`[Monitor] Scheduling checks every ${interval} minute(s)`);

  checkAllWatchlist().catch(console.error);

  monitorTask = cron.schedule(`*/${interval} * * * *`, () => {
    checkAllWatchlist().catch(console.error);
  });
  return monitorTask;
}

function stopMonitoring() {
  if (monitorTask) { monitorTask.stop(); monitorTask = null; }
}

function getStatus() {
  return { running: isRunning, lastCheck: lastCheckTime, checksToday, availableNow };
}

module.exports = { startMonitoring, stopMonitoring, checkAllWatchlist, getStatus };
