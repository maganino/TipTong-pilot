/**
 * Service-worker registration + "new version" restart toast.
 *
 * Shipped from public/ so it deploys with every build; loaded by the
 * <script> tag deploy-pilot.sh injects into index.html. The deploy script
 * also sets window.__TT_BASE__ to the channel's base path ("/TipTong-pilot"
 * or "/TipTong-pilot/dev") so one file serves both channels.
 *
 * Flow: sw.js no longer calls skipWaiting() on install, so a new deploy
 * lands as a *waiting* worker. We surface that as a toast; tapping Restart
 * messages the worker to take over, and the controllerchange that follows
 * reloads the page onto the new bundle. Browsers only re-fetch sw.js on
 * navigation (SPAs rarely navigate), so we also poll for updates when the
 * tab regains focus and every 30 minutes.
 */
(function () {
  if (!("serviceWorker" in navigator)) return;

  var BASE = window.__TT_BASE__ || "/TipTong-pilot";
  var reloading = false;

  function showToast(waitingWorker) {
    if (document.getElementById("tt-update-toast")) return;
    var toast = document.createElement("div");
    toast.id = "tt-update-toast";
    toast.setAttribute("role", "status");
    toast.style.cssText =
      "position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));" +
      "transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:12px;" +
      "background:#160751;color:#fff;border:1px solid rgba(255,255,255,0.18);" +
      "border-radius:14px;padding:12px 16px;box-shadow:0 6px 24px rgba(0,0,0,0.35);" +
      "font:600 14px system-ui,sans-serif;max-width:92vw;";
    toast.innerHTML =
      '<span>New version ready</span>' +
      '<button id="tt-update-go" style="background:#2EE6A8;color:#160751;border:none;' +
      'border-radius:10px;padding:8px 14px;font:700 13px system-ui,sans-serif;cursor:pointer">' +
      "Restart</button>" +
      '<button id="tt-update-later" aria-label="Not now" style="background:none;border:none;' +
      'color:rgba(255,255,255,0.6);font:600 16px system-ui;cursor:pointer;padding:4px">✕</button>';
    document.body.appendChild(toast);
    document.getElementById("tt-update-go").addEventListener("click", function () {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    });
    document.getElementById("tt-update-later").addEventListener("click", function () {
      toast.remove();
    });
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register(BASE + "/sw.js").then(function (reg) {
      // A deploy that happened while the app was closed is already waiting.
      if (reg.waiting && navigator.serviceWorker.controller) showToast(reg.waiting);

      reg.addEventListener("updatefound", function () {
        var next = reg.installing;
        if (!next) return;
        next.addEventListener("statechange", function () {
          // "installed" with an active controller = an update, not first install.
          if (next.state === "installed" && navigator.serviceWorker.controller) {
            showToast(next);
          }
        });
      });

      var check = function () { reg.update().catch(function () {}); };
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, 30 * 60 * 1000);
    });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
})();
