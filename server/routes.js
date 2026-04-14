const express = require('express');
const router  = express.Router();

const { getWatchlist, addToWatchlist, removeFromWatchlist, getSettings, setSetting, countAlertsSent } = require('./db');
const { saveCredentials, getCredentials, ACCOUNTS } = require('./credentials');
const { searchCampgrounds: recGovSearch, getCampgroundDetails, getCampgroundMedia, getCampgroundPhotos } = require('./recreation-gov');
const { searchCampgrounds: rcSearch, searchByBounds: rcSearchByBounds } = require('./reserve-california');
const { getCampgroundRecommendations, getSiteRecommendations, searchByBounds, REGIONS } = require('./recommendations');
const { checkAllWatchlist, getStatus } = require('./monitor');
const { getPreferences, savePreferences }  = require('./preferences');
const { getInsights, getAllInsights }       = require('./patterns');
const { sendTestSMS }                      = require('./alerts');
const agent                                = require('./agentService');
const { searchCountyParks, searchCountyParksByBounds } = require('./county-parks');

// ── Public client config ───────────────────────────────────────────────────────
// Exposes non-secret runtime config to the browser (Mapbox token is meant to be
// client-side; restrict it by allowed URL in the Mapbox dashboard instead).

router.get('/config', (req, res) => {
  res.json({ mapboxToken: process.env.MAPBOX_TOKEN || '' });
});

