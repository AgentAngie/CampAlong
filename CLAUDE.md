# CampAlong — Project Guide

## Homepage Chat Vision
User types query → AI extracts preferences → chips animate in below chat box → preferences save silently to Preferences tab → Perplexity-style conversational response with campground result cards appears inline below chips → page grows down, trending cards stay → user never leaves homepage. Must match homepage design: Playfair Display + DM Sans, terracotta #C4622D, no jarring UI shifts.

## Current File Structure (updated April 7 2026)
- public/index.html — homepage only (hero, chat input, trending cards). NOT the SPA.
- public/app.html — main SPA (all tabs: Dashboard, Watch, Preferences, Discover, Settings)
- public/css/home.css — homepage styles only
- public/js/home.js — homepage JS only
- public/app.js — SPA JS
- public/styles.css — SPA styles

## Rules — enforce these on every task, no exceptions
- Read every file in full before touching it
- Show your plan before making any changes
- Restart server and verify after every single change
- Never say done without showing proof it works
- Never touch app.html, app.js, or styles.css without explicit permission first

## Pending Work — do in this exact order, one at a time, verify each before moving on

### 1. Unify the nav
Replace the tab bar in app.html with the homepage-style nav. Same wordmark (links to /), same fonts, same style. Links: Home (/) · Discover (/app?tab=discover) · Alerts (/app?tab=watch) · Preferences (/app?tab=preferences) · Settings (/app?tab=settings). Active link highlights in terracotta #C4622D based on current ?tab= param. Remove old tab bar completely.

### 2. Match fonts and colors in the app
Add Playfair Display + DM Sans from Google Fonts to styles.css. Playfair Display for headings, DM Sans for body. Terracotta #C4622D for buttons and accents. Must match homepage exactly.

### 3. Fix auto-search
When arriving at /app?tab=watch&q=QUERY, the Watch tab must open, search field must be pre-filled, and search must auto-run without user clicking anything.

### 4. Update trending cards
In public/js/home.js, update card names to: Palomar Mountain, Cuyamaca Rancho, Anza Borrego, Lopez Lake. These return real search results.

### 5. Homepage chat — full AI experience
This is the most important feature. Do not build until steps 1-4 are verified working.

Flow:
- User types natural language query into homepage chat box
- AI extracts: location, dates, party size, amenities (shade, water, etc)
- Preference chips animate in below the chat box showing what was extracted
- Extracted preferences save silently to the Preferences tab in the background
- A conversational AI response appears below the chips with campground result cards inline
- Page grows downward, trending cards remain below
- User never navigates away from the homepage
- The entire experience — chips, response, result cards — must match homepage design exactly: Playfair Display + DM Sans, terracotta palette, warm editorial feel. No jarring UI shifts.

## Current File Structure (updated April 7 2026)
- public/index.html — homepage only (hero, chat input, trending cards). NOT the SPA.
- public/app.html — main SPA (all tabs: Dashboard, Watch, Preferences, Discover, Settings)
- public/css/home.css — homepage styles only
- public/js/home.js — homepage JS only
- public/app.js — SPA JS
- public/styles.css — SPA styles

## Known Issues (April 7 2026)
- Homepage cards and chat input route to /app?tab=watch&q=QUERY correctly
- Watch tab opens and search field is pre-filled correctly
- BUT search does not auto-run — user must manually click Search
- The search button click simulation in init() is not firing correctly

## Rules (never break these)
- Never overwrite public/app.html
- Never overwrite public/app.js
- Never overwrite public/styles.css
- Always show file contents before editing
- Always confirm server is running after changes

## What This Is / Who It's For

CampAlong is an AI-powered camping companion for West Coast campers who want to discover, book, and monitor campsite availability without spending hours on Recreation.gov. The primary user is a California family camper who knows roughly what they want (shade, water, family-friendly, specific dates) but can't find availability through normal means.

**Core loop:**
1. Discover top campgrounds for a region, filtered by preferences
2. Browse AI-written summaries sourced from Reddit + The Dyrt (not government copy)
3. Open a campground detail page: gallery, best sites, real-time availability, camper reviews
4. Book directly (deep link to specific site) or watch for cancellations
5. Get emailed/texted the moment a matching site opens

Run with: `npm start` (or `npm run dev` for nodemon). Server on port 3000.

---

## Complete User Journey

