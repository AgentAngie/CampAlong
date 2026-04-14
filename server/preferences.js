// Global user preference profile — stored once, applied to ALL alerts and recommendations.
const fs = require('fs');
const path = require('path');

const PREFS_FILE = path.join(__dirname, '..', 'data', 'preferences.json');

const DEFAULTS = {
  treecover: false,        // wants tree / canopy cover
  shade: false,            // wants shaded sites
  nearWater: false,        // wants lake / creek / river nearby
  trailAccess: false,      // wants trail access from campground
  kidFriendlyTerrain: false, // prefers flat / easy terrain
  avoidExposed: false,     // avoids hot / sunny / exposed sites
  avoidRVLoops: false,     // avoids RV / hookup-heavy loops
  minOccupants: 1,         // minimum site capacity needed
};

const WATER_WORDS = ['lake', 'creek', 'river', 'beach', 'bay', 'ocean', 'pond', 'stream', 'falls', 'lagoon', 'shore', 'reservoir', 'spring'];
const TREE_WORDS  = ['oak', 'pine', 'redwood', 'cedar', 'fir', 'maple', 'sycamore', 'eucalyptus', 'manzanita', 'spruce', 'aspen', 'forest', 'grove', 'timber', 'sequoia', 'wooded'];
const RV_TYPES    = ['full hookup', 'hookup', 'rv', 'electric', 'water electric', 'group rv', 'equestrian rv'];