// ── Stats ──────────────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const { checksToday, availableNow } = getStatus();
    res.json({
      watching:     getWatchlist().length,
      availableNow,
      checksToday,
      alertsSent:   countAlertsSent(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Watchlist ─────────────────────────────────────────────────────────────────

router.get('/watchlist', (req, res) => {
  try { res.json(getWatchlist()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/watchlist', (req, res) => {
  try {
    const { campground_id, campground_name, date_start, date_end, min_nights, preferences, source } = req.body;
    if (!campground_id || !campground_name || !date_start || !date_end)
      return res.status(400).json({ error: 'campground_id, campground_name, date_start, date_end are required' });
    const id = addToWatchlist({ campground_id, campground_name, date_start, date_end, min_nights, preferences, source: source || 'recreation.gov' });
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/watchlist/:id', (req, res) => {
  try { removeFromWatchlist(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', (req, res) => {
  try {
    const s = getSettings();
    res.json({ checkIntervalMinutes: s.checkIntervalMinutes || 5, alertEmail: s.alertEmail });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/settings', (req, res) => {
  try {
    const { checkIntervalMinutes, alertEmail } = req.body;
    if (checkIntervalMinutes != null) setSetting('checkIntervalMinutes', Number(checkIntervalMinutes));
    if (alertEmail          != null) setSetting('alertEmail', alertEmail);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── User preference profile ───────────────────────────────────────────────────

router.get('/preferences', (req, res) => {
  try { res.json(getPreferences()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/preferences', (req, res) => {
  try { res.json({ success: true, preferences: savePreferences(req.body) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Predictive patterns ───────────────────────────────────────────────────────

router.get('/patterns', (req, res) => {
  try { res.json(getAllInsights()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/patterns/:id', (req, res) => {
  try { res.json(getInsights(req.params.id, req.query.checkinDate || null)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Credentials ───────────────────────────────────────────────────────────────

router.post('/credentials/recreation-gov', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });
    await saveCredentials(ACCOUNTS.RECREATION_GOV, { apiKey });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/credentials/recreation-gov/validate', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });
    const axios = require('axios');
    const { data } = await axios.get('https://ridb.recreation.gov/api/v1/facilities', {
      params: { query: 'campground', limit: 1, apikey: apiKey },
      timeout: 8000,
    });
    if (!data || data.METADATA === undefined) throw new Error('Unexpected API response');
    res.json({ success: true, message: 'Key is valid' });
  } catch (e) {
    const status = e.response?.status;
    const msg = status === 401 || status === 403
      ? 'Invalid API key — check you copied it correctly'
      : `Could not reach Recreation.gov (${e.message})`;
    res.status(400).json({ error: msg });
  }
});

router.post('/credentials/email', async (req, res) => {
  try {
    const { host, port, user, pass } = req.body;
    if (!user || !pass) return res.status(400).json({ error: 'user and pass are required' });
    await saveCredentials(ACCOUNTS.EMAIL, { host: host || 'smtp.gmail.com', port: Number(port) || 587, user, pass });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/credentials/twilio', async (req, res) => {
  try {
    const { accountSid, authToken, from, to } = req.body;
    if (!accountSid || !authToken || !from || !to)
      return res.status(400).json({ error: 'accountSid, authToken, from, and to are all required' });
    await saveCredentials(ACCOUNTS.TWILIO, { accountSid, authToken, from, to });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/credentials/twilio/test', async (req, res) => {
  try {
    await sendTestSMS();
    res.json({ success: true, message: 'Test SMS sent!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/credentials/status', async (req, res) => {
  try {
    const [recGov, email, twilio] = await Promise.all([
      getCredentials(ACCOUNTS.RECREATION_GOV),
      getCredentials(ACCOUNTS.EMAIL),
      getCredentials(ACCOUNTS.TWILIO),
    ]);
    const oauthReady = !!(
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_USER &&
      process.env.GMAIL_REFRESH_TOKEN
    );
    res.json({
      recreationGov: !!recGov?.apiKey,
      email:         oauthReady || !!email?.user,
      gmailOAuth:    oauthReady,
      gmailUser:     oauthReady ? process.env.GMAIL_USER : null,
      twilio:        !!twilio?.accountSid,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Search — Recreation.gov ───────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const { q, state } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });
    const results = await recGovSearch(q, state || undefined);
    res.json(results.map(c => ({
      id:          c.FacilityID,
      name:        c.FacilityName,
      description: (c.FacilityDescription || '').replace(/<[^>]+>/g, '').slice(0, 200).trim(),
      state:       (c.FACILITYADDRESS || [])[0]?.AddressStateCode,
      latitude:    c.FacilityLatitude,
      longitude:   c.FacilityLongitude,
      reservable:  c.Reservable,
      source:      'recreation.gov',
      url: `https://www.recreation.gov/camping/campgrounds/${c.FacilityID}`,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Search — County / Regional Parks ─────────────────────────────────────────

router.get('/search/county', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  res.json(searchCountyParks(q));
});

// ── Search — ReserveCalifornia ────────────────────────────────────────────────

router.get('/search/reservecalifornia', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });
    const results = await rcSearch(q);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Campground detail / site recommendations ──────────────────────────────────

router.get('/campground/:id', async (req, res) => {
  try { res.json(await getCampgroundDetails(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Returns the first photo URL for a campground (non-critical — always responds 200)
router.get('/campground/:id/photo', async (req, res) => {
  try {
    const { source } = req.query;
    // ReserveCalifornia (Tyler Technologies) doesn't expose a public media API
    if (source === 'reserve-california') return res.json({ photoUrl: null });
    const photoUrl = await getCampgroundMedia(req.params.id);
    res.json({ photoUrl: photoUrl || null });
  } catch { res.json({ photoUrl: null }); }
});

// Returns up to 8 photos for the gallery view
router.get('/campground/:id/photos', async (req, res) => {
  try {
    const { source } = req.query;
    if (source === 'reserve-california') return res.json({ photos: [] });
    const photos = await getCampgroundPhotos(req.params.id, 8);
    res.json({ photos });
  } catch { res.json({ photos: [] }); }
});

router.get('/campground/:id/sites', async (req, res) => {
  try {
    const prefs = getPreferences();
    const sites = await getSiteRecommendations(req.params.id, prefs);
    res.json(sites);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Availability check for detail page — Recreation.gov
router.get('/campground/:id/availability', async (req, res) => {
  try {
    const { startDate, endDate, minNights } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });
    const { getAvailability, findAvailableSites } = require('./recreation-gov');
    const campsites = await getAvailability(req.params.id, startDate, endDate);
    const sites     = findAvailableSites(campsites, startDate, endDate, parseInt(minNights) || 1);
    res.json(sites);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Availability check for detail page — ReserveCalifornia
router.post('/campground/:id/availability/rc', async (req, res) => {
  try {
    const { facilityId, startDate, endDate, minNights } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });
    const { getAvailability, findAvailableSites } = require('./reserve-california');
    const grid  = await getAvailability(facilityId || req.params.id, startDate, endDate, parseInt(minNights) || 1);
    const sites = findAvailableSites(grid, startDate, endDate, parseInt(minNights) || 1);
    res.json(sites);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Campground recommendations ────────────────────────────────────────────────

router.get('/recommendations/regions', (req, res) => {
  res.json(Object.keys(REGIONS));
});

router.get('/recommendations', async (req, res) => {
  try {
    const { region } = req.query;
    if (!region) return res.status(400).json({ error: 'region is required', regions: Object.keys(REGIONS) });

    // Merge global preference profile with any query overrides
    const globalPrefs = getPreferences();
    const prefs = {
      nearWater:      req.query.nearWater      !== undefined ? req.query.nearWater !== 'false'      : globalPrefs.nearWater,
      shade:          req.query.shade          !== undefined ? req.query.shade !== 'false'          : globalPrefs.shade,
      familyAmenities: req.query.familyAmenities !== undefined ? req.query.familyAmenities !== 'false' : true,
      treecover:      globalPrefs.treecover,
      kidFriendlyTerrain: globalPrefs.kidFriendlyTerrain,
    };
    const results = await getCampgroundRecommendations(region, prefs);
    res.json({ region, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bounds search ─────────────────────────────────────────────────────────────

router.get('/search/bounds', async (req, res) => {
  try {
    const { minLat, maxLat, minLng, maxLng } = req.query;
    if (!minLat || !maxLat || !minLng || !maxLng)
      return res.status(400).json({ error: 'minLat, maxLat, minLng, maxLng are required' });

    const mn = parseFloat(minLat), mx = parseFloat(maxLat),
          mw = parseFloat(minLng), me = parseFloat(maxLng);

    // Query both APIs + county parks in parallel; RC/county only cover California
    const [recRes, rcRes, countyRes] = await Promise.allSettled([
      searchByBounds(mn, mx, mw, me),
      rcSearchByBounds(mn, mx, mw, me),
      Promise.resolve(searchCountyParksByBounds(mn, mx, mw, me)),
    ]);

    const recResults    = recRes.status    === 'fulfilled' ? recRes.value    : [];
    const rcResults     = rcRes.status     === 'fulfilled' ? rcRes.value     : [];
    const countyResults = countyRes.status === 'fulfilled' ? countyRes.value : [];

    // Deduplicate by name prefix (RC and county against Rec.gov)
    const seen   = new Set(recResults.map(r => r.name.toLowerCase().slice(0, 20)));
    const unique = rcResults.filter(r => !seen.has(r.name.toLowerCase().slice(0, 20)));
    countyResults.forEach(p => {
      const k = p.name.toLowerCase().slice(0, 20);
      if (!seen.has(k)) { seen.add(k); unique.push(p); }
    });

    res.json([...recResults, ...unique]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Monitor control ───────────────────────────────────────────────────────────

router.post('/check-now', (req, res) => {
  res.json({ success: true, message: 'Check triggered' });
  checkAllWatchlist().catch(console.error);
});

router.get('/monitor/status', (req, res) => {
  res.json(getStatus());
});

// ── Agent (AI research layer) ──────────────────────────────────────────────

// Feature 1: Campground discovery by map bounds
router.get('/agent/discover', async (req, res) => {
  try {
    const { minLat, maxLat, minLng, maxLng } = req.query;
    if (!minLat || !maxLat || !minLng || !maxLng)
      return res.status(400).json({ error: 'minLat, maxLat, minLng, maxLng are required' });
    const results = await agent.discoverCampgrounds({ minLat, maxLat, minLng, maxLng });
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 2: Campground card summary (replaces raw API description)
router.get('/agent/summary/:id', async (req, res) => {
  try {
    const { name, state, description } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.getCampgroundSummary({
      id: req.params.id, name, state, rawDescription: description,
    });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 3: Best sites from camper reviews
router.get('/agent/best-sites/:id', async (req, res) => {
  try {
    const { name, state } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.getBestSites({ id: req.params.id, name, state });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 4: Data enrichment (fill API gaps)
router.get('/agent/enrich/:id', async (req, res) => {
  try {
    const { name, state } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.enrichCampgroundData({
      id: req.params.id, name, state, currentData: {},
    });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 6: Watchlist intelligence
router.get('/agent/watchlist-intel/:id', async (req, res) => {
  try {
    const { name, state } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.getWatchlistIntelligence({ id: req.params.id, name, state });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 7: Personalized recommendations
router.post('/agent/personalize', async (req, res) => {
  try {
    const { preferences, likedCampgrounds } = req.body;
    const result = await agent.personalizeRecommendations({ preferences, likedCampgrounds });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 8: Trip planner (infrastructure — UI comes later)
router.post('/agent/trip-plan', async (req, res) => {
  try {
    const result = await agent.planTripRoute(req.body);
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 9: Availability predictions
router.get('/agent/predict/:id', async (req, res) => {
  try {
    const { name, state } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.predictAvailability({
      id: req.params.id, name, state, historicalData: null,
    });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 10: Photo search (for RC and agent-discovered campgrounds)
router.get('/agent/photo/:id', async (req, res) => {
  try {
    const { name, state } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const photoUrl = await agent.searchCampgroundPhoto(name, state);
    res.json({ photoUrl: photoUrl || null });
  } catch (e) { res.json({ photoUrl: null }); }
});

// Feature 11: Campground reviews (for detail page)
router.get('/agent/reviews/:id', async (req, res) => {
  try {
    const { name, state } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.getCampgroundReviews({ id: req.params.id, name, state });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Feature 12: Nearby info (EV charging, fire restrictions, nearest town)
router.get('/agent/nearby/:id', async (req, res) => {
  try {
    const { name, state, latitude, longitude } = req.query;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await agent.getNearbyInfo({ id: req.params.id, name, state, latitude, longitude });
    res.json(result || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dev: cache inspection
router.get('/agent/cache', (req, res) => {
  res.json(agent.getCacheStats());
});

// ── Homepage AI discovery fallback ────────────────────────────────────────────
// Called when keyword APIs return no results. Claude uses web_search to find
// real bookable campgrounds matching a natural-language query.
router.post('/home/discover', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim())
      return res.status(400).json({ error: 'query is required' });
    const results = await agent.discoverByQuery(query.trim());
    res.json(Array.isArray(results) ? results : []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Homepage chat ─────────────────────────────────────────────────────────────
// Parses a natural-language query, returns chips + intro + searchQuery.
// Also silently merges extracted amenity preferences into the stored profile.
router.post('/home/chat', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim())
      return res.status(400).json({ error: 'query is required' });

    const parsed = await agent.parseHomeChatQuery(query.trim());

    // Silently merge extracted preferences into stored profile
    if (parsed.preferences && Object.keys(parsed.preferences).length) {
      try {
        const current = getPreferences();
        savePreferences({ ...current, ...parsed.preferences });
      } catch (_e) { /* non-fatal */ }
    }

    res.json(parsed);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
