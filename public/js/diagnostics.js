(function () {
  function showError(message) {
    function display() {
      var loading = document.getElementById("loading");

      if (loading) {
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

    if (target && target !== window) {
      var source = target.src || target.href;

      if (source) {
        showError("Could not load " + source);
      }

      return;
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
