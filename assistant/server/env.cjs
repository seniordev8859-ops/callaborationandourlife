const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

// The assistant's settings live in TailorBid's .env.local (the repository root), the one env file for both apps.
// Only the assistant's values (ASSISTANT_*) and the few it shares with TailorBid are loaded, not TailorBid's
// database and other secrets. They override
// existing variables on purpose, so a stale system-wide variable can't shadow them.
const FILE = path.join(__dirname, '..', '..', '.env.local');
const SHARED = ['OPENAI_API_KEY', 'NEXT_PUBLIC_ASSISTANT_URL', 'APP_URL'];
const USED = (name) => name.startsWith('ASSISTANT_') || SHARED.includes(name);

try {
  const values = parseEnv(fs.readFileSync(FILE, 'utf8'));
  for (const [name, value] of Object.entries(values)) if (USED(name)) process.env[name] = value;
} catch {
  // No .env.local: defaults, and the settings saved in Setup.
}

// The port of NEXT_PUBLIC_ASSISTANT_URL: where TailorBid's Interview Assistant button opens the app.
function port() {
  try {
    return Number(new URL(process.env.NEXT_PUBLIC_ASSISTANT_URL).port) || 4317;
  } catch {
    return 4317;
  }
}

module.exports = { FILE, PORT: port() };
