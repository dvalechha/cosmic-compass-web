import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../confirmed.html", import.meta.url), "utf8");
const script = readFileSync(
  new URL("../assets/confirmation.js", import.meta.url),
  "utf8",
);

function element() {
  return { textContent: "" };
}

function pageHarness(hash, search = "") {
  const elements = {
    heading: element(),
    "status-message": element(),
  };
  const location = {
    hash,
    pathname: "/confirmed.html",
    search,
  };
  const replacedUrls = [];
  const consoleMessages = [];
  const localValues = new Map();
  const sessionValues = new Map();

  function storage(values) {
    return {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
    };
  }

  const window = {
    history: {
      replaceState(_state, _title, url) {
        replacedUrls.push(url);
        location.hash = "";
        location.search = "";
      },
    },
    localStorage: storage(localValues),
    location,
    sessionStorage: storage(sessionValues),
  };
  const document = {
    title: "Cosmic Compass — Email Confirmation",
    getElementById(id) {
      return elements[id];
    },
  };
  const console = {
    debug: (...values) => consoleMessages.push(values),
    error: (...values) => consoleMessages.push(values),
    info: (...values) => consoleMessages.push(values),
    log: (...values) => consoleMessages.push(values),
    warn: (...values) => consoleMessages.push(values),
  };

  vm.runInNewContext(script, { console, document, URLSearchParams, window });

  return {
    consoleMessages,
    elements,
    localValues,
    location,
    replacedUrls,
    sessionValues,
  };
}

test("uses same-origin assets and a default-deny CSP", () => {
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ]) {
    const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(csp, new RegExp(escaped));
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta http-equiv="Cache-Control" content="no-store">/);
  assert.match(html, /src="\.\/assets\/confirmation\.js"/);
  assert.match(html, /href="\.\/assets\/reset-password\.css"/);
  assert.doesNotMatch(html, /<script(?![^>]+src=)/i);
  assert.doesNotMatch(html, /https:|supabase/i);
});

test("successful signup confirmation renders success and cleans secrets", () => {
  const accessToken = "synthetic-access-secret";
  const refreshToken = "synthetic-refresh-secret";
  const page = pageHarness(
    `#access_token=${accessToken}&refresh_token=${refreshToken}&token_type=bearer&type=signup`,
    "?unexpected=query",
  );

  assert.equal(page.location.hash, "");
  assert.equal(page.location.search, "");
  assert.deepEqual(page.replacedUrls, ["/confirmed.html"]);
  assert.equal(page.elements.heading.textContent, "Your email is confirmed");
  assert.match(
    page.elements["status-message"].textContent,
    /return to Cosmic Compass/i,
  );
  assert.doesNotMatch(
    page.elements["status-message"].textContent,
    new RegExp(accessToken),
  );
  assert.doesNotMatch(
    page.elements["status-message"].textContent,
    new RegExp(refreshToken),
  );
  assert.equal(page.localValues.size, 0);
  assert.equal(page.sessionValues.size, 0);
  assert.deepEqual(page.consoleMessages, []);
});

test("reused or expired callback renders bounded invalid-link state", () => {
  const rawProviderMessage = "Sensitive provider detail must not be rendered";
  const page = pageHarness(
    `#error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent(rawProviderMessage)}`,
  );

  assert.equal(page.location.hash, "");
  assert.deepEqual(page.replacedUrls, ["/confirmed.html"]);
  assert.equal(
    page.elements.heading.textContent,
    "Confirmation link invalid or expired",
  );
  assert.match(
    page.elements["status-message"].textContent,
    /already been used, is invalid, or has expired/i,
  );
  assert.doesNotMatch(page.elements["status-message"].textContent, /confirmed/i);
  assert.doesNotMatch(
    page.elements["status-message"].textContent,
    /sensitive|provider/i,
  );
  assert.equal(page.localValues.size, 0);
  assert.equal(page.sessionValues.size, 0);
  assert.deepEqual(page.consoleMessages, []);
});

test("unknown provider errors fail closed without exposing raw payload", () => {
  const page = pageHarness(
    "#error=server_error&error_code=unexpected_provider_state&error_description=raw-internal-detail",
  );

  assert.equal(page.location.hash, "");
  assert.equal(page.elements.heading.textContent, "Email not confirmed");
  assert.match(page.elements["status-message"].textContent, /couldn't confirm/i);
  assert.doesNotMatch(
    page.elements["status-message"].textContent,
    /raw|internal|provider/i,
  );
});

test("incomplete success callback fails closed and removes fragment", () => {
  const page = pageHarness("#type=signup&access_token=synthetic-incomplete-secret");

  assert.equal(page.location.hash, "");
  assert.deepEqual(page.replacedUrls, ["/confirmed.html"]);
  assert.equal(page.elements.heading.textContent, "Email not confirmed");
  assert.match(page.elements["status-message"].textContent, /couldn't confirm/i);
  assert.doesNotMatch(page.elements["status-message"].textContent, /synthetic|secret/i);
});

test("missing callback never defaults to success", () => {
  const page = pageHarness("");

  assert.equal(page.elements.heading.textContent, "Email not confirmed");
  assert.match(page.elements["status-message"].textContent, /couldn't confirm/i);
  assert.deepEqual(page.replacedUrls, []);
});
