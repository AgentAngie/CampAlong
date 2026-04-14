// Tracks historical cancellation timing and surfaces predictive insights.
// Each time the monitor detects a NEW opening, we record:
//   - which campground, which date became available, how far in advance
// Over time we compute average lead time, best days of week, etc.

const fs = require('fs');
const path = require('path');

const PATTERNS_FILE = path.join(__dirname, '..', 'data', 'patterns.json');
const MAX_EVENTS = 200; // per campground

const DAYS   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function read() {
  try { return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8')); } catch (_) { return {}; }
}
function write(data) { fs.writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2)); }

/**
 * Record newly-detected cancellations for a campground.
 * Call this only for genuinely NEW site openings (not repeat alerts).
 *
 * @param {string} campgroundId
 * @param {string} source - 'recreation.gov' | 'reserve-california'
 * @param {string} campgroundName
 * @param {Array}  sites - available site objects (each has availableWindows)
 */
function recordCancellations(campgroundId, source, campgroundName, sites) {
  const now = new Date();
  const data = read();

  if (!data[campgroundId]) {
    data[campgroundId] = { source, name: campgroundName, events: [] };
  }
  // Update name in case it changed
  data[campgroundId].name = campgroundName;

  for (const site of sites) {
    for (const win of site.availableWindows || []) {
      const checkin = new Date(win.start + 'T12:00:00');
      const leadDays = Math.round((checkin - now) / 86400000); // ms → days
      if (leadDays < 0 || leadDays > 365) continue; // ignore bad data

      data[campgroundId].events.push({
        detectedAt: now.toISOString(),
        checkinDate: win.start,
        leadDays,
        dayOfWeek: now.getDay(),   // 0=Sun
        month: now.getMonth(),     // 0=Jan
      });
    }
  }

  // Trim to most recent N events
  if (data[campgroundId].events.length > MAX_EVENTS) {
    data[campgroundId].events = data[campgroundId].events.slice(-MAX_EVENTS);
  }

  write(data);
}

/**
 * Return insight object for a specific campground.
 *
 * @param {string} campgroundId
 * @param {string|null} checkinDate - user's planned check-in (YYYY-MM-DD) for personalised "start watching" date
 */
function getInsights(campgroundId, checkinDate) {
  const data = read();
  const entry = data[campgroundId];
  const events = entry?.events || [];

  // ── Generic advice (used when we have < 3 data points) ──────────────────
  const genericStartDate = startWatchDate(checkinDate, 18);
  const generic = {
    hasData: false,
    eventCount: 0,
    generalAdvice: 'Cancellations most commonly appear 14–21 days before check-in. Tuesday and Wednesday mornings tend to be the most active.',
    bestDays: ['Tuesday', 'Wednesday'],
    startWatchDate: genericStartDate,
    recommendation: genericStartDate
      ? `Start watching around ${genericStartDate} (≈18 days before check-in)`
      : 'Start watching 2–3 weeks before your trip',
  };

  if (events.length < 3) return generic;

  // ── Average & median lead time ───────────────────────────────────────────
  const avgLead = Math.round(events.reduce((s, e) => s + e.leadDays, 0) / events.length);
  const sorted  = [...events].sort((a, b) => a.leadDays - b.leadDays);
  const medLead = sorted[Math.floor(sorted.length / 2)].leadDays;

  // ── Day-of-week distribution ─────────────────────────────────────────────
  const dayCounts = Array(7).fill(0);
  events.forEach(e => dayCounts[e.dayOfWeek]++);
  const topDays = dayCounts
    .map((c, i) => ({ day: DAYS[i], count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .filter(x => x.count > 0)
    .map(x => x.day);

  // ── Month distribution ───────────────────────────────────────────────────
  const monthCounts = Array(12).fill(0);
  events.forEach(e => monthCounts[e.month]++);
  const peakMonth = MONTHS[monthCounts.indexOf(Math.max(...monthCounts))];

  // ── Personalised start-watch date ────────────────────────────────────────
  const watchDate = startWatchDate(checkinDate, avgLead);

  const insight = [
    `Cancellations at this campground typically appear ${avgLead} day${avgLead !== 1 ? 's' : ''} before check-in`,
    topDays.length ? `, most often on ${topDays.join(' and ')}s` : '',
    `. Peak cancellation month: ${peakMonth}.`,
  ].join('');

  return {
    hasData: true,
    eventCount: events.length,
    avgLeadDays: avgLead,
    medianLeadDays: medLead,
    bestDays: topDays.length ? topDays : ['Tuesday', 'Wednesday'],
    peakMonth,
    startWatchDate: watchDate,
    insight,
    recommendation: watchDate
      ? `Start watching around ${watchDate} (${avgLead} days before check-in)`
      : `Start watching ${avgLead} days before your trip`,
  };
}

function startWatchDate(checkinDate, leadDays) {
  if (!checkinDate) return null;
  const d = new Date(checkinDate + 'T12:00:00');
  d.setDate(d.getDate() - leadDays - 3); // a few days buffer
  return d.toISOString().slice(0, 10);
}

/**
 * Return insight objects for ALL tracked campgrounds (for the dashboard).
 */
function getAllInsights() {
  const data = read();
  return Object.entries(data).map(([id, entry]) => ({
    campgroundId: id,
    source: entry.source,
    name: entry.name,
    eventCount: entry.events?.length || 0,
    insights: getInsights(id, null),
  }));
}

module.exports = { recordCancellations, getInsights, getAllInsights };