```
Date range + region select
  → "Find Campgrounds" → scored list + map
    → Filter panel: stars / drive-in only / shade / water / crowd level (AI)
      → Click campground card or map marker
        → Detail page: gallery · AI summary · key chips · availability checker
          → If available: "Book Site N" → deep link to specific site (new tab)
          → If not: "+ Watch for openings" → adds to watchlist inline
            → Monitor checks every 5 min
              → Email + SMS alert with booking deep link
```

---

## Data Sources

| Source | What It Provides | Auth |
|--------|-----------------|------|
| **Recreation.gov RIDB** | Federal campgrounds (NPS, USFS, BLM), site-level data, photos, availability | API key from ridb.recreation.gov/profile |
| **ReserveCalifornia** | California State Parks (Tyler Technologies backend) | None — no key required |
| **Anthropic Claude (web_search)** | AI summaries, best sites, discovery, reviews, photos for RC, nearby info | ANTHROPIC_API_KEY |
| **Mapbox GL JS** | Interactive map, outdoors style | MAPBOX_TOKEN (client-side, restrict by URL) |
| **Gmail OAuth2** | Availability alerts via email | GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN |
| **Twilio** | SMS alerts | accountSid, authToken, from, to (stored encrypted) |

**Future:** county parks, HipCamp, The Dyrt API, PlugShare (EV charging).

---

## File Structure

```
campsite-alert/
├── server/
│   ├── index.js            — Express entry; logs key/token status on boot; starts monitoring
│   ├── routes.js           — All API routes (see Route Map below)
│   ├── agentService.js     — Anthropic AI agent (12 features, web_search tool, 1-hr cache)
│   ├── recreation-gov.js   — RIDB API client; getCampgroundPhotos returns up to 8 photos
│   ├── reserve-california.js — Tyler Technologies RC client; no key needed; in-memory cache
│   ├── recommendations.js  — Campground scoring, REGIONS, hike-in exclusion, bounds search
│   ├── db.js               — JSON file storage (watchlist, settings, alerts, campground cache)
│   ├── monitor.js          — Cron watchlist checker; sends alerts
│   ├── alerts.js           — Gmail OAuth2 email + Twilio SMS alert sending
│   ├── credentials.js      — Encrypted credential storage
│   ├── preferences.js      — User preference profile (nearWater, shade, familyAmenities, etc.)
│   └── patterns.js         — Booking pattern tracking + predictive insights
├── public/
│   ├── index.html          — SPA shell; Mapbox GL JS v3.4.0 from CDN; detail overlay; filter HTML
│   ├── app.js              — All client-side JS (vanilla ES2020; no bundler; no imports)
│   └── styles.css          — All styles (CSS variables, components, responsive)
├── scripts/
│   └── get-gmail-token.js  — OAuth2 helper for Gmail refresh token
├── data/                   — Runtime files (gitignored)
│   ├── watchlist.json
│   ├── settings.json
│   ├── alerts-sent.json
│   └── campground-cache.json
├── .env                    — Environment variables
└── package.json            — node/nodemon; @anthropic-ai/sdk, axios, express, node-cron, nodemailer, twilio
```

---

## Environment Variables (.env)

```bash
# Recreation.gov — users add in Settings UI; also works from env
RECREATION_GOV_API_KEY=...

# Gmail OAuth2 (preferred over App Password)
# Run node scripts/get-gmail-token.js to get the refresh token
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_USER=your@gmail.com
GMAIL_REFRESH_TOKEN=...

# Anthropic — all AI features, web_search tool
ANTHROPIC_API_KEY=sk-ant-api03-...
AGENT_MOCK=false   # set true to use mock data without billing

# Mapbox GL JS — intentionally client-side; restrict by allowed URL in Mapbox dashboard
MAPBOX_TOKEN=pk.eyJ1...

PORT=3000
```

**Startup logs:** `[agent] key loaded` / `[agent] key missing` and `[mapbox] token loaded` / `[mapbox] token missing` appear on every boot.

---

## API 1: Recreation.gov (RIDB)

**Base URL:** `https://ridb.recreation.gov/api/v1`

**Key endpoints:**
- `GET /facilities?query=&latitude=&longitude=&radius=&activity=9&apikey=` — search with geo-radius
- `GET /facilities/:id?full=true&apikey=` — full facility detail (1-hr file cache)
- `GET /facilities/:id/campsites?full=true&limit=500&apikey=` — site list
- `GET /facilities/:id/media?apikey=` — photos (RECDATA[].MediaType, .URL)
- `GET https://www.recreation.gov/api/camps/availability/campground/:id/month?start_date=` — availability grid

