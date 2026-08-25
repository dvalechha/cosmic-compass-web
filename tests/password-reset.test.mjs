import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../reset-password.html", import.meta.url), "utf8");
const script = readFileSync(
  new URL("../assets/reset-password.js", import.meta.url),
  "utf8",
);
const vendor = readFileSync(
  new URL("../vendor/supabase-2.112.4.js", import.meta.url),
);

function element(initialClasses = []) {
  const classes = new Set(initialClasses);
  return {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
    disabled: false,
    listeners: {},
    textContent: "",
    value: "",
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    },
  };
}

function pageHarness({ hash, updateResult = { error: null }, updateThrows = false }) {
  const elements = {
    heading: element(),
    "status-message": element(),
    "reset-form": element(["hidden"]),
    "form-error": element(["hidden"]),
    "submit-button": element(),
    password: element(),
    "confirm-password": element(),
  };
  const location = {
    hash,
    pathname: "/cosmic-compass-web/reset-password.html",
    search: "",
  };
  const replacedUrls = [];
  const timers = [];
  const clientOptions = [];
  let authListener;
  let signOutCalls = 0;

  const auth = {
    onAuthStateChange(listener) {
      authListener = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signOut() {
      signOutCalls += 1;
    },
    async updateUser() {
      if (updateThrows) throw new Error("raw update exception");
      return updateResult;
    },
  };
  const window = {
    history: {
      replaceState(_state, _title, url) {
        replacedUrls.push(url);
        location.hash = "";
      },
    },
    location,
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    supabase: {
      createClient(url, key, options) {
        clientOptions.push({ key, options, url });
        return { auth };
      },
    },
  };
  const document = {
    title: "Cosmic Compass — Password Reset",
    getElementById(id) {
      return elements[id];
    },
  };

  vm.runInNewContext(script, { document, window });

  return {
    authEvent(event) {
      authListener(event);
    },
    clientOptions,
    elements,
    location,
    replacedUrls,
    runTimeout() {
      timers.forEach((callback) => callback());
    },
    signOutCalls: () => signOutCalls,
    async submit() {
      await elements["reset-form"].listeners.submit({ preventDefault() {} });
    },
  };
}

test("uses only exact same-origin scripts and a verified vendored SDK", () => {
  assert.match(html, /src="\.\/vendor\/supabase-2\.112\.4\.js"/);
  assert.match(html, /integrity="sha384-ysv13JVP3fufiEXfjML9OdCa\/rRbMJvUBOWyor82wfuK8INNZAvmbxHgKIHi\+oqz"/);
  assert.doesNotMatch(html, /<script[^>]+src="https:/i);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|jsdelivr|unpkg/i);
  assert.equal(
    createHash("sha256").update(vendor).digest("hex"),
    "f8ce7fab799af1916019cbd0b485b39bb80dbdbc6dc062909a751c9e5198e04c",
  );
});

test("defines a default-deny CSP without inline execution", () => {
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "connect-src https://zmosjyybquyfrmvzbsen.supabase.co",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ]) {
    assert.match(csp, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta http-equiv="Cache-Control" content="no-store">/);
  assert.doesNotMatch(html, /<script(?![^>]+src=)/i);
});

test("contains only public Supabase client configuration", () => {
  assert.match(script, /PUBLIC_SUPABASE_URL/);
  assert.match(script, /sb_publishable_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(
    `${html}\n${script}`,
    /service_role|sb_secret_|revenuecat_webhook_secret|prokerala_client_secret|openai_api_key|anthropic_api_key/i,
  );
});

test("successful recovery clears the fragment before revealing the form", () => {
  const page = pageHarness({
    hash: "#access_token=sensitive-token&type=recovery&refresh_token=sensitive-refresh",
  });

  page.authEvent("PASSWORD_RECOVERY");

  assert.equal(page.location.hash, "");
  assert.deepEqual(page.replacedUrls, ["/cosmic-compass-web/reset-password.html"]);
  assert.equal(page.elements["reset-form"].classList.contains("hidden"), false);
  assert.equal(page.clientOptions[0].options.auth.persistSession, false);
  assert.equal(page.clientOptions[0].options.auth.flowType, "implicit");
});

test("expired recovery errors are cleared and never displayed raw", () => {
  const rawError = "sensitive upstream auth detail";
  const page = pageHarness({
    hash: `#error=access_denied&error_description=${rawError}`,
  });

  assert.equal(page.location.hash, "");
  assert.doesNotMatch(page.elements["status-message"].textContent, /sensitive|upstream/i);
  assert.match(page.elements["status-message"].textContent, /invalid or expired/i);
});

test("session establishment failure clears the fragment with stable copy", () => {
  const page = pageHarness({
    hash: "#access_token=sensitive-token&type=recovery",
  });

  page.runTimeout();

  assert.equal(page.location.hash, "");
  assert.match(page.elements["status-message"].textContent, /could not verify/i);
});

test("password validation and successful update remain functional", async () => {
  const page = pageHarness({
    hash: "#access_token=sensitive-token&type=recovery",
  });
  page.authEvent("PASSWORD_RECOVERY");
  page.elements.password.value = "new-password";
  page.elements["confirm-password"].value = "new-password";

  await page.submit();

  assert.equal(page.elements.heading.textContent, "All set!");
  assert.equal(page.signOutCalls(), 1);
  assert.equal(page.elements["reset-form"].classList.contains("hidden"), true);
});

test("password update failures never expose raw Auth errors", async () => {
  const page = pageHarness({
    hash: "#access_token=sensitive-token&type=recovery",
    updateResult: { error: { message: "raw Supabase Auth response" } },
  });
  page.authEvent("PASSWORD_RECOVERY");
  page.elements.password.value = "new-password";
  page.elements["confirm-password"].value = "new-password";

  await page.submit();

  assert.doesNotMatch(page.elements["form-error"].textContent, /raw|supabase/i);
  assert.match(page.elements["form-error"].textContent, /could not update/i);
  assert.equal(page.elements["form-error"].classList.contains("hidden"), false);
});
