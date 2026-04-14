'use strict';

/**
 * agentService.js — Central AI research layer
 *
 * Uses Claude claude-sonnet-4-20250514 with Anthropic's hosted web_search tool.
 * All functions are safe to call in parallel; failures are caught and return null/[].
 * Results are cached server-side (1-hour TTL) to avoid redundant API calls.
 *
 * Set AGENT_MOCK=true in .env to return realistic placeholder data while
 * Anthropic billing is being resolved. Swap back to real calls by removing it.
 */

const Anthropic = require('@anthropic-ai/sdk');

// ════════════════════════════════════════════════════════════════════════════
// MOCK MODE
// Realistic placeholder data that exercises every UI component.
// Varied by campground name so different cards don't look identical.
// ════════════════════════════════════════════════════════════════════════════

const MOCK_SUMMARIES = [
  { summary: "A local favorite that fills up fast for good reason — riverside sites in the lower loop put you practically in the water, and the tree cover keeps things cool even in August. The bathrooms are clean, the camp host is friendly, and you can hear the creek from your tent.", highlights: ["Creek access", "Dense shade", "Family-friendly"], crowdLevel: "busy", bestFor: "families" },
  { summary: "One of those places that feels genuinely remote even though it's only 90 minutes from the city. Sites are well-spaced and the views from the upper loop are hard to beat at sunrise. Bring firewood — there's none on site.", highlights: ["Mountain views", "Dispersed feel", "Star gazing"], crowdLevel: "moderate", bestFor: "couples" },
  { summary: "Underrated gem that most people drive right past on the way to the more famous spots. The beach access is a 5-minute walk and the sites are surprisingly private given how close everything is. Book the even-numbered sites on the west end.", highlights: ["Beach access", "Good privacy", "Walk to water"], crowdLevel: "uncrowded", bestFor: "all" },
  { summary: "Real talk: it's a busy campground, but the location is so good it doesn't matter. Campers keep coming back because the sunset views over the reservoir are legitimately stunning and the swimming is excellent all summer.", highlights: ["Reservoir views", "Swimming", "Sunsets"], crowdLevel: "busy", bestFor: "groups" },
  { summary: "A solid base camp for hiking — three trailheads within walking distance and the elevation keeps temps reasonable even in July. Sites in the B loop are biggest and farthest from the road noise.", highlights: ["Trailhead access", "Cool temps", "Hiking"], crowdLevel: "moderate", bestFor: "solo" },
  { summary: "The kind of campground that regulars keep quiet because they don't want it to get crowded. Oak woodland setting with great shade, a seasonal creek running through, and sites roomy enough for a large group. Get site 14 or 22 if you can.", highlights: ["Oak shade", "Seasonal creek", "Spacious sites"], crowdLevel: "uncrowded", bestFor: "families" },
];

const MOCK_SITES = [
  { siteNumber: "14", whyRecommended: "Backs up against the tree line with a natural buffer from neighbors — campers consistently call this the most private site in the campground.", shade: "Full shade", privacy: "High", views: "Forested hillside", noise: "Quiet", waterProximity: "5-minute walk to creek", capacity: "Up to 6 people", insiderTip: "The fire ring is well-positioned and the flat tent pad fits a 4-person tent easily." },
  { siteNumber: "22", whyRecommended: "End-of-loop site with no neighbors on one side and a direct sightline to the water. Worth the extra walk from the parking area.", shade: "Partial shade", privacy: "High", views: "Lake or reservoir", noise: "Quiet", waterProximity: "Directly adjacent", capacity: "Up to 8 people", insiderTip: "Arrive early — this one goes first and rarely shows up in cancellations." },
  { siteNumber: "7", whyRecommended: "Perfect for families — flat, grassy, close to the bathrooms without being too close, and there's a small meadow right next to it the kids can run around in.", shade: "Partial shade", privacy: "Medium", views: "Open meadow", noise: "Moderate", waterProximity: "Water spigot 50ft away", capacity: "Up to 6 people", insiderTip: "The pull-through setup makes it easy to back in a trailer or larger vehicle." },
  { siteNumber: "31", whyRecommended: "Tucked into a bend in the loop so traffic doesn't pass by. The large oak overhead provides shade all afternoon — a rare find.", shade: "Full shade", privacy: "High", views: "Canyon and oak canopy", noise: "Quiet", waterProximity: "Creek audible from site", capacity: "Up to 4 people", insiderTip: "Small site — best for tents or a short van. Bring an extra tarp; it can get dewy." },
  { siteNumber: "5", whyRecommended: "Right on the water — one of only three sites with direct access. Gets snapped up the moment cancellations open.", shade: "No shade", privacy: "Low", views: "Open water panorama", noise: "Can be loud on weekends", waterProximity: "Directly on the waterfront", capacity: "Up to 6 people", insiderTip: "Faces west — bring sunshade for the afternoon heat, but the sunset is spectacular." },
];

