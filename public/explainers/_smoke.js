/* Synthetic explainer fixture for <RevealExplainer> tests (G.1.c.2).
 *
 * Mirrors the same Reveal coupling shape as bnt_explainer.js: registers
 * fragmentshown / fragmenthidden handlers, and inside each handler polls
 * the section's `.bnt-frag.visible` count to derive the current act. The
 * wrapper's job is to set/unset `.visible` on those fragment markers as
 * scroll position changes — when that handshake works, the polling sees
 * the right count and updates the DOM, which the test asserts on.
 *
 * Lives under a "_" prefix so production grep makes it obvious this is a
 * test fixture. Ships in out/ but no real route references it.
 */
(function (g) {
  "use strict";

  function syncSection(section) {
    var frags = section.querySelectorAll(".bnt-frag");
    var shown = 0;
    for (var i = 0; i < frags.length; i++) {
      if (frags[i].classList.contains("visible")) shown += 1;
    }
    var act = shown + 1;
    section.setAttribute("data-current-act", String(act));
    var display = section.querySelector('[data-role="smoke-act"]');
    if (display) display.textContent = String(act);
  }

  function syncAll() {
    var sections = document.querySelectorAll(
      '[data-bnt-explainer][data-bnt-kind="smoke"]'
    );
    for (var i = 0; i < sections.length; i++) syncSection(sections[i]);
  }

  g.SmokeExplainer = {
    attach: function (Reveal) {
      // The wrapper fires 'ready' synchronously after attach(), but cover
      // the async case for parity with bnt_explainer's `Reveal.isReady()`
      // check in case a future explainer waits.
      if (typeof Reveal.isReady === "function" && Reveal.isReady()) {
        syncAll();
      } else if (typeof Reveal.on === "function") {
        Reveal.on("ready", syncAll);
      }
      if (typeof Reveal.on === "function") {
        Reveal.on("fragmentshown", syncAll);
        Reveal.on("fragmenthidden", syncAll);
      }
    },
  };
})(window);
