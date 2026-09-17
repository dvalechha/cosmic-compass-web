(() => {
  "use strict";

  const SUCCESS_MESSAGE =
    "Your email is confirmed. You can return to Cosmic Compass and log in.";
  const INVALID_LINK_MESSAGE =
    "This confirmation link is invalid or has expired. Please return to Cosmic Compass and request a new confirmation email if needed.";
  const GENERIC_FAILURE_MESSAGE =
    "We couldn't confirm this email from this link. Please return to Cosmic Compass and try again.";

  const heading = document.getElementById("heading");
  const statusMessage = document.getElementById("status-message");

  function clearCallbackUrl() {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname,
      );
    }
  }

  function classifyCallback(fragment) {
    const params = new URLSearchParams(fragment.replace(/^#/, ""));
    const hasAuthError =
      params.has("error") ||
      params.has("error_code") ||
      params.has("error_description");

    if (hasAuthError) {
      return params.get("error_code") === "otp_expired"
        ? "invalid"
        : "failure";
    }

    const isSignupConfirmation = params.get("type") === "signup";
    const hasCompleteSessionResult =
      params.has("access_token") && params.has("refresh_token");

    return isSignupConfirmation && hasCompleteSessionResult
      ? "success"
      : "failure";
  }

  function render(state) {
    if (state === "success") {
      heading.textContent = "Your email is confirmed";
      statusMessage.textContent = SUCCESS_MESSAGE;
      return;
    }

    if (state === "invalid") {
      heading.textContent = "Confirmation link unavailable";
      statusMessage.textContent = INVALID_LINK_MESSAGE;
      return;
    }

    heading.textContent = "Email not confirmed";
    statusMessage.textContent = GENERIC_FAILURE_MESSAGE;
  }

  let callbackFragment = window.location.hash;
  clearCallbackUrl();
  const state = classifyCallback(callbackFragment);
  callbackFragment = "";
  render(state);
})();
