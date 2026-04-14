/* ── Utilities ────────────────────────────────────────────────────────────── */

const $ = id => document.getElementById(id);

function showToast(msg, type = 'info', ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, ms);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function loading(el, text = 'Loading…') {
  el.innerHTML = `<div class="loading"><div class="spinner"></div>${text}</div>`;
}

function fmt(ds) {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Client-side tag stripper — removes <cite> and any other HTML tags injected
// by Anthropic's web_search tool before rendering text to the DOM.
function stripTagsClient(str) {
  return (str || '')
    .replace(/<cite[^>]*>([\s\S]*?)<\/cite>/gi, '$1')  // preserve cite text, strip only the tags
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ').trim();
}

/* ── Tab navigation ───────────────────────────────────────────────────────── */

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
document.addEventListener('click', e => {
  const link = e.target.closest('[data-tab-link]');
  if (link) switchTab(link.dataset.tabLink);
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`tab-${name}`)?.classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${name}"]`)?.classList.add('active');
  // Map needs a resize when the container goes from display:none → visible
  if (name === 'recommendations' && _recMap) {
    requestAnimationFrame(() => _recMap.resize());
  }
  // Restore watch/alerts tab results when switching back to it
  if (name === 'add') {
    requestAnimationFrame(_restoreWatchState);
  }
}

/* ── Credential status badges ─────────────────────────────────────────────── */

async function refreshCredentialStatus() {
  try {
    const s = await api('/credentials/status');

    // Update connection dropdown rows
    setConnRow('cr-recgov', s.recreationGov, s.recreationGov ? 'Configured' : 'Not configured');
    setConnRow('cr-email',  s.email,  s.email ? (s.gmailOAuth ? s.gmailUser || 'Connected' : 'SMTP configured') : 'Not configured');
    // ReserveCalifornia never needs credentials
    const rcRow = $('cr-reserveca');
    if (rcRow) {
      rcRow.querySelector('.cr-dot').className = 'cr-dot green';
      rcRow.querySelector('.cr-status').textContent = 'Connected';
    }

    // Overall connection dot
    const issues = [!s.recreationGov, !s.email].filter(Boolean).length;
    const dot = $('conn-dot');
    const lbl = $('conn-lbl');
    if (dot && lbl) {
      if (issues === 0) {
        dot.className = 'conn-dot green';
        lbl.textContent = 'All systems connected';
      } else if (issues === 1) {
        dot.className = 'conn-dot amber';
        lbl.textContent = '1 connection issue';
      } else {
        dot.className = 'conn-dot red';
        lbl.textContent = `${issues} connections down`;
      }
    }

    // Twilio badge in settings
    const detail = $('badge-twilio-detail');
    if (detail) {
      detail.textContent = s.twilio ? 'Configured' : 'Not configured';
      detail.className   = `badge ${s.twilio ? 'active' : 'inactive'}`;
    }

    renderGmailStatusCard(s);
  } catch (_) {}
}

function setConnRow(id, ok, text) {
  const row = $(id);
  if (!row) return;
  const dot = row.querySelector('.cr-dot');
  const status = row.querySelector('.cr-status');
  if (dot)    dot.className = `cr-dot ${ok ? 'green' : 'amber'}`;
  if (status) status.textContent = text;
}

function renderGmailStatusCard(s) {
  const card = $('gmail-status-card');
  if (!card) return;
  if (s.gmailOAuth) {
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;background:#f2f8ee;border:1px solid var(--sage);border-radius:8px;padding:14px 16px">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--forest);flex-shrink:0;margin-top:5px"></div>
        <div>
          <div style="font-weight:600;color:var(--forest)">Connected as ${escHtml(s.gmailUser)}</div>
          <div style="font-size:12px;color:var(--earth);margin-top:3px">Gmail OAuth is active — alerts will be sent via this account.</div>
          <div style="font-size:12px;color:var(--stone);margin-top:6px">To reconnect or switch accounts, run <code style="background:var(--sand);padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace">node scripts/get-gmail-token.js</code> and restart the server.</div>
        </div>
      </div>`;
  } else {
    card.innerHTML = `
      <div style="background:#fef9ec;border:1px solid #e9c46e;border-radius:8px;padding:14px 16px">
        <div style="font-weight:600;color:var(--ink);margin-bottom:8px">Gmail not connected</div>
        <ol style="margin:0 0 0 18px;line-height:1.9;font-size:13px;color:var(--earth)">
          <li>Open <code style="background:var(--sand);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">.env</code> and paste your <strong>GMAIL_CLIENT_ID</strong> and <strong>GMAIL_CLIENT_SECRET</strong></li>
          <li>Run <code style="background:var(--sand);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">node scripts/get-gmail-token.js</code> &mdash; a browser window will open</li>
          <li>Approve access &mdash; the refresh token is written to <code style="background:var(--sand);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">.env</code> automatically</li>
          <li>Restart the server with <code style="background:var(--sand);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace">npm start</code></li>
        </ol>
      </div>`;
  }
}

// Show setup banner if Rec.gov key not yet configured
async function updateSetupBanner() {
  const banner = $('setup-banner');
  if (!banner) return;
  const dismissed = sessionStorage.getItem('setup-banner-dismissed');
  if (dismissed) return;
  try {
    const s = await api('/credentials/status');
    banner.classList.toggle('show', !s.recreationGov);
  } catch (e) {}
}

// "Set up now" → navigate to Settings and scroll to API key
$('btn-setup-rec-gov').addEventListener('click', () => {
  document.querySelectorAll('nav button')[4].click();
  setTimeout(() => $('rec-gov-api-key')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
});

// Dismiss button
$('btn-dismiss-setup').addEventListener('click', () => {
  $('setup-banner').style.display = 'none';
  sessionStorage.setItem('setup-banner-dismissed', '1');
});

// Connection status dropdown toggle
(function() {
  const trigger  = document.getElementById('conn-trigger');
  const dropdown = document.getElementById('conn-dropdown');
  if (!trigger || !dropdown) return;
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  });
})();

/* ── Stats bar ────────────────────────────────────────────────────────────── */

async function loadStats() {
  try {
    const s = await api('/stats');
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('stat-watching',  s.watching);
    set('stat-available', s.availableNow);
    set('stat-checks',    s.checksToday);
    set('stat-alerts',    s.alertsSent);
  } catch (_) {}
}

// "Watch a campground" pill → switch to Watch tab
const _bGW = $('btn-goto-watch');
if (_bGW) _bGW.addEventListener('click', () => switchTab('add'));

/* ══════════════════════════════ DASHBOARD ══════════════════════════════════ */

async function loadWatchlist() {
  const container = $('watchlist-items');
  loading(container, 'Loading watchlist…');
  try {
    const items = await api('/watchlist');
    if (items.length === 0) {
      container.innerHTML = '';
      $('watchlist-empty').style.display = 'block';
      $('patterns-section').style.display = 'none';
      return;
    }
    $('watchlist-empty').style.display = 'none';
    container.innerHTML = items.map(item => renderWatchCard(item)).join('');
    loadWatchlistPhotos(items).catch(() => {});
    container.insertAdjacentHTML('beforeend', `
      <div class="watch-card watch-card-placeholder" tabindex="0"
           onclick="switchTab('add')"
           onkeydown="if(event.key==='Enter')switchTab('add')">
        <div class="placeholder-inner">
          <span class="placeholder-plus">+</span>
          <span class="placeholder-label">Watch another campground</span>
        </div>
      </div>`);
    loadPatterns(items);
  } catch (e) {
    container.innerHTML = `<p style="color:var(--red-600)">${e.message}</p>`;
  }
}

function renderWatchCard(item) {
  const src      = item.source || 'recreation.gov';
  const srcLabel = src === 'reserve-california' ? 'ReserveCalifornia' : 'Recreation.gov';

  return `
    <div class="watch-card" data-id="${item.id}" data-campground-id="${escHtml(String(item.campground_id))}" data-source="${escHtml(src)}" data-name="${escHtml(item.campground_name)}">
      <div class="watch-card-photo" id="wcp-${item.id}"></div>
      <div class="watch-card-body">
        <div class="watch-card-top">
          <span class="avail-badge badge-watching">Watching</span>
          <button class="watch-card-remove" onclick="removeWatch(${item.id})" title="Remove">&times;</button>
        </div>
        <div class="watch-card-name" onclick="openDetailByWatchItem(${item.id})">${escHtml(item.campground_name)}</div>
        <div class="watch-card-loc">${escHtml(srcLabel)}</div>
        <div class="watch-card-dates">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1.5C5.07 1.5 3.5 3.07 3.5 5v3.5L2.5 10.5h9L10.5 8.5V5C10.5 3.07 8.93 1.5 7 1.5Z" stroke="var(--stone)" stroke-width="1.2" stroke-linejoin="round"/>
            <path d="M5.5 10.5a1.5 1.5 0 003 0" stroke="var(--stone)" stroke-width="1.2"/>
          </svg>
          <span>${fmt(item.date_start)} &ndash; ${fmt(item.date_end)}</span>
        </div>
      </div>
    </div>`;
}

async function removeWatch(id) {
  try {
    await api(`/watchlist/${id}`, { method: 'DELETE' });
    showToast('Removed from watchlist', 'success');
    loadWatchlist();
  } catch (e) { showToast(e.message, 'error'); }
}

// Load photos for watchlist cards — overlays the gradient with an actual photo
async function loadWatchlistPhotos(items) {
  await Promise.allSettled(items.map(async item => {
    const wrap = $(`wcp-${item.id}`);
    if (!wrap) return;
    const src = item.source || 'recreation.gov';
    let photoUrl = null;

    // Check localStorage cache first
    const cacheKey = `photo:${item.campground_id}`;
    const cached = agentCacheGet(cacheKey);
    if (cached) {
      photoUrl = cached;
    } else if (src === 'recreation.gov') {
      try {
        const res = await api(`/campground/${encodeURIComponent(item.campground_id)}/photo?source=recreation.gov`);
        photoUrl = res.photoUrl;
        if (photoUrl) agentCacheSet(cacheKey, photoUrl);
      } catch {}
    }
    // RC campgrounds: terracotta gradient placeholder (already the card bg — no action needed)

    if (photoUrl) {
      wrap.innerHTML = `<img src="${escHtml(photoUrl)}" alt="" onerror="this.style.display='none'" loading="lazy">`;
    }
  }));
}

function openDetailByWatchItem(watchId) {
  const card = document.querySelector(`[data-id="${watchId}"]`);
  if (!card) return;
  openDetail({
    id:     card.dataset.campgroundId,
    name:   card.dataset.name,
    source: card.dataset.source || 'recreation.gov',
  });
}

$('btn-check-now').addEventListener('click', async () => {
  const btn = $('btn-check-now');
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    await api('/check-now', { method: 'POST' });
    showToast('Check triggered — alerts will arrive shortly if sites are open', 'success', 5000);
    setTimeout(loadStats, 3000);
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Check now'; }
});

/* ── Predictive patterns ──────────────────────────────────────────────────── */

async function loadPatterns(watchlistItems) {
  try {
    const allPatterns = await api('/patterns');
    if (allPatterns.length === 0) return;

    $('patterns-section').style.display = 'block';
    const list = $('patterns-list');

    list.innerHTML = allPatterns.map(p => {
      const ins = p.insights;
      return `
        <div class="pattern-card">
          <div class="pattern-card-name">${escHtml(p.name)}</div>
          <div class="pattern-card-source">${p.source === 'reserve-california' ? 'ReserveCalifornia' : 'Recreation.gov'}</div>
          ${ins.hasData ? `
            <div class="pattern-stat">
              <span class="pattern-num">${ins.avgLeadDays}</span>
              <span class="pattern-label">avg days before check-in</span>
            </div>
            <div class="pattern-stat">
              <span class="pattern-num">${ins.bestDays.join('/')}</span>
              <span class="pattern-label">best days to check</span>
            </div>
            <p class="pattern-insight">${escHtml(ins.insight)}</p>
            ${ins.startWatchDate ? `<div class="pattern-recommend">${ins.recommendation}</div>` : ''}
            <div class="pattern-events">${p.eventCount} cancellation${p.eventCount !== 1 ? 's' : ''} tracked</div>
          ` : `
            <p class="pattern-insight">${escHtml(ins.generalAdvice)}</p>
            ${ins.startWatchDate ? `<div class="pattern-recommend">${ins.recommendation}</div>` : ''}
            <div class="pattern-events">Learning — check back after more alerts</div>
          `}
        </div>`;
    }).join('');

    // Also inject inline patterns into watchlist cards
    for (const item of watchlistItems) {
      const p = allPatterns.find(x => x.campgroundId === item.campground_id);
      if (!p) continue;
      const el = $(`pattern-inline-${item.campground_id}`);
      if (!el) continue;
      const ins = p.insights;
      el.style.display = 'block';
      el.innerHTML = ins.hasData
        ? `<span class="pattern-pill">Cancellations appear ~${ins.avgLeadDays} days out &middot; Best: ${ins.bestDays[0]}</span>`
        : `<span class="pattern-pill muted">Gathering data&hellip;</span>`;
    }
  } catch (_) {}
}

/* ══════════════════════════════ ADD CAMPGROUND ═════════════════════════════ */

let selectedCampground = null;

function _restoreWatchState() {
  try {
    const si        = $('search-input');
    const container = $('search-results');
    if (!container) return;
    // Only restore if the container hasn't already been filled by a live search
    if (container.querySelector('.search-result-card, .loading')) return;

    // If homepage just ran a search, auto-run that same query here
    const mirrorQ = sessionStorage.getItem('home_last_query');
    if (mirrorQ && !sessionStorage.getItem('watch_state')) {
      if (si) { si.value = mirrorQ; setTimeout(doSearch, 50); }
      return;
    }

    const saved = JSON.parse(sessionStorage.getItem('watch_state') || 'null');
    if (!saved || !saved.html) return;
    if (si) si.value = saved.query || '';
    container.innerHTML = saved.html;
  } catch(_) {}
}

$('btn-search').addEventListener('click', doSearch);
$('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

async function doSearch() {
  const q = $('search-input').value.trim();
  if (!q) { showToast('Enter a campground name or location', 'info'); return; }

  const container = $('search-results');
  loading(container, 'Searching Recreation.gov, ReserveCalifornia, and county parks…');
  selectedCampground = null;
  $('add-form-section').style.display = 'none';

  try {
    const [recGovRes, rcRes, countyRes] = await Promise.allSettled([
      api(`/search?q=${encodeURIComponent(q)}`),
      api(`/search/reservecalifornia?q=${encodeURIComponent(q)}`),
      api(`/search/county?q=${encodeURIComponent(q)}`),
    ]);

    const recGov = recGovRes.status === 'fulfilled' ? recGovRes.value : [];
    const rc     = rcRes.status     === 'fulfilled' ? rcRes.value     : [];
    const county = countyRes.status === 'fulfilled' ? countyRes.value : [];

    // Interleave: up to 5 from each source, then remainder, deduplicated by id
    const seen = new Set();
    const results = [];
    const addIfNew = c => { if (!seen.has(String(c.id))) { seen.add(String(c.id)); results.push(c); } };
    const maxEach = 5;
    recGov.slice(0, maxEach).forEach(addIfNew);
    rc.slice(0, maxEach).forEach(addIfNew);
    county.slice(0, maxEach).forEach(addIfNew);
    recGov.slice(maxEach).forEach(addIfNew);
    rc.slice(maxEach).forEach(addIfNew);
    county.slice(maxEach).forEach(addIfNew);

    if (results.length === 0) {
      container.innerHTML = `<div style="padding:16px;font-size:14px;color:var(--stone);line-height:1.6">
        <strong style="color:var(--ink)">No results for &ldquo;${escHtml(q)}&rdquo;</strong><br>
        CampAlong searches Recreation.gov (national forests, NPS, BLM) and ReserveCalifornia (state parks). County and regional parks — like William Heise, Lake Morena, or Dos Picos — aren't in either system.<br><br>
        Try searching for a nearby state or federal campground, like <em>Cuyamaca</em> or <em>Palomar Mountain</em>.
      </div>`;
      return;
    }
    container.innerHTML =
      `<p style="font-size:12px;color:var(--stone);margin-bottom:10px">${results.length} result${results.length !== 1 ? 's' : ''} for <strong>${escHtml(q)}</strong></p>` +
      results.map(renderSearchResult).join('');
    // Persist so results survive navigating away and back
    try {
      sessionStorage.setItem('watch_state', JSON.stringify({ query: q, html: container.innerHTML }));
    } catch(_) {}
  } catch (e) {
    container.innerHTML = `<p style="color:var(--error);padding:16px">${e.message}</p>`;
  }
}

function renderSearchResult(c) {
  const srcTag = c.source === 'reserve-california' || c.source === 'reservecalifornia'
    ? '<span class="src-tag ca">ReserveCalifornia</span>'
    : c.source === 'county'
    ? '<span class="src-tag county">County Park</span>'
    : '<span class="src-tag rec">Recreation.gov</span>';

  // County parks can't be monitored — show a "Book" link instead of Select
  if (c.source === 'county') {
    const loc = escHtml(c.location || 'CA');
    return `
      <div class="search-result-card" data-id="${escHtml(String(c.id))}">
        <div>
          <div class="result-name">${escHtml(c.name)} ${srcTag}</div>
          <div class="result-meta">${loc}</div>
          ${c.description ? `<div class="result-desc">${escHtml(c.description)}</div>` : ''}
          <div style="font-size:11px;color:var(--stone);margin-top:6px">County parks aren't in Recreation.gov or ReserveCalifornia — book directly on their website.</div>
        </div>
        <a href="${escHtml(c.bookingUrl || '#')}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Book</a>
      </div>`;
  }

  return `
    <div class="search-result-card" onclick="selectCampground('${escJs(String(c.id))}', '${escJs(c.name)}', '${c.source || 'recreation.gov'}')" data-id="${c.id}">
      <div>
        <div class="result-name">${escHtml(c.name)} ${srcTag}</div>
        <div class="result-meta">${c.state || 'CA'} ${c.reservable ? '· Reservable' : ''}</div>
        ${c.description ? `<div class="result-desc">${escHtml(c.description)}</div>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm">Select</button>
    </div>`;
}

function selectCampground(id, name, source) {
  selectedCampground = { id, name, source };
  document.querySelectorAll('.search-result-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === String(id));
  });

  $('selected-campground-name').textContent = name;
  $('add-form-section').style.display = 'block';
  $('add-form-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Default dates: 2 weeks from now to 2 months from now
  const today     = new Date();
  const twoWeeks  = new Date(today); twoWeeks.setDate(today.getDate() + 14);
  const twoMonths = new Date(today); twoMonths.setDate(today.getDate() + 60);
  $('date-start').value = twoWeeks.toISOString().slice(0, 10);
  $('date-end').value   = twoMonths.toISOString().slice(0, 10);

  updatePrefSummaryInline();
}

async function updatePrefSummaryInline() {
  try {
    const p = await api('/preferences');
    const active = [
      p.shade && 'shaded',
      p.treecover && 'tree cover',
      p.nearWater && 'near water',
      p.avoidRVLoops && 'no RV loops',
      p.avoidExposed && 'no exposed sites',
      p.kidFriendlyTerrain && 'kid-friendly terrain',
      p.trailAccess && 'trail access',
      p.minOccupants > 1 && `${p.minOccupants}+ people`,
    ].filter(Boolean);
    const el = $('pref-summary-inline');
    if (el) {
      el.innerHTML = active.length
        ? `Active filters: <strong>${active.join(', ')}</strong>.`
        : 'No preference filters active — <a href="#" data-tab-link="preferences">set them up</a>.';
    }
  } catch (_) {}
}

$('btn-add-to-watchlist').addEventListener('click', async () => {
  if (!selectedCampground) { showToast('Select a campground first', 'info'); return; }

  const dateStart = $('date-start').value;
  const dateEnd   = $('date-end').value;
  if (!dateStart || !dateEnd) { showToast('Set start and end dates', 'info'); return; }
  if (dateEnd <= dateStart)   { showToast('End date must be after start date', 'error'); return; }

  const btn = $('btn-add-to-watchlist');
  btn.disabled = true; btn.textContent = 'Adding…';

  try {
    await api('/watchlist', {
      method: 'POST',
      body: {
        campground_id:   selectedCampground.id,
        campground_name: selectedCampground.name,
        date_start:      dateStart,
        date_end:        dateEnd,
        min_nights:      parseInt($('min-nights').value) || 2,
        source:          selectedCampground.source || 'recreation.gov',
        preferences:     {},  // global prefs handle filtering
      },
    });
    showToast(`Watching ${selectedCampground.name}`, 'success');
    $('add-form-section').style.display = 'none';
    $('search-results').innerHTML = '';
    $('search-input').value = '';
    selectedCampground = null;
    loadWatchlist();
    switchTab('dashboard');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '+ Add to Watchlist & Start Monitoring';
  }
});

/* ══════════════════════════════ PREFERENCES ════════════════════════════════ */

const PREF_IDS = ['treecover', 'shade', 'nearWater', 'avoidExposed', 'kidFriendlyTerrain', 'trailAccess', 'avoidRVLoops'];

async function loadPreferences() {
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
    const p = await Promise.race([api('/preferences'), timeout]);
    _prefs = p;
    PREF_IDS.forEach(k => {
      const el = $(`gp-${k}`);
      if (el) el.checked = !!p[k];
    });
    const minOcc = $('gp-minOccupants');
    if (minOcc) minOcc.value = p.minOccupants || 1;
    updatePreferencePreview(p);

    // Sync filter panel defaults with loaded preferences
    const filterWater = $('filter-water'); if (filterWater) filterWater.checked = !!p.nearWater;
    const filterShade = $('filter-shade'); if (filterShade) filterShade.checked = !!(p.shade || p.treecover);
  } catch (_) {}
}

function collectPreferences() {
  const p = {};
  PREF_IDS.forEach(k => { p[k] = !!$(`gp-${k}`)?.checked; });
  p.minOccupants = parseInt($('gp-minOccupants')?.value) || 1;
  return p;
}

// Live preview as user changes toggles
PREF_IDS.forEach(k => {
  const el = $(`gp-${k}`);
  if (el) el.addEventListener('change', () => updatePreferencePreview(collectPreferences()));
});
$('gp-minOccupants')?.addEventListener('input', () => updatePreferencePreview(collectPreferences()));

function updatePreferencePreview(p) {
  const preview = $('prefs-preview');
  const box     = $('alert-preview-box');
  if (!preview || !box) return;

  const reasons = [
    p.treecover && 'Oak tree cover',
    p.shade     && 'Shaded site (partial shade)',
    p.nearWater && 'Creek nearby',
    p.avoidRVLoops && 'Tent/standard site (not an RV loop)',
    p.kidFriendlyTerrain && 'Flat / easy terrain',
    p.trailAccess && 'Trail access',
    p.minOccupants > 1 && `Fits ${Math.max(p.minOccupants, 4)} people`,
  ].filter(Boolean);

  if (reasons.length === 0) {
    preview.style.display = 'none';
    return;
  }
  preview.style.display = 'block';

  const badges = reasons.map(r => `<span class="match-badge">${r}</span>`).join('');
  box.innerHTML = `
    <div class="preview-header"><strong>Refugio State Beach</strong> &middot; Site 23 &middot; Jun 15&ndash;17 (2 nights)</div>
    <div class="preview-why">Why it matches your preferences:</div>
    <div class="preview-badges">${badges}</div>
    <div class="preview-sms">
      <strong>SMS:</strong> Refugio State Beach<br>
      Site 23 · Jun 15–17 (2 nights)<br>
      ✓ ${reasons.slice(0, 3).join(', ')}<br>
      reservecalifornia.com/park/120085
    </div>`;
}

$('btn-save-preferences').addEventListener('click', async () => {
  const p   = collectPreferences();
  const btn = $('btn-save-preferences');
  btn.disabled = true;
  try {
    await api('/preferences', { method: 'POST', body: p });
    const msg = $('prefs-saved-msg');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2500); }
    showToast('✓ Preference profile saved', 'success');
    // Sync filter panel defaults with saved preferences
    const filterWater  = $('filter-water');  if (filterWater)  filterWater.checked  = !!p.nearWater;
    const filterShade  = $('filter-shade');  if (filterShade)  filterShade.checked  = !!(p.shade || p.treecover);
  } catch (e) { showToast(e.message, 'error'); }
  finally { btn.disabled = false; }
});