function getPreferences() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function savePreferences(prefs) {
  const merged = { ...DEFAULTS, ...prefs };
  // Coerce types
  merged.minOccupants = parseInt(merged.minOccupants) || 1;
  fs.writeFileSync(PREFS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

/**
 * Normalize a Recreation.gov availability-response site into the common format.
 * (These come from the availability API — only basic fields, no ATTRIBUTES array.)
 */
function normalizeRecGovAvailSite(site, campgroundName) {
  return {
    name: site.siteName || site.site || '',
    loop: site.loop || '',
    type: site.siteType || site.campsite_type || '',
    maxOccupants: site.maxOccupants || site.max_num_people || 0,
    attributes: {},          // not available from availability endpoint
    campgroundName: campgroundName || '',
    campgroundDesc: '',
  };
}

/**
 * Normalize a Recreation.gov RIDB full-site record.
 * (These come from getCampgroundSites — includes ATTRIBUTES array.)
 */
function normalizeRecGovDetailSite(site, campground) {
  const attrs = {};
  for (const a of site.ATTRIBUTES || []) attrs[a.AttributeName] = a.AttributeValue;
  return {
    name: site.CampsiteName || site.site || String(site.CampsiteID || ''),
    loop: site.Loop || '',
    type: site.CampsiteType || '',
    maxOccupants: site.CampsiteMaxOccupants || 0,
    attributes: attrs,
    campgroundName: campground?.FacilityName || '',
    campgroundDesc: (campground?.FacilityDescription || '').replace(/<[^>]+>/g, ''),
  };
}

/**
 * Normalize a ReserveCalifornia unit from the grid response.
 */
function normalizeReserveCASite(unit, facilityName) {
  return {
    name: unit.Name || unit.UnitName || '',
    loop: unit.Loop || unit.LoopName || '',
    type: unit.UnitTypeName || '',
    maxOccupants: unit.MaxOccupancy || 0,
    attributes: {},
    campgroundName: facilityName || '',
    campgroundDesc: '',
  };
}

/**
 * Match a normalized site against the user's global preference profile.
 * Returns match reasons, mismatch reasons, and whether the site passes the filter.
 *
 * Strategy:
 *  - Hard mismatches (avoidRVLoops, minOccupants) block the alert entirely.
 *  - Positive matches produce human-readable reasons included in the alert.
 *  - Preferences we can't detect (e.g. shade without attribute data) are skipped
 *    rather than penalized — we only flag what we can actually verify.
 */
function matchSiteToPreferences(site, prefs) {
  if (!prefs) return { matchReasons: [], mismatchReasons: [], score: 0, passes: true };

  const matchReasons = [];
  const mismatchReasons = [];

  const name   = ((site.name || '') + ' ' + (site.loop || '')).toLowerCase();
  const type   = (site.type || '').toLowerCase();
  const cgName = (site.campgroundName || '').toLowerCase();
  const cgDesc = (site.campgroundDesc || '').toLowerCase();
  const attrs  = site.attributes || {};

  const getAttr = (...keys) => {
    for (const k of keys) {
      const v = attrs[k] || attrs[k.toLowerCase()] || '';
      if (v) return String(v).toLowerCase();
    }
    return '';
  };

  const shadeAttr   = getAttr('Shade', 'Site Shaded', 'Canopy Cover', 'shade', 'site shaded');
  const terrainAttr = getAttr('Terrain Type', 'Site Access', 'Campsite Access', 'terrain type');

  // ── Shade ─────────────────────────────────────────────────────────────────
  const hasShade   = /yes|full|partial|heavy|moderate|dense/.test(shadeAttr);
  const hasNoShade = /no|none|open|exposed/.test(shadeAttr);

  if (prefs.shade && shadeAttr) {
    if (hasShade) {
      const desc = shadeAttr.includes('full') ? 'full shade' : shadeAttr.includes('heavy') ? 'heavy canopy' : 'partial shade';
      matchReasons.push(`Shaded site (${desc})`);
    } else if (hasNoShade) {
      mismatchReasons.push('Unshaded / exposed site');
    }
  }

  if (prefs.avoidExposed && shadeAttr && hasNoShade) {
    if (!mismatchReasons.includes('Unshaded / exposed site'))
      mismatchReasons.push('Exposed / sunny site');
  }

  // ── Tree cover ─────────────────────────────────────────────────────────────
  if (prefs.treecover) {
    const treeHits = TREE_WORDS.filter(w => name.includes(w) || cgName.includes(w) || cgDesc.includes(w));
    if (treeHits.length) {
      const top = treeHits.slice(0, 2).map(t => t.charAt(0).toUpperCase() + t.slice(1));
      matchReasons.push(`${top.join('/')} tree cover`);
    } else if (hasShade) {
      matchReasons.push('Tree canopy noted');
    }
  }

  // ── Near water ────────────────────────────────────────────────────────────
  if (prefs.nearWater) {
    const waterHits = WATER_WORDS.filter(w => name.includes(w) || cgName.includes(w) || cgDesc.includes(w));
    if (waterHits.length) {
      const label = waterHits[0].charAt(0).toUpperCase() + waterHits[0].slice(1);
      matchReasons.push(`${label} nearby`);
    }
  }

  // ── Trail access ──────────────────────────────────────────────────────────
  if (prefs.trailAccess) {
    const hasTrails = ['trail', 'trailhead', 'hike', 'hiking'].some(w => cgName.includes(w) || cgDesc.includes(w) || name.includes(w));
    if (hasTrails) matchReasons.push('Trail access');
  }

  // ── Kid-friendly terrain ──────────────────────────────────────────────────
  if (prefs.kidFriendlyTerrain && terrainAttr) {
    if (/flat|level|paved|easy|accessible/.test(terrainAttr)) {
      matchReasons.push('Flat / easy terrain');
    } else if (/steep|hilly|sloped|rocky|uneven/.test(terrainAttr)) {
      mismatchReasons.push('Steep / uneven terrain');
    }
  }

  // ── Avoid RV loops ─────────────────────────────────────────────────────────
  if (prefs.avoidRVLoops) {
    const isRV = RV_TYPES.some(t => type.includes(t)) || /\brv\b|hookup/.test(name);
    if (isRV) {
      mismatchReasons.push('RV / hookup site');
    } else if (/standard|tent|nonelectric|non-electric/.test(type)) {
      matchReasons.push('Tent/standard site (not an RV loop)');
    }
  }

  // ── Minimum occupants ──────────────────────────────────────────────────────
  const minOcc = parseInt(prefs.minOccupants) || 1;
  const maxOcc = parseInt(site.maxOccupants) || 0;
  if (minOcc > 1 && maxOcc > 0) {
    if (maxOcc < minOcc) {
      mismatchReasons.push(`Site fits only ${maxOcc} (you need ${minOcc}+)`);
    } else {
      matchReasons.push(`Fits ${maxOcc} people`);
    }
  }

  const score = matchReasons.length * 10 - mismatchReasons.length * 20;
  const passes = mismatchReasons.length === 0;

  return { matchReasons, mismatchReasons, score, passes };
}

module.exports = {
  getPreferences,
  savePreferences,
  matchSiteToPreferences,
  normalizeRecGovAvailSite,
  normalizeRecGovDetailSite,
  normalizeReserveCASite,
  DEFAULTS,
};
