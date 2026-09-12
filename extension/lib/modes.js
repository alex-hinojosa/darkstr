/**
 * darkstr Phase 1 — XOR mode engine.
 *
 * Product rule (Meridian / PM):
 *   Homogeneous XOR Pollution. Never stacked.
 *   Native-Compatible is independent and does not change the mode enum.
 *
 * Homogeneous = stock LibreWolf RFP. Extension does not apply a Duppel persona.
 * Pollution   = Duppel persona path. Requires RFP off. Extension refuses to
 *               activate pollution surfaces if an RFP probe looks positive.
 */
"use strict";

/**
 * @typedef {"homogeneous"|"pollution"} DarkstrMode
 */

/**
 * Refuse any attempt to represent both modes at once.
 * Callers must pass a single enum value — never a set, never "both", never RFP+persona.
 */
function assertModeXor(mode) {
  if (mode === "homogeneous" || mode === "pollution") {
    return mode;
  }
  throw new Error(
    "darkstr.mode XOR violation: expected 'homogeneous' or 'pollution', got " +
      JSON.stringify(mode)
  );
}

/**
 * Decide which surfaces may run.
 *
 * @param {{mode: DarkstrMode, nativeCompatible: boolean, rfpLikely: boolean}} input
 */
function resolveActivation(input) {
  const mode = assertModeXor(input && input.mode);
  const nativeCompatible = !!(input && input.nativeCompatible);
  const rfpLikely = !!(input && input.rfpLikely);

  const rfpConflict = mode === "pollution" && rfpLikely;

  // Pollution surfaces (persona, DNR spoof/strip that Duppel owns, chaff).
  const pollutionActive =
    mode === "pollution" && !nativeCompatible && !rfpConflict;

  // Homogeneous: extension stays out of the fingerprint path. LibreWolf RFP owns it.
  const homogeneousActive = mode === "homogeneous";

  return {
    mode,
    nativeCompatible,
    rfpLikely,
    rfpConflict,
    pollutionActive,
    homogeneousActive,
    // Persona MAIN-world inject (Duppel bootstrap) — Phase 1 stub gate only.
    allowPersonaInject: pollutionActive,
    allowDnrTrackingRules: pollutionActive,
    allowChaff: pollutionActive,
    reason: rfpConflict
      ? "rfp_xor_pollution"
      : nativeCompatible
        ? "native_compatible"
        : mode,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.assertModeXor = assertModeXor;
  globalThis.resolveActivation = resolveActivation;
}