/* ══════════════════════════════ RECOMMENDATIONS ════════════════════════════ */

async function loadRegions() {
  try {
    const regions = await api('/recommendations/regions');
    const sel = $('rec-region');
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = r;
      sel.appendChild(opt);
    });
  } catch (_) {}
}

$('btn-get-recommendations').addEventListener('click', loadRecommendations);

let _recMap  = null;
let _recRecs = [];   // last loaded recs, used when switching to map view
let _prefs   = {};   // cached preferences — loaded once at init, reused everywhere

async function loadRecommendations() {
  const region = $('rec-region').value;
  if (!region) { showToast('Select a region first', 'info'); return; }

  // Use cached preferences — loaded non-blocking at init, never blocks card rendering
  const globalPrefs = _prefs;

  const params = new URLSearchParams({
    region,
    nearWater:       globalPrefs.nearWater       || false,
    shade:           globalPrefs.shade           || false,
    familyAmenities: true,   // always on by default; user can override via filter panel
  });

  // Destroy any previous map instance
  if (_recMap) { _recMap.remove(); _recMap = null; }
  _recRecs = [];

  const container = $('recommendations-results');
  loading(container, 'Finding best campgrounds…');

  try {
    const { results } = await api(`/recommendations?${params}`);
    const recs = results || [];
    if (!recs.length) {
      container.innerHTML = '<p style="color:var(--stone);padding:20px">No results. Try adjusting filters.</p>';
      return;
    }
    _recRecs = recs;

    // Render split view: list (40%) left, map (60%) right — always both visible
    container.innerHTML = `
      <div class="discover-split" id="discover-split">
        <div class="discover-list-panel" id="rec-list-view">
          <div class="sheet-handle" id="sheet-handle" onclick="document.getElementById('rec-list-view').classList.toggle('sheet-open')">
            <span class="sheet-drag-bar"></span>
            <button class="sheet-close-btn" onclick="event.stopPropagation();_closeMobileSheet()">Close</button>
          </div>
          <div class="rec-grid">${recs.map(renderRecCard).join('')}</div>
        </div>
        <div class="discover-map-panel" id="discover-map-panel">
          <div id="rec-map"></div>
          <button class="map-show-list-btn" onclick="_openMobileSheet()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 3.5h10M2 7h10M2 10.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Show list
          </button>
        </div>
      </div>`;

    // Non-blocking: AI summaries + photos
    agentEnhanceCards(recs).catch(() => {});
    loadCardPhotos(recs).catch(() => {});
    // Wire filter panel (only after first load)
    _wireFilterPanel();

    // Initialize map immediately — it's always visible in the split
    renderRecMap(recs);

  } catch (e) {
    container.innerHTML = `<p style="color:var(--error);padding:20px">${e.message}</p>`;
  }
}

