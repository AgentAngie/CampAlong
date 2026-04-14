// ReserveCalifornia (California State Parks) availability client.
// Uses the Tyler Technologies recreation-management backend.
// No API key required.
//
// Migration note: calirdr.usedirect.com was retired (resolves to 0.0.0.0).
// New host: california-rdr.prod.cali.rd12.recreation-management.tylerapp.com

const axios = require('axios');

const BASE = 'https://california-rdr.prod.cali.rd12.recreation-management.tylerapp.com';
const CACHE_TTL = 3600000; // 1 hour

const client = axios.create({
  baseURL: BASE,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': 'https://www.reservecalifornia.com/',
    'Origin':  'https://www.reservecalifornia.com',
    'Accept':  'application/json, text/javascript, */*; q=0.01',
  },
  timeout: 20000,
});

// ── In-memory cache for the static places/facilities lists ────────────────────

let _places = null;
let _placesAt = 0;
let _facilities = null;
let _facilitiesAt = 0;

async function getPlaces() {
  if (_places && Date.now() - _placesAt < CACHE_TTL) return _places;
  const { data } = await client.get('/rdr/fd/places');
  _places = Array.isArray(data) ? data : [];
  _placesAt = Date.now();
  return _places;
}

async function getFacilities() {
  if (_facilities && Date.now() - _facilitiesAt < CACHE_TTL) return _facilities;
  const { data } = await client.get('/rdr/fd/facilities');
  _facilities = Array.isArray(data) ? data : [];
  _facilitiesAt = Date.now();
  return _facilities;
}

// New API uses MM-DD-YYYY with dashes (not M/D/YYYY with slashes)
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}-${d}-${y}`;
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search for campgrounds by name or keyword.
 * Loads the full places + facilities lists (cached 1 h) and filters in-memory.
 * Returns facilities (individual campground loops/areas) rather than parks so
 * callers get the FacilityId needed for availability queries.
 */
async function searchCampgrounds(query) {
  const [places, facilities] = await Promise.all([getPlaces(), getFacilities()]);

  const q = query.toLowerCase();

  // Which parks match the search term?
  const matchingPlaceIds = new Set(
    places
      .filter(p => (p.Name || '').toLowerCase().includes(q))
      .map(p => p.PlaceId)
  );

  // Build a PlaceId → place lookup for coordinates & naming
  const placeById = {};
  for (const p of places) placeById[p.PlaceId] = p;

  // Collect facilities that belong to a matching park OR match by name
  const seen = new Set();
  const results = [];

  for (const f of facilities) {
    if (!f.AllowWebBooking) continue;
    const nameMatch  = (f.Name || '').toLowerCase().includes(q);
    const placeMatch = matchingPlaceIds.has(f.PlaceId);
    if (!nameMatch && !placeMatch) continue;
    if (seen.has(f.FacilityId)) continue;
    seen.add(f.FacilityId);

    const place = placeById[f.PlaceId] || {};
    const placeName = place.Name || '';
    const facName   = f.Name || f.ShortName || '';

    // Build a friendly display name: "Park Name — Campground Area"
    const displayName = placeName && facName && placeName !== facName
      ? `${placeName} — ${facName}`
      : placeName || facName;

    results.push({
      id:          String(f.FacilityId),
      name:        displayName,
      description: (f.Description || '').replace(/<[^>]+>/g, '').slice(0, 200).trim(),
      state:       'CA',
      source:      'reserve-california',
      reservable:  true,
      latitude:    place.Latitude  || null,
      longitude:   place.Longitude || null,
      url: `https://www.reservecalifornia.com/Web/Default.aspx#!park/${f.PlaceId}/${f.FacilityId}`,
    });
  }

  return results;
}

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Fetch the availability grid for a specific facility (campground loop/area).
 * facilityId should be the FacilityId returned by searchCampgrounds.
 */
