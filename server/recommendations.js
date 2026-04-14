const { searchCampgrounds, getCampgroundSites } = require('./recreation-gov');
const { searchByBounds: rcSearchByBounds }      = require('./reserve-california');

// ─── Campground scoring ─────────────────────────────────────────────────────

function scoreCampground(facility, prefs = {}) {
  let score = 0;
  const reasons = [];

  const name = (facility.FacilityName || '').toLowerCase();
  const desc = (facility.FacilityDescription || '').replace(/<[^>]+>/g, '').toLowerCase();
  const combined = `${name} ${desc}`;

  // Water proximity (+up to 30)
  if (prefs.nearWater !== false) {
    const water = ['lake', 'creek', 'river', 'beach', 'bay', 'ocean', 'pond', 'stream', 'falls', 'reservoir', 'lagoon'];
    const hits = water.filter(w => combined.includes(w));
    if (hits.length) {
      score += Math.min(30, 15 + hits.length * 5);
      reasons.push(`Near water — ${hits.slice(0, 2).join(', ')}`);
    }
  }

  // Tree cover / shade (+up to 25)
  if (prefs.shade !== false) {
    const trees = ['redwood', 'sequoia', 'forest', 'pine', 'oak', 'cedar', 'fir', 'grove', 'woodland', 'timber', 'spruce', 'aspen'];
    const hits = trees.filter(w => combined.includes(w));
    if (hits.length) {
      score += Math.min(25, 10 + hits.length * 5);
      reasons.push(`Tree cover — ${hits.slice(0, 2).join(', ')}`);
    }
  }

  // Family amenities (+15)
  if (prefs.familyAmenities !== false) {
    const family = ['family', 'playground', 'picnic', 'swim', 'fishing', 'junior ranger', 'visitor center'];
    const hits = family.filter(w => combined.includes(w));
    if (hits.length) {
      score += Math.min(15, hits.length * 5);
      reasons.push('Family-friendly amenities');
    }
  }

  // Flush toilets / showers — important for families (+10)
  if (combined.includes('flush') || combined.includes('shower') || combined.includes('restroom')) {
    score += 10;
    reasons.push('Flush toilets / showers');
  }

  // Mild-temperature indicator: coastal or mid-elevation latitude band (+5)
  const lat = facility.FacilityLatitude || 0;
  if (lat > 33 && lat < 47) score += 5;

  // ADA accessible bonus (+3)
  if (facility.FacilityAdaAccess === 'Y') score += 3;

  return { score, reasons };
}

// ─── Campsite scoring ───────────────────────────────────────────────────────

function scoreSite(site, prefs = {}) {
  let score = 0;
  const reasons = [];

  const name = ((site.CampsiteName || '') + ' ' + (site.Loop || '')).toLowerCase();

  // Build attribute lookup
  const attrs = {};
  for (const a of site.ATTRIBUTES || []) {
    attrs[(a.AttributeName || '').toLowerCase()] = (a.AttributeValue || '').toLowerCase();
  }

  // Shade
  const shadeVal = attrs['shade'] || attrs['site shaded'] || attrs['canopy cover'] || '';
  if (/yes|full|partial|heavy|moderate/.test(shadeVal)) {
    score += 20;
    reasons.push(`Shaded (${shadeVal})`);
  }

  // Family size — enough capacity
  const maxOcc = site.CampsiteMaxOccupants || parseInt(attrs['max occupants']) || 0;
  if (maxOcc >= 6) { score += 15; reasons.push(`Fits up to ${maxOcc} people`); }
  else if (maxOcc >= 4) { score += 8; reasons.push(`Fits up to ${maxOcc} people`); }

  // Near water (by site name)
  const waterWords = ['lake', 'creek', 'river', 'water', 'beach', 'shore'];
  if (waterWords.some(w => name.includes(w))) {
    score += 20;
    reasons.push('Near water');
  }

  // Flat / easy terrain
  const terrain = attrs['terrain type'] || attrs['site access'] || '';
  if (/flat|paved|easy|accessible/.test(terrain)) {
    score += 10;
    reasons.push('Flat / easy access');
  }

  // Pull-through (easier for families with gear)
  const siteType = attrs['site type'] || attrs['campsite type'] || '';
  if (siteType.includes('pull')) { score += 5; reasons.push('Pull-through'); }

  // Standard / tent (not hookup-required)
  if (/standard|tent/.test((site.CampsiteType || '').toLowerCase())) score += 5;

  return { score, reasons };
}

// ─── Geographic regions ─────────────────────────────────────────────────────