// ── Mapbox GL JS map state ─────────────────────────────────────────────────
// _recMap      — the mapboxgl.Map instance
// _apiMarkers  — mapboxgl.Marker[] for Rec.gov / RC results
// _aiMarkers   — mapboxgl.Marker[] for agent-discovered results
// _markerById  — id → { marker, popup, campground } for popup updates
let _apiMarkers  = [];
let _aiMarkers   = [];
let _markerById  = {};
let _userLatLng  = null;   // { lat, lng } set when geolocation resolves

// Fetch a photo URL for a map marker (uses RIDB or agent photo search)
async function _fetchMarkerPhoto(c) {
  const cacheKey = `photo:${c.id}`;
  const cached   = agentCacheGet(cacheKey);
  if (cached) return cached;

  let url = null;
  if (c.source === 'recreation.gov' || !c.source) {
    try {
      const { photoUrl } = await api(`/campground/${encodeURIComponent(c.id)}/photo?source=recreation.gov`);
      url = photoUrl;
    } catch {}
  }
  if (!url && c.source === 'reserve-california') {
    // RC has no photo API — try agent search
    try {
      const params = new URLSearchParams({ name: c.name, state: c.state || 'CA' });
      const { photoUrl } = await api(`/agent/photo/${encodeURIComponent(c.id)}?${params}`);
      url = photoUrl;
    } catch {}
  }
  if (url) agentCacheSet(cacheKey, url);
  return url || null;
}

// Haversine distance in miles between two lat/lng points
function _distanceMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Build popup HTML for a campground marker.
// Prefers cached AI highlights; falls back to scoring reasons.
function buildMarkerPopup(c) {
  const stars  = '★'.repeat(Math.min(5, Math.round((c.score || 0) / 10))) +
                 '☆'.repeat(Math.max(0, 5 - Math.round((c.score || 0) / 10)));
  const source = c.source || 'recreation.gov';
  const idStr  = escJs(String(c.id));

  const cached   = agentCacheGet(`summary:${c.id}`);
  const tags     = (cached?.highlights || c.reasons || []).slice(0, 3);
  const tagsHtml = tags.length
    ? `<div class="rec-popup-tags">${tags.map(t => `<span class="rec-popup-tag">${escHtml(stripTagsClient(t))}</span>`).join('')}</div>`
    : '';

  const srcBadge = c.agentDiscovered
    ? `<div class="rec-popup-agent-src">AI discovered</div>`
    : '';

  // Photo (150x100) — only shown when _photoUrl is available
  const photoHtml = c._photoUrl
    ? `<div class="rec-popup-photo"><img src="${escHtml(c._photoUrl)}" alt="" onerror="this.parentElement.style.display='none'" loading="lazy"></div>`
    : '';

  // Distance from user if available
  const distHtml = c._distanceMi != null
    ? `<span class="rec-popup-dist">${c._distanceMi < 1 ? 'Nearby' : Math.round(c._distanceMi) + ' mi away'}</span>`
    : '';

  // Close all Mapbox popups then open detail page
  const closePopups = `document.querySelectorAll('.mapboxgl-popup').forEach(function(el){el.remove()})`;

  return `
    <div class="rec-popup">
      ${photoHtml}
      <div class="rec-popup-body">
        <div class="rec-popup-name">${escHtml(c.name)}</div>
        ${c.score ? `<span class="rec-popup-score">${stars}</span>` : ''}
        ${distHtml}
        ${srcBadge}
        ${tagsHtml}
        <div class="rec-popup-actions">
          <button class="rec-popup-link" onclick="${closePopups};openDetailById('${idStr}')">View Details</button>
          <button class="rec-popup-watch" onclick="${closePopups};quickWatch('${idStr}','${escJs(c.name)}','${escJs(source)}')">+ Watch</button>
        </div>
      </div>
    </div>`;
}

