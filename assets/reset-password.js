(() => {
  "use strict";

  const PUBLIC_SUPABASE_URL = "https://zmosjyybquyfrmvzbsen.supabase.co";
  const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_VRVxgzXV6ods7yu0zB2-Dw_8vhuX5QT";
  const MIN_PASSWORD_LENGTH = 6;
  const INVALID_LINK_MESSAGE =
    "This reset link is invalid or expired. Please request a new password reset email.";
  const SESSION_ERROR_MESSAGE =
    "We could not verify this reset link. Please request a new password reset email.";
  const UPDATE_ERROR_MESSAGE =
    "Could not update your password. Please request a new reset link and try again.";

  const heading = document.getElementById("heading");
  const statusMessage = document.getElementById("status-message");
  const resetForm = document.getElementById("reset-form");
  const formError = document.getElementById("form-error");
  const submitButton = document.getElementById("submit-button");

  function clearRecoveryFragment() {
    if (window.location.hash) {
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }

  function showLinkError(message) {
    heading.textContent = "Reset link unavailable";
    statusMessage.textContent = message;
    resetForm.classList.add("hidden");
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.remove("hidden");
  }

  function showSuccess() {
    heading.textContent = "All set!";
    statusMessage.textContent =
      "Your password has been reset. Head back to the Cosmic Compass app to log in.";
    resetForm.classList.add("hidden");
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    clearRecoveryFragment();
    showLinkError(SESSION_ERROR_MESSAGE);
    return;
  }

  let supabaseClient;
  try {
    supabaseClient = window.supabase.createClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: true,
          flowType: "implicit",
          persistSession: false,
        },
      },
    );
  } catch {
    clearRecoveryFragment();
    showLinkError(SESSION_ERROR_MESSAGE);
    return;
  }

  function init() {
    const fragmentHasAuthError = /(?:^|[#&])error(?:_code|_description)?=/.test(
      window.location.hash,
    );
    const fragmentLooksLikeRecovery =
      /(?:^|[#&])type=recovery(?:&|$)/.test(window.location.hash) &&
      /(?:^|[#&])access_token=/.test(window.location.hash);

    if (fragmentHasAuthError) {
      clearRecoveryFragment();
      showLinkError(INVALID_LINK_MESSAGE);
      return;
    }

    let recoveryHandled = false;
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY" || recoveryHandled) return;

      // The pinned SDK has established its in-memory recovery session before
      // emitting PASSWORD_RECOVERY, so the bearer fragment is no longer needed.
      recoveryHandled = true;
      clearRecoveryFragment();
      statusMessage.textContent = "Choose a new password for your account.";
      resetForm.classList.remove("hidden");
    });

    window.setTimeout(() => {
      if (recoveryHandled) return;

      clearRecoveryFragment();
      showLinkError(
        fragmentLooksLikeRecovery ? SESSION_ERROR_MESSAGE : INVALID_LINK_MESSAGE,
      );
    }, 3000);
  }

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.classList.add("hidden");

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password.length < MIN_PASSWORD_LENGTH) {
      showFormError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password !== confirmPassword) {
      showFormError("Passwords do not match.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Setting password…";

    try {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) {
        showFormError(UPDATE_ERROR_MESSAGE);
        return;
      }

      try {
        await supabaseClient.auth.signOut({ scope: "local" });
      } catch {
        // Password update already succeeded. The non-persistent session will
        // also disappear when this isolated page is closed.
      }
      showSuccess();
    } catch {
      showFormError(UPDATE_ERROR_MESSAGE);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Set new password";
    }
  });

  init();
})();
