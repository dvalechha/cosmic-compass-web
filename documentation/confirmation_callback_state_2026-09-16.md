# Email confirmation callback-state hardening

## Scope

The confirmation landing page now treats the Supabase callback fragment as
untrusted, short-lived input. It distinguishes a complete implicit signup
result, Supabase's bounded `otp_expired` result, and all malformed or unknown
states. Unknown input fails closed instead of displaying confirmation success.
The bounded `otp_expired` copy explains that the link may already have been
used, may be invalid, or may have expired because Supabase does not reliably
distinguish those cases.

The page remains informational. It does not initialize Supabase, establish a
browser session, call application APIs, or write auth state to storage.

## Token hygiene

The callback fragment is read once and immediately removed from the visible URL
with `history.replaceState()`. Synthetic tests assert that access and refresh
token values are not placed in page content, console output, local storage, or
session storage. Provider error descriptions are never rendered.

The page uses same-origin CSS and JavaScript under a default-deny meta CSP. It
also declares no-referrer and best-effort no-store policies. GitHub Pages does
not provide repository-controlled response headers, so a header-capable host or
CDN remains the stronger long-term control for cache, anti-framing, `nosniff`,
and Permissions Policy headers.

## Compatibility and release

Older app builds may request the legacy GitHub Pages URL. GitHub Pages redirects
that host to `reset.valorg.app` while preserving the callback fragment, so the
same canonical page handles direct and legacy callbacks.

This change requires review and explicit promotion to the Production `main`
branch before it becomes live. No Supabase configuration change is required.

## Validation completed

- The complete web suite passes: 14 tests, including six confirmation tests.
- `assets/confirmation.js` passes Node's static syntax check.
- `git diff --check` reports no whitespace errors.
- A focused secret-pattern scan found only intentionally synthetic callback
  values in tests and no real credentials.
- Local browser checks covered complete signup success, `otp_expired`, and an
  incomplete callback. Each state removed its fragment and rendered the
  expected bounded copy.
- The invalid/expired state was visually checked at a 390 × 844 mobile
  viewport, and the browser console remained empty.