**Facility object fields:** `FacilityID`, `FacilityName`, `FacilityDescription`, `FacilityLatitude`, `FacilityLongitude`, `FacilityAdaAccess`, `Reservable`, `FACILITYADDRESS[]`, `ATTRIBUTES[]`

**Logging:** Every `searchCampgrounds` call logs `[rec.gov] search q="..." lat=N lng=N radius=Nmi` + result count — verifies geo params are being sent.

**Booking deep link:** `https://www.recreation.gov/camping/campgrounds/{facilityId}/r/campsiteCalendar.do?loop=&campsiteId={siteId}`

---

## API 2: ReserveCalifornia

**Base URL:** `https://california-rdr.prod.cali.rd12.recreation-management.tylerapp.com`

**Old host** (`calirdr.usedirect.com`) is dead. Always use the URL above.

**Key endpoints:**
- `GET /rdr/fd/places` — all parks (PlaceId, Name, Latitude, Longitude)
- `GET /rdr/fd/facilities` — all campground loops (FacilityId, PlaceId, Name, AllowWebBooking)
- `POST /rdr/search/grid` — availability grid (date format `MM-DD-YYYY`)

**Caching:** Full lists cached in memory 1 hour (`_places`, `_facilities`). All search/bounds filtering is in-memory — no extra API calls.

**Display name:** `"Park Name — Loop Name"` when they differ.

**URL format:** `https://www.reservecalifornia.com/Web/Default.aspx#!park/{PlaceId}/{FacilityId}`

**No photo API:** RC has no public media endpoint. RC cards use either agent-sourced photo or warm gradient placeholder.

**Booking deep link:** `https://www.reservecalifornia.com/Web/Default.aspx#!park/{parkId}/unit/{unitId}`

---

## AI Agent Layer (agentService.js)

**Model:** `claude-sonnet-4-20250514` with hosted `web_search_20250305` tool.

**Architecture:**
- `runAgent(system, userMessage, maxTokens)` — multi-turn agentic loop (max 10 turns). On `tool_use` stop, pushes assistant turn + empty `tool_result` acks (Anthropic executes searches server-side). Returns final text.
- `parseJSON(raw)` — strips fences, extracts first JSON object/array, runs `stripTagsDeep` on result.
- **Server-side cache** — `Map` with 1-hr TTL. Key format: `"feature:campgroundId"`.
- **Mock mode** — `AGENT_MOCK=true` returns varied placeholder data without billing.

### All 12 Agent Features

| Route | Function | Returns |
|-------|----------|---------|
| `GET /agent/discover?minLat=&maxLat=&minLng=&maxLng=` | `discoverCampgrounds` | `[{name, description, latitude, longitude, source, url, agentDiscovered:true}]` |
| `GET /agent/summary/:id?name=&state=` | `getCampgroundSummary` | `{summary, highlights[], crowdLevel, bestFor, hikeInOnly}` |
| `GET /agent/best-sites/:id?name=&state=` | `getBestSites` | `{sites[], generalTips, reviewSource}` |
| `GET /agent/enrich/:id?name=&state=` | `enrichCampgroundData` | `{accessType, hikeInOnly, elevation, ...}` |
| `GET /agent/watchlist-intel/:id?name=&state=` | `getWatchlistIntelligence` | `{cancellationPatterns, bestSitesToWatch[], ...}` |
| `POST /agent/personalize` | `personalizeRecommendations` | `{recommendations[]}` |
| `POST /agent/trip-plan` | `planTripRoute` | `{route, stops[]}` |
| `GET /agent/predict/:id?name=&state=` | `predictAvailability` | `{bestCheckTime, typicalLeadTime, ...}` |
| `GET /agent/photo/:id?name=&state=` | `searchCampgroundPhoto` | `{photoUrl}` — direct image URL or null |
| `GET /agent/reviews/:id?name=&state=` | `getCampgroundReviews` | `{reviews[{quote, source, rating}]}` |
| `GET /agent/nearby/:id?name=&state=&latitude=&longitude=` | `getNearbyInfo` | `{nearestTown, evCharging, fireRestrictions}` |
| `GET /agent/cache` | `getCacheStats` | dev cache inspection |

### `stripTagsDeep` / `stripTagsClient` Pattern (critical)

Anthropic's `web_search` tool injects `<cite>` tags into responses. Strip them everywhere.

