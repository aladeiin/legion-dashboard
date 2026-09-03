# Working notes for Claude Code on this repo

Distilled from the session that built Supabase Auth+RLS, the AI extraction
("Showaround") feature, Managed Coworking, and several bug fixes. Read this
before starting new work here.

## Standing process rules (explicit, repeated instructions)

- **Branch discipline.** Develop on the branch named in the session's task
  instructions (has been `claude/dashboard-upload-bulk-properties-mx3uo6`).
  Never push to a different branch or merge to `main` without the user
  explicitly confirming it first - not implied, not inferred from "done"
  about something else.
- **Schema changes gate the merge, not the commit.** If work depends on new
  Supabase columns, commit/push the code freely, but do not merge to `main`
  until the user has explicitly confirmed the SQL was run in Supabase.
  Merging first breaks production - PostgREST rejects inserts that
  reference unknown columns. Deliver the SQL as a file, wait for
  confirmation (a bare "done" after sending schema SQL means "I ran it").
- **Testing bar is high, stated repeatedly and explicitly.** "Rigorous
  testing" means: write a test that specifically tries to trigger the
  reported failure mode, not just a happy-path check. Don't claim a fix
  works, don't say "100% confident," and don't merge anything until the
  test has actually been run and passed - not reasoned about.
- **Reproduce against the real input before hypothesizing.** When a user
  reports a document/file that extracted wrong, read the actual file
  first (Read tool handles PDFs directly) rather than guessing what might
  be in it. The Weikfield PDF bug was root-caused correctly on the first
  try specifically because the real PDF was read before touching the
  prompt.
- **A wave of new test failures is not proof of a regression.** Compare
  against a clean baseline before concluding something broke: check test
  infrastructure liveness first (see gotchas below), and if needed,
  temporarily swap `index.html` back to the previous commit and re-run the
  same failing tests to see if they were already broken.

## User preferences (explicit choices, apply by default)

- **Auth identity = real work email address**, not app-generated
  usernames. Chosen explicitly when asked to clarify the Supabase Auth
  migration.
- **On a large/ambiguous build spec, ask 1-2 scoping questions before
  building**, each with one option clearly marked "(Recommended)." This
  user has picked the recommended option every time asked - default to
  proposing the recommended path rather than building the maximal
  interpretation unprompted.
- **Exactly one login prompt, total.** Layered auth (edge gate + in-app
  login) reads as broken UX to this user even when each layer once had a
  real justification. When a deeper layer (RLS) already covers the
  original security need, remove the redundant outer layer rather than
  keeping both "just in case."
- **Never invent or approximate missing data, especially coordinates.**
  Stated as a hard, repeated rule for the coworking import: exclude a
  record entirely rather than guess its lat/lng. Treat this as the
  default posture for any data-integrity tradeoff in this app, not just
  that one import.

## Environment / technical gotchas (save future debugging time)

- **This sandbox cannot fetch from arbitrary external hosts.** Outbound
  requests to company websites, Wikimedia, Clearbit, even the open-source
  Simple Icons repo are policy-denied; only a small allowlist plus GitHub
  raw content is reachable. Check `$HTTPS_PROXY/__agentproxy/status` (its
  `recentRelayFailures`) immediately when a fetch fails, instead of
  guessing at alternate hosts one by one. Real logo/brand-asset sourcing
  from the open web is not possible from inside an agent session here -
  it needs either user-supplied files/URLs or an admin-upload UI.
- **The container is ephemeral and clones fresh from GitHub every
  session.** Nothing outside the git repo (local `.claude/` config,
  scratch files, background processes) survives to the next session.
  Anything meant to persist must be committed to the repo - this file
  included.
- **The Playwright test static file servers die between sessions.** Tests
  in `<scratchpad>/test_*.js` hit `python3 -m http.server` instances on
  fixed ports (8931-8949 as of this writing, grep test files for the
  current set) serving the repo root. These do not persist across
  environment boundaries. When a previously-clean regression run suddenly
  shows many `ERR_CONNECTION_REFUSED` / ~30 failures at once, restart the
  dead servers first, before doing any deeper diagnosis - this exact false
  alarm happened twice in one session.
- **`npm install <pkg> --no-save` inside the test scratchpad's `cdn/`
  mirror silently prunes other "extraneous" packages**, breaking other
  tests' local library mirrors. Every package the mirror needs (exceljs,
  pdfjs-dist, leaflet, xlsx, etc.) must be declared as a real dependency in
  `cdn/package.json`, then installed with a plain `npm install`.
- **Playwright's `page.route()` matches in reverse registration order.** A
  later, broader route can silently shadow an earlier, more specific one
  for HTTP methods it wasn't even meant to handle (a catch-all
  POST/PATCH/DELETE mock swallowing GET too, returning an empty body).
  Register one handler per URL pattern that branches on
  `route.request().method()`, not multiple layered `page.route()` calls
  for the same pattern.
- **CSV files must be read as text, not bytes.**
  `XLSX.read(bytes, {type:'array'})` on a `.csv` File does not auto-detect
  UTF-8 and corrupts multi-byte characters (e.g. "°" becomes "Â°").
  Always do `XLSX.read(await file.text(), {type:'string'})` for `.csv`;
  keep the `arrayBuffer`/`type:'array'` path only for real binary
  `.xlsx`/`.xls`.
- **Several CSS classes are shared generic button styles reused across
  many different panels/forms**: `.ep-save`, `.ep-cancel`, `.cbtn` are the
  ones that have already caused test breakage. Adding a new modal/form
  that reuses one of these silently breaks any Playwright test using an
  unscoped selector for it (wrong element matched, or an ambiguous
  match that resolves to the wrong one). When writing a new test against
  a class like this, scope the selector to a parent id
  (e.g. `#workspace-overlay .ep-save`). When adding new UI, expect this to
  bite existing tests and grep for the class's other usages first.

## Architecture quick-reference

- Single-file vanilla-JS SPA (`index.html`) + Vercel serverless functions
  (`api/extract.js`, `api/whatsapp.js`) + Supabase (Postgres/PostgREST/
  Auth/Storage). No build step.
- Auth: Supabase Auth (email/password) + RLS keyed off
  `auth.jwt()->>'email'` matched against `team_users` (roles: admin/
  editor, no passwords stored in `team_users` itself).
- `insertProperty`/`patchProperty`/`insertMarketSpace`/`bulkInsertProperties`
  all retry up to 10x, stripping one missing column per attempt on a
  PostgREST "could not find column" error - this is why a missing-column
  bug looks like "too many blank fields" instead of an outright failure.
- AI extraction (`api/extract.js` proxies to the Anthropic Messages API)
  is split into two independent calls: text fields (small, fixed-size,
  `buildTextExtractPrompt()`) and photos/floor-plans/inclusions (scales
  with document size, `buildMediaExtractPrompt()`) - so a truncation or
  misclassification in one never blocks the other.
- Managed Coworking spaces are regular `properties` rows with
  `space_type='Managed'`, not a separate table - reuses the existing map/
  filter/card/edit infrastructure.
