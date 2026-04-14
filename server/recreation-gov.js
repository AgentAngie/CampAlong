const axios = require('axios');
const { getCredentials, ACCOUNTS } = require('./credentials');
const { db } = require('./db');

const RIDB_BASE = 'https://ridb.recreation.gov/api/v1';
const AVAIL_BASE = 'https://www.recreation.gov/api/camps/availability';

// Shared axios instance with Recreation.gov-friendly headers
const client = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Referer': 'https://www.recreation.gov/',
    'Accept': 'application/json',
  },
  timeout: 15000,
});

const getApiKey = async () => {
  const creds = await getCredentials(ACCOUNTS.RECREATION_GOV);
  return creds?.apiKey || process.env.RECREATION_GOV_API_KEY || '';
};

// Search campgrounds via RIDB public API
// opts: { state, lat, lng, radius } — lat/lng/radius take priority over state for geo-filtering
const searchCampgrounds = async (query, state, limit = 20, opts = {}) => {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Recreation.gov API key not configured — add it in Settings');

  const params = { query, limit, offset: 0, full: true, activity: 9, apikey: apiKey };

  if (opts.lat != null && opts.lng != null && opts.radius != null) {
    // Geo-radius search — much more precise than state-level filtering
    params.latitude  = opts.lat;
    params.longitude = opts.lng;
    params.radius    = opts.radius;
    console.log(`[rec.gov] search q="${query}" lat=${opts.lat} lng=${opts.lng} radius=${opts.radius}mi`);
  } else if (state) {
    params.state = state;
    console.log(`[rec.gov] search q="${query}" state=${state}`);
  }

  const { data } = await client.get(`${RIDB_BASE}/facilities`, { params });
  const count = (data.RECDATA || []).length;
  console.log(`[rec.gov] returned ${count} results`);
  return data.RECDATA || [];
};

// Get full campground/facility details (with 1-hour cache)
const getCampgroundDetails = async (facilityId) => {
  const cached = db.prepare(
    "SELECT data FROM campground_cache WHERE campground_id = ? AND datetime(cached_at, '+1 hour') > datetime('now')"
  ).get(String(facilityId));
  if (cached) return JSON.parse(cached.data);

  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Recreation.gov API key not configured');

  const { data } = await client.get(`${RIDB_BASE}/facilities/${facilityId}`, {
    params: { apikey: apiKey, full: true },
  });

  db.prepare('INSERT OR REPLACE INTO campground_cache (campground_id, data) VALUES (?, ?)').run(
    String(facilityId), JSON.stringify(data)
  );
  return data;
};

// Get all campsites within a campground
const getCampgroundSites = async (facilityId) => {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Recreation.gov API key not configured');

  const { data } = await client.get(`${RIDB_BASE}/facilities/${facilityId}/campsites`, {
    params: { apikey: apiKey, full: true, limit: 500 },
  });
  return data.RECDATA || [];
};

// Fetch one month of availability from Recreation.gov's internal availability API
// (no API key required — this is the same endpoint the website uses)
const getMonthAvailability = async (campgroundId, year, month) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const startDateStr = startDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

  const { data } = await client.get(
    `${AVAIL_BASE}/campground/${campgroundId}/month`,
    { params: { start_date: startDateStr } }
  );
  return data;
};

// Fetch availability across an arbitrary date range (spanning multiple months)
const getAvailability = async (campgroundId, startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const months = new Set();
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur <= end) {
    months.add(`${cur.getUTCFullYear()}-${cur.getUTCMonth() + 1}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const allCampsites = {};
  for (const ym of months) {
    const [year, month] = ym.split('-').map(Number);
    const data = await getMonthAvailability(campgroundId, year, month);

    for (const [siteId, siteData] of Object.entries(data.campsites || {})) {
      if (!allCampsites[siteId]) {
        allCampsites[siteId] = { ...siteData, availabilities: {} };
      }
      Object.assign(allCampsites[siteId].availabilities, siteData.availabilities);
    }

    // Small delay between month fetches
    await new Promise(r => setTimeout(r, 300));
  }

  return allCampsites;
};

// Find all sites that have >= minNights consecutive available nights within [startDate, endDate]
const findAvailableSites = (campsites, startDate, endDate, minNights) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const results = [];

  for (const [siteId, site] of Object.entries(campsites)) {
    if (site.campsite_reserve_type === 'First Come, First Served') continue;

    const availableWindows = [];
    const scanDate = new Date(start);

    while (scanDate < end) {
      const windowStart = new Date(scanDate);
      let consecutive = 0;
      const d = new Date(scanDate);

      while (d < end) {
        const key = `${d.toISOString().slice(0, 10)}T00:00:00Z`;
        if (site.availabilities?.[key] === 'Available') {
          consecutive++;
          if (consecutive >= minNights) {
            const windowEnd = new Date(d);
            windowEnd.setDate(windowEnd.getDate() + 1);
            availableWindows.push({
              start: windowStart.toISOString().slice(0, 10),
              end: windowEnd.toISOString().slice(0, 10),
              nights: consecutive,
            });
            break;
          }
        } else {
          break;
        }
        d.setDate(d.getDate() + 1);
      }

      scanDate.setDate(scanDate.getDate() + 1);
    }

    if (availableWindows.length > 0) {
      results.push({
        siteId,
        siteName: site.site,
        loop: site.loop,
        siteType: site.campsite_type,
        maxOccupants: site.max_num_people,
        minOccupants: site.min_num_people,
        reserveType: site.campsite_reserve_type,
        availableWindows,
      });
    }
  }

  return results;
};

// Get the first photo URL for a facility from RIDB media endpoint
const getCampgroundMedia = async (facilityId) => {
  const apiKey = await getApiKey();
  if (!apiKey) return null;
  try {
    const { data } = await client.get(`${RIDB_BASE}/facilities/${facilityId}/media`, {
      params: { apikey: apiKey },
    });
    const photos = (data.RECDATA || []).filter(m =>
      m.MediaType === 'Photo' || m.MediaType === 'Image'
    );
    return photos[0]?.URL || null;
  } catch {
    return null;
  }
};

// Get ALL photo URLs for a facility (for the gallery view)
const getCampgroundPhotos = async (facilityId, limit = 8) => {
  const apiKey = await getApiKey();
  if (!apiKey) return [];
  try {
    const { data } = await client.get(`${RIDB_BASE}/facilities/${facilityId}/media`, {
      params: { apikey: apiKey },
    });
    const photos = (data.RECDATA || []).filter(m =>
      m.MediaType === 'Photo' || m.MediaType === 'Image'
    );
    return photos.slice(0, limit).map(p => ({ url: p.URL, title: p.Title || '', credits: p.Credits || '' }));
  } catch {
    return [];
  }
};

module.exports = {
  searchCampgrounds,
  getCampgroundDetails,
  getCampgroundSites,
  getCampgroundMedia,
  getCampgroundPhotos,
  getAvailability,
  findAvailableSites,
};
