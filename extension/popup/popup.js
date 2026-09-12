"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;
const modeHint = document.getElementById("modeHint");
const nativeCompatible = document.getElementById("nativeCompatible");
const nativeCompatSiteToggle = document.getElementById("nativeCompatSiteToggle");
const nativeCompatSiteLabel = document.getElementById("nativeCompatSiteLabel");
const nativeCompatSiteList = document.getElementById("nativeCompatSiteList");
const strictFirstDoc = document.getElementById("strictFirstDoc");
const conflict = document.getElementById("conflict");
const prefsLine = document.getElementById("prefsLine");
const persona = document.getElementById("persona");
const chaff = document.getElementById("chaff");
const chaosDesc = document.getElementById("chaosDesc");
const statsLine = document.getElementById("statsLine");
const rotateBtn = document.getElementById("rotateBtn");
const fireBeaconsBtn = document.getElementById("fireBeaconsBtn");
const cleanCookiesBtn = document.getElementById("cleanCookiesBtn");
const cookieCleanHint = document.getElementById("cookieCleanHint");

let currentEtld1 = "";

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

function paintSiteList(sitesMap) {
  const sites = Object.keys(sitesMap || {}).sort();
  nativeCompatSiteList.innerHTML = "";
  if (!sites.length) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "No per-site entries yet.";
    nativeCompatSiteList.appendChild(li);
    return;
  }
  for (const etld1 of sites) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "mono";
    name.textContent = etld1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn tiny secondary";
    btn.textContent = "Remove";
    btn.dataset.etld1 = etld1;
    btn.addEventListener("click", async () => {
      const state = await B.runtime.sendMessage({
        type: "removeNativeCompatSite",
        etld1,
      });
      paint(state);
      await refreshSiteToggle();
    });
    li.appendChild(name);
    li.appendChild(btn);
    nativeCompatSiteList.appendChild(li);
  }
}

function paint(state) {
  if (!state || !state.prefs) return;
  const mode = state.prefs["darkstr.mode"];
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.checked = el.value === mode;
  });
  nativeCompatible.checked = state.prefs["darkstr.nativeCompatible"] === true;
  strictFirstDoc.checked = state.prefs["darkstr.strictFirstDoc"] !== false;
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

  const siteCount = Object.keys(state.prefs["darkstr.nativeCompatSites"] || {}).length;
  prefsLine.textContent =
    "darkstr.mode=" +
    mode +
    " · darkstr.nativeCompatible=" +
    String(state.prefs["darkstr.nativeCompatible"] === true) +
    " · sites=" +
    siteCount +
    " · strictFirstDoc=" +
    String(state.prefs["darkstr.strictFirstDoc"] !== false);

  paintSiteList(state.prefs["darkstr.nativeCompatSites"] || state.nativeCompatSites);

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
      ` · Rotations: ${state.stats.identityRotations || 0}` +
      ` · Tracker cookies purged: ${state.stats.cookiesCleaned || 0}`;
  }
}

async function refreshSiteToggle() {
  try {
    const tabs = await B.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    let hostname = "";
    if (tab && tab.url && /^https?:/i.test(tab.url)) {
      hostname = new URL(tab.url).hostname;
    }
    if (!hostname) {
      currentEtld1 = "";
      nativeCompatSiteLabel.textContent = "(no http(s) tab)";
      nativeCompatSiteToggle.checked = false;
      nativeCompatSiteToggle.disabled = true;
      return;
    }
    const resp = await B.runtime.sendMessage({
      type: "getNativeCompatSite",
      hostname,
    });
    currentEtld1 = (resp && resp.etld1) || hostname;
    nativeCompatSiteLabel.textContent = currentEtld1;
    nativeCompatSiteToggle.disabled = false;
    nativeCompatSiteToggle.checked = !!(resp && resp.enabled);
  } catch (_) {
    currentEtld1 = "";
    nativeCompatSiteLabel.textContent = "—";
    nativeCompatSiteToggle.disabled = true;
  }
}

async function refresh() {
  const state = await B.runtime.sendMessage({ type: "getState" });
  paint(state);
  await refreshSiteToggle();
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

nativeCompatSiteToggle.addEventListener("change", async () => {
  if (!currentEtld1) {
    nativeCompatSiteToggle.checked = false;
    return;
  }
  const state = await B.runtime.sendMessage({
    type: "setNativeCompatSite",
    hostname: currentEtld1,
    enabled: nativeCompatSiteToggle.checked,
  });
  paint(state);
  await refreshSiteToggle();
});

strictFirstDoc.addEventListener("change", async () => {
  const state = await B.runtime.sendMessage({
    type: "setStrictFirstDoc",
    enabled: strictFirstDoc.checked,
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


cleanCookiesBtn.addEventListener("click", async () => {
  cleanCookiesBtn.disabled = true;
  cleanCookiesBtn.textContent = "Purging…";
  cookieCleanHint.textContent = "";
  try {
    const resp = await B.runtime.sendMessage({ type: "cleanCookiesNow" });
    if (resp && resp.error === "host_permissions_required") {
      cookieCleanHint.textContent =
        "Site access required. Use first-run Grant site access, then retry.";
      cleanCookiesBtn.textContent = "Purge tracker cookies";
    } else if (resp && resp.error) {
      cookieCleanHint.textContent = "Purge failed: " + resp.error;
      cleanCookiesBtn.textContent = "Purge tracker cookies";
    } else {
      const n = (resp && resp.cleaned) || 0;
      cleanCookiesBtn.textContent = n ? `Purged ${n}` : "None matched";
      cookieCleanHint.textContent =
        "Matched Domain against the static tracker list only.";
      setTimeout(() => {
        cleanCookiesBtn.textContent = "Purge tracker cookies";
        cleanCookiesBtn.disabled = false;
      }, 2000);
      await refresh();
      return;
    }
  } catch (err) {
    cookieCleanHint.textContent = "Purge failed.";
    cleanCookiesBtn.textContent = "Purge tracker cookies";
  }
  cleanCookiesBtn.disabled = false;
});

refresh();
setInterval(refresh, 2500);
