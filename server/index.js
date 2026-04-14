const path = require('path');
// Explicit path so .env is always found regardless of working directory
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');

// ── Startup key checks ───────────────────────────────────────────────────────
console.log(`  [agent] key loaded: ${process.env.ANTHROPIC_API_KEY ? 'YES' : 'NO'}`);
console.log(`  [mapbox] token loaded: ${process.env.MAPBOX_TOKEN ? 'YES' : 'NO'}`);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', require('./routes'));

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  CampAlong`);
  console.log(`  http://localhost:${PORT}\n`);
  require('./monitor').startMonitoring();
});