async function getAvailability(facilityId, startDate, endDate, minNights) {
  const { data } = await client.post('/rdr/search/grid', {
    FacilityId:       Number(facilityId),
    StartDate:        fmtDate(startDate),
    EndDate:          fmtDate(endDate),
    UnitTypeId:       0,
    InSeasonOnly:     false,
    WebOnly:          false,
    IsADA:            false,
    SleepingUnitId:   0,
    MinVehicleLength: 0,
    UnitCategoryId:   0,
    UnitTypesGroupIds: [],
    NightsRequested:  minNights || 1,
  });
  return data;
}

/**
 * Parse the grid response and find units with >= minNights consecutive
 * available nights within [startDate, endDate].
 *
 * Slice keys are ISO datetime strings ("2026-07-01T00:00:00") — we match
 * by comparing just the first 10 characters (the date portion).
 */
function findAvailableSites(gridData, startDate, endDate, minNights) {
  const facility = gridData?.Facility;
  if (!facility?.Units) return [];

  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date(endDate   + 'T12:00:00');
  const results = [];

  for (const [unitId, unit] of Object.entries(facility.Units)) {
    const slices = unit.Slices || {};
    const availableWindows = [];

    const scanDate = new Date(start);
    while (scanDate < end) {
      const windowStart = new Date(scanDate);
      let consecutive = 0;
      const d = new Date(scanDate);

      while (d < end) {
        const dateKey = d.toISOString().slice(0, 10); // "2026-07-01"
        // Slice keys look like "2026-07-01T00:00:00" — match by date prefix
        const sliceKey = Object.keys(slices).find(k => k.startsWith(dateKey));
        const slice    = sliceKey ? slices[sliceKey] : null;

        if (slice && slice.IsFree && !slice.IsBlocked) {
          consecutive++;
          if (consecutive >= minNights) {
            const windowEnd = new Date(d);
            windowEnd.setDate(windowEnd.getDate() + 1);
            availableWindows.push({
              start:  windowStart.toISOString().slice(0, 10),
              end:    windowEnd.toISOString().slice(0, 10),
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
        siteId:       String(unitId),
        siteName:     unit.Name || `Unit ${unitId}`,
        loop:         unit.Loop || unit.LoopName || '',
        siteType:     unit.UnitTypeName || 'Standard',
        maxOccupants: unit.MaxOccupancy || 0,
        availableWindows,
        _rawUnit: unit,
      });
    }
  }

  return results;
}

// Search campgrounds whose parent Place falls within a lat/lng bounding box.
// Uses the same cached places + facilities lists — no extra network calls.
async function searchByBounds(minLat, maxLat, minLng, maxLng) {
  const [places, facilities] = await Promise.all([getPlaces(), getFacilities()]);

  const withinBounds = new Set(
    places
      .filter(p => {
        const lat = p.Latitude, lng = p.Longitude;
        return lat && lng &&
          lat >= minLat && lat <= maxLat &&
          lng >= minLng && lng <= maxLng;
      })
      .map(p => p.PlaceId)
  );

  const placeById = {};
  for (const p of places) placeById[p.PlaceId] = p;

  const seen    = new Set();
  const results = [];

  for (const f of facilities) {
    if (!withinBounds.has(f.PlaceId)) continue;
    if (!f.AllowWebBooking) continue;
    if (seen.has(f.FacilityId)) continue;
    seen.add(f.FacilityId);

    const place       = placeById[f.PlaceId] || {};
    const placeName   = place.Name || '';
    const facName     = f.Name || f.ShortName || '';
    const displayName = placeName && facName && placeName !== facName
      ? `${placeName} — ${facName}` : placeName || facName;

    results.push({
      id:          String(f.FacilityId),
      name:        displayName,
      description: (f.Description || '').replace(/<[^>]+>/g, '').slice(0, 200).trim(),
      state:       'CA',
      source:      'reserve-california',
      reservable:  true,
      latitude:    place.Latitude  || null,
      longitude:   place.Longitude || null,
      score:       0,
      reasons:     [],
      url: `https://www.reservecalifornia.com/Web/Default.aspx#!park/${f.PlaceId}/${f.FacilityId}`,
    });
  }

  return results;
}

module.exports = { searchCampgrounds, searchByBounds, getAvailability, findAvailableSites };
