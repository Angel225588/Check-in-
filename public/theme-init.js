/*
 * Sets the dark class before first paint, so the app does not flash light and
 * then swap.
 *
 * This lives in a file rather than inline in layout.tsx for one reason: an
 * inline script requires `script-src 'unsafe-inline'`, and with the roster
 * encrypted in browser storage, script injection is now the residual path to
 * guest data. One inline script was holding the whole page's CSP open.
 * See docs/GDPR-AUDIT.md section 6.
 */
(function () {
  try {
    var d = localStorage.getItem("app-dark");
    if (d === "true" || (d === null && matchMedia("(prefers-color-scheme:dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    /* storage blocked — light theme is the safe default */
  }
})();
