// Runs in the MAIN world so it can patch page-context prototypes.
// The isolated content.js toggles data-tvt-keep-playing on <html> to
// activate/deactivate the intercept without any cross-world messaging.
(function () {
  const orig = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    if (document.documentElement.hasAttribute("data-tvt-keep-playing")) return;
    return orig.call(this);
  };
})();
