(function () {
  function showError(message) {
    function display() {
      var loading = document.getElementById("loading");

      if (loading) {
        loading.hidden = false;
        loading.textContent = "Startup error: " + message;
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", display, {
        once: true
      });
    } else {
      display();
    }
  }

  window.addEventListener("error", function (event) {
    var target = event.target;

    // Resource-loading errors: report only our own scripts.
    if (target && target !== window) {
      if (target.tagName !== "SCRIPT" || !target.src) return;

      try {
        var resourceURL = new URL(target.src, location.href);

        if (resourceURL.origin !== location.origin) return;

        showError("Could not load application script: " + resourceURL.pathname);
      } catch (_) {
        // Ignore malformed external resource URLs.
      }

      return;
    }

    // Ignore execution errors explicitly attributed to external scripts.
    if (event.filename) {
      try {
        if (
          new URL(event.filename, location.href).origin !== location.origin
        ) return;
      } catch (_) {}
    }

    showError(
      (event.message || "JavaScript execution failed.") +
      (event.filename
        ? " — " + event.filename + ":" + event.lineno
        : "")
    );
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;

    showError(
      reason && reason.message
        ? reason.message
        : String(reason || "An unexpected JavaScript error occurred.")
    );
  });
})();