// Create a custom HTML marker element for a campground.
// API / RC results → solid terracotta teardrop pin (no numbers).
// Agent-discovered → outlined terracotta pin with inner dot.
function _makeMarkerEl(c) {
  const el = document.createElement('div');
  if (c.agentDiscovered) {
    el.className = 'map-marker map-marker-ai';
    el.innerHTML = `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 1C6.03 1 2 5.03 2 10c0 6.75 9 17 9 17s9-10.25 9-17c0-4.97-4.03-9-9-9z" stroke="#C4622D" stroke-width="2" fill="white"/>
      <circle cx="11" cy="10" r="3" fill="#C4622D"/>
    </svg>`;
  } else {
    el.className = 'map-marker map-marker-api';
    el.innerHTML = `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 1C6.03 1 2 5.03 2 10c0 6.75 9 17 9 17s9-10.25 9-17c0-4.97-4.03-9-9-9z" fill="#C4622D" stroke="#a3501d" stroke-width="1.5"/>
      <circle cx="11" cy="10" r="3.5" fill="white"/>
    </svg>`;
  }
  return el;
}

// Add campground markers to the Mapbox map.
// Returns markers array (caller decides which bucket to push to).
function addMarkersToMap(items) {
  if (!_recMap) return [];
  const mappable = items.filter(c => parseFloat(c.latitude) && parseFloat(c.longitude));
  const created  = [];

  mappable.forEach(c => {
    const lat = parseFloat(c.latitude);
    const lng = parseFloat(c.longitude);

    const el     = _makeMarkerEl(c);
    const popup  = new mapboxgl.Popup({ maxWidth: '300px', offset: [0, -24] })
                     .setHTML(buildMarkerPopup(c));
    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                     .setLngLat([lng, lat])
                     .setPopup(popup)
                     .addTo(_recMap);

    created.push(marker);
    _markerById[String(c.id)] = { marker, popup, campground: c, el };

    // Clicking the marker pin highlights the matching list card (map → list sync)
    el.addEventListener('click', () => _highlightCardForId(String(c.id)));

    // Async: fetch photo and refresh popup when it arrives
    if (!c._photoUrl) {
      _fetchMarkerPhoto(c).then(photoUrl => {
        if (!photoUrl) return;
        const entry = _markerById[String(c.id)];
        if (!entry) return;
        entry.campground = { ...entry.campground, _photoUrl: photoUrl };
        entry.popup.setHTML(buildMarkerPopup(entry.campground));
      }).catch(() => {});
    }
  });

  return created;
}

