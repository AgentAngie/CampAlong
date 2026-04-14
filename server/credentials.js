// Encrypts credentials with AES-256-GCM using a machine-stable key.
// Key is derived from a random secret seeded once at first run and stored
// in ~/.campsite-alert-key (chmod 600).  Credentials are stored in
// data/credentials.enc.json — both files together are needed to decrypt.
//
// This avoids any native dependencies (keytar) while keeping secrets off disk
// in plaintext.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEY_FILE = path.join(os.homedir(), '.campsite-alert-key');
const CREDS_FILE = path.join(__dirname, '..', 'data', '.credentials.enc.json');

function getMasterKey() {
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  }
  // First run: generate a 256-bit random key
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

function encrypt(plaintext) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(ciphertext) {
  const key = getMasterKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveStore(store) {
  // Ensure data dir exists
  const dir = path.dirname(CREDS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

const ACCOUNTS = {
  RECREATION_GOV: 'recreation.gov',
  RESERVE_CALIFORNIA: 'reservecalifornia.com',
  EMAIL: 'email-config',
  TWILIO: 'twilio-config',
};

async function saveCredentials(account, credentials) {
  const store = loadStore();
  store[account] = encrypt(JSON.stringify(credentials));
  saveStore(store);
}

async function getCredentials(account) {
  const store = loadStore();
  if (!store[account]) return null;
  try {
    return JSON.parse(decrypt(store[account]));
  } catch (_) {
    return null;
  }
}

async function deleteCredentials(account) {
  const store = loadStore();
  delete store[account];
  saveStore(store);
}

module.exports = { saveCredentials, getCredentials, deleteCredentials, ACCOUNTS };