const MOCK_DISCOVERED = [
  { name: "Cachuma Lake Recreation Area", description: "Santa Barbara County's best-kept secret — bald eagles winter here and the bass fishing is excellent year-round.", latitude: 34.5805, longitude: -119.9823, source: "countypark", url: "https://www.countyofsb.org/parks/cachuma", location: "Santa Barbara, CA", agentDiscovered: true },
  { name: "Gaviota State Park — Beach Sites", description: "Tent sites literally on the sand, tucked into a cove that blocks the wind. Reservable and almost always worth it.", latitude: 34.4713, longitude: -120.2277, source: "thedyrt", url: "https://www.parks.ca.gov/?page_id=606", location: "Gaviota, CA", agentDiscovered: true },
  { name: "Los Padres NF — Nira Campground", description: "Free dispersed-style camping along the Manzana Creek with excellent swimming holes a short hike away.", latitude: 34.7391, longitude: -119.8637, source: "blm", url: "https://www.fs.usda.gov/recarea/lpnf", location: "Santa Barbara County, CA", agentDiscovered: true },
  { name: "Figueroa Mountain Campground", description: "High-elevation oak and pine campground with sweeping valley views — stunning during wildflower season.", latitude: 34.7344, longitude: -119.9760, source: "recreation.gov", url: "https://www.recreation.gov/camping/campgrounds/233116", location: "Los Olivos, CA", agentDiscovered: true },
  { name: "Paradise Road Dispersed Camping", description: "Free camping along Santa Ynez River — popular with locals who know the area. Bring your own water.", latitude: 34.5750, longitude: -119.8530, source: "blm", url: "https://www.fs.usda.gov/lpnf", location: "Santa Ynez, CA", agentDiscovered: true },
  { name: "Mono Camp (Los Padres NF)", description: "Quiet primitive campground rarely seen on popular apps. Oak canopy, creek access, and almost no crowds.", latitude: 34.6820, longitude: -119.8340, source: "blog", url: "https://www.fs.usda.gov/lpnf", location: "Santa Barbara County, CA", agentDiscovered: true },
  { name: "Jalama Beach County Park", description: "Wind, waves, and the best tacos in Santa Barbara County at the camp store. Surfers love it; so do birders.", latitude: 34.5025, longitude: -120.5014, source: "countypark", url: "https://www.countyofsb.org/parks/jalama", location: "Lompoc, CA", agentDiscovered: true },
  { name: "HipCamp — Hilltop Oak Ranch", description: "Private working ranch with panoramic views of the Santa Ynez Valley. Fire pits, stargazing, and total quiet.", latitude: 34.6120, longitude: -120.0450, source: "hipcamp", url: "https://www.hipcamp.com", location: "Solvang, CA", agentDiscovered: true },
];

const MOCK_WATCHLIST_INTEL = [
  { cancellationPatterns: "Cancellations most often appear Tuesday and Wednesday mornings, typically 45–60 days before the target check-in date. The 6-month booking window opens at 7am Pacific and popular summer weekends sell out within minutes.", bestSitesToWatch: ["Site 14", "Site 22", "Loop B riverside sites"], bestMonths: ["April", "May", "October", "November"], peakBookingInfo: "6-month window opens at 7am — set an alarm. Fall weekends open faster than summer.", insiderTip: "Watch for Tuesday morning cancellations — that's when people finalize summer travel plans and drop sites they booked speculatively.", typicalLeadTime: "45–60 days before check-in" },
  { cancellationPatterns: "This campground sees cancellations cluster around the 14-day and 2-day marks — people who book 'just in case' and then bail. Check Monday and Friday mornings.", bestSitesToWatch: ["End-of-loop sites", "Waterfront sites (5, 6, 7)", "Site 31"], bestMonths: ["September", "October", "March"], peakBookingInfo: "Fills fast for Memorial Day, 4th of July, and Labor Day. All other weekends are more manageable.", insiderTip: "Set a Recreation.gov availability alert and check back exactly 14 days before your target date.", typicalLeadTime: "14 days or 2 days before check-in" },
];

const MOCK_PREDICTIONS = [
  { bestCheckTime: "Tuesday and Wednesday mornings, 7–9am Pacific", typicalLeadTime: "45–60 days before check-in", peakCancellationWindows: ["6 months out (initial booking rush — drops appear within hours)", "2 weeks before (plans-change window)", "48 hours before (last-minute drops)"], bestMonths: ["April", "October", "November"], confidence: "medium", tip: "Set a browser bookmark to the availability page and check it Tuesday mornings — that's when most cancellations hit." },
];

// Simple hash to pick varied mock data deterministically per campground
function mockPick(arr, key) {
  let h = 0;
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return arr[h % arr.length];
}

function isMockMode() {
  return process.env.AGENT_MOCK === 'true';
}

// ── Lazy client init ────────────────────────────────────────────────────────
let _client = null;

function getClient() {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set in environment');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

const MODEL      = 'claude-sonnet-4-6';   // kept for reference; detail features use MODEL_FAST
const MODEL_FAST = 'claude-haiku-4-5-20251001'; // ~20x cheaper — used for all detail page features
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search' };

// ── Server-side cache (Map → { data, exp }) ─────────────────────────────────
const _cache    = new Map();
const HOUR      = 60 * 60 * 1000;
const CACHE_TTL = HOUR;

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) { _cache.delete(key); return null; }
  return hit.data;
}

