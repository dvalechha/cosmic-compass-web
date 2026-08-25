# CC-SEC-009 — Password reset hardening

## Recovery flow

1. The Flutter app asks Supabase Auth to send a reset email with
   `reset-password.html` as its redirect target.
2. Supabase redirects the browser with an implicit recovery session in the URL
   fragment. Fragments are not sent to GitHub Pages or in HTTP referrers.
3. Same-origin Supabase JS establishes a non-persistent, in-memory session and
   emits `PASSWORD_RECOVERY`.
4. The page immediately removes the complete fragment with
   `history.replaceState()` before displaying the password form.
5. `updateUser` changes the password. The recovery session is signed out
   locally on success and also disappears when the isolated page closes.

No token is manually parsed, persisted, logged, placed in the DOM, or sent to
telemetry. Malformed, expired, establishment, and update failures use bounded
user-facing messages rather than raw Supabase errors.

## Dependency isolation

- `@supabase/supabase-js` is pinned to `2.112.4` and served from this repository
  as `vendor/supabase-2.112.4.js`.
- The vendored browser build came from the npm package with registry integrity
  `sha512-UiCX1udlFY1fQQrO7Z3GU7obQsju0w5Vk9mOOwalfo/+Gy+tahWVenSSuu5E/GTy/q//HxvGv2IrCdW66/61kw==`.
- Vendored UMD SHA-256:
  `f8ce7fab799af1916019cbd0b485b39bb80dbdbc6dc062909a751c9e5198e04c`.
- The HTML additionally pins the local asset with SHA-384 Subresource
  Integrity. The upstream MIT license is retained beside the asset.
- Google Fonts and all other third-party page resources were removed.

## CSP and browser controls

The page has an early meta CSP with `default-src 'none'`. Scripts/styles are
same-origin only, network connections are limited to the intended Production
Supabase origin, and objects, forms, fonts, images, frames, workers, media, and
manifests are denied. Inline script/style and `unsafe-eval` are not permitted.
The page also declares `no-referrer` and a best-effort meta `no-store` policy.

The site is currently hosted by legacy GitHub Pages from `main`. GitHub Pages
does not provide repository-controlled custom response headers. A meta CSP
cannot enforce `frame-ancestors`, and cache, `nosniff`, and Permissions Policy
are strongest as HTTP response headers. Before treating hosting-layer controls
as complete, place the site behind a header-capable host/CDN and configure:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src https://zmosjyybquyfrmvzbsen.supabase.co; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'
Cache-Control: no-store
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

A read-only header check on 2026-08-25 confirmed that GitHub Pages enforces
HTTPS/HSTS but currently serves the page with `Cache-Control: max-age=600` and
without CSP, Referrer Policy, `nosniff`, or Permissions Policy response
headers. The page-level CSP and referrer directive are therefore effective
code controls, while no-store and anti-framing remain hosting-layer gaps.

## Environment configuration

The Supabase project URL and `sb_publishable_` key are intentionally public
browser configuration, not secrets. They remain explicit because this is a
three-file static GitHub Pages project with no build-time environment pipeline.
The automated test pins the intended Production project ref
`zmosjyybquyfrmvzbsen` and rejects service-role/server-secret patterns.

## PKCE assessment

The Flutter app deliberately requests an implicit recovery link that may be
opened in a different browser/device. PKCE would require the verifier stored on
the requesting client or a redesigned app deep-link/server-assisted exchange.
That is broader than this focused hardening. The implicit flow remains, with its
bearer exposure reduced to two audited same-origin scripts and the shortest
practical fragment lifetime.

## Deployment and live verification

GitHub Pages deploys only from `main`, so merging to `develop` does not publish
this change. Before the Production release:

1. Review and promote `develop` to `main` with explicit approval.
2. Verify GitHub Pages serves the pinned JS with the expected content type and
   no unexpected redirects.
3. Confirm the Supabase Auth allowed redirect URL exactly matches the Pages
   reset URL.
4. Use a throwaway test account to exercise reset email, recovery form,
   password update, fragment removal, and post-reset login.
5. Confirm browser developer tools report no CSP violations or third-party
   requests.
6. Add the response headers above through a header-capable hosting layer.

Until steps 4–6 are completed: **LIVE PASSWORD-RECOVERY VERIFICATION PENDING**.
