const nodemailer = require('nodemailer');
const { getCredentials, ACCOUNTS } = require('./credentials');
const { getSettings } = require('./db');

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmailAlert(sites, watchItem) {
  // OAuth2 (env) takes precedence over stored SMTP credentials
  const oauthUser    = process.env.GMAIL_USER;
  const oauthRefresh = process.env.GMAIL_REFRESH_TOKEN;
  const oauthId      = process.env.GMAIL_CLIENT_ID;
  const oauthSecret  = process.env.GMAIL_CLIENT_SECRET;
  const useOAuth     = oauthUser && oauthRefresh && oauthId && oauthSecret;

  const emailCreds = useOAuth ? null : await getCredentials(ACCOUNTS.EMAIL);
  if (!useOAuth && (!emailCreds?.user || !emailCreds?.pass)) {
    console.log('[Alert] Email not configured — skipping');
    return false;
  }

  const settings     = getSettings();
  const fromAddress  = useOAuth ? oauthUser : emailCreds.user;
  const toEmail      = settings.alertEmail || fromAddress;
  const source       = watchItem.source || 'recreation.gov';
  const bookingUrl = source === 'reserve-california'
    ? `https://www.reservecalifornia.com/Web/Default.aspx/FacilityDetails/${watchItem.campground_id}`
    : `https://www.recreation.gov/camping/campgrounds/${watchItem.campground_id}`;

  const transporter = useOAuth
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type:         'OAuth2',
          user:         oauthUser,
          clientId:     oauthId,
          clientSecret: oauthSecret,
          refreshToken: oauthRefresh,
        },
      })
    : nodemailer.createTransport({
        host:   emailCreds.host || 'smtp.gmail.com',
        port:   Number(emailCreds.port) || 587,
        secure: false,
        auth:   { user: emailCreds.user, pass: emailCreds.pass },
      });

  const siteRows = sites.map(s => {
    const windows = s.availableWindows.map(w =>
      `<li>${w.start} → ${w.end} (${w.nights} night${w.nights > 1 ? 's' : ''})</li>`
    ).join('');

    const matchBadges = (s.matchReasons || []).map(r =>
      `<span style="display:inline-block;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;margin:2px">${r}</span>`
    ).join('');

    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <strong style="font-size:15px">Site ${s.siteName}</strong>
          ${s.loop ? `<span style="color:#6b7280;font-size:13px"> · ${s.loop}</span>` : ''}
          <br>
          <small style="color:#6b7280">${s.siteType || 'Standard'} · up to ${s.maxOccupants || '?'} people</small>
          ${matchBadges ? `<br><div style="margin-top:6px">${matchBadges}</div>` : ''}
        </td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <ul style="margin:0;padding-left:16px">${windows}</ul>
        </td>
      </tr>`;
  }).join('');

  // Plain-text version
  const textSites = sites.map(s => {
    const wins = s.availableWindows.map(w => `  • ${w.start} → ${w.end} (${w.nights}n)`).join('\n');
    const why  = s.matchReasons?.length ? `  Why it matches: ${s.matchReasons.join(', ')}` : '';
    return `Site ${s.siteName} [${s.loop || ''}] ${s.siteType || ''}\n${wins}${why ? '\n' + why : ''}`;
  }).join('\n\n');

  const sourceLabel = source === 'reserve-california' ? 'ReserveCalifornia' : 'Recreation.gov';

  const html = `
  <!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:620px;margin:0 auto;padding:20px;background:#f9fafb">
    <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
      <div style="background:#15803d;padding:24px;color:white">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.8;margin-bottom:6px">${sourceLabel}</div>
        <h1 style="margin:0 0 6px;font-size:22px;font-family:Georgia,serif;font-style:italic">Campsite Available</h1>
        <p style="margin:0;opacity:.9;font-size:16px">${watchItem.campground_name}</p>
      </div>

      <div style="padding:24px">
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px">Your Date Range</p>
        <p style="margin:0 0 24px;font-size:17px;font-weight:700">${watchItem.date_start} → ${watchItem.date_end}</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">SITE &amp; WHY IT MATCHES</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">AVAILABLE DATES</th>
            </tr>
          </thead>
          <tbody>${siteRows}</tbody>
        </table>

        <a href="${bookingUrl}"
           style="display:inline-block;background:#15803d;color:white;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
          Book Now →
        </a>
      </div>

      <div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
        Campsite Alert · <a href="http://localhost:3000" style="color:#6b7280">Manage alerts</a>
        · Monitoring every ${getSettings().checkIntervalMinutes || 5} minutes
      </div>
    </div>
  </body></html>`;

  await transporter.sendMail({
    from: `Campsite Alert <${fromAddress}>`,
    to: toEmail,
    subject: `Site available — ${watchItem.campground_name}`,
    text: `Campsite Available\n\n${watchItem.campground_name}\n${watchItem.date_start} → ${watchItem.date_end}\n\n${textSites}\n\nBook: ${bookingUrl}`,
    html,
  });

  console.log(`[Alert] Email → ${toEmail}`);
  return true;
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────

async function sendSMSAlert(sites, watchItem) {
  const creds = await getCredentials(ACCOUNTS.TWILIO);
  if (!creds?.accountSid || !creds?.authToken || !creds?.from || !creds?.to) {
    console.log('[Alert] Twilio not configured — skipping SMS');
    return false;
  }

  const twilio = require('twilio')(creds.accountSid, creds.authToken);
  const source = watchItem.source || 'recreation.gov';

  const first  = sites[0];
  const win    = first.availableWindows[0];
  const why    = first.matchReasons?.length ? ` ✓ ${first.matchReasons.slice(0, 3).join(', ')}` : '';
  const url    = source === 'reserve-california'
    ? `reservecalifornia.com/Web/Default.aspx/FacilityDetails/${watchItem.campground_id}`
    : `recreation.gov/camping/campgrounds/${watchItem.campground_id}`;

  // Format: fits in 160 chars
  const lines = [
    watchItem.campground_name,
    `Site ${first.siteName} · ${win.start}–${win.end} (${win.nights}n)`,
    why,
    url,
  ].filter(Boolean);

  let body = lines.join('\n');
  if (body.length > 160) {
    // Shorten campground name
    body = [
      `🏕️ ${watchItem.campground_name.slice(0, 30)}`,
      `Site ${first.siteName} · ${win.start}`,
      why.slice(0, 50),
      url,
    ].filter(Boolean).join('\n').slice(0, 160);
  }

  await twilio.messages.create({ body, from: creds.from, to: creds.to });
  console.log(`[Alert] SMS sent for ${watchItem.campground_name}`);
  return true;
}

// ── Test SMS ──────────────────────────────────────────────────────────────────

async function sendTestSMS() {
  const creds = await getCredentials(ACCOUNTS.TWILIO);
  if (!creds?.accountSid || !creds?.authToken || !creds?.from || !creds?.to) {
    throw new Error('Twilio not configured');
  }
  const twilio = require('twilio')(creds.accountSid, creds.authToken);
  await twilio.messages.create({
    body: 'CampAlong test — SMS alerts are working!',
    from: creds.from,
    to: creds.to,
  });
  return true;
}

module.exports = { sendEmailAlert, sendSMSAlert, sendTestSMS };