**Server** — automatic via `parseJSON()`:
```javascript
function stripTagsDeep(obj) {
  if (typeof obj === 'string') return str.replace(/<cite[^>]*>[\s\S]*?<\/cite>/gi,'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
  if (Array.isArray(obj)) return obj.map(stripTagsDeep);
  if (obj && typeof obj === 'object') { const r={}; for (const [k,v] of Object.entries(obj)) r[k]=stripTagsDeep(v); return r; }
  return obj;
}
```

**Client** — `stripTagsClient(str)` in app.js. **Rule:** always `escHtml(stripTagsClient(text))` before DOM insertion. Never trust raw agent text.

---

## Campground Detail Page

The detail page is an in-page overlay (`#detail-overlay`) that slides in from the right. Triggered by:
- Clicking a campground card name or "View Details" button in Discover
- Clicking "View Details" in a map popup
- Clicking a watchlist card name

**Sections (loaded in parallel, fill as data arrives):**
1. **Photo gallery** — RIDB photos (up to 8) or agent photo search; warm gradient placeholder if none
2. **Header** — campground name, state, distance from user, source badge (Recreation.gov / ReserveCalifornia)
3. **AI summary** — full summary + highlight tags + crowd/bestFor chips; 20s timeout → raw description fallback
4. **Availability checker** — date range + nights input; calls Rec.gov or RC availability API
   - Found: "Book Site N" buttons with specific site deep links (open new tab)
   - None: "+ Watch for openings" button adds inline with toast confirmation
5. **Best Sites** — same as Discover card panel but expanded; source from agent reviews
6. **What Campers Say** — 3-5 real review quotes with source attribution; no `<cite>` tags
7. **Nearby** — nearest town + services, EV charging (PlugShare/ChargePoint), fire restriction level

---

## Mapbox GL JS Map (app.js)

**Library:** Mapbox GL JS v3.4.0 (CDN in index.html)
**Style:** `mapbox://styles/mapbox/outdoors-v12`
**Token:** from `GET /api/config` at init

**Key conventions:**
- Coordinate order: `[lng, lat]` — opposite of Leaflet. Never mix these up.
- Wait for `map.on('load', ...)` before adding markers.
- `_recMap.resize()` when map tab becomes visible.
- `_recMap.flyTo({ center: [lng, lat], zoom })` to navigate.
- Default center: `[-119.4, 36.7]` zoom 6 (broad California) — geolocation flies to user if granted.

**State:**
```javascript
let _recMap      = null;     // mapboxgl.Map instance
let _apiMarkers  = [];       // Marker[] for Rec.gov + RC results
let _aiMarkers   = [];       // Marker[] for agent-discovered results
let _markerById  = {};       // id → { marker, popup, campground }
let _userLatLng  = null;     // { lat, lng } once geolocation resolves
```

**Markers:**
- API/RC results: solid terracotta SVG teardrop pin (no numbers)
- Agent-discovered: outlined terracotta SVG pin with inner dot
- Color: `#C4622D` (terracotta)

**Popup contains:** campground photo (150x100, async), name, star rating, AI tags, distance from user, "View Details" (opens internal detail page) + "+ Watch" button.

**`_fetchMarkerPhoto(c)`:** Async per-marker; uses RIDB for Rec.gov, falls back to agent photo search for RC. Refreshes popup HTML when photo arrives.

**Distance:** `_distanceMi(lat1,lng1,lat2,lng2)` Haversine formula. Shown in popup and detail header once `_userLatLng` is known.

**Agent discovery layer:** 1.5s after map load, non-blocking call to `GET /agent/discover` for current viewport bounds. AI-discovered markers are outlined pins, deduplicated against API results by name prefix.

**"Search this area":** Appears on pan/zoom; re-queries both APIs + agent discover; syncs list view and map simultaneously.

---

## Filters Panel (app.js)

Appears above Discover results after first load. State in `_filters` object.

**Filters:**
- `minStars` — 0/2/3/4/5 star chips
- `driveInOnly` — default true; excludes agent-flagged hike-in campgrounds
- `water`, `shade`, `family`, `flush` — amenity checkboxes (pre-loaded from preference profile)
- `crowd` — AI crowd level chips (shown after agent summaries arrive): Quiet / Moderate / Busy

**`_applyFilters()`** applies all filters to `_recRecs` array client-side. `_renderFilteredResults()` re-renders both list and map markers. Active filter count shown in badge: "Filters (3)". Reset button restores all defaults.

---

## Campground Scoring (recommendations.js)