// bounds: [minLat, maxLat, minLng, maxLng]  center: { lat, lng, radius (miles) }
// The API is queried by center+radius so results are geographically constrained at the source.
// bounds is then applied as a precise post-filter cutoff.
const REGIONS = {
  'Northern California':             { state: 'CA', query: 'redwood coast northern california',         center: { lat: 40.2,  lng: -122.0, radius: 180 }, bounds: [38.5,  42.0,  -124.5, -119.5] },
  'Sierra Nevada (CA)':             { state: 'CA', query: 'sierra nevada lake yosemite tahoe',         center: { lat: 38.0,  lng: -119.5, radius: 150 }, bounds: [36.5,  39.5,  -121.0, -118.0] },
  'Central California Coast':       { state: 'CA', query: 'big sur monterey coast central california', center: { lat: 36.7,  lng: -121.6, radius: 120 }, bounds: [35.0,  38.5,  -122.5, -120.5] },
  'Southern California':            { state: 'CA', query: 'angeles san diego southern california',     center: { lat: 34.1,  lng: -117.3, radius: 200 }, bounds: [32.5,  35.8,  -120.5, -114.1] },
  'Pacific Northwest — Oregon':     { state: 'OR', query: 'crater lake columbia river cascade',        center: { lat: 44.1,  lng: -120.5, radius: 200 }, bounds: [41.9,  46.3,  -124.6, -116.5] },
  'Pacific Northwest — Washington': { state: 'WA', query: 'olympic rainier north cascades',           center: { lat: 47.2,  lng: -121.0, radius: 180 }, bounds: [45.5,  49.0,  -124.8, -117.0] },
  'Southwest — Utah':               { state: 'UT', query: 'zion bryce canyon arches canyonlands',     center: { lat: 39.3,  lng: -111.5, radius: 220 }, bounds: [36.9,  42.0,  -114.1, -109.0] },
  'Southwest — Arizona':            { state: 'AZ', query: 'grand canyon sedona arizona',              center: { lat: 34.3,  lng: -112.0, radius: 220 }, bounds: [31.3,  37.0,  -114.9, -109.0] },
  'Rocky Mountains — Colorado':     { state: 'CO', query: 'rocky mountain colorado national forest',  center: { lat: 39.0,  lng: -105.5, radius: 220 }, bounds: [36.9,  41.1,  -109.1, -102.0] },
  'Northern Rockies — Montana/Wyoming': { state: 'MT', query: 'glacier yellowstone montana wyoming',  center: { lat: 45.5,  lng: -110.0, radius: 280 }, bounds: [41.0,  49.0,  -116.1, -104.0] },
};

// ─── Public API ─────────────────────────────────────────────────────────────

async function getCampgroundRecommendations(region, prefs = {}, limit = 50) {
  const regionData = REGIONS[region];
  if (!regionData) throw new Error(`Unknown region: ${region}`);

  const seen = new Set();
  const scored = [];

  // Run two searches: region-specific query + generic camping
  // Pass center lat/lng/radius so the API returns geographically relevant results
  const geoOpts = regionData.center
    ? { lat: regionData.center.lat, lng: regionData.center.lng, radius: regionData.center.radius }
    : { state: regionData.state };

  const queries = [regionData.query, 'campground'];
  for (const q of queries) {
    let results;
    try {
      results = await searchCampgrounds(q, regionData.state, 50, geoOpts);
    } catch (_) {
      continue;
    }
    for (const c of results) {
      if (seen.has(c.FacilityID)) continue;
      seen.add(c.FacilityID);

      // Always skip facilities with missing/zero coordinates — they can't be mapped
      const lat = parseFloat(c.FacilityLatitude);
      const lng = parseFloat(c.FacilityLongitude);
      if (!lat || !lng) continue;

      // Filter by bounding box when defined
      if (regionData.bounds) {
        const [minLat, maxLat, minLng, maxLng] = regionData.bounds;
        if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
      }

      // Exclude hike-in / walk-in / trail-access campgrounds when family filter is on —
      // these are inaccessible with young children, gear, or strollers.
      if (prefs.familyAmenities) {
        const combined = (
          (c.FacilityName || '') + ' ' + (c.FacilityDescription || '')
        ).toLowerCase().replace(/<[^>]+>/g, '');
        const hikeInTerms = [
          'hike-in', 'hike in', 'hikein',
          'walk-in', 'walk in', 'walkin',
          'trail-in', 'trail in',
          'pack-in', 'pack in',
          'backpack only', 'non-motorized access',
          'accessible only by trail', 'accessible by trail',
          'no vehicle access',
        ];
        if (hikeInTerms.some(t => combined.includes(t))) continue;
      }

      const { score, reasons } = scoreCampground(c, prefs);
      scored.push({ ...c, _score: score, _reasons: reasons });
    }
  }

  // Deterministic: score desc → name asc (never random)
  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return (a.FacilityName || '').localeCompare(b.FacilityName || '');
  });

  const recResults = scored.slice(0, limit).map(c => ({
    id: c.FacilityID,
    name: c.FacilityName,
    description: (c.FacilityDescription || '').replace(/<[^>]+>/g, '').replace(/^Overview\s*/i, '').slice(0, 400).trim(),
    latitude: c.FacilityLatitude,
    longitude: c.FacilityLongitude,
    state: (c.FACILITYADDRESS || [])[0]?.AddressStateCode,
    score: c._score,
    reasons: c._reasons,
    reservable: c.Reservable,
    url: `https://www.recreation.gov/camping/campgrounds/${c.FacilityID}`,
    source: 'recreation.gov',
    phone: c.FacilityPhone,
  }));

  // For CA regions, merge in ReserveCalifornia results from the same bounds
  if (regionData.state === 'CA' && regionData.bounds) {
    const [minLat, maxLat, minLng, maxLng] = regionData.bounds;
    const rcResults = await rcSearchByBounds(minLat, maxLat, minLng, maxLng).catch(() => []);
    const recNames  = new Set(recResults.map(r => r.name.toLowerCase().slice(0, 20)));
    const rcUnique  = rcResults.filter(r => {
      if (!r.latitude || !r.longitude) return false;
      if (recNames.has(r.name.toLowerCase().slice(0, 20))) return false;
      return true;
    });
    // Assign a score to RC results for sorting; RC results have no score, use 0
    const rcWithScore = rcUnique.map(r => ({ ...r, score: r.score || 0 }));
    const combined    = [...recResults, ...rcWithScore];
    // Deterministic sort: score desc → name asc
    combined.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.name || '').localeCompare(b.name || '');
    });
    return combined;
  }

  return recResults;
}

