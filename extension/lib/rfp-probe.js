/**
 * Heuristic RFP probe for Pollution-mode gating.
 *
 * Extensions cannot write privacy.resistFingerprinting. LibreWolf RFP forces
 * timezone UTC and letterboxed screens. That is enough to refuse stacking.
 *
 * This is a heuristic, not a Proof gate. Proof pins about:config values
 * (docs/PROOF-PIN.md), not this probe.
 */
"use strict";

function collectRfpSignals() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const w = window.screen && window.screen.width;
  const h = window.screen && window.screen.height;
  const letterboxed =
    typeof w === "number" &&
    typeof h === "number" &&
    w % 200 === 0 &&
    h % 100 === 0;
  const utc = tz === "UTC";
  return {
    timeZone: tz,
    screen: { width: w, height: h },
    utc,
    letterboxed,
    likelyRfp: utc,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.collectRfpSignals = collectRfpSignals;
}