**`scoreCampground(facility, prefs)`:** Water (+30), tree cover (+25), family amenities (+15), flush/showers (+10), latitude band (+5), ADA (+3).

**Hike-in exclusion:** Hard exclude (not penalty) when `prefs.familyAmenities = true`. Matches 12 terms: "hike-in", "hike in", "hikein", "walk-in", "walk in", "trail-in", "trail in", "pack-in", "pack in", "backpack only", "non-motorized access", "accessible only by trail", "accessible by trail", "no vehicle access". This runs server-side in `getCampgroundRecommendations` — fix hike-in filtering issues here, not in client JS.

**Deterministic sort:** Always `score desc → name asc`. Never random. Applied in `getCampgroundRecommendations`, `searchByBounds`, and the RC+Rec.gov merge.

**REGIONS:** 10 predefined regions each with `{state, query, center: {lat, lng, radius}, bounds: [minLat, maxLat, minLng, maxLng]}`. RIDB queried by center+radius (geo params sent IN the request), then bounds post-filters outliers.

**RC merge:** For CA regions, `rcSearchByBounds` adds ReserveCalifornia results after Rec.gov scoring. Combined list re-sorted deterministically.

---

## Watchlist Cards (app.js / dashboard)

Each card in the dark grid shows the campground name, date range, and source. After render:
- RIDB photo is fetched and overlaid at 35% opacity over the gradient (gives real campground feel)
- RC campgrounds: no photo overlay (no RC media API) — gradient persists
- Clicking the campground name opens the detail page overlay
- `openDetailByWatchItem(watchId)` reads the card's data attributes to open detail

---

## Data Layer (db.js)

JSON file storage — no SQLite. `db` export is a compat shim mimicking better-sqlite3's `.prepare().get()/.run()` interface, used only for the campground cache.

Files in `data/`:
- `watchlist.json` — active watchlist items (soft-delete with `active:false`)
- `settings.json` — `{checkIntervalMinutes, alertEmail}`
- `alerts-sent.json` — deduplication log keyed by `campgroundId|siteId|dates`
- `campground-cache.json` — 1-hr facility detail cache

---

## Alerts & Monitoring

**Gmail OAuth2** — preferred. `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_USER`, `GMAIL_REFRESH_TOKEN` from `.env`. Run `node scripts/get-gmail-token.js` to get the refresh token.

**SMTP fallback** — via `POST /api/credentials/email` in Settings.

**Twilio SMS** — via `POST /api/credentials/twilio`. Both email and SMS fire on the same availability hit.

**Monitor** — `node-cron` job (default 5-min interval). On hit: deduplicates by `campgroundId|siteId|dates` key, sends email + SMS with booking deep link.

---

## Route Map

```
GET  /api/config                          — { mapboxToken }
GET  /api/stats
GET  /api/watchlist
POST /api/watchlist
DEL  /api/watchlist/:id
GET  /api/settings
POST /api/settings
GET  /api/preferences
POST /api/preferences
GET  /api/patterns
GET  /api/patterns/:id
POST /api/credentials/recreation-gov
POST /api/credentials/recreation-gov/validate
POST /api/credentials/email
POST /api/credentials/twilio
POST /api/credentials/twilio/test
GET  /api/credentials/status
GET  /api/search?q=                       — Rec.gov search
GET  /api/search/reservecalifornia?q=     — RC search
GET  /api/search/bounds?minLat=&maxLat=&minLng=&maxLng=   — both APIs merged
GET  /api/campground/:id                  — Rec.gov facility detail
GET  /api/campground/:id/photo?source=    — first photo URL (RC always null)
GET  /api/campground/:id/photos?source=   — up to 8 photos for gallery
GET  /api/campground/:id/sites            — scored site recommendations
GET  /api/campground/:id/availability?startDate=&endDate=&minNights=   — Rec.gov availability
POST /api/campground/:id/availability/rc  — ReserveCalifornia availability
GET  /api/recommendations/regions
GET  /api/recommendations?region=
POST /api/check-now
GET  /api/monitor/status
GET  /api/agent/discover?minLat=...
GET  /api/agent/summary/:id?name=&state=
GET  /api/agent/best-sites/:id?name=&state=
GET  /api/agent/enrich/:id?name=&state=
GET  /api/agent/watchlist-intel/:id?name=&state=
POST /api/agent/personalize
POST /api/agent/trip-plan
GET  /api/agent/predict/:id?name=&state=
GET  /api/agent/photo/:id?name=&state=    — photo URL for RC/agent-discovered campgrounds
GET  /api/agent/reviews/:id?name=&state=  — 3-5 real camper quotes
GET  /api/agent/nearby/:id?name=&state=&latitude=&longitude=   — town, EV, fire restrictions
GET  /api/agent/cache                     — dev cache inspection
```

