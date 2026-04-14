/* home.js — CampAlong homepage */

// ── Nav scroll ───────────────────────────────────────────────────────────────
(function () {
  const nav = document.getElementById('homeNav');
  function onScroll() {
    if (window.scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ── Textarea auto-resize ──────────────────────────────────────────────────────
(function () {
  const ta = document.getElementById('chatInput');
  if (!ta) return;
  ta.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 180) + 'px';
  });
})();

// ── Chat submit → inline AI results ──────────────────────────────────────────
(function () {
  var btn     = document.getElementById('chatSubmit');
  var ta      = document.getElementById('chatInput');
  var section = document.getElementById('chatResults');
  var chipsEl = document.getElementById('chatChips');
  var introEl = document.getElementById('chatIntro');
  var cardsEl = document.getElementById('chatCards');
  var seeAll  = document.getElementById('chatSeeAll');
  if (!btn || !ta || !section) return;

  // Silently get geolocation — used to bias search results toward nearby campgrounds
  var _lat = null, _lng = null;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) { _lat = pos.coords.latitude; _lng = pos.coords.longitude; },
      function() {} // denied or unavailable — no problem
    );
  }

  // Suggestion chips pre-fill the textarea and submit
  document.querySelectorAll('.chat-suggestion').forEach(function(btn) {
    btn.addEventListener('click', function() {
      ta.value = this.dataset.q;
      ta.dispatchEvent(new Event('input')); // trigger auto-resize
      submit();
    });
  });

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Extract a plain location keyword from a natural-language query, no API needed.
  // Strips stop words and amenity terms so we get a useful search term for Rec.gov.
  function extractSearchTerm(q) {
    var STOP = /\b(find|me|a|the|some|near|around|by|for|with|and|or|is|are|that|has|have|great|good|best|nice|beautiful|family|families|kids|adults|weekend|weekday|trip|camping|campsite|campground|campgrounds|camp|spot|spots|site|sites|shady|shade|trees|tree|wooded|forest|sunny|water|lake|river|creek|stream|ocean|beach|mountains|mountain|hills|desert|pet|pets|dog|dogs|friendly|quiet|uncrowded|crowded|busy|popular|remote|secluded|full|hookup|hookups|electric|flush|toilet|toilets|shower|showers|swimming|swim|fishing|fish|hiking|hike|this|next|upcoming)\b/gi;
    var cleaned = q.replace(STOP, ' ').replace(/\s+/g, ' ').trim();
    // Take up to first 3 words of whatever remains
    return cleaned.split(/\s+/).slice(0, 3).join(' ') || q.split(/\s+/).slice(0, 2).join(' ');
  }

  // Haversine distance in miles between two lat/lng points.
  function distanceMi(lat1, lng1, lat2, lng2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Score a campground result against extracted preferences.
  // Penalizes mismatches (e.g. desert campgrounds when shade is wanted).
  function scoreResult(c, prefs) {
    var score = 0;
    var text = ((c.FacilityName || c.name || '') + ' ' + (c.description || '')).toLowerCase();

    if (prefs.shade) {
      var shadeWords = ['redwood', 'sequoia', 'forest', 'pine', 'oak', 'cedar', 'fir', 'grove', 'woodland', 'spruce', 'aspen', 'shade', 'shaded', 'shady', 'trees', 'tree', 'canopy', 'conifer', 'mountain'];
      if (shadeWords.some(function(w) { return text.includes(w); })) score += 25;
      // Penalize dry/desert environments
      var desertWords = ['desert', 'mojave', 'anza-borrego', 'dry lake', 'dunes', 'arid', 'joshua', 'sonoran', 'chaparral', 'scrub'];
      if (desertWords.some(function(w) { return text.includes(w); })) score -= 40;
    }

    if (prefs.nearWater) {
      var waterWords = ['lake', 'creek', 'river', 'beach', 'bay', 'ocean', 'stream', 'falls', 'reservoir', 'lagoon', 'pond', 'waterfront'];
      if (waterWords.some(function(w) { return text.includes(w); })) score += 25;
    }

    if (prefs.familyAmenities) {
      var familyWords = ['family', 'playground', 'picnic', 'swim', 'fishing', 'visitor center'];
      if (familyWords.some(function(w) { return text.includes(w); })) score += 15;
    }

    if (prefs.flushToilets) {
      if (text.includes('flush') || text.includes('restroom') || text.includes('shower')) score += 10;
    }

    return score;
  }

  function shimmer(n) {
    var html = '';
    for (var i = 0; i < n; i++) {
      html += '<div class="chat-card-shimmer">' +
        '<div class="chat-card-shimmer-img"></div>' +
        '<div class="chat-card-shimmer-body">' +
          '<div class="chat-card-shimmer-line"></div>' +
          '<div class="chat-card-shimmer-line short"></div>' +
        '</div></div>';
    }
    return html;
  }

  function renderCard(c) {
    var name    = esc(c.FacilityName || c.name || 'Campground');
    var rawName = c.FacilityName || c.name || 'Campground';
    var rawLoc  = c.FACILITYADDRESS && c.FACILITYADDRESS[0]
                  ? ((c.FACILITYADDRESS[0].City || '') + ', ' + (c.FACILITYADDRESS[0].AddressStateCode || '')).replace(/^,\s*/, '')
                  : (c.location || '');
    var loc     = esc(rawLoc.trim());
    var desc    = c.description ? esc(c.description) : '';
    var source  = c.source || 'recreation.gov';
    var badge   = source === 'reservecalifornia' ? 'ReserveCalifornia'
                : source === 'county'            ? 'County Park'
                : source === 'other'             ? 'AI discovered'
                : 'Recreation.gov';

    // County parks link directly to the county booking site (external)
    var id = c.FacilityID || (source !== 'county' ? c.id : '') || '';
    var appUrl;
    var isExternal = false;
    if (source === 'county' && c.bookingUrl) {
      appUrl     = c.bookingUrl;
      isExternal = true;
    } else if (id) {
      appUrl = '/app?tab=discover&open=' + encodeURIComponent(id) +
               '&name=' + encodeURIComponent(rawName) +
               '&source=' + encodeURIComponent(source) +
               (c.FacilityLatitude  ? '&lat='   + encodeURIComponent(c.FacilityLatitude)  : '') +
               (c.FacilityLongitude ? '&lng='   + encodeURIComponent(c.FacilityLongitude) : '') +
               (c.state             ? '&state=' + encodeURIComponent(c.state)              : '');
    } else {
      // AI-discovered campgrounds have no ID — fall back to discover search
      appUrl = '/app?tab=discover&q=' + encodeURIComponent(rawName);
    }

    var imgHtml = c.photoUrl
      ? '<img class="chat-card-img" src="' + esc(c.photoUrl) + '" alt="' + name + '" loading="lazy" />'
      : '<div class="chat-card-img"></div>';

    return '<a class="chat-card" href="#" data-card-idx>' +
      imgHtml +
      '<div class="chat-card-body">' +
        '<div class="chat-card-name">' + name + '</div>' +
        (loc  ? '<div class="chat-card-location">' + loc + '</div>' : '') +
        (desc ? '<div style="font-size:12px;color:var(--stone);line-height:1.45;margin-bottom:10px">' + desc + '</div>' : '') +
        '<div class="chat-card-tags"><span class="trend-tag">' + badge + '</span></div>' +
        '<span class="chat-card-watch">View details &amp; availability</span>' +
      '</div>' +
    '</a>';
  }

  function _attachCardListeners(results) {
    var cards = cardsEl.querySelectorAll('.chat-card');
    cards.forEach(function(card, i) {
      var c = results[i];
      if (!c) return;
      card.addEventListener('click', function(e) {
        e.preventDefault();
        openHomeDetail(c);
      });
    });
  }

  function loadPhotos(results) {
    var cards = cardsEl.querySelectorAll('.chat-card');
    results.forEach(function(c, i) {
      var card = cards[i];
      if (!card) return;
      var slot = card.querySelector('.chat-card-img:not(img)');
      if (!slot) return;

      // Only fetch fast RIDB photos for Recreation.gov results with a real ID.
      // AI-discovered and RC cards keep the gradient placeholder.
      var id = c.FacilityID;
      if (!id || c.source === 'reservecalifornia') return;

      fetch('/api/campground/' + id + '/photo?source=recreation.gov')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var photoUrl = data.photoUrl || null;
          if (photoUrl && slot && slot.parentNode) {
            var img = new Image();
            img.className = 'chat-card-img';
            img.alt = c.FacilityName || '';
            img.loading = 'lazy';
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.35s ease';
            img.onload = function() { img.style.opacity = '1'; };
            img.src = photoUrl;
            slot.parentNode.replaceChild(img, slot);
          }
        })
        .catch(function() {});
    });
  }

  async function submit() {
    var q = ta.value.trim();
    if (!q) return;

    // Lock input
    btn.disabled = true;
    ta.disabled  = true;

    // Show section with shimmers
    section.hidden = false;
    chipsEl.innerHTML = '';
    introEl.textContent = '';
    cardsEl.innerHTML = shimmer(3);
    seeAll.href = '/app?tab=watch&q=' + encodeURIComponent(q);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      await _doSearch(q);
    } catch (err) {
      console.error('[home] submit error:', err);
      cardsEl.innerHTML = '<p style="color:var(--stone);font-size:14px;grid-column:1/-1">Something went wrong. Please try again.</p>';
    }

    btn.disabled = false;
    ta.disabled  = false;
  }

  async function _doSearch(q) {

    // Fire all requests in parallel immediately — including AI discover as early pre-fetch.
    // If keyword/bounds results come back with data, we cancel discover before awaiting it.
    var chatPromise = fetch('/api/home/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    }).then(function(r) { return r.json(); }).catch(function() { return {}; });

    // If we have the user's location, also run a bounds search (~120mi radius) in parallel
    var boundsPromise = (_lat && _lng)
      ? (function() {
          var deg = 1.8; // ~120 miles
          var url = '/api/search/bounds?minLat=' + (_lat - deg) +
                    '&maxLat=' + (_lat + deg) +
                    '&minLng=' + (_lng - deg) +
                    '&maxLng=' + (_lng + deg);
          return fetch(url).then(function(r) { return r.json(); }).catch(function() { return []; });
        })()
      : Promise.resolve([]);

    var searchPromise = Promise.all([
      fetch('/api/search?q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).catch(function(){ return []; }),
      fetch('/api/search/reservecalifornia?q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).catch(function(){ return []; }),
      fetch('/api/search/county?q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).catch(function(){ return []; }),
    ]);

    // Pre-fire discover in parallel — server caches results so repeat queries are instant.
    // We only await it if keyword+bounds searches return nothing.
    var _discoverCtrl = new AbortController();
    var _discoverTimer = setTimeout(function() { _discoverCtrl.abort(); }, 18000);
    var discoverPromise = fetch('/api/home/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
      signal: _discoverCtrl.signal,
    }).then(function(r) { return r.json(); }).catch(function() { return []; });

    // Render chips + intro as soon as AI responds
    var parsed = await chatPromise;

    // Animate chips in one by one
    var chips = Array.isArray(parsed.chips) ? parsed.chips : [];
    chipsEl.innerHTML = '';
    chips.forEach(function(chip, i) {
      var el = document.createElement('span');
      el.className = 'chat-chip';
      el.style.animationDelay = (i * 80) + 'ms';
      el.innerHTML = '<span class="chat-chip-label">' + esc(chip.label) + '</span>' + esc(chip.value);
      chipsEl.appendChild(el);
    });

    // Show intro
    if (parsed.intro) {
      introEl.textContent = parsed.intro;
    }

    // Gather all search results in parallel: keyword search + bounds search
    var [r1, r2, r3] = await searchPromise;
    var keywordResults = [].concat(Array.isArray(r1) ? r1 : [], Array.isArray(r2) ? r2 : [], Array.isArray(r3) ? r3 : []);

    // Build a list of secondary search terms to try:
    // 1. AI-extracted location (if Claude worked), 2. local-extracted term
    var searchTerms = [];
    var aiSearchQ = (parsed.searchQuery || '').trim();
    if (aiSearchQ && aiSearchQ.toLowerCase() !== q.toLowerCase()) searchTerms.push(aiSearchQ);
    var localSearchQ = extractSearchTerm(q);
    if (localSearchQ && localSearchQ.toLowerCase() !== q.toLowerCase() && localSearchQ !== aiSearchQ) searchTerms.push(localSearchQ);

    for (var si = 0; si < searchTerms.length; si++) {
      try {
        var st = searchTerms[si];
        var [rx1, rx2, rx3] = await Promise.all([
          fetch('/api/search?q=' + encodeURIComponent(st)).then(function(r){ return r.json(); }).catch(function(){ return []; }),
          fetch('/api/search/reservecalifornia?q=' + encodeURIComponent(st)).then(function(r){ return r.json(); }).catch(function(){ return []; }),
          fetch('/api/search/county?q=' + encodeURIComponent(st)).then(function(r){ return r.json(); }).catch(function(){ return []; }),
        ]);
        [].concat(Array.isArray(rx1) ? rx1 : [], Array.isArray(rx2) ? rx2 : [], Array.isArray(rx3) ? rx3 : []).forEach(function(c) {
          var k = (c.FacilityName || c.name || '').toLowerCase();
          if (!keywordResults.some(function(x) { return (x.FacilityName || x.name || '').toLowerCase() === k; })) {
            keywordResults.push(c);
          }
        });
      } catch(_) {}
    }

    // Merge nearby (bounds) results — they take priority if location is available
    var nearbyResults = await boundsPromise;
    nearbyResults = Array.isArray(nearbyResults) ? nearbyResults : [];

    var seen = {};
    var searchResults = [];

    // Add nearby first (already sorted by distance on server)
    nearbyResults.forEach(function(c) {
      var k = (c.FacilityName || c.name || '').toLowerCase();
      if (!seen[k]) { seen[k] = true; searchResults.push(c); }
    });

    // Fill in with keyword matches not already present.
    // If user location is known, skip results that are more than 250 miles away —
    // "near me" queries shouldn't return campgrounds in Oregon or Nevada.
    var MAX_DIST_MI = 250;
    var hasLocation = (_lat !== null && _lng !== null);
    keywordResults.forEach(function(c) {
      var k = (c.FacilityName || c.name || '').toLowerCase();
      if (seen[k]) return;
      if (hasLocation) {
        var lat = parseFloat(c.FacilityLatitude || c.latitude);
        var lng = parseFloat(c.FacilityLongitude || c.longitude);
        if (lat && lng && distanceMi(_lat, _lng, lat, lng) > MAX_DIST_MI) return;
      }
      seen[k] = true;
      searchResults.push(c);
    });

    // Re-sort by preference match if Claude extracted any preferences.
    // This pushes shaded/forested campgrounds to the top when shade is wanted,
    // and penalizes desert results when the user asked for shade.
    var prefs = parsed.preferences || {};
    var hasPrefs = prefs.shade || prefs.nearWater || prefs.familyAmenities || prefs.flushToilets;
    if (hasPrefs && searchResults.length > 1) {
      searchResults.sort(function(a, b) {
        return scoreResult(b, prefs) - scoreResult(a, prefs);
      });
    }

    // If keyword APIs returned nothing, use the already-in-flight discover call
    if (!searchResults.length) {
      try {
        var aiResults = await discoverPromise;
        clearTimeout(_discoverTimer);
        if (Array.isArray(aiResults) && aiResults.length) {
          searchResults = aiResults;
        }
      } catch(_) {
        // Timeout or network error — fall through to "no results" message
      }
    } else {
      // Keyword results found — cancel the discover request to save API budget
      clearTimeout(_discoverTimer);
      _discoverCtrl.abort();
    }

    // Render cards (up to 6)
    var shown = searchResults.slice(0, 6);
    if (shown.length) {
      cardsEl.innerHTML = shown.map(renderCard).join('');
      _attachCardListeners(shown);
      // Save the query so we can re-run it if user navigates away and comes back
      try { sessionStorage.setItem('home_last_query', q); } catch(_) {}
      loadPhotos(shown);
    } else {
      // Nothing found — try fetching trending/nearby campgrounds as a fallback
      try {
        var [fb1, fb2] = await Promise.all([
          fetch('/api/search?q=california+camping').then(function(r){ return r.json(); }).catch(function(){ return []; }),
          fetch('/api/search/reservecalifornia?q=california').then(function(r){ return r.json(); }).catch(function(){ return []; }),
        ]);
        var fallback = [].concat(Array.isArray(fb1) ? fb1 : [], Array.isArray(fb2) ? fb2 : []).slice(0, 6);
        if (fallback.length) {
          introEl.textContent = 'No exact matches — here are some popular California campgrounds to explore.';
          cardsEl.innerHTML = fallback.map(renderCard).join('');
          loadPhotos(fallback);
        } else {
          cardsEl.innerHTML = '<p style="color:var(--stone);font-size:14px;grid-column:1/-1">No campgrounds found. Try a specific location like "San Diego", "Big Bear", or "Yosemite".</p>';
        }
      } catch(_) {
        cardsEl.innerHTML = '<p style="color:var(--stone);font-size:14px;grid-column:1/-1">No campgrounds found. Try a specific location like "San Diego", "Big Bear", or "Yosemite".</p>';
      }
    }
  }

  // ── Campground detail overlay ─────────────────────────────────────────────

  var _overlayEl   = document.getElementById('detail-overlay');
  var _detailClose = document.getElementById('detail-close');

  function _fmtDate(ds) {
    var d = new Date(ds + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function openHomeDetail(c) {
    var overlay   = _overlayEl; if (!overlay) return;
    var nameEl    = document.getElementById('detail-name');
    var metaEl    = document.getElementById('detail-meta-row');
    var badgeEl   = document.getElementById('detail-header-right');
    var galleryEl = document.getElementById('detail-gallery');
    var summarySection = document.getElementById('detail-summary-section');
    var summaryEl = document.getElementById('detail-summary');
    var tagsEl    = document.getElementById('detail-tags');
    var availSection = document.getElementById('detail-avail-section');
    var availBtn  = document.getElementById('detail-avail-btn');
    var availRes  = document.getElementById('detail-avail-results');

    // Reset
    nameEl.textContent   = c.FacilityName || c.name || '';
    metaEl.innerHTML     = esc(c.location || c.county || c.state || '');
    badgeEl.innerHTML    = '';
    availRes.innerHTML   = '';
    summarySection.style.display = 'none';

    // Source badge
    var source = c.source || 'recreation.gov';
    if (source === 'county') {
      badgeEl.innerHTML = '<span class="detail-src-badge detail-src-county">County Park</span>';
    } else if (source === 'reservecalifornia' || source === 'reserve-california') {
      badgeEl.innerHTML = '<span class="detail-src-badge detail-src-ca">ReserveCalifornia</span>';
    } else {
      badgeEl.innerHTML = '<span class="detail-src-badge detail-src-rec">Recreation.gov</span>';
    }

    // Gallery — placeholder while loading
    galleryEl.innerHTML = '<div class="detail-gallery-placeholder"><span class="detail-gallery-placeholder-label">' + esc(c.FacilityName || c.name || '') + '</span></div>';

    // For county parks: hide availability checker, show AI summary + booking link
    if (source === 'county') {
      availSection.style.display = 'none';
      // Replace avail section with a Book button
      var bookDiv = document.getElementById('detail-county-book');
      if (!bookDiv) {
        bookDiv = document.createElement('div');
        bookDiv.id = 'detail-county-book';
        bookDiv.className = 'detail-county-book';
        availSection.parentNode.insertBefore(bookDiv, availSection.nextSibling);
      }
      bookDiv.innerHTML = '<a href="' + esc(c.bookingUrl || '#') + '" target="_blank" rel="noopener" class="btn btn-primary">Book on county website</a>';
      // Load AI summary using the park's description as seed data
      _loadHomeSummary(c);
    } else {
      // Remove county book div if present
      var old = document.getElementById('detail-county-book');
      if (old) old.remove();
      availSection.style.display = '';

      // Default dates
      var today    = new Date();
      var checkin  = new Date(today); checkin.setDate(today.getDate() + 14);
      var checkout = new Date(today); checkout.setDate(today.getDate() + 60);
      document.getElementById('detail-checkin').value  = checkin.toISOString().slice(0, 10);
      document.getElementById('detail-checkout').value = checkout.toISOString().slice(0, 10);

      availBtn.onclick = function() { _checkHomeAvailability(c); };

      // Load photo and AI summary in background
      _loadHomePhoto(c);
      _loadHomeSummary(c);
    }

    overlay.style.display = '';
    document.body.style.overflow = 'hidden';
  }

  function _loadHomePhoto(c) {
    var galleryEl = document.getElementById('detail-gallery');
    if (!galleryEl) return;
    var id = c.FacilityID || c.id;
    if (!id || c.source === 'reservecalifornia' || c.source === 'reserve-california') return;
    fetch('/api/campground/' + encodeURIComponent(id) + '/photos?source=recreation.gov')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var photos = (data && data.photos) ? data.photos : [];
        if (!photos.length) return;
        galleryEl.innerHTML = '<div class="detail-gallery-scroll">' +
          photos.slice(0, 5).map(function(p, i) {
            return '<div class="detail-gallery-item' + (i === 0 ? ' detail-gallery-main' : '') + '">' +
              '<img src="' + esc(p.url) + '" alt="" loading="' + (i === 0 ? 'eager' : 'lazy') + '" onerror="this.parentElement.style.display=\'none\'">' +
            '</div>';
          }).join('') +
        '</div>';
      })
      .catch(function() {});
  }

  function _loadHomeSummary(c) {
    var section   = document.getElementById('detail-summary-section');
    var summaryEl = document.getElementById('detail-summary');
    var tagsEl    = document.getElementById('detail-tags');
    if (!section || !summaryEl) return;

    section.style.display = '';
    summaryEl.innerHTML = '<span class="agent-shimmer" style="display:block;height:14px;margin-bottom:8px"></span>' +
                          '<span class="agent-shimmer" style="display:block;height:14px;width:65%"></span>';
    // Pre-fill static tags while AI loads (county parks have tags[])
    tagsEl.innerHTML = Array.isArray(c.tags) ? c.tags.map(function(t) {
      return '<span class="detail-chip chip-best">' + esc(t) + '</span>';
    }).join('') : '';

    var id   = c.FacilityID || c.id || '';
    var name = c.FacilityName || c.name || '';
    var state = c.state || (c.location ? c.location.split(',').pop().trim() : '');
    var desc  = c.description || '';
    var params = 'name=' + encodeURIComponent(name) + '&state=' + encodeURIComponent(state) + '&description=' + encodeURIComponent(desc.slice(0, 400));

    fetch('/api/agent/summary/' + encodeURIComponent(id) + '?' + params)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.summary) {
          summaryEl.textContent = data.summary;
        } else {
          section.style.display = 'none';
          return;
        }
        if (data.highlights && data.highlights.length) {
          tagsEl.innerHTML = data.highlights.map(function(h) {
            return '<span class="detail-chip chip-best">' + esc(h) + '</span>';
          }).join('');
        }
        if (data.crowdLevel) {
          tagsEl.innerHTML += '<span class="detail-chip chip-crowd">' + esc(data.crowdLevel) + '</span>';
        }
      })
      .catch(function() { section.style.display = 'none'; });
  }

  function _checkHomeAvailability(c) {
    var checkin  = document.getElementById('detail-checkin').value;
    var checkout = document.getElementById('detail-checkout').value;
    var nights   = parseInt(document.getElementById('detail-nights').value) || 2;
    var resultsEl = document.getElementById('detail-avail-results');
    if (!checkin || !checkout || !resultsEl) return;

    resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>Checking availability…</div>';

    var id     = c.FacilityID || c.id || '';
    var isRC   = c.source === 'reservecalifornia' || c.source === 'reserve-california';
    var reqUrl, reqOpts;

    if (isRC) {
      reqUrl  = '/api/campground/' + encodeURIComponent(id) + '/availability/rc';
      reqOpts = { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ facilityId: id, startDate: checkin, endDate: checkout, minNights: nights }) };
    } else {
      reqUrl  = '/api/campground/' + encodeURIComponent(id) + '/availability?startDate=' + checkin + '&endDate=' + checkout + '&minNights=' + nights;
      reqOpts = {};
    }

    fetch(reqUrl, reqOpts)
      .then(function(r) { return r.json(); })
      .then(function(sites) {
        if (!Array.isArray(sites) || !sites.length) {
          resultsEl.innerHTML = '<div class="detail-avail-none">No sites available for those dates.</div>';
          return;
        }
        var html = '<div class="detail-avail-found">' + sites.length + ' site' + (sites.length !== 1 ? 's' : '') + ' available</div>' +
          '<div class="detail-avail-grid">' +
          sites.slice(0, 12).map(function(s) {
            var siteId  = s.siteId || s.unitId || '';
            var bookUrl = isRC
              ? 'https://www.reservecalifornia.com/Web/Default.aspx#!park/' + (c.parkId || id) + '/unit/' + siteId
              : 'https://www.recreation.gov/camping/campsites/' + siteId;
            return '<div class="detail-avail-site">' +
              '<div class="detail-avail-site-name">' + esc(s.siteName || s.site || ('Site ' + siteId)) + '</div>' +
              '<div class="detail-avail-site-meta">' + esc(s.siteType || '') + (s.availableWindows && s.availableWindows[0] ? ' · ' + _fmtDate(s.availableWindows[0].start) : '') + '</div>' +
              '<a href="' + esc(bookUrl) + '" target="_blank" rel="noopener" class="btn btn-success btn-sm">Book Site</a>' +
            '</div>';
          }).join('') +
          '</div>';
        resultsEl.innerHTML = html;
      })
      .catch(function(e) {
        resultsEl.innerHTML = '<div class="detail-avail-none">Error checking availability. Please try again.</div>';
      });
  }

  // Close overlay
  if (_detailClose) {
    _detailClose.addEventListener('click', function() {
      _overlayEl.style.display = 'none';
      document.body.style.overflow = '';
    });
  }
  if (_overlayEl) {
    _overlayEl.addEventListener('click', function(e) {
      if (e.target === _overlayEl) {
        _overlayEl.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && _overlayEl && _overlayEl.style.display !== 'none') {
      _overlayEl.style.display = 'none';
      document.body.style.overflow = '';
    }
  });

  btn.addEventListener('click', submit);
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  // If user previously searched, re-run that query automatically on page load
  try {
    var _lastQ = sessionStorage.getItem('home_last_query');
    if (_lastQ) {
      ta.value = _lastQ;
      ta.dispatchEvent(new Event('input'));
      submit();
    }
  } catch(_) {}
})();

