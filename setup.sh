#!/bin/bash
set -e

echo ""
echo "🏕️  Campsite Alert — Setup"
echo "══════════════════════════════════════"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install it from https://nodejs.org/ (v18+ recommended)"
  exit 1
fi
NODE_VER=$(node -v)
echo "✓ Node.js $NODE_VER"

# Install dependencies
echo ""
echo "Installing dependencies…"
npm install

# Copy .env if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from .env.example"
fi

echo ""
echo "══════════════════════════════════════"
echo "✅ Setup complete!"
echo ""
echo "Start the server:"
echo "  npm start"
echo ""
echo "Then open http://localhost:3000 in your browser."
echo ""
echo "First steps:"
echo "  1. Go to Settings → enter your Recreation.gov API key"
echo "     Get one free at https://ridb.recreation.gov/"
echo "  2. Set up email alerts (Gmail + App Password)"
echo "  3. Add campgrounds on the 'Add Campground' tab"
echo "  4. Browse family-friendly picks on the 'Recommendations' tab"
echo ""