// Map → list sync: highlight the list card matching a marker click and scroll it into view.
// On mobile, also opens the bottom sheet so the card is visible.
function _highlightCardForId(id) {
  document.querySelectorAll('.rec-card.map-selected').forEach(el => el.classList.remove('map-selected'));
  const card = document.querySelector(`.rec-card[data-campground-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.classList.add('map-selected');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (window.innerWidth <= 768) _openMobileSheet();
}

// Mobile bottom sheet open/close
function _openMobileSheet() {
  const panel = document.getElementById('rec-list-view');
  if (panel) panel.classList.add('sheet-open');
}
function _closeMobileSheet() {
  const panel = document.getElementById('rec-list-view');
  if (panel) panel.classList.remove('sheet-open');
}

// List → map sync: pulse the marker pin matching a hovered list card.
function _highlightMarkerForId(id) {
  Object.values(_markerById).forEach(entry => entry.el?.classList.remove('marker-hover'));
  const entry = _markerById[String(id)];
  if (entry?.el) entry.el.classList.add('marker-hover');
}
function _clearMarkerHover() {
  Object.values(_markerById).forEach(entry => entry.el?.classList.remove('marker-hover'));
}

// Remove a set of markers from the map
function _clearMarkers(list) {
  list.forEach(m => m.remove());
  list.length = 0;
}

function renderRecMap(results) {
  const mapEl = document.getElementById('rec-map');

  if (!_mapboxToken) {
    mapEl.innerHTML = '<p style="padding:24px;color:var(--stone);font-size:13px">Mapbox token not set — add MAPBOX_TOKEN to .env and restart.</p>';
    return;
  }

  mapboxgl.accessToken = _mapboxToken;

  // Default: broad California view (lat 36.7, lng -119.4, zoom 6)
  // Geolocation will fly to the user if permission is granted
  _recMap = new mapboxgl.Map({
    container: 'rec-map',
    style:     'mapbox://styles/mapbox/outdoors-v12',
    center:    [-119.4, 36.7],
    zoom:      6,
  });

  // Add navigation controls (zoom +/−, compass)
  _recMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

  _apiMarkers = [];
  _aiMarkers  = [];
  _markerById = {};

  // After style loads: add markers, start geolocation, wire search button
  _recMap.on('load', () => {
    // Place API / RC markers
    _apiMarkers = addMarkersToMap(results);

    // Fit map to show all result markers — never fly to user location, which
    // would move the viewport away from the searched region.
    const mappableResults = results.filter(c => parseFloat(c.latitude) && parseFloat(c.longitude));
    if (mappableResults.length >= 2) {
      const lats = mappableResults.map(c => parseFloat(c.latitude));
      const lngs = mappableResults.map(c => parseFloat(c.longitude));
      _recMap.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, maxZoom: 10 }
      );
    } else if (mappableResults.length === 1) {
      const c = mappableResults[0];
      _recMap.flyTo({ center: [parseFloat(c.longitude), parseFloat(c.latitude)], zoom: 10 });
    }

    // Geolocation: only used to compute distances shown in popups — does NOT move the map
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          _userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Refresh popup distances now that we know user location
          Object.values(_markerById).forEach(entry => {
            const c   = entry.campground;
            const lat = parseFloat(c.latitude);
            const lng = parseFloat(c.longitude);
            if (lat && lng) {
              entry.campground = { ...c, _distanceMi: _distanceMi(_userLatLng.lat, _userLatLng.lng, lat, lng) };
              entry.popup.setHTML(buildMarkerPopup(entry.campground));
            }
          });
        },
        () => {},
        { timeout: 5000 }
      );
    }

    // Non-blocking: agent discovers campgrounds missing from APIs
    // Fires 1.5 s after load so geolocation has time to settle the view first
    setTimeout(() => {
      const b = _recMap.getBounds();
      agentDiscoverForMap({
        minLat: b.getSouth(), maxLat: b.getNorth(),
        minLng: b.getWest(),  maxLng: b.getEast(),
      }).then(discovered => {
        if (!discovered.length) return;
        const existing = new Set(_recRecs.map(r => r.name.toLowerCase().slice(0, 20)));
        const newOnes  = discovered.filter(d => !existing.has(d.name.toLowerCase().slice(0, 20)));
        if (!newOnes.length) return;
        const added = addMarkersToMap(newOnes);
        _aiMarkers.push(...added);
      }).catch(() => {});
    }, 1500);
  });

  // ── "Search this area" button ─────────────────────────────────────────────
  const searchBtn = document.createElement('button');
  searchBtn.className     = 'map-search-area-btn';
  searchBtn.textContent   = 'Search this area';
  searchBtn.style.display = 'none';
  mapEl.appendChild(searchBtn);

  let moveHandled = false;
  _recMap.on('moveend', () => {
    if (!moveHandled) return;
    searchBtn.style.display = '';
  });
  setTimeout(() => { moveHandled = true; }, 1000);

  searchBtn.addEventListener('click', async () => {
    searchBtn.disabled    = true;
    searchBtn.textContent = 'Searching…';

    const b      = _recMap.getBounds();
    const params = new URLSearchParams({
      minLat: b.getSouth(), maxLat: b.getNorth(),
      minLng: b.getWest(),  maxLng: b.getEast(),
    });

    try {
      // Queries both Rec.gov + ReserveCalifornia
      const areaResults = await api(`/search/bounds?${params}`);
      _recRecs = areaResults;

      // Clear existing markers and re-add for new viewport
      _clearMarkers(_apiMarkers);
      _clearMarkers(_aiMarkers);
      _markerById = {};
      _apiMarkers = addMarkersToMap(areaResults);

      // Sync list grid (preserve sheet handle)
      const _syncListGrid = (items) => {
        const listEl = document.getElementById('rec-list-view');
        if (!listEl) return;
        let grid = listEl.querySelector('.rec-grid');
        if (!grid) { grid = document.createElement('div'); grid.className = 'rec-grid'; listEl.appendChild(grid); }
        grid.innerHTML = items.map(renderRecCard).join('');
      };
      _syncListGrid(areaResults);

      agentEnhanceCards(areaResults).catch(() => {});
      loadCardPhotos(areaResults).catch(() => {});

      // Non-blocking: agent discovers additional campgrounds for new viewport
      agentDiscoverForMap({
        minLat: b.getSouth(), maxLat: b.getNorth(),
        minLng: b.getWest(),  maxLng: b.getEast(),
      }).then(discovered => {
        if (!discovered.length) return;
        const existing = new Set(_recRecs.map(r => r.name.toLowerCase().slice(0, 20)));
        const newOnes  = discovered.filter(d => !existing.has(d.name.toLowerCase().slice(0, 20)));
        if (!newOnes.length) return;
        const added = addMarkersToMap(newOnes);
        _aiMarkers.push(...added);
        _recRecs = [..._recRecs, ...newOnes];
        _syncListGrid(_recRecs);
        agentEnhanceCards(newOnes).catch(() => {});
        loadCardPhotos(newOnes).catch(() => {});
      }).catch(() => {});
    } catch (e) {
      showToast(e.message, 'error');
    }

    searchBtn.style.display = 'none';
    searchBtn.disabled      = false;
    searchBtn.textContent   = 'Search this area';
  });
}

function renderRecCard(c) {
  const stars  = '★'.repeat(Math.min(5, Math.round((c.score || 0) / 10))) + '☆'.repeat(Math.max(0, 5 - Math.round((c.score || 0) / 10)));
  const badges = (c.reasons || []).map(r => `<span class="tag">${r}</span>`).join('');

  // Agent-discovered cards already have their description; API cards check the
  // client-side cache first — if a summary is already known (e.g. after a filter
  // re-render), render it immediately and never show a shimmer.
  let descHtml;
  if (c.agentDiscovered) {
    descHtml = c.description ? `<div class="rec-card-desc">${escHtml(c.description)}</div>` : '';
  } else {
    const cached = agentCacheGet(`summary:${c.id}`);
    if (cached?.summary) {
      const cleanSummary = stripTagsClient(cached.summary);
      const tagsHtml = (cached.highlights || []).slice(0, 4)
        .map(h => `<span class="agent-tag">${escHtml(stripTagsClient(h))}</span>`).join('');
      descHtml = `<div class="rec-card-desc">
        <div class="agent-summary-text">${escHtml(cleanSummary)}</div>
        ${tagsHtml ? `<div class="agent-tags-row">${tagsHtml}</div>` : ''}
        <span class="agent-badge">✦ AI summary</span>
      </div>`;
    } else {
      descHtml = `<div class="rec-card-desc agent-desc-wrap" data-agent-desc="${escHtml(String(c.id))}">
          <div class="agent-shimmer"></div>
          <div class="agent-shimmer short"></div>
         </div>`;
    }
  }

  const srcLabel = c.agentDiscovered
    ? `<span class="agent-src-tag">✦ AI discovered · ${escHtml(c.source || 'web')}</span>`
    : '';

  // Photo thumbnail — hidden until loadCardPhotos() resolves with a real URL
  const photoHtml = !c.agentDiscovered
    ? `<div class="rec-card-photo-wrap" data-photo-id="${escHtml(String(c.id))}" data-photo-source="${escHtml(c.source || 'recreation.gov')}" style="display:none"></div>`
    : '';

  const idStr  = escJs(String(c.id));
  const srcStr = escJs(c.source || 'recreation.gov');
  return `
    <div class="rec-card" data-campground-id="${c.id}" data-source="${escHtml(c.source||'recreation.gov')}"
         onmouseenter="_highlightMarkerForId('${idStr}')" onmouseleave="_clearMarkerHover()">
      ${photoHtml}
      <div class="rec-card-header" style="cursor:pointer" onclick="openDetail({id:'${idStr}',name:'${escJs(c.name)}',source:'${srcStr}',latitude:'${escJs(String(c.latitude||''))}',longitude:'${escJs(String(c.longitude||''))}',state:'${escJs(c.state||'')}',score:${c.score||0}})">
        <div class="rec-card-name">${escHtml(c.name)}${srcLabel}</div>
        ${c.score ? `<span class="rec-score">${stars}</span>` : ''}
      </div>
      ${badges ? `<div class="rec-card-reasons">${badges}</div>` : ''}
      ${descHtml}
      <div class="rec-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openDetail({id:'${idStr}',name:'${escJs(c.name)}',source:'${srcStr}',latitude:'${escJs(String(c.latitude||''))}',longitude:'${escJs(String(c.longitude||''))}',state:'${escJs(c.state||'')}',score:${c.score||0}})">View Details</button>
        <button class="btn btn-sm btn-secondary" onclick="toggleSiteRecs('${idStr}','${escJs(c.name)}','${escJs(c.state||'')}',this)">Best Sites</button>
        <button class="btn btn-primary btn-sm" onclick="quickWatch('${idStr}','${escJs(c.name)}','${srcStr}')">+ Watch</button>
      </div>
      <div id="site-recs-${c.id}" style="display:none;margin-top:14px"></div>
    </div>`;
}

async function toggleSiteRecs(id, name, state, btn) {
  const container = $(`site-recs-${id}`);
  if (container.style.display !== 'none') {
    container.style.display = 'none';
    btn.textContent = 'Best Sites →';
    return;
  }
  container.style.display = 'block';
  btn.textContent = 'Hide Sites';

  // Show skeleton immediately
  container.innerHTML = `
    <div class="best-sites-loading">
      <div class="agent-shimmer" style="height:14px;width:40%;margin-bottom:10px"></div>
      <div class="agent-shimmer" style="height:70px;margin-bottom:8px"></div>
      <div class="agent-shimmer" style="height:70px"></div>
    </div>`;

  // Fire Rec.gov API sites + agent camper reviews in parallel
  const [apiRes, agentRes] = await Promise.allSettled([
    api(`/campground/${id}/sites`),
    agentGetBestSites(id, name, state),
  ]);

  const apiSites  = apiRes.status  === 'fulfilled' ? (apiRes.value  || []) : [];
  const agentData = agentRes.status === 'fulfilled' ? agentRes.value : null;

  if (!apiSites.length && !agentData?.sites?.length) {
    container.innerHTML = `<p style="font-size:12px;color:var(--stone);padding:8px 0">No site data found for this campground.</p>`;
    return;
  }

  container.innerHTML = renderUnifiedSiteCards(apiSites, agentData);
}

// Merges Rec.gov API sites + agent camper intel into compact unified cards.
// No government-labelled sections — reads like a menu, not a database dump.
function renderUnifiedSiteCards(apiSites, agentData) {
  // Build a lookup from site name/number → API site
  const apiMap = {};
  for (const s of apiSites) {
    apiMap[s.name] = s;
    // Also index by bare number ("Site 14" → "14")
    const bare = (s.name || '').replace(/^site\s*/i, '').trim();
    if (bare) apiMap[bare] = s;
  }

  const agentSites = agentData?.sites || [];
  const rendered   = new Set();

  let html = '';

  // Intro tip + source attribution
  if (agentData?.generalTips) {
    html += `
      <div class="sites-general-tip">
        <span class="agent-badge">✦ What campers say</span>
        <span class="sites-tip-text">${escHtml(stripTagsClient(agentData.generalTips))}</span>
      </div>`;
  }

  html += '<div class="sites-compact-grid">';

  // Agent sites first (richest data); merge in matching API row if found
  for (const as of agentSites) {
    const apiMatch = apiMap[as.siteNumber] || apiMap['Site ' + as.siteNumber] || null;
    html += renderCompactSiteCard(as, apiMatch);
    if (apiMatch) rendered.add(apiMatch.name);
  }

  // Any remaining API-only sites (no agent data found for them)
  for (const s of apiSites.slice(0, 6)) {
    if (rendered.has(s.name)) continue;
    html += renderCompactSiteCard(null, s);
  }

  html += '</div>';
  return html;
}

function renderCompactSiteCard(agentSite, apiSite) {
  const siteName = agentSite?.siteNumber
    ? `Site ${escHtml(agentSite.siteNumber)}`
    : escHtml(apiSite?.name || 'Site');

  const loopLabel = apiSite?.loop ? ` <span class="site-compact-loop">${escHtml(apiSite.loop)}</span>` : '';

  // Attribute chips — from agent + API
  const chips = [];
  if (agentSite?.shade)         chips.push(escHtml(agentSite.shade));
  if (agentSite?.privacy)       chips.push(`Privacy: ${escHtml(agentSite.privacy)}`);
  if (agentSite?.noise)         chips.push(escHtml(agentSite.noise));
  if (agentSite?.waterProximity) chips.push(escHtml(agentSite.waterProximity));
  if (agentSite?.views)         chips.push(escHtml(agentSite.views));
  if (apiSite?.maxOccupants)    chips.push(`Up to ${apiSite.maxOccupants} ppl`);
  if (apiSite?.type && apiSite.type !== 'STANDARD') chips.push(escHtml(apiSite.type));
  if (apiSite?.accessible)      chips.push('♿ Accessible');

  const chipsHtml = chips.length
    ? `<div class="site-compact-chips">${chips.map(c => `<span class="site-chip">${c}</span>`).join('')}</div>`
    : '';

  // Photo thumbnail (agent may provide a direct URL from The Dyrt / CampSitePhotos)
  const photoHtml = agentSite?.photoUrl
    ? `<img class="site-compact-photo" src="${escHtml(agentSite.photoUrl)}" alt="" onerror="this.style.display='none'" loading="lazy">`
    : '';

  return `
    <div class="site-compact-card">
      <div class="site-compact-top">
        <div class="site-compact-name">${siteName}${loopLabel}</div>
        ${photoHtml}
      </div>
      ${agentSite?.whyRecommended ? `<p class="site-compact-why">${escHtml(stripTagsClient(agentSite.whyRecommended))}</p>` : ''}
      ${chipsHtml}
      ${agentSite?.insiderTip ? `<div class="site-compact-tip">Tip: ${escHtml(stripTagsClient(agentSite.insiderTip))}</div>` : ''}
    </div>`;
}

/* ══════════════════════════════ CAMPGROUND DETAIL ══════════════════════════ */

// _detailCampground — the campground currently shown in the detail overlay
let _detailCampground = null;

function openDetailById(id) {
  const entry = _markerById[String(id)];
  if (entry) { openDetail(entry.campground); return; }
  // Fallback: find in _recRecs
  const rec = (_recRecs || []).find(r => String(r.id) === String(id));
  if (rec) { openDetail(rec); return; }
  openDetail({ id, name: 'Campground', source: 'recreation.gov' });
}

async function openDetail(c) {
  _detailCampground = c;
  const overlay = $('detail-overlay');
  overlay.style.display = '';
  document.body.style.overflow = 'hidden';

  // Reset sections
  $('detail-name').textContent        = c.name;
  $('detail-meta-row').innerHTML      = '';
  $('detail-header-right').innerHTML  = '';
  $('detail-gallery').innerHTML       = '<div class="detail-gallery-loading"><div class="agent-shimmer" style="height:220px;border-radius:0"></div></div>';
  $('detail-summary-section').style.display  = 'none';
  $('detail-attrs-section').style.display    = 'none';
  $('detail-sites-section').style.display    = 'none';
  $('detail-sitemap-section').style.display  = 'none';
  $('detail-reviews-section').style.display  = 'none';
  $('detail-nearby-section').style.display   = 'none';
  $('detail-avail-results').innerHTML = '';

  // Default dates
  const today     = new Date();
  const twoWeeks  = new Date(today); twoWeeks.setDate(today.getDate() + 14);
  const twoMonths = new Date(today); twoMonths.setDate(today.getDate() + 60);
  $('detail-checkin').value  = twoWeeks.toISOString().slice(0, 10);
  $('detail-checkout').value = twoMonths.toISOString().slice(0, 10);

  // Source badge + booking URL
  const isRC   = c.source === 'reserve-california';
  const srcBadge = isRC
    ? '<span class="detail-src-badge detail-src-ca">ReserveCalifornia</span>'
    : '<span class="detail-src-badge detail-src-rec">Recreation.gov</span>';
  $('detail-header-right').innerHTML = srcBadge;

  // Distance from user
  if (_userLatLng && c.latitude && c.longitude) {
    const dist = _distanceMi(_userLatLng.lat, _userLatLng.lng, parseFloat(c.latitude), parseFloat(c.longitude));
    $('detail-meta-row').innerHTML = `<span class="detail-dist">${Math.round(dist)} mi away</span>`;
  }
  if (c.state) {
    $('detail-meta-row').insertAdjacentHTML('beforeend', `<span class="detail-state">${escHtml(c.state)}</span>`);
  }

  // Wire availability checker
  $('detail-avail-btn').onclick = () => _checkDetailAvailability(c);

  // Load data in parallel (non-blocking — each section fills as it arrives)
  Promise.allSettled([
    _loadDetailPhotos(c),
    _loadDetailSummary(c),
    _loadDetailBestSites(c),
    _loadDetailReviews(c),
    _loadDetailNearby(c),
  ]);
}

async function _loadDetailPhotos(c) {
  const gallery = $('detail-gallery');
  if (!gallery) return;

  const fetchTimeout = ms => new Promise(resolve => setTimeout(() => resolve(null), ms));

  let photos = [];

  // RC has no photo API — show placeholder immediately, no waiting
  if (c.source === 'reserve-california' || c.source === 'reservecalifornia') {
    gallery.innerHTML = `<div class="detail-gallery-placeholder"><span class="detail-gallery-placeholder-label">${escHtml(c.name)}</span></div>`;
    return;
  }

  try {
    const res = await Promise.race([
      api(`/campground/${encodeURIComponent(c.id)}/photos?source=${encodeURIComponent(c.source||'recreation.gov')}`),
      fetchTimeout(5000),
    ]);
    photos = res?.photos || [];
  } catch {}

  if (!photos.length) {
    gallery.innerHTML = `<div class="detail-gallery-placeholder"><span class="detail-gallery-placeholder-label">${escHtml(c.name)}</span></div>`;
    return;
  }

  gallery.innerHTML = `
    <div class="detail-gallery-scroll">
      ${photos.map((p, i) => `
        <div class="detail-gallery-item ${i === 0 ? 'detail-gallery-main' : ''}">
          <img src="${escHtml(p.url)}" alt="${escHtml(p.title||c.name)}" onerror="this.parentElement.style.display='none'" loading="${i === 0 ? 'eager' : 'lazy'}">
          ${p.credits ? `<div class="detail-photo-credit">${escHtml(p.credits)}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

async function _loadDetailSummary(c) {
  const section = $('detail-summary-section');
  const summaryEl = $('detail-summary');
  const tagsEl    = $('detail-tags');
  const attrsEl   = $('detail-attrs');
  const attrsSection = $('detail-attrs-section');
  if (!section || !summaryEl) return;

  // Show shimmer
  section.style.display = '';
  summaryEl.innerHTML   = '<span class="agent-shimmer" style="display:block;height:16px;margin-bottom:8px"></span><span class="agent-shimmer short" style="display:block;height:16px;width:60%"></span>';

  const cacheKey = `summary:${c.id}`;
  let summary    = agentCacheGet(cacheKey);
  if (!summary) {
    try {
      const params = new URLSearchParams({ name: c.name, state: c.state || '', description: '' });
      const fetch5s = api(`/agent/summary/${encodeURIComponent(c.id)}?${params}`);
      const timeout = new Promise(resolve => setTimeout(() => resolve(null), 20000));
      summary = await Promise.race([fetch5s, timeout]);
      if (summary?.summary) agentCacheSet(cacheKey, summary);
    } catch {}
  }

  if (summary?.summary) {
    summaryEl.textContent = stripTagsClient(summary.summary);
    if (summary.highlights?.length) {
      tagsEl.innerHTML = summary.highlights.slice(0, 5)
        .map(h => `<span class="agent-tag">${escHtml(stripTagsClient(h))}</span>`).join('');
    }
    // Attribute chips
    const chips = [];
    if (summary.crowdLevel)  chips.push({ label: `Crowd: ${summary.crowdLevel}`, cls: 'chip-crowd' });
    if (summary.bestFor)     chips.push({ label: `Best for: ${summary.bestFor}`, cls: 'chip-best' });
    if (summary.hikeInOnly)  chips.push({ label: 'Hike-in only', cls: 'chip-warn' });
    if (chips.length && attrsEl) {
      attrsSection.style.display = '';
      attrsEl.innerHTML = chips.map(ch => `<span class="detail-chip ${ch.cls}">${escHtml(ch.label)}</span>`).join('');
    }
  } else if (c.description) {
    summaryEl.textContent = c.description.slice(0, 400);
  } else {
    section.style.display = 'none';
  }
}

async function _loadDetailBestSites(c) {
  const section  = $('detail-sites-section');
  const content  = $('detail-sites-content');
  if (!section || !content) return;

  section.style.display = '';
  content.innerHTML = '<div class="agent-shimmer" style="height:70px;margin-bottom:8px"></div><div class="agent-shimmer" style="height:70px"></div>';

  // Render RIDB sites immediately — never wait for the slow agent call first
  let apiSites = [];
  try {
    apiSites = await api(`/campground/${encodeURIComponent(c.id)}/sites`) || [];
  } catch {}

  if (!apiSites.length) {
    section.style.display = 'none';
  } else {
    content.innerHTML = renderUnifiedSiteCards(apiSites, null);
  }

  // Enhance with agent insights non-blocking — updates the section when ready
  agentGetBestSites(c.id, c.name, c.state).then(agentData => {
    if (!agentData?.sites?.length) return;
    const currentSection = $('detail-sites-section');
    const currentContent = $('detail-sites-content');
    if (!currentSection || !currentContent) return;
    currentSection.style.display = '';
    currentContent.innerHTML = renderUnifiedSiteCards(apiSites, agentData);
  }).catch(() => {});
}

async function _loadDetailReviews(c) {
  const section = $('detail-reviews-section');
  const content = $('detail-reviews-content');
  if (!section || !content) return;

  section.style.display = '';
  content.innerHTML = '<div class="agent-shimmer" style="height:60px;margin-bottom:8px"></div>';

  const cacheKey = `reviews:${c.id}`;
  let data = agentCacheGet(cacheKey);
  if (!data) {
    try {
      const params = new URLSearchParams({ name: c.name, state: c.state || '' });
      data = await api(`/agent/reviews/${encodeURIComponent(c.id)}?${params}`);
      if (data?.reviews?.length) agentCacheSet(cacheKey, data);
    } catch {}
  }

  if (!data?.reviews?.length) {
    section.style.display = 'none';
    return;
  }

  content.innerHTML = data.reviews.map(r => `
    <div class="detail-review">
      <p class="detail-review-quote">"${escHtml(stripTagsClient(r.quote))}"</p>
      <div class="detail-review-meta">
        <span class="detail-review-source">${escHtml(r.source || '')}</span>
        ${r.rating ? `<span class="detail-review-stars">${'★'.repeat(r.rating)}</span>` : ''}
      </div>
    </div>`).join('');
}

async function _loadDetailNearby(c) {
  const section = $('detail-nearby-section');
  const content = $('detail-nearby-content');
  if (!section || !content) return;

  section.style.display = '';
  content.innerHTML = '<div class="agent-shimmer" style="height:50px"></div>';

  const cacheKey = `nearby:${c.id}`;
  let data = agentCacheGet(cacheKey);
  if (!data) {
    try {
      const params = new URLSearchParams({ name: c.name, state: c.state || '', latitude: c.latitude || '', longitude: c.longitude || '' });
      data = await api(`/agent/nearby/${encodeURIComponent(c.id)}?${params}`);
      if (data?.nearestTown || data?.evCharging || data?.fireRestrictions) agentCacheSet(cacheKey, data);
    } catch {}
  }

  if (!data || (!data.nearestTown && !data.evCharging && !data.fireRestrictions)) {
    section.style.display = 'none';
    return;
  }

  const parts = [];
  if (data.nearestTown) {
    parts.push(`<div class="detail-nearby-row">
      <span class="detail-nearby-icon">Town</span>
      <span><strong>${escHtml(data.nearestTown.name)}</strong> — ${data.nearestTown.distanceMiles} mi${data.nearestTown.servicesNote ? ' · ' + escHtml(data.nearestTown.servicesNote) : ''}</span>
    </div>`);
  }
  if (data.evCharging) {
    const evLabel = data.evCharging.available ? `${data.evCharging.distanceMiles} mi — ${escHtml(data.evCharging.note || '')}` : 'None within range';
    parts.push(`<div class="detail-nearby-row">
      <span class="detail-nearby-icon">EV</span>
      <span>${evLabel}</span>
    </div>`);
  }
  if (data.fireRestrictions) {
    const fr = data.fireRestrictions;
    const cls = fr.level > 0 ? 'detail-fire-warn' : '';
    parts.push(`<div class="detail-nearby-row ${cls}">
      <span class="detail-nearby-icon">Fire</span>
      <span>${escHtml(fr.description)}${fr.source ? ` · ${escHtml(fr.source)}` : ''}</span>
    </div>`);
  }
  content.innerHTML = parts.join('');
}

async function _checkDetailAvailability(c) {
  const checkin  = $('detail-checkin').value;
  const checkout = $('detail-checkout').value;
  const nights   = parseInt($('detail-nights').value) || 2;
  const resultsEl = $('detail-avail-results');
  if (!checkin || !checkout || !resultsEl) return;

  resultsEl.innerHTML = '<div class="loading"><div class="spinner"></div>Checking availability…</div>';

  try {
    const isRC = c.source === 'reserve-california';
    let sites = [];

    if (isRC) {
      // ReserveCalifornia availability
      const { findAvailableSites: rcFind } = window._rcAvail || {};
      const data = await api(`/campground/${encodeURIComponent(c.id)}/availability/rc`, {
        method: 'POST',
        body: { facilityId: c.id, startDate: checkin, endDate: checkout, minNights: nights },
      }).catch(() => null);
      sites = data || [];
    } else {
      // Recreation.gov availability
      const data = await api(`/campground/${encodeURIComponent(c.id)}/availability?startDate=${checkin}&endDate=${checkout}&minNights=${nights}`).catch(() => null);
      sites = data || [];
    }

    if (!sites.length) {
      resultsEl.innerHTML = `
        <div class="detail-avail-none">
          No sites available for those dates.
          <button class="btn btn-primary btn-sm" style="margin-left:12px" onclick="quickWatch('${escJs(String(c.id))}','${escJs(c.name)}','${escJs(c.source||'recreation.gov')}')">+ Watch for openings</button>
        </div>`;
      return;
    }

    resultsEl.innerHTML = `
      <div class="detail-avail-found">${sites.length} site${sites.length !== 1 ? 's' : ''} available</div>
      <div class="detail-avail-grid">
        ${sites.slice(0, 12).map(s => {
          const siteId = s.siteId || s.unitId || '';
          const bookUrl = c.source === 'reserve-california'
            ? `https://www.reservecalifornia.com/Web/Default.aspx#!park/${c.parkId || c.id}/unit/${siteId}`
            : `https://www.recreation.gov/camping/campsites/${siteId}`;
          return `
            <div class="detail-avail-site">
              <div class="detail-avail-site-name">${escHtml(s.siteName || s.site || ('Site ' + siteId))}</div>
              <div class="detail-avail-site-meta">${s.siteType || ''} ${s.availableWindows?.[0] ? '· ' + fmt(s.availableWindows[0].start) : ''}</div>
              <a href="${escHtml(bookUrl)}" target="_blank" class="btn btn-success btn-sm">Book Site</a>
            </div>`;
        }).join('')}
      </div>`;
  } catch (e) {
    resultsEl.innerHTML = `<p style="color:var(--error)">${e.message}</p>`;
  }
}

// Close detail overlay
$('detail-close').addEventListener('click', () => {
  $('detail-overlay').style.display = 'none';
  document.body.style.overflow = '';
  _detailCampground = null;
});
// Close on backdrop click
$('detail-overlay').addEventListener('click', e => {
  if (e.target === $('detail-overlay')) {
    $('detail-overlay').style.display = 'none';
    document.body.style.overflow = '';
    _detailCampground = null;
  }
});
// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('detail-overlay').style.display !== 'none') {
    $('detail-overlay').style.display = 'none';
    document.body.style.overflow = '';
    _detailCampground = null;
  }
});

/* ══════════════════════════════ FILTER PANEL ════════════════════════════════ */

// Active filter state — all defaults
let _filters = {
  minStars: 0,
  driveInOnly: true,
  water: false,
  shade: false,
  family: true,
  flush: false,
  crowd: '',
};

function _applyFilters() {
  const all = _recRecs || [];
  return all.filter(c => {
    // Star rating
    if (_filters.minStars > 0) {
      const stars = Math.round((c.score || 0) / 10);
      if (stars < _filters.minStars) return false;
    }
    // Drive-in only (exclude hike-in cards if agent has flagged them)
    if (_filters.driveInOnly) {
      const cached = agentCacheGet(`summary:${c.id}`);
      if (cached?.hikeInOnly) return false;
    }
    // Amenity filters
    if (_filters.water && !(c.reasons || []).some(r => /water|lake|creek|river|beach/i.test(r))) return false;
    if (_filters.shade && !(c.reasons || []).some(r => /shade|tree|forest|canopy/i.test(r))) return false;
    // Crowd level (AI filter)
    if (_filters.crowd) {
      const cached = agentCacheGet(`summary:${c.id}`);
      if (cached?.crowdLevel && cached.crowdLevel !== _filters.crowd) return false;
    }
    return true;
  });
}

function _renderFilteredResults() {
  const filtered   = _applyFilters();
  const listView   = document.getElementById('rec-list-view');
  if (!listView) return;
  // Update only the grid, preserving the mobile sheet handle at the top
  let grid = listView.querySelector('.rec-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'rec-grid';
    listView.appendChild(grid);
  }
  grid.innerHTML = filtered.map(renderRecCard).join('');
  // Reload photos for visible cards
  loadCardPhotos(filtered).catch(() => {});
  // Update map markers
  if (_recMap) {
    _clearMarkers(_apiMarkers);
    _markerById = {};
    _apiMarkers = addMarkersToMap(filtered);
  }
  // Update active filter count badge
  const active = [
    _filters.minStars > 0,
    _filters.driveInOnly !== true,   // default is true, so count if changed
    _filters.water,
    _filters.shade,
    _filters.family !== true,
    _filters.flush,
    !!_filters.crowd,
  ].filter(Boolean).length;
  const label = $('filter-toggle-label');
  if (label) label.textContent = active > 0 ? `Filters (${active})` : 'Filters';
  const resetBtn = $('filter-reset-btn');
  if (resetBtn) resetBtn.style.display = active > 0 ? '' : 'none';
}

function _wireFilterPanel() {
  const panel = $('filter-panel');
  if (!panel) return;
  panel.style.display = '';

  // Toggle expand/collapse
  $('filter-toggle-btn').addEventListener('click', () => {
    const body = $('filter-panel-body');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
  });

  // Reset button
  $('filter-reset-btn').addEventListener('click', () => {
    _filters = { minStars: 0, driveInOnly: true, water: false, shade: false, family: true, flush: false, crowd: '' };
    // Reset UI
    document.querySelectorAll('#filter-stars .filter-chip').forEach(b => b.classList.toggle('active', b.dataset.val === '0'));
    const driveIn = $('filter-drive-in'); if (driveIn) driveIn.checked = true;
    const water = $('filter-water'); if (water) water.checked = false;
    const shade = $('filter-shade'); if (shade) shade.checked = false;
    const family = $('filter-family'); if (family) family.checked = true;
    const flush = $('filter-flush'); if (flush) flush.checked = false;
    document.querySelectorAll('#filter-crowd .filter-chip').forEach(b => b.classList.toggle('active', b.dataset.val === ''));
    _renderFilteredResults();
  });

  // Star rating chips
  document.querySelectorAll('#filter-stars .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filter-stars .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _filters.minStars = Number(btn.dataset.val);
      _renderFilteredResults();
    });
  });

  // Drive-in toggle
  const driveInEl = $('filter-drive-in');
  if (driveInEl) driveInEl.addEventListener('change', () => {
    _filters.driveInOnly = driveInEl.checked;
    _renderFilteredResults();
  });

  // Amenity checkboxes
  [['filter-water','water'],['filter-shade','shade'],['filter-family','family'],['filter-flush','flush']].forEach(([id, key]) => {
    const el = $(id);
    if (el) el.addEventListener('change', () => {
      _filters[key] = el.checked;
      _renderFilteredResults();
    });
  });

  // Crowd level chips (AI)
  document.querySelectorAll('#filter-crowd .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filter-crowd .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _filters.crowd = btn.dataset.val;
      _renderFilteredResults();
    });
  });
}

function quickWatch(id, name, source) {
  selectedCampground = { id, name, source };
  switchTab('add');
  // Pre-select this campground in the search
  $('selected-campground-name').textContent = name;
  $('add-form-section').style.display = 'block';
  const today    = new Date();
  const twoWeeks = new Date(today); twoWeeks.setDate(today.getDate() + 14);
  const twoMonths= new Date(today); twoMonths.setDate(today.getDate() + 60);
  $('date-start').value = twoWeeks.toISOString().slice(0, 10);
  $('date-end').value   = twoMonths.toISOString().slice(0, 10);
  $('add-form-section').scrollIntoView({ behavior: 'smooth' });
  updatePrefSummaryInline();
}

/* ══════════════════════════════ SETTINGS ════════════════════════════════════ */

async function loadSettings() {
  try {
    const s = await api('/settings');
    $('check-interval').value = s.checkIntervalMinutes || 5;
    if (s.alertEmail && $('alert-email')) $('alert-email').value = s.alertEmail;
  } catch (_) {}
}

// Show/hide toggle for the API key input
$('btn-toggle-rec-gov').addEventListener('click', () => {
  const input = $('rec-gov-api-key');
  const btn   = $('btn-toggle-rec-gov');
  const hidden = input.type === 'password';
  input.type   = hidden ? 'text' : 'password';
  btn.textContent = hidden ? 'Hide' : 'Show';
});

// Validate key against the RIDB API before (or after) saving
$('btn-validate-rec-gov').addEventListener('click', async () => {
  const apiKey = $('rec-gov-api-key').value.trim();
  const status = $('validate-status');
  const btn    = $('btn-validate-rec-gov');

  if (!apiKey) { showToast('Paste your API key first', 'info'); return; }

  btn.disabled = true;
  status.textContent = 'Checking…';
  status.style.color = '#888';

  try {
    await api('/credentials/recreation-gov/validate', { method: 'POST', body: { apiKey } });
    status.textContent = '✓ Key is valid!';
    status.style.color = '#2e7d32';
  } catch (e) {
    status.textContent = `✗ ${e.message}`;
    status.style.color = 'var(--red-600)';
  } finally {
    btn.disabled = false;
    setTimeout(() => { status.textContent = ''; }, 6000);
  }
});

$('btn-save-rec-gov').addEventListener('click', async () => {
  const apiKey = $('rec-gov-api-key').value.trim();
  if (!apiKey) { showToast('Enter your API key', 'info'); return; }
  try {
    await api('/credentials/recreation-gov', { method: 'POST', body: { apiKey } });
    showToast('✓ Recreation.gov API key saved securely', 'success');
    $('rec-gov-api-key').value = '';
    $('validate-status').textContent = '';
    updateSetupBanner();
    refreshCredentialStatus();
  } catch (e) { showToast(e.message, 'error'); }
});

$('btn-save-alert-email').addEventListener('click', async () => {
  const alertEmail = $('alert-email').value.trim();
  if (!alertEmail) { showToast('Enter a forwarding address', 'info'); return; }
  try {
    await api('/settings', { method: 'POST', body: { alertEmail } });
    showToast('✓ Forwarding address saved', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

$('btn-save-twilio').addEventListener('click', async () => {
  const body = {
    accountSid: $('twilio-sid').value.trim(),
    authToken:  $('twilio-token').value.trim(),
    from:       $('twilio-from').value.trim(),
    to:         $('twilio-to').value.trim(),
  };
  if (!body.accountSid || !body.authToken || !body.from || !body.to) {
    showToast('Fill in all four Twilio fields', 'info'); return;
  }
  try {
    await api('/credentials/twilio', { method: 'POST', body });
    showToast('✓ Twilio SMS settings saved securely', 'success');
    $('twilio-token').value = '';
    refreshCredentialStatus();
  } catch (e) { showToast(e.message, 'error'); }
});

$('btn-test-sms').addEventListener('click', async () => {
  const btn    = $('btn-test-sms');
  const result = $('sms-test-result');
  btn.disabled = true; btn.textContent = 'Sending…';
  result.style.display = 'none';
  try {
    await api('/credentials/twilio/test', { method: 'POST' });
    result.textContent = '✓ Test SMS sent!';
    result.style.cssText = 'display:inline;color:var(--green-700);font-weight:600';
  } catch (e) {
    result.textContent = `✗ ${e.message}`;
    result.style.cssText = 'display:inline;color:var(--red-600)';
  } finally {
    btn.disabled = false; btn.textContent = 'Send Test SMS';
    setTimeout(() => { result.style.display = 'none'; }, 5000);
  }
});

$('btn-save-interval').addEventListener('click', async () => {
  const val = parseInt($('check-interval').value);
  if (!val || val < 1) { showToast('Minimum 1 minute', 'info'); return; }
  try {
    await api('/settings', { method: 'POST', body: { checkIntervalMinutes: val } });
    showToast(`✓ Interval set to ${val} min (restart to apply)`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

/* ══════════════════════════════ AGENT CLIENT ═══════════════════════════════ */

// ── localStorage cache ─────────────────────────────────────────────────────
// Mirrors server cache client-side so repeated Discover searches are instant.
const _AGENT_TTL = 60 * 60 * 1000; // 1 hour
const _AGENT_PFX = 'sf:agent:v1:';

function agentCacheGet(key) {
  try {
    const raw = localStorage.getItem(_AGENT_PFX + key);
    if (!raw) return null;
    const { data, exp } = JSON.parse(raw);
    if (Date.now() > exp) { localStorage.removeItem(_AGENT_PFX + key); return null; }
    return data;
  } catch { return null; }
}

function agentCacheSet(key, data, ttl = _AGENT_TTL) {
  try {
    localStorage.setItem(_AGENT_PFX + key, JSON.stringify({ data, exp: Date.now() + ttl }));
  } catch {} // quota exceeded — silently ignore
}

// ── Feature 2: Enhance cards with AI summaries (non-blocking) ─────────────
// For each non-agent-discovered card (up to 6), fetches an AI summary and
// replaces the shimmer placeholder with real content. Re-queries the DOM
// *after* the async fetch so stale references from re-renders never cause
// silent failures.
async function agentEnhanceCards(recs) {
  const batch = (recs || []).filter(c => !c.agentDiscovered && c.id).slice(0, 6);

  await Promise.allSettled(batch.map(async c => {
    const idStr    = String(c.id);
    const cacheKey = `summary:${idStr}`;

    // ── 1. Fetch or use cached summary ──────────────────────────────────────
    let summary = agentCacheGet(cacheKey);
    if (!summary) {
      try {
        const params  = new URLSearchParams({ name: c.name, state: c.state || '' });
        const timeout = new Promise(resolve => setTimeout(() => resolve(null), 15000));
        summary = await Promise.race([
          api(`/agent/summary/${encodeURIComponent(idStr)}?${params}`),
          timeout,
        ]);
        if (summary?.summary) agentCacheSet(cacheKey, summary);
      } catch { /* fall through to fallback */ }
    }

    // ── 2. Re-query DOM after the await ─────────────────────────────────────
    const card   = document.querySelector(`.rec-card[data-campground-id="${CSS.escape(idStr)}"]`);
    if (!card) return;
    const descEl = card.querySelector('[data-agent-desc]');
    if (!descEl) return;

    // ── 3. Fallback: timeout or error → raw description, never shimmer ──────
    if (!summary?.summary) {
      descEl.removeAttribute('data-agent-desc');
      descEl.className  = 'rec-card-desc';
      descEl.innerHTML  = c.description
        ? `<div class="agent-summary-text">${escHtml(c.description.slice(0, 300))}</div>`
        : '';
      return;
    }

    // ── 4. Hike-in detection → hide card or badge it ────────────────────────
    const lc = (summary.summary || '').toLowerCase();
    const isHikeIn = summary.hikeInOnly ||
      /\b(hike|walk|trail|pack).?in\b|accessible only by trail|no vehicle access|backpack.only/.test(lc);
    if (isHikeIn) {
      const familyOn = document.getElementById('rec-pref-family')?.checked;
      if (familyOn) { card.style.display = 'none'; return; }
      const header = card.querySelector('.rec-card-header');
      if (header && !header.querySelector('.hike-in-badge')) {
        header.insertAdjacentHTML('beforeend', '<span class="hike-in-badge">Hike-in only</span>');
      }
    }

    // ── 5. Render summary into the card ─────────────────────────────────────
    const text = escHtml(
      stripTagsClient(summary.summary).replace(/^Overview[:\s]+/i, '').trim()
    );
    const tags = (summary.highlights || []).slice(0, 4)
      .map(h => `<span class="agent-tag">${escHtml(stripTagsClient(h))}</span>`).join('');

    descEl.removeAttribute('data-agent-desc');
    descEl.className = 'rec-card-desc';
    descEl.innerHTML =
      `<div class="agent-summary-text">${text}</div>` +
      (tags ? `<div class="agent-tags-row">${tags}</div>` : '') +
      `<span class="agent-badge">✦ AI summary</span>`;

    // ── 6. Refresh Mapbox popup with AI highlights ───────────────────────────
    const entry = _markerById[idStr];
    if (entry) {
      entry.campground = { ...entry.campground, reasons: summary.highlights || entry.campground.reasons };
      entry.popup.setHTML(buildMarkerPopup(entry.campground));
    }

    // ── 7. Show crowd filter chip group once summaries start arriving ────────
    const aiGroup = document.getElementById('filter-ai-group');
    if (aiGroup) aiGroup.style.display = '';
  }));
}

// ── Photo loader: fetches campground photos and injects into rec cards ────────
async function loadCardPhotos(recs) {
  const apiRecs = (recs || []).filter(c => !c.agentDiscovered && c.id);
  await Promise.allSettled(apiRecs.map(async c => {
    const idStr = String(c.id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const wrap  = document.querySelector(`[data-photo-id="${idStr}"]`);
    if (!wrap) return;
    try {
      const source = c.source || 'recreation.gov';
      const { photoUrl } = await api(`/campground/${encodeURIComponent(c.id)}/photo?source=${encodeURIComponent(source)}`);
      if (photoUrl) {
        wrap.style.display = '';
        wrap.innerHTML = `<img class="rec-card-photo" src="${escHtml(photoUrl)}" alt="" onerror="this.parentElement.style.display='none'" loading="lazy">`;
      }
      // No photo found — wrap stays hidden (display:none from HTML)
    } catch {
      // Leave hidden on error
    }
  }));
}

// ── Feature 3: Get best sites via agent (with localStorage cache) ──────────
async function agentGetBestSites(id, name, state) {
  const key = `best-sites:${id}`;
  let data  = agentCacheGet(key);
  if (data) return data;

  const params  = new URLSearchParams({ name, state: state || '' });
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 20000));
  data = await Promise.race([
    api(`/agent/best-sites/${encodeURIComponent(id)}?${params}`),
    timeout,
  ]);
  if (data?.sites?.length) agentCacheSet(key, data);
  return data;
}

// ── Feature 1: Discover campgrounds for map (with localStorage cache) ──────
async function agentDiscoverForMap({ minLat, maxLat, minLng, maxLng }) {
  const key = `discover:${Number(minLat).toFixed(3)}:${Number(maxLat).toFixed(3)}:${Number(minLng).toFixed(3)}:${Number(maxLng).toFixed(3)}`;
  let data  = agentCacheGet(key);
  if (data) return data;

  const params = new URLSearchParams({ minLat, maxLat, minLng, maxLng });
  data = await api(`/agent/discover?${params}`);
  if (Array.isArray(data) && data.length) agentCacheSet(key, data);
  return Array.isArray(data) ? data : [];
}

/* ══════════════════════════════ INIT ════════════════════════════════════════ */

let _mapboxToken = '';

(async function init() {
  const _p = new URLSearchParams(window.location.search);
  const _tabParam = _p.get('tab') || '';
  const _tabMap = {discover:'recommendations',watch:'add',alerts:'add',preferences:'preferences',settings:'settings'};
  if (_tabParam) switchTab(_tabMap[_tabParam] || _tabParam);
  // Highlight the active nav link
  document.querySelectorAll('.nav-link').forEach(function(a) {
    a.classList.toggle('active', a.dataset.nav === _tabParam);
  });
  // If arriving from homepage search, render stored results into Discover tab
  if (_tabParam === 'discover' && _p.get('q')) {
    const _stored = sessionStorage.getItem('campSearchResults');
    if (_stored) {
      try {
        sessionStorage.removeItem('campSearchResults');
        const _sr = JSON.parse(_stored);
        if (_sr.results && _sr.results.length) {
          _recRecs = _sr.results;
          const _rc = $('recommendations-results');
          if (_rc) {
            _rc.innerHTML = '<div class="rec-grid">' + _sr.results.map(renderRecCard).join('') + '</div>';
            agentEnhanceCards(_sr.results).catch(function(){});
            loadCardPhotos(_sr.results).catch(function(){});
          }
        }
      } catch(_e) {}
    }
  }
  // Task 4: auto-run watch tab search when ?tab=watch&q= present
  if (_p.get('q') && _tabParam === 'watch') {
    const si = document.getElementById('search-input');
    if (si) { si.value = _p.get('q'); setTimeout(doSearch, 150); }
  } else if (_tabParam === 'watch' || !_tabParam) {
    // Restore previous watch results if returning without a new query
    _restoreWatchState();
  }
  const results = await Promise.allSettled([
    api('/config'),           // index 0 — Mapbox token + other public config
    loadWatchlist(),
    loadPreferences(),
    loadSettings(),
    loadRegions(),
    refreshCredentialStatus(),
    updateSetupBanner(),
    loadStats(),
  ]);
  if (results[0].status === 'fulfilled') {
    _mapboxToken = results[0].value?.mapboxToken || '';
  }

  // Deep-link: ?open=ID&name=NAME&source=SOURCE opens the detail overlay directly
  // Used when navigating from homepage result cards
  const _openId = _p.get('open');
  if (_openId) {
    openDetail({
      id:        _openId,
      name:      _p.get('name')   || 'Campground',
      source:    _p.get('source') || 'recreation.gov',
      latitude:  _p.get('lat')   || '',
      longitude: _p.get('lng')   || '',
      state:     _p.get('state') || '',
    });
  }
})();