// ── Trending cards ────────────────────────────────────────────────────────────
(function () {
  const TRENDING = [
    {
      name: 'Palomar Mountain',
      location: 'San Diego County, CA',
      tags: ['Tree cover', 'Cool temps', 'Stargazing'],
      photo: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&q=75',
      url: '/app?tab=watch&q=Palomar+Mountain',
    },
    {
      name: 'Cuyamaca Rancho',
      location: 'Julian, CA',
      tags: ['Shade', 'Hiking', 'Oak forest'],
      photo: 'https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=600&q=75',
      url: '/app?tab=watch&q=Cuyamaca+Rancho',
    },
    {
      name: 'Anza Borrego',
      location: 'Borrego Springs, CA',
      tags: ['Desert', 'Dark skies', 'Spring blooms'],
      photo: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=600&q=75',
      url: '/app?tab=watch&q=Anza+Borrego',
    },
    {
      name: 'Lopez Lake',
      location: 'San Luis Obispo County, CA',
      tags: ['Swimming', 'Boating', 'Oak hills'],
      photo: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&q=75',
      url: '/app?tab=watch&q=Lopez+Lake',
    },
  ];

  const grid = document.getElementById('trendingGrid');
  if (!grid) return;

  grid.innerHTML = TRENDING.map(function (c) {
    const tags = c.tags.map(function (t) {
      return '<span class="trend-tag">' + t + '</span>';
    }).join('');

    return (
      '<a class="trend-card" href="' + c.url + '">' +
        '<img class="trend-card-img" src="' + c.photo + '" alt="' + c.name + '" loading="lazy" />' +
        '<div class="trend-card-body">' +
          '<div class="trend-card-name">' + c.name + '</div>' +
          '<div class="trend-card-location">' + c.location + '</div>' +
          '<div class="trend-card-tags">' + tags + '</div>' +
        '</div>' +
      '</a>'
    );
  }).join('');
})();
