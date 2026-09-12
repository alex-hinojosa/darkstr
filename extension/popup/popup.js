"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;
const modeHint = document.getElementById("modeHint");
const nativeCompatible = document.getElementById("nativeCompatible");
const conflict = document.getElementById("conflict");
const prefsLine = document.getElementById("prefsLine");

function paint(state) {
  if (!state || !state.prefs) return;
  const mode = state.prefs["darkstr.mode"];
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.checked = el.value === mode;
  });
  nativeCompatible.checked = state.prefs["darkstr.nativeCompatible"] === true;
  const act = state.activation || {};
  conflict.classList.toggle("hidden", !act.rfpConflict);
  modeHint.textContent = act.rfpConflict
    ? "Pollution gated: RFP XOR Pollution."
    : act.nativeCompatible
      ? "Native-Compatible on — persona/DNR/chaff stay off."
      : mode === "pollution"
        ? "Pollution armed. Persona bootstrap is still a Phase 1 port (not injected)."
        : "Homogeneous. LibreWolf RFP owns the fingerprint path.";
  prefsLine.textContent =
    "darkstr.mode=" + mode +
    " · darkstr.nativeCompatible=" + String(state.prefs["darkstr.nativeCompatible"] === true);
}

async function refresh() {
  const state = await B.runtime.sendMessage({ type: "getState" });
  paint(state);
}

document.querySelectorAll('input[name="mode"]').forEach((el) => {
  el.addEventListener("change", async () => {
    if (!el.checked) return;
    const state = await B.runtime.sendMessage({ type: "setMode", mode: el.value });
    paint(state);
  });
});

nativeCompatible.addEventListener("change", async () => {
  const state = await B.runtime.sendMessage({
    type: "setNativeCompatible",
    enabled: nativeCompatible.checked,
  });
  paint(state);
});

refresh();
