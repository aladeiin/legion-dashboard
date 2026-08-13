// Site-wide gate for a Vercel Hobby (free) project, where the built-in
// paid Deployment Protection isn't available. This runs on Vercel's Edge
// Runtime in front of every request - including the static index.html
// and its own JS - before any of it is served, so it stops someone from
// reaching the dashboard (or reading its source/API key) at all, not just
// from getting past the in-app login screen (which is client-side only
// and was never a real access boundary).
//
// Credentials come from Vercel project environment variables
// (SITE_AUTH_USER / SITE_AUTH_PASS) - never hardcode them here, since
// this file is committed to the repo. If those variables aren't set,
// this fails CLOSED (denies everyone) rather than silently letting
// traffic through, since an unprotected proprietary-data deployment is a
// worse failure mode than a locked-out team during setup.
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

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Legion Realty Dashboard"' },
  });
}

export default function middleware(request) {
  const expectedUser = process.env.SITE_AUTH_USER || '';
  const expectedPass = process.env.SITE_AUTH_PASS || '';
  if (!expectedUser || !expectedPass) return unauthorized();

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

  if (!timingSafeEqual(user, expectedUser) || !timingSafeEqual(pass, expectedPass)) {
    return unauthorized();
  }
}