---

## Design Rules

- **No emojis** — none in UI text. Stars use ★ (Unicode, not emoji).
- **Warm sunset palette:** terracotta `#C4622D`, burnt sienna, amber, cream `#FDF6EE` background.
- **Typography:** `Playfair Display` serif for headings/campground names, `DM Sans` for all body/UI text.
- **Scannable shorthand** — no walls of text. Chips > paragraphs. Never more than 3 sentences in a summary card.
- **Strip `<cite>` tags** everywhere — `stripTagsDeep` server-side at parse time, `stripTagsClient` client-side at render time. Always wrap: `escHtml(stripTagsClient(text))`.
- **Tile layouts** — grid cards, no heavy header bars.
- **Photos:** Always load or show warm gradient placeholder (`linear-gradient(155deg, #C4622D 0%, #e8a87c 60%, #F2E8DC 100%)`). Never broken image icons.
- **Mobile-friendly** — all new UI tested at 375px.

---

## Coding Rules

- **Server-side over client-side** — filtering, sorting, deduplication happen on the server.
- **Always both APIs** — every data call that makes sense (search, bounds) queries Rec.gov AND ReserveCalifornia via `Promise.allSettled`.
- **Always include user preference profile** — `getPreferences()` is called in recommendation routes.
- **Cache agent results** — 1-hr TTL server-side + localStorage client-side. Cache key format: `"feature:campgroundId"`.
- **Deep-link, never homepage** — every booking button uses facility ID + site ID. Rec.gov: `recreation.gov/camping/campgrounds/{fid}/r/campsiteCalendar.do?campsiteId={siteId}`. RC: `reservecalifornia.com/Web/Default.aspx#!park/{placeId}/unit/{unitId}`.
- **Open external links in new tab** — `target="_blank"` everywhere.
- **Non-blocking agent calls** — render existing data first, enhance as AI arrives. `.catch(() => {})` on all agent calls.
- **Never shimmer forever** — `agentEnhanceCards` races agent call against 15s timeout; falls back to raw API description.
- **Deterministic ordering** — always score desc → name asc. Never random. Never append-only.
- **No bundler** — vanilla ES2020, no imports. Single `app.js` file loaded directly by index.html.

---

## Current Feature Status (as of April 2026)

### Working
- Server: boots cleanly, logs key/token status, all modules load
- Rec.gov: search, facility detail, site list, availability, photos (RIDB media)
- ReserveCalifornia: search, availability, bounds search (in-memory filter)
- Bounds search: both APIs in parallel, merged, deduplicated
- AI agent: all 12 features, 1-hr server cache, mock mode
- Discover: scored list, AI summaries (15s fallback), unified Best Sites cards, photo thumbnails
- Filters panel: stars, drive-in only, amenities, AI crowd level
- Map: Mapbox GL JS v3.4.0, outdoors style, terracotta teardrop pins, geolocation, popups with photo + "View Details"
- "Search this area": re-queries both APIs + agent for current viewport
- Agent discovery layer: outlined pins, deduplicated
- Campground detail overlay: gallery, AI summary, availability checker, best sites, reviews, nearby info
- Watchlist: add/remove, photo overlay, click-to-detail
- Monitoring: cron-based, Gmail OAuth2, Twilio SMS, alert deduplication
- Settings: Rec.gov API key, email, Twilio, monitoring interval

### Not Yet Built
- Trip planner UI (route + stops — server infrastructure exists at `POST /agent/trip-plan`)
- Site map image (detail page section is wired but no site map fetch implemented)
- County parks / HipCamp in direct API (only via agent discovery)
- Personalization UI (API exists at `POST /agent/personalize`)
- Mobile filters bottom drawer (desktop panel works; drawer HTML placeholder in index.html)
- User accounts / login (anonymous single-user currently)

### Known Limitations
- RC campground photos require agent web search (slow) — gradient placeholder is common
- Agent photo search returns `null` in mock mode — intentional
- RC availability `findAvailableSites` parses Tyler Technologies grid format (slice keys are ISO datetime strings)
- Geolocation used for distance display only — not for automatic region selection