async function getSiteRecommendations(campgroundId, prefs = {}) {
  const sites = await getCampgroundSites(campgroundId);

  return sites
    .map(site => {
      const { score, reasons } = scoreSite(site, prefs);
      return {
        id: site.CampsiteID,
        name: site.CampsiteName || site.Loop || `Site ${site.CampsiteID}`,
        loop: site.Loop,
        type: site.CampsiteType,
        maxOccupants: site.CampsiteMaxOccupants,
        accessible: site.CampsiteAccessible === 'Y',
        attributes: (site.ATTRIBUTES || []).reduce((acc, a) => {
          acc[a.AttributeName] = a.AttributeValue;
          return acc;
        }, {}),
        score,
        reasons,
        url: `https://www.recreation.gov/camping/campsites/${site.CampsiteID}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// Search campgrounds within an arbitrary lat/lng bounding box
async function searchByBounds(minLat, maxLat, minLng, maxLng, prefs = {}, limit = 50) {
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  // Radius from center to far corner in miles
  const latMiles  = Math.abs(maxLat - centerLat) * 69;
  const lngMiles  = Math.abs(maxLng - centerLng) * Math.cos(centerLat * Math.PI / 180) * 69;
  const radius    = Math.ceil(Math.sqrt(latMiles * latMiles + lngMiles * lngMiles)) + 10;

  const geoOpts = { lat: centerLat, lng: centerLng, radius };
  const seen    = new Set();
  const scored  = [];

  for (const q of ['campground', 'camping']) {
    let results;
    try { results = await searchCampgrounds(q, null, 50, geoOpts); } catch (_) { continue; }

    for (const c of results) {
      if (seen.has(c.FacilityID)) continue;
      seen.add(c.FacilityID);

      const lat = parseFloat(c.FacilityLatitude);
      const lng = parseFloat(c.FacilityLongitude);
      if (!lat || !lng || lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;

      const { score, reasons } = scoreCampground(c, prefs);
      scored.push({ ...c, _score: score, _reasons: reasons });
    }
  }

  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return (a.FacilityName || '').localeCompare(b.FacilityName || '');
  });

  return scored.slice(0, limit).map(c => ({
    id:          c.FacilityID,
    name:        c.FacilityName,
    description: (c.FacilityDescription || '').replace(/<[^>]+>/g, '').replace(/^Overview\s*/i, '').slice(0, 400).trim(),
    latitude:    c.FacilityLatitude,
    longitude:   c.FacilityLongitude,
    state:       (c.FACILITYADDRESS || [])[0]?.AddressStateCode,
    score:       c._score,
    reasons:     c._reasons,
    reservable:  c.Reservable,
    url:         `https://www.recreation.gov/camping/campgrounds/${c.FacilityID}`,
    source:      'recreation.gov',
  }));
}

module.exports = { getCampgroundRecommendations, getSiteRecommendations, searchByBounds, scoreSite, REGIONS };
