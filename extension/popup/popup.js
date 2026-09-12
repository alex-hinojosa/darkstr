"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;
const modeHint = document.getElementById("modeHint");
const nativeCompatible = document.getElementById("nativeCompatible");
const conflict = document.getElementById("conflict");
const prefsLine = document.getElementById("prefsLine");
const persona = document.getElementById("persona");
const chaff = document.getElementById("chaff");
const chaosDesc = document.getElementById("chaosDesc");
const statsLine = document.getElementById("statsLine");
const rotateBtn = document.getElementById("rotateBtn");
const fireBeaconsBtn = document.getElementById("fireBeaconsBtn");

const chaosDescriptions = {
  quiet: "Low-volume coherent chaff, long intervals (8–20 min).",
  balanced: "Moderate chaff with persona clusters (3–8 min).",
  loud: "High-volume broad chaff, short intervals (1–3 min). Lab only.",
  // Legacy stored prefs (pre Quiet/Balanced/Loud rename)
  stealth: "Low-volume coherent chaff, long intervals (8–20 min).",
  chaos: "High-volume broad chaff, short intervals (1–3 min). Lab only.",
};

function paintProfile(profile) {
  if (!profile) return;
  const ua = profile.userAgent || "";
  document.getElementById("currentUA").textContent =
    ua.length > 72 ? ua.slice(0, 72) + "…" : ua || "—";
  document.getElementById("currentPlatform").textContent = profile.platform || "—";
  document.getElementById("currentScreen").textContent = profile.screen
    ? `${profile.screen.width}×${profile.screen.height}`
    : "—";
  document.getElementById("currentGPU").textContent =
    (profile.gpu && profile.gpu.renderer) || "—";
  document.getElementById("currentTZ").textContent = profile.timezone || "—";
  document.getElementById("currentHW").textContent =
    `${profile.hardwareConcurrency || "—"} / ${profile.deviceMemory || "—"} GB`;
}

function paint(state) {
  if (!state || !state.prefs) return;
  const mode = state.prefs["darkstr.mode"];
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.checked = el.value === mode;
  });
  nativeCompatible.checked = state.prefs["darkstr.nativeCompatible"] === true;
  const act = state.activation || {};
  conflict.classList.toggle("hidden", !act.rfpConflict);

  const armed = !!act.pollutionActive;
  persona.classList.toggle("hidden", !armed);
  chaff.classList.toggle("hidden", !armed);

  modeHint.textContent = act.rfpConflict
    ? "Pollution gated: Homogeneous XOR Pollution — RFP stack refused."
    : act.nativeCompatible
      ? "Native-Compatible on — persona / DNR / chaff stay off. Mode unchanged."
      : mode === "pollution"
        ? "Pollution armed. MAIN-world persona inject + chaff run on http(s) pages."
        : "Homogeneous. LibreWolf RFP owns the fingerprint path. Extension surfaces off.";

  prefsLine.textContent =
    "darkstr.mode=" +
    mode +
    " · darkstr.nativeCompatible=" +
    String(state.prefs["darkstr.nativeCompatible"] === true);

  if (armed && state.profile) paintProfile(state.profile);

  const level = state.chaosLevel || "balanced";
  document.querySelectorAll(".chaos-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.level === level);
  });
  chaosDesc.textContent = chaosDescriptions[level] || chaosDescriptions.balanced;

  if (state.stats) {
    statsLine.textContent =
      `Beacons accepted: ${state.stats.fakeBeaconsFired || 0}` +
      ` · DOM chaff: ${state.stats.domChaffApplied || 0}` +
      ` · Rotations: ${state.stats.identityRotations || 0}`;
  }
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

rotateBtn.addEventListener("click", async () => {
  rotateBtn.disabled = true;
  rotateBtn.textContent = "Rotating…";
  const state = await B.runtime.sendMessage({ type: "rotateNow" });
  paint(state);
  rotateBtn.textContent = "Rotate identity";
  rotateBtn.disabled = false;
});

document.querySelectorAll(".chaos-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const state = await B.runtime.sendMessage({
      type: "setChaosLevel",
      level: btn.dataset.level,
    });
    paint(state);
  });
});

fireBeaconsBtn.addEventListener("click", async () => {
  fireBeaconsBtn.disabled = true;
  const resp = await B.runtime.sendMessage({ type: "fireBeaconsNow" });
  fireBeaconsBtn.textContent = `Sent ${resp && resp.count != null ? resp.count : 0}`;
  setTimeout(() => {
    fireBeaconsBtn.textContent = "Send chaff now";
    fireBeaconsBtn.disabled = false;
  }, 1500);
  refresh();
});

refresh();
setInterval(refresh, 2500);
