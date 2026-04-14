'use strict';

/**
 * county-parks.js — Static database of California county and regional parks
 * that offer camping but are NOT in Recreation.gov or ReserveCalifornia.
 *
 * Includes San Diego County, LA County, East Bay Regional Parks, etc.
 * Search is in-memory (no API calls). Booking links go to each park's system.
 */

const COUNTY_PARKS = [
  // ── San Diego County ──────────────────────────────────────────────────────
  {
    id: 'sdco-william-heise',
    name: 'William Heise County Park',
    county: 'San Diego County',
    location: 'Julian, CA',
    latitude: 33.0842,
    longitude: -116.6347,
    description: 'Oak, pine, and cedar forest at 4,200ft — one of the shadiest campgrounds near San Diego. Family-friendly with playgrounds, showers, fire rings, and easy hiking to views.',
    tags: ['shade', 'trees', 'family', 'flush', 'mountain'],
    bookingUrl: 'https://parksres.sandiegocounty.gov/',
    source: 'county',
  },
  {
    id: 'sdco-lake-morena',
    name: 'Lake Morena County Park',
    county: 'San Diego County',
    location: 'Campo, CA',
    latitude: 32.6894,
    longitude: -116.5261,
    description: 'Quiet oak-studded reservoir camping in the backcountry east of San Diego. Excellent bass fishing, wildlife, and far less crowded than nearby state parks.',
    tags: ['water', 'lake', 'fishing', 'oak', 'shade', 'quiet'],
    bookingUrl: 'https://parksres.sandiegocounty.gov/',
    source: 'county',
  },
  {
    id: 'sdco-dos-picos',
    name: 'Dos Picos County Park',
    county: 'San Diego County',
    location: 'Ramona, CA',
    latitude: 33.0508,
    longitude: -116.8706,
    description: 'Shaded oak woodland campground about 40 miles northeast of San Diego. Peaceful, uncrowded, with clean restrooms and great bird watching.',
    tags: ['shade', 'oak', 'family', 'flush', 'quiet'],
    bookingUrl: 'https://parksres.sandiegocounty.gov/',
    source: 'county',
  },
  {
    id: 'sdco-guajome',
    name: 'Guajome Regional Park',
    county: 'San Diego County',
    location: 'Oceanside, CA',
    latitude: 33.2614,
    longitude: -117.2806,
    description: 'Riparian park with a scenic lake near Oceanside. Good for families with fishing, birding, and shaded campsites close to the coast.',
    tags: ['water', 'lake', 'shade', 'family', 'fishing', 'flush'],
    bookingUrl: 'https://parksres.sandiegocounty.gov/',
    source: 'county',
  },
  {
    id: 'sdco-sweetwater',
    name: 'Sweetwater Summit Regional Park',
    county: 'San Diego County',
    location: 'Bonita, CA',
    latitude: 32.6703,
    longitude: -116.9975,
    description: 'Rolling hills with reservoir views just 15 miles from downtown San Diego. Great for groups and equestrian camping, with hookups available.',
    tags: ['family', 'flush', 'hookup', 'reservoir', 'hills'],
    bookingUrl: 'https://parksres.sandiegocounty.gov/',
    source: 'county',
  },

  // ── East Bay Regional Parks (Alameda & Contra Costa) ─────────────────────
  {
    id: 'ebrp-del-valle',
    name: 'Del Valle Regional Park',
    county: 'Alameda County',
    location: 'Livermore, CA',
    latitude: 37.6004,
    longitude: -121.7447,
    description: 'Large reservoir camping in the Livermore hills with swimming, boating, and fishing. Well-equipped sites with showers — popular with Bay Area families.',
    tags: ['water', 'lake', 'swimming', 'boating', 'fishing', 'flush', 'family'],
    bookingUrl: 'https://reservations.ebparks.org/',
    source: 'county',
  },
  {
    id: 'ebrp-anthony-chabot',
    name: 'Anthony Chabot Regional Park',
    county: 'Alameda County',
    location: 'Castro Valley, CA',
    latitude: 37.7232,
    longitude: -122.0789,
    description: 'East Bay hills camping with eucalyptus forest, equestrian trails, and a reservoir. One of the few campgrounds within 30 minutes of Oakland and San Francisco.',
    tags: ['shade', 'trees', 'forest', 'hills', 'flush', 'family'],
    bookingUrl: 'https://reservations.ebparks.org/',
    source: 'county',
  },
  {
    id: 'ebrp-sunol',
    name: 'Sunol Regional Wilderness',
    county: 'Alameda County',
    location: 'Sunol, CA',
    latitude: 37.5135,
    longitude: -121.8302,
    description: 'Creekside camping in oak-studded wilderness with excellent hiking and swimming holes. Feels remote but is just an hour from San Francisco.',
    tags: ['water', 'creek', 'shade', 'oak', 'hiking', 'swimming', 'quiet'],
    bookingUrl: 'https://reservations.ebparks.org/',
    source: 'county',
  },
  {
    id: 'ebrp-briones',
    name: 'Briones Regional Park',
    county: 'Contra Costa County',
    location: 'Martinez, CA',
    latitude: 37.9244,
    longitude: -122.1481,
    description: 'Hike-in camping in rolling oak grassland with panoramic views of the Bay Area. Ideal for backpackers and those seeking solitude close to civilization.',
    tags: ['oak', 'shade', 'hiking', 'quiet', 'hills'],
    bookingUrl: 'https://reservations.ebparks.org/',
    source: 'county',
  },

  // ── Santa Barbara County ──────────────────────────────────────────────────
  {
    id: 'sbco-jalama',
    name: 'Jalama Beach County Park',
    county: 'Santa Barbara County',
    location: 'Lompoc, CA',
    latitude: 34.5025,
    longitude: -120.5014,
    description: 'Dramatic ocean-bluff camping on a remote stretch of Santa Barbara coast. Wind, waves, whale watching, and legendary tacos at the camp store.',
    tags: ['ocean', 'beach', 'water', 'remote', 'family', 'flush'],
    bookingUrl: 'https://www.countyofsb.org/parks/jalama',
    source: 'county',
  },
  {
    id: 'sbco-cachuma',
    name: 'Cachuma Lake Recreation Area',
    county: 'Santa Barbara County',
    location: 'Santa Barbara, CA',
    latitude: 34.5805,
    longitude: -119.9823,
    description: 'Santa Barbara County\'s most popular campground — a reservoir surrounded by oak hills with boating, fishing, and bald eagles in winter. Full amenities.',
    tags: ['water', 'lake', 'fishing', 'boating', 'oak', 'shade', 'family', 'flush'],
    bookingUrl: 'https://www.countyofsb.org/parks/cachuma',
    source: 'county',
  },

  // ── San Luis Obispo County ────────────────────────────────────────────────
  {
    id: 'sloco-lopez',
    name: 'Lopez Lake Recreation Area',
    county: 'San Luis Obispo County',
    location: 'Arroyo Grande, CA',
    latitude: 35.1447,
    longitude: -120.5831,
    description: 'Warm reservoir camping in the oak hills of the Central Coast. Great swimming, kayaking, and fishing — a popular family destination from April through October.',
    tags: ['water', 'lake', 'swimming', 'fishing', 'boating', 'oak', 'family', 'flush', 'shade'],
    bookingUrl: 'https://www.sloparks.org/lopez-lake',
    source: 'county',
  },
  {
    id: 'sloco-nacimiento',
    name: 'Lake Nacimiento Resort',
    county: 'San Luis Obispo County',
    location: 'Paso Robles, CA',
    latitude: 35.7466,
    longitude: -121.0545,
    description: 'Popular warm-water reservoir surrounded by rolling hills. Boating, wakeboarding, and fishing — busy on summer weekends but stunning scenery.',
    tags: ['water', 'lake', 'swimming', 'boating', 'fishing', 'flush', 'hookup'],
    bookingUrl: 'https://www.nacimientoresort.com/',
    source: 'county',
  },

  // ── Ventura County ────────────────────────────────────────────────────────
  {
    id: 'vnco-lake-casitas',
    name: 'Lake Casitas Recreation Area',
    county: 'Ventura County',
    location: 'Ojai, CA',
    latitude: 34.3803,
    longitude: -119.3178,
    description: 'Premier bass fishing lake near Ojai with full hookups, boat rentals, and a water park in summer. No swimming in the reservoir but lots of family amenities.',
    tags: ['water', 'lake', 'fishing', 'boating', 'family', 'flush', 'hookup'],
    bookingUrl: 'https://casitaswater.com/recreation/camping/',
    source: 'county',
  },

  // ── Los Angeles County ────────────────────────────────────────────────────
  {
    id: 'laco-castaic',
    name: 'Castaic Lake Recreation Area',
    county: 'Los Angeles County',
    location: 'Castaic, CA',
    latitude: 34.5117,
    longitude: -118.6289,
    description: 'Large reservoir with sandy beaches, water sports, and camping just off the I-5 north of LA. Good family option when SoCal campgrounds are full.',
    tags: ['water', 'lake', 'swimming', 'boating', 'family', 'flush'],
    bookingUrl: 'https://parks.lacounty.gov/castaic-lake-recreation-area/',
    source: 'county',
  },
  {
    id: 'laco-bonelli',
    name: 'Frank G. Bonelli Regional Park',
    county: 'Los Angeles County',
    location: 'San Dimas, CA',
    latitude: 34.0842,
    longitude: -117.8161,
    description: 'Puddingstone Reservoir camping in the San Gabriel Valley foothills with water sports, fishing, and a full hook-up campground. Convenient to the LA Basin.',
    tags: ['water', 'lake', 'fishing', 'boating', 'family', 'flush', 'hookup'],
    bookingUrl: 'https://parks.lacounty.gov/frank-g-bonelli-regional-county-park/',
    source: 'county',
  },

  // ── Orange County ─────────────────────────────────────────────────────────
  {
    id: 'occo-caspers',
    name: 'Caspers Wilderness Park',
    county: 'Orange County',
    location: 'San Juan Capistrano, CA',
    latitude: 33.5678,
    longitude: -117.5592,
    description: 'Wild oak woodland camping in the Santa Ana Mountains, 20 miles from the coast. Mountain lion country — genuinely wild feel close to Orange County suburbs.',
    tags: ['shade', 'oak', 'trees', 'hiking', 'quiet', 'flush', 'mountain'],
    bookingUrl: 'https://ocparks.com/parks/caspers/',
    source: 'county',
  },

  // ── Monterey County ───────────────────────────────────────────────────────
  {
    id: 'mtco-lake-san-antonio',
    name: 'Lake San Antonio',
    county: 'Monterey County',
    location: 'Bradley, CA',
    latitude: 35.8547,
    longitude: -121.0172,
    description: 'Remote reservoir in the Paso Robles hills with eagle watching in winter and bass fishing year-round. Quiet, uncrowded, and a local favorite.',
    tags: ['water', 'lake', 'fishing', 'boating', 'quiet', 'flush', 'family'],
    bookingUrl: 'https://www.co.monterey.ca.us/government/departments-a-h/parks/lakes/lake-san-antonio',
    source: 'county',
  },

  // ── Marin / Sonoma ────────────────────────────────────────────────────────
  {
    id: 'mrco-china-camp',
    name: 'China Camp State Park (Walk-in)',
    county: 'Marin County',
    location: 'San Rafael, CA',
    latitude: 38.0025,
    longitude: -122.4789,
    description: 'Secluded walk-in tent camping on San Pablo Bay with stunning bay views, mountain biking trails, and a historic shrimping village. Minimal amenities — pit toilets only.',
    tags: ['water', 'bay', 'hiking', 'quiet', 'remote', 'views'],
    bookingUrl: 'https://www.reservecalifornia.com',
    source: 'county',
  },

  // ── Sacramento / Gold Country ─────────────────────────────────────────────
  {
    id: 'elco-lake-amador',
    name: 'Lake Amador Recreation Area',
    county: 'Amador County',
    location: 'Ione, CA',
    latitude: 38.3831,
    longitude: -120.9275,
    description: 'Bass fishing heaven in the Gold Country foothills. Full hookups, clean facilities, and uncrowded even on summer weekends.',
    tags: ['water', 'lake', 'fishing', 'boating', 'flush', 'hookup', 'family'],
    bookingUrl: 'https://www.lakeamador.com/',
    source: 'county',
  },
  {
    id: 'elco-rancho-seco',
    name: 'Rancho Seco Recreation Area',
    county: 'Sacramento County',
    location: 'Herald, CA',
    latitude: 38.3456,
    longitude: -121.1228,
    description: 'Quiet reservoir camping with fishing, swimming, and birding near Sacramento. Remarkably uncrowded — a locals\' secret.',
    tags: ['water', 'lake', 'swimming', 'fishing', 'quiet', 'flush', 'family'],
    bookingUrl: 'https://www.smud.org/en/about-smud/community-environment/rancho-seco',
    source: 'county',
  },
];

/**
 * Search county parks by name, location, county, or tag keyword.
 * Case-insensitive in-memory filter.
 */
function searchCountyParks(query) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/);

  return COUNTY_PARKS.filter(park => {
    const searchable = [
      park.name,
      park.county,
      park.location,
      park.description,
      ...(park.tags || []),
    ].join(' ').toLowerCase();

    // Match if ANY term hits (broader) — but weight full-phrase hits
    return terms.some(t => searchable.includes(t));
  });
}

/**
 * Find county parks within a geographic bounding box.
 */
function searchCountyParksByBounds(minLat, maxLat, minLng, maxLng) {
  return COUNTY_PARKS.filter(p =>
    p.latitude  >= minLat && p.latitude  <= maxLat &&
    p.longitude >= minLng && p.longitude <= maxLng
  );
}

module.exports = { searchCountyParks, searchCountyParksByBounds, COUNTY_PARKS };
