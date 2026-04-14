#!/usr/bin/env node
/**
 * Gmail OAuth2 token helper
 * ─────────────────────────
 * Run:  node scripts/get-gmail-token.js
 *
 * Reads GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from .env,
 * opens the Google consent page in your browser, catches the
 * redirect on http://localhost:8080, exchanges the code for tokens,
 * then writes GMAIL_REFRESH_TOKEN and GMAIL_USER back into .env.
 * You never need to paste anything in the terminal.
 */

require('dotenv').config();
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(msg) { console.error('\n✗  ' + msg + '\n'); process.exit(1); }

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const u    = new URL(url);
    const req  = https.request({
      hostname: u.hostname,
      path:     u.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Bad JSON: ' + raw)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Update a single KEY=value line in .env, or append it if missing. */
function upsertEnv(envPath, key, value) {
  let src = fs.readFileSync(envPath, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(src)) {
    src = src.replace(re, `${key}=${value}`);
  } else {
    src = src.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, src, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ENV_PATH     = path.join(__dirname, '..', '.env');
const REDIRECT_URI = 'http://localhost:8080/oauth2callback';
const SCOPES       = 'https://mail.google.com/';

const clientId     = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId)     fail('GMAIL_CLIENT_ID is empty in .env — fill it in first (see comments in .env).');
if (!clientSecret) fail('GMAIL_CLIENT_SECRET is empty in .env — fill it in first.');

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth' +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n🏕️  Gmail OAuth2 setup\n');
console.log('Opening your browser to the Google consent page…');
console.log('If it does not open automatically, visit:\n');
console.log('  ' + authUrl + '\n');

// Try to open the browser (best-effort — not required)
const { exec } = require('child_process');
exec(`open "${authUrl}"`, () => {});

// ── Local callback server ─────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:8080');
  if (urlObj.pathname !== '/oauth2callback') {
    res.end('Not found'); return;
  }

  const code  = urlObj.searchParams.get('code');
  const error = urlObj.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error: ${error || 'no code returned'}</h2><p>Close this tab and try again.</p>`);
    server.close();
    fail(`Google returned an error: ${error}`);
    return;
  }

  // Exchange code → tokens
  let tokens;
  try {
    tokens = await httpsPost('https://oauth2.googleapis.com/token', {
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Token exchange failed</h2><pre>${e.message}</pre>`);
    server.close();
    fail('Token exchange failed: ' + e.message);
    return;
  }

  if (tokens.error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Token error</h2><pre>${JSON.stringify(tokens, null, 2)}</pre>`);
    server.close();
    fail('Token error: ' + tokens.error_description);
    return;
  }

  // Decode the id_token to get the user's email (without extra deps)
  let email = '';
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
      email = payload.email || '';
    } catch { /* ignore */ }
  }

  // Write into .env — no terminal pasting required
  upsertEnv(ENV_PATH, 'GMAIL_REFRESH_TOKEN', tokens.refresh_token);
  if (email) upsertEnv(ENV_PATH, 'GMAIL_USER', email);

  console.log('\n✓  Tokens received and written to .env');
  if (email) console.log(`   Gmail account: ${email}`);
  console.log('   GMAIL_REFRESH_TOKEN saved');
  console.log('\n   You can close the browser tab and restart the server.\n');

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: system-ui, sans-serif; max-width: 500px; margin: 60px auto; padding: 20px; }
      h2   { color: #15803d; }
    </style></head>
    <body>
      <h2>✓ Connected!</h2>
      <p>Gmail OAuth is configured${email ? ` for <strong>${email}</strong>` : ''}.</p>
      <p>Your refresh token has been saved to <code>.env</code>.<br>
         You can close this tab and restart the server with <code>npm start</code>.</p>
    </body>
    </html>`);

  server.close();
});

server.listen(8080, () => {
  console.log('Waiting for Google to redirect back to localhost:8080 …\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    fail('Port 8080 is already in use. Kill the process using it and try again.');
  }
  fail(e.message);
});