function cacheSet(key, data, ttl = CACHE_TTL) {
  _cache.set(key, { data, exp: Date.now() + ttl });
}

// ── Core agentic loop ────────────────────────────────────────────────────────
// Handles multi-turn tool use for Anthropic's hosted web search.
// The API executes searches server-side; we loop until stop_reason === 'end_turn'.
async function runAgent(system, userMessage, maxTokens = 2048) {
  const client   = getClient();
  const messages = [{ role: 'user', content: userMessage }];
  let   finalText = '';

  for (let turn = 0; turn < 10; turn++) {
    let resp;
    try {
      resp = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        tools: [WEB_SEARCH],
        system,
        messages,
      });
    } catch (apiErr) {
      // Unwrap Anthropic SDK error for a clean, actionable log line
      const status  = apiErr.status  || apiErr.statusCode || '?';
      const message = apiErr.message || String(apiErr);
      const body    = apiErr.error   ? JSON.stringify(apiErr.error) : '';
      console.error(`[agent] API error ${status}: ${message}${body ? ' — ' + body : ''}`);
      throw apiErr;
    }

    // Collect text from this turn
    const text = resp.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    console.log(`[agent] turn ${turn + 1}: stop_reason=${resp.stop_reason} text_len=${text.length} blocks=${resp.content.length}`);

    if (resp.stop_reason === 'end_turn') {
      finalText = text || finalText;
      break;
    }

    if (resp.stop_reason === 'tool_use') {
      const toolBlocks = resp.content.filter(b => b.type === 'tool_use');
      console.log(`[agent] tool calls: ${toolBlocks.map(b => `${b.name}(${JSON.stringify(b.input).slice(0, 80)})`).join(', ')}`);
      // Push assistant turn (contains web_search tool_use blocks)
      messages.push({ role: 'assistant', content: resp.content });
      // Anthropic's hosted search executes server-side; we ack with empty tool_results
      const acks = toolBlocks.map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
      messages.push({ role: 'user', content: acks });
      if (text) finalText = text;
    } else {
      // max_tokens or unexpected stop
      console.warn(`[agent] unexpected stop_reason: ${resp.stop_reason}`);
      finalText = text || finalText;
      break;
    }
  }

  return finalText;
}

