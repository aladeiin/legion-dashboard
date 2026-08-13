// Site-wide gate for a Vercel Hobby (free) project, where the built-in
// paid Deployment Protection isn't available. This runs on Vercel's Edge
// Runtime in front of every request - including the static index.html
// and its own JS - before any of it is served, so it stops someone from
// reaching the dashboard (or reading its source/API key) at all, not just
// from getting past the in-app login screen.
//
// Each teammate gets their own username:password pair here (distinct
// from their actual Supabase Auth login inside the app) rather than one
// shared secret, so one person's credential leaking or a departure only
// means rotating that one pair, not the whole team's.
//
// Credentials come from a Vercel project environment variable
// (SITE_AUTH_USERS) - never hardcode them here, since this file is
// committed to the repo. If that variable is missing/empty, this fails
// CLOSED (denies everyone) rather than silently letting traffic through,
// since an unprotected proprietary-data deployment is a worse failure
// mode than a locked-out team during setup.
//
// api/whatsapp.js is excluded (see matcher below) because it's an
// inbound webhook called directly by WhatsApp/Twilio, which can't
// complete an interactive Basic Auth challenge - it already checks the
// calling origin itself where that's meaningful.

export const config = {
  matcher: ['/((?!api/whatsapp).*)'],
};

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// SITE_AUTH_USERS format: "alice:pass1,bob:pass2,admin:pass3" - one
// user:pass pair per teammate, comma-separated. A password containing a
// comma isn't supported by this format; use something else if needed.
function parseUsers(raw) {
  const pairs = {};
  (raw || '').split(',').forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const sep = trimmed.indexOf(':');
    if (sep === -1) return;
    const user = trimmed.slice(0, sep);
    const pass = trimmed.slice(sep + 1);
    if (user) pairs[user] = pass;
  });
  return pairs;
}

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Legion Realty Dashboard"' },
  });
}

export default function middleware(request) {
  const users = parseUsers(process.env.SITE_AUTH_USERS);
  const userCount = Object.keys(users).length;
  if (userCount === 0) return unauthorized();

  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch (e) {
    return unauthorized();
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return unauthorized();
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  // Every configured username is checked (not just an early match) so
  // response timing doesn't leak which usernames exist.
  let matched = false;
  for (const knownUser in users) {
    const userMatches = timingSafeEqual(user, knownUser);
    const passMatches = timingSafeEqual(pass, users[knownUser]);
    if (userMatches && passMatches) matched = true;
  }
  if (!matched) return unauthorized();
}