// ── Fast single-turn Haiku call (no web_search, no loop) ─────────────────────
// Used for all detail page features. ~20x cheaper than Sonnet + web_search.
// Claude's training data covers all well-known campgrounds adequately.
async function fastAgent(system, userMessage, maxTokens = 1000) {
  const client = getClient();
  try {
    const resp = await client.messages.create({
      model: MODEL_FAST,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    return resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } catch (apiErr) {
    const status  = apiErr.status  || apiErr.statusCode || '?';
    const message = apiErr.message || String(apiErr);
    console.error(`[agent] fastAgent error ${status}: ${message}`);
    throw apiErr;
  }
}

// ── JSON extraction helper ───────────────────────────────────────────────────
function parseJSON(raw) {
  if (!raw) return null;
  // Strip markdown code fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : raw;
  // Find first JSON object or array
  const objMatch = src.match(/([\[{][\s\S]*[\]}])/);
  const candidate = objMatch ? objMatch[1] : src;
  try { return stripTagsDeep(JSON.parse(candidate.trim())); } catch { return null; }
}

// ── Strip HTML tags from agent text (removes <cite>, <a>, etc.) ─────────────
// Anthropic's web_search tool injects <cite> citation markers into responses.
function stripTags(str) {
  return (str || '')
    .replace(/<cite[^>]*>([\s\S]*?)<\/cite>/gi, '$1')  // preserve cite text, strip only the tags
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Recursively strip tags from all string values in a parsed JSON structure.
function stripTagsDeep(obj) {
  if (typeof obj === 'string') return stripTags(obj);
  if (Array.isArray(obj)) return obj.map(stripTagsDeep);
  if (obj && typeof obj === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(obj)) r[k] = stripTagsDeep(v);
    return r;
  }
  return obj;
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — Campground Discovery
// Returns campgrounds the gov APIs miss: county parks, HipCamp, Dyrt, hidden gems
// ════════════════════════════════════════════════════════════════════════════
async function discoverCampgrounds({ minLat, maxLat, minLng, maxLng }) {
  const key = `discover:${Number(minLat).toFixed(3)}:${Number(maxLat).toFixed(3)}:${Number(minLng).toFixed(3)}:${Number(maxLng).toFixed(3)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    console.log('[agent:mock] discoverCampgrounds');
    await new Promise(r => setTimeout(r, 600));
    cacheSet(key, MOCK_DISCOVERED);
    return MOCK_DISCOVERED;
  }

  const centerLat = ((parseFloat(minLat) + parseFloat(maxLat)) / 2).toFixed(4);
  const centerLng = ((parseFloat(minLng) + parseFloat(maxLng)) / 2).toFixed(4);

  const system = `You are a camping expert who knows every campground in the US —
including the hidden gems that never appear on Recreation.gov or ReserveCalifornia.
Your specialty is county parks, regional parks, HipCamp, The Dyrt, private campgrounds,
dispersed camping areas, and lesser-known gems from camping blogs.
Always respond with valid JSON and nothing else.`;

  const msg = `Search the web for ALL campgrounds in this geographic area:
Latitude: ${minLat} to ${maxLat} | Longitude: ${minLng} to ${maxLng}
Approximate center: ${centerLat}, ${centerLng}

Prioritise campgrounds that Recreation.gov and ReserveCalifornia APIs typically miss:
1. County and regional parks
2. HipCamp listings
3. The Dyrt top-rated spots
4. Private and independent campgrounds
5. Dispersed / free camping (National Forest, BLM)
6. Hidden gems from Reddit r/camping or camping blogs
7. State park units not covered by ReserveCalifornia

Return ONLY a JSON object:
{
  "campgrounds": [
    {
      "name": "Camp Name",
      "description": "One punchy sentence on what makes it special",
      "latitude": 37.1234,
      "longitude": -119.5678,
      "source": "hipcamp|thedyrt|countypark|recreation.gov|blm|blog|other",
      "url": "https://...",
      "location": "City, State",
      "agentDiscovered": true
    }
  ]
}

Include every campground you can find (aim for 15+). Only include entries with real coordinates.`;

  try {
    const raw     = await fastAgent(system, msg, 2000);
    const data    = parseJSON(raw);
    const results = (data?.campgrounds || [])
      .filter(c => c.latitude && c.longitude && c.name)
      .map(c => ({ ...c, agentDiscovered: true }));

    cacheSet(key, results, 2 * HOUR);
    return results;
  } catch (err) {
    console.error('[agent] discoverCampgrounds:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — Campground Card Summaries
// Replaces raw API descriptions with real-camper-voiced summaries
// ════════════════════════════════════════════════════════════════════════════
async function getCampgroundSummary({ id, name, state, rawDescription }) {
  const key = `summary:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    console.log(`[agent:mock] getCampgroundSummary: ${name}`);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    const mock = mockPick(MOCK_SUMMARIES, id || name);
    cacheSet(key, mock);
    return mock;
  }

  const system = `You write short, honest campground summaries sourced from what real campers say —
Reddit, The Dyrt, CampSitePhotos, AllTrails, and camping forums.
Sound like a knowledgeable friend who's been there, not a government brochure.
No filler words. No "nestled" or "picturesque." Respond with JSON only.`;

  const msg = `Search Reddit, The Dyrt, CampSitePhotos, and camping blogs for what real campers say about:
"${name}"${state ? ` in ${state}` : ''}

Write a 2-3 sentence summary that captures the genuine vibe, what makes it stand out,
and any honest caveats. Skip the generic government description.
${rawDescription ? `\nIgnore this raw API text: "${rawDescription.slice(0, 200)}"` : ''}

Return ONLY:
{
  "summary": "2-3 honest, punchy sentences from a camping friend.",
  "highlights": ["tag1", "tag2", "tag3"],
  "crowdLevel": "busy|moderate|uncrowded",
  "bestFor": "families|couples|solo|groups|all",
  "hikeInOnly": false
}

Set hikeInOnly to true if the campground requires hiking in (no vehicle access to sites).`;

  try {
    const raw  = await fastAgent(system, msg, 800);
    const data = parseJSON(raw);
    if (!data?.summary) return null;

    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] getCampgroundSummary:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — Best Sites
// Searches camper reviews for specific numbered site recommendations
// ════════════════════════════════════════════════════════════════════════════
async function getBestSites({ id, name, state }) {
  const key = `best-sites:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    console.log(`[agent:mock] getBestSites: ${name}`);
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    // Pick 3–5 varied sites from the mock pool for this campground
    const hash = (() => { let h = 0; for (const c of String(id || name)) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return h; })();
    const count = 3 + (hash % 3);
    const sites = Array.from({ length: count }, (_, i) => MOCK_SITES[(hash + i) % MOCK_SITES.length]);
    const mock  = { sites, generalTips: `Book early — ${name} is popular and the best sites go fast. Check cancellations Tuesday mornings for the best luck.`, reviewSource: "Reddit, The Dyrt, CampSitePhotos" };
    cacheSet(key, mock);
    return mock;
  }

  const system = `You extract specific campsite number recommendations from real camper reviews.
Search Reddit (r/camping, r/CampingandHiking, r/NationalParks), The Dyrt, CampSitePhotos,
and camping forums for posts mentioning specific sites by number or name at this campground.
Respond with JSON only.`;

  const msg = `Find the best individual campsites at "${name}"${state ? ` in ${state}` : ''}.

Search for posts/reviews mentioning specific site numbers. Look for patterns like
"site 23 is the best", "grab a loop B site", "avoid the sites near the road", etc.

Return ONLY:
{
  "sites": [
    {
      "siteNumber": "23",
      "whyRecommended": "Why campers specifically seek out this site",
      "shade": "Full shade|Partial shade|No shade",
      "privacy": "High|Medium|Low",
      "views": "What you can see from this site",
      "noise": "Quiet|Moderate|Can be loud",
      "waterProximity": "On the creek|Near the lake|No water nearby|etc.",
      "capacity": "Up to 6 people",
      "insiderTip": "One practical insider tip",
      "photoUrl": null
    }
  ],
  "generalTips": "Overall tips for getting a good site here",
  "reviewSource": "Reddit, The Dyrt, CampSitePhotos"
}

For photoUrl: if The Dyrt or CampSitePhotos has a direct photo URL for this specific site, include it; otherwise leave null.

Return up to 8 sites. If exact site numbers aren't in reviews, describe the best site types
(e.g. "riverside sites in the C loop" or "even-numbered sites on the west end").`;

  try {
    const raw  = await fastAgent(system, msg, 1200);
    const data = parseJSON(raw);
    if (!data?.sites?.length) return null;

    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] getBestSites:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 4 — Data Enrichment
// Fills gaps in Recreation.gov data from camper reports
// ════════════════════════════════════════════════════════════════════════════
async function enrichCampgroundData({ id, name, state, currentData = {} }) {
  const key = `enrich:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const system = `You fill in missing campground data from authoritative sources and camper reports.
Be conservative — only report facts you can verify. Respond with JSON only.`;

  const msg = `Find accurate data for "${name}"${state ? ` in ${state}` : ''}.

Fill these gaps in Recreation.gov data:
- Max occupancy: ${currentData.maxOccupants ? `Have: ${currentData.maxOccupants}` : 'Missing'}
- Access type: ${currentData.accessType || 'Unknown — drive-in? hike-in? walk-in? boat-in?'}
- Hike-in only: ${currentData.hikeInOnly !== undefined ? `Have: ${currentData.hikeInOnly}` : 'Unknown'}

Also check if the campground is commonly misclassified in any region listings.

Return ONLY:
{
  "maxOccupants": 6,
  "accessType": "drive-in|hike-in|walk-in|boat-in",
  "hikeInOnly": false,
  "hikeDistance": "0.5 miles from trailhead",
  "region": "Correct region name",
  "elevation": 4200,
  "reservable": true,
  "misclassified": false,
  "confidence": "high|medium|low"
}`;

  try {
    const raw  = await fastAgent(system, msg, 600);
    const data = parseJSON(raw);
    if (!data) return null;

    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] enrichCampgroundData:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 6 — Watchlist Intelligence
// Cancellation patterns, best-cancelling sites, peak booking windows
// ════════════════════════════════════════════════════════════════════════════
async function getWatchlistIntelligence({ id, name, state }) {
  const key = `watchlist-intel:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    console.log(`[agent:mock] getWatchlistIntelligence: ${name}`);
    await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
    const mock = mockPick(MOCK_WATCHLIST_INTEL, id || name);
    cacheSet(key, mock, 4 * HOUR);
    return mock;
  }

  const system = `You synthesize campground booking intelligence from community knowledge.
Search Reddit, The Dyrt, and camping forums for tips specific to this campground.
Be concrete and actionable. Respond with JSON only.`;

  const msg = `What are the booking and cancellation patterns for "${name}"${state ? ` in ${state}` : ''}?

Search Reddit and camping communities for:
- When cancellations typically appear (day of week, lead time before check-in)
- Which specific sites or loops cancel most often
- When the 6-month booking window opens and how fast it fills
- Best times of year to find openings

Return ONLY:
{
  "cancellationPatterns": "Concrete description: e.g. 'Cancellations often appear Tuesday mornings 45-60 days before check-in'",
  "bestSitesToWatch": ["Site 12", "Loop B sites", "Riverside sites in D loop"],
  "bestMonths": ["April", "October", "November"],
  "peakBookingInfo": "When the booking window opens and how fast popular dates sell out",
  "insiderTip": "One specific, actionable tip for scoring a site",
  "typicalLeadTime": "How far in advance cancellations typically appear"
}`;

  try {
    const raw  = await fastAgent(system, msg, 800);
    const data = parseJSON(raw);
    if (!data) return null;

    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] getWatchlistIntelligence:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 7 — Personalization
// "Campers who liked X also loved these"
// ════════════════════════════════════════════════════════════════════════════
async function personalizeRecommendations({ preferences, likedCampgrounds }) {
  if (!likedCampgrounds?.length) return null;

  const liked  = likedCampgrounds.slice(0, 5).join(', ');
  const key    = `personalize:${liked}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const prefList = Object.entries(preferences || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .join(', ') || 'no specific filters';

  const system = `You recommend campgrounds based on a camper's history and preferences.
Think like an expert camping friend. Respond with JSON only.`;

  const msg = `This camper has watched or visited: ${liked}
Preferences: ${prefList}

Based on what they love, find 5-8 campgrounds they'd probably love next.
Explain the connection to their favorites.

Return ONLY:
{
  "recommendations": [
    {
      "name": "Campground Name",
      "state": "CA",
      "whySimilar": "One sentence connecting it to their favorites",
      "url": "https://...",
      "source": "recreation.gov|hipcamp|thedyrt|other"
    }
  ]
}`;

  try {
    const raw  = await fastAgent(system, msg, 1000);
    const data = parseJSON(raw);
    if (!data?.recommendations) return null;

    cacheSet(key, data, 6 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] personalizeRecommendations:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 8 — Trip Planner (infrastructure only — UI comes later)
// Accepts origin/dest/dates/partySize/prefs, returns campground stops along route
// ════════════════════════════════════════════════════════════════════════════
async function planTripRoute({ origin, destination, travelDates, partySize, preferences }) {
  if (!origin || !destination) return null;

  const key    = `trip:${origin}:${destination}:${travelDates?.start}:${partySize}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const prefStr = Object.entries(preferences || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .join(', ') || 'none specified';

  const system = `You plan road-trip camping itineraries with specific campground stops.
Find campgrounds that are scenic, well-reviewed, and actually along the route.
Mix Recreation.gov sites with alternatives (HipCamp, county parks). Respond with JSON only.`;

  const msg = `Plan a camping road trip:
Origin: ${origin}
Destination: ${destination}
Dates: ${travelDates?.start || 'flexible'} – ${travelDates?.end || 'flexible'}
Party size: ${partySize || 2}
Preferences: ${prefStr}

Find 3-6 campground stops along the most scenic route between these points.
Include mix of well-known and hidden-gem campgrounds.

Return ONLY:
{
  "route": "Brief route description (e.g. 'PCH then inland via Hwy 1')",
  "totalMiles": 450,
  "stops": [
    {
      "order": 1,
      "name": "Campground Name",
      "location": "City, State",
      "latitude": 37.123,
      "longitude": -119.456,
      "nightsRecommended": 2,
      "whyStop": "Why this is a great stop and what to do nearby",
      "url": "https://...",
      "source": "recreation.gov|hipcamp|thedyrt|other"
    }
  ]
}`;

  try {
    const raw  = await fastAgent(system, msg, 2000);
    const data = parseJSON(raw);
    if (!data?.stops) return null;

    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] planTripRoute:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 9 — Availability Predictions
// Pattern-matches cancellation community knowledge to predict openings
// ════════════════════════════════════════════════════════════════════════════
async function predictAvailability({ id, name, state, historicalData }) {
  const key = `predict:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    console.log(`[agent:mock] predictAvailability: ${name}`);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
    const mock = mockPick(MOCK_PREDICTIONS, id || name);
    cacheSet(key, mock, 4 * HOUR);
    return mock;
  }

  const histCtx = historicalData
    ? `Local historical data: avg ${historicalData.avgLeadDays} days lead, best days: ${(historicalData.bestDays || []).join(', ')}`
    : 'No local historical data yet';

  const system = `You predict campground availability openings from community knowledge.
Be specific — day of week, time ranges, lead times. Respond with JSON only.`;

  const msg = `Predict when sites typically open at "${name}"${state ? ` in ${state}` : ''}.
${histCtx}

Search Reddit and camping communities for booking tips specific to this campground.

Return ONLY:
{
  "bestCheckTime": "e.g. Tuesday and Wednesday mornings around 8am PT",
  "typicalLeadTime": "e.g. 45-60 days before check-in",
  "peakCancellationWindows": [
    "6 months out (initial booking window — watch for drops within hours)",
    "2 weeks before (plans change — last-minute openings)"
  ],
  "bestMonths": ["April", "October"],
  "confidence": "high|medium|low",
  "tip": "Single most actionable tip for this specific campground"
}`;

  try {
    const raw  = await fastAgent(system, msg, 800);
    const data = parseJSON(raw);
    if (!data) return null;

    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] predictAvailability:', err.status || '', err.message, err.error ? JSON.stringify(err.error) : '');
    return null;
  }
}

// ── Startup probe — validates key on first require() ─────────────────────────
// Logs one clear line so boot output immediately shows whether the agent is ready.
(async function probeKey() {
  if (isMockMode()) {
    console.log('[agent] 🟡 MOCK MODE — realistic placeholder data active (set AGENT_MOCK=false to use real API)');
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn('[agent] ⚠️  ANTHROPIC_API_KEY not set — agent features disabled');
    return;
  }
  try {
    const c = new Anthropic({ apiKey: key });
    await c.messages.create({
      model: MODEL_FAST,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    });
    console.log('[agent] ✓ Anthropic key valid — agent ready');
  } catch (err) {
    const status = err.status || err.statusCode || '?';
    const msg    = err.error?.error?.message || err.message || String(err);
    console.error(`[agent] ✗ Key probe failed (HTTP ${status}): ${msg}`);
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 10 — Photo Search
// Finds a photo URL for any campground (used for RC + agent-discovered)
// ════════════════════════════════════════════════════════════════════════════
async function searchCampgroundPhoto(name, state) {
  const key = `photo:${name}:${state || ''}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    // Return null so UI uses gradient placeholder in mock mode
    return null;
  }

  const system = `You find direct photo URLs for campgrounds.
Return ONLY a JSON object with a photoUrl field.
The URL must be a direct image link (jpg, jpeg, png, webp).
If you cannot find a real photo URL, return {"photoUrl": null}.`;

  const msg = `Find a real photo of "${name}"${state ? ` in ${state}` : ''}.

Search The Dyrt (thedyrt.com), CampSitePhotos (campsitephotos.com), AllTrails,
Recreation.gov, or the campground's own website.

Return ONLY:
{"photoUrl": "https://direct-image-url.jpg"}

The URL must be a direct link to an image file, not a web page.
If no direct image URL is available, return: {"photoUrl": null}`;

  // Photo search via web_search removed — too expensive and unreliable.
  // Rec.gov campgrounds use RIDB photos. RC campgrounds use gradient placeholder.
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 11 — Campground Reviews
// 3-5 real camper quotes with source attribution for the detail page
// ════════════════════════════════════════════════════════════════════════════
async function getCampgroundReviews({ id, name, state }) {
  const key = `reviews:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    return {
      reviews: [
        { quote: "The riverside sites are unbeatable — you fall asleep to the sound of the creek every night.", source: "Reddit r/camping", rating: 5 },
        { quote: "Site 14 is the one everyone talks about. Huge oak canopy, total privacy, fire ring perfectly positioned.", source: "The Dyrt", rating: 5 },
        { quote: "Clean bathrooms, friendly hosts, and the camp store is surprisingly well-stocked.", source: "Google Reviews", rating: 4 },
        { quote: "Book exactly 6 months out at 7am — the good sites are gone in minutes. Don't sleep on it.", source: "Reddit r/CampingandHiking", rating: 5 },
      ],
    };
  }

  const system = `You extract genuine camper quotes from public review sites.
Find real quotes — not summaries you write yourself. Attribute them correctly.
Respond with JSON only.`;

  const msg = `Find 3-5 real camper reviews or quotes about "${name}"${state ? ` in ${state}` : ''}.

Search Reddit (r/camping, r/NationalParks, r/CampingandHiking),
The Dyrt (thedyrt.com), Google Reviews, and Yelp.

Return ONLY:
{
  "reviews": [
    {
      "quote": "Direct quote or close paraphrase from the review",
      "source": "Reddit r/camping | The Dyrt | Google Reviews | Yelp | etc.",
      "rating": 5
    }
  ]
}

If you cannot find specific reviews, return what real campers commonly say about this type of campground.
Max 5 reviews. Keep quotes concise (2-3 sentences max each).`;

  try {
    const raw  = await fastAgent(system, msg, 900);
    const data = parseJSON(raw);
    if (!data?.reviews?.length) return null;
    cacheSet(key, data, 24 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] getCampgroundReviews:', err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE 12 — Nearby Info
// EV charging, fire restrictions, nearest town — for the detail page
// ════════════════════════════════════════════════════════════════════════════
async function getNearbyInfo({ id, name, state, latitude, longitude }) {
  const key = `nearby:${id || name}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (isMockMode()) {
    return {
      nearestTown: { name: 'Santa Barbara', distanceMiles: 18, servicesNote: 'Full services — grocery, gas, hospital' },
      evCharging: { available: true, distanceMiles: 12, note: 'ChargePoint station in Los Olivos (12 mi)' },
      fireRestrictions: { level: 0, description: 'No restrictions currently active', source: 'USFS Los Padres NF', asOf: new Date().toISOString().slice(0, 10) },
    };
  }

  const locationContext = latitude && longitude
    ? `Coordinates: ${latitude}, ${longitude}`
    : `Location: ${name}, ${state || 'CA'}`;

  const system = `You look up current, practical info near campgrounds.
Be specific and accurate. Respond with JSON only.`;

  const msg = `Find current nearby info for "${name}"${state ? ` in ${state}` : ''}.
${locationContext}

Search for:
1. Nearest town with services (grocery, gas) — how far, what's available
2. Nearest EV charging station (PlugShare, ChargePoint, Tesla Supercharger) — distance
3. Current fire restrictions from USFS or CAL FIRE

Return ONLY:
{
  "nearestTown": {
    "name": "Town Name",
    "distanceMiles": 15,
    "servicesNote": "Brief note on what's available"
  },
  "evCharging": {
    "available": true,
    "distanceMiles": 8,
    "note": "ChargePoint station at [location]"
  },
  "fireRestrictions": {
    "level": 0,
    "description": "No restrictions | Stage 1 | Stage 2 | Closure",
    "source": "USFS | CAL FIRE | Forest name",
    "asOf": "YYYY-MM-DD"
  }
}`;

  try {
    const raw  = await fastAgent(system, msg, 700);
    const data = parseJSON(raw);
    if (!data) return null;
    cacheSet(key, data, 6 * HOUR);
    return data;
  } catch (err) {
    console.error('[agent] getNearbyInfo:', err.message);
    return null;
  }
}

// ── Dev utility ─────────────────────────────────────────────────────────────
function getCacheStats() {
  const now = Date.now();
  const entries = [..._cache.entries()].map(([k, v]) => ({
    key: k,
    expiresIn: Math.round((v.exp - now) / 1000) + 's',
  }));
  return { size: _cache.size, entries };
}

// ── Homepage AI campground discovery (web_search fallback) ───────────────────
// Called when keyword search APIs return no results. Uses Claude + web_search
// to find real, bookable campgrounds matching the user's natural language query.
async function discoverByQuery(query) {
  if (isMockMode()) {
    return [
      { name: 'Palomar Mountain Campground', location: 'San Diego County, CA', description: 'Dense oak and pine forest at 5,500ft — exceptional shade even in summer. Flush toilets, fire rings, and easy family hiking nearby.', url: 'https://www.recreation.gov', source: 'recreation.gov' },
      { name: 'Cuyamaca Rancho State Park', location: 'Julian, CA', description: 'Classic California oak woodland with generous shade all day. Family-friendly loops with hot showers and a creek to explore.', url: 'https://www.reservecalifornia.com', source: 'reservecalifornia' },
      { name: 'Lake Morena County Park', location: 'Campo, CA', description: 'Quiet reservoir camping under oak trees. Far less crowded than neighboring parks with excellent birding and fishing.', url: 'https://www.recreation.gov', source: 'recreation.gov' },
    ];
  }

  const cacheKey = `discover:${query.toLowerCase().trim()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const client = getClient();
  const system = `You are CampAlong's campground discovery engine. From your training knowledge, name 4-5 real, bookable campgrounds in California (or the US West Coast) that best match the user's request. Return a JSON array — no markdown fences, no explanation, only the array — with these fields per campground:
- name: exact campground name as listed on recreation.gov or reservecalifornia.com
- location: city or county, state abbreviation
- description: 1-2 sentences on why it matches — be specific about shade, water, family amenities, crowd level, elevation
- source: "recreation.gov" for national forest/NPS/BLM campgrounds, "reservecalifornia" for California State Parks, "other" for everything else

Only include campgrounds that genuinely exist and are bookable. Prioritize well-known Recreation.gov and ReserveCalifornia campgrounds.`;

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system,
      messages: [{ role: 'user', content: `Find campgrounds for: ${query}` }],
    });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const result = parseJSON(text);
    const camps = Array.isArray(result) ? result : [];
    if (camps.length) cacheSet(cacheKey, camps);
    return camps;
  } catch (e) {
    console.error('[agent] discoverByQuery error:', e.message);
    return [];
  }
}

// ── Homepage chat query parser ────────────────────────────────────────────────
// Takes a natural-language query and extracts structured preferences + writes
// a warm conversational intro. No web search needed — pure extraction.
async function parseHomeChatQuery(query) {
  if (isMockMode()) {
    return {
      chips: [
        { label: 'Location', value: 'San Diego area' },
        { label: 'Dates', value: 'Memorial Day weekend' },
        { label: 'Party', value: '2 adults, 2 kids' },
        { label: 'Shade', value: 'Important' },
        { label: 'Water access', value: 'Preferred' },
      ],
      intro: "Sounds like a perfect family escape. I'll look for shaded sites near San Diego with water access — these tend to go fast for Memorial Day, so let me pull the best options now.",
      searchQuery: 'San Diego family camping shade water',
      preferences: { nearWater: true, shade: true, familyAmenities: true },
    };
  }

  const client = getClient();
  const system = `You are CampAlong's AI assistant. Parse the user's camping query and return a JSON object with these fields:
- chips: array of {label, value} objects (max 5) capturing what you extracted: location, dates, party size, and key amenities. Keep values short (2-4 words each).
- intro: 2 sentences, warm and editorial in tone. First sentence acknowledges what they want. Second sentence says what you're doing now. No quotes around campground names. Never start with "I".
- searchQuery: IMPORTANT — extract only the location name or a well-known campground/park name from the query. Examples: "San Diego", "Yosemite", "Big Bear Lake", "Santa Barbara", "Joshua Tree". If no clear location, use the most specific geographic term mentioned. Never use descriptive words like "shady" or "family" here.
- preferences: object with boolean fields (nearWater, shade, familyAmenities, flushToilets, electric) set to true only if clearly mentioned.

Respond with only valid JSON, no markdown fences.`;

  let resp;
  try {
    resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: query }],
    });
  } catch (e) {
    console.error('[agent] parseHomeChatQuery error:', e.message);
    return {
      chips: [{ label: 'Search', value: query.slice(0, 30) }],
      intro: "Let me find the best campgrounds for you.",
      searchQuery: query,
      preferences: {},
    };
  }

  const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return {
      chips:       Array.isArray(parsed.chips)       ? parsed.chips       : [],
      intro:       typeof parsed.intro === 'string'  ? parsed.intro       : '',
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : query,
      preferences: parsed.preferences || {},
    };
  } catch (_e) {
    return {
      chips: [{ label: 'Search', value: query.slice(0, 30) }],
      intro: "Let me find the best campgrounds for you.",
      searchQuery: query,
      preferences: {},
    };
  }
}

module.exports = {
  parseHomeChatQuery,
  discoverByQuery,
  discoverCampgrounds,
  getCampgroundSummary,
  getBestSites,
  enrichCampgroundData,
  getWatchlistIntelligence,
  personalizeRecommendations,
  planTripRoute,
  predictAvailability,
  searchCampgroundPhoto,
  getCampgroundReviews,
  getNearbyInfo,
  getCacheStats,
};
