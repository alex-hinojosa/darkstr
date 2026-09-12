"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;
const modeHint = document.getElementById("modeHint");
const xorImplications = document.getElementById("xorImplications");
const nativeCompatible = document.getElementById("nativeCompatible");
const nativeCompatSiteList = document.getElementById("nativeCompatSiteList");
const siteSummary = document.getElementById("siteSummary");
const strictFirstDoc = document.getElementById("strictFirstDoc");
const prefsLine = document.getElementById("prefsLine");

function xorCopy(mode) {
  if (mode === "pollution") {
    return {
      className: "xor-box pollution",
      html:
        "<strong>Pollution implications</strong><br>" +
        "Fork / Proof: <code>privacy.resistFingerprinting</code> and " +
        "<code>privacy.fingerprintingProtection</code> <strong>must be false</strong> " +
        "(auto-set on darkstr fork M2+; manual on stock LibreWolf).<br>" +
        "Duppel persona + chaff path may run. Do not stack with RFP.",
    };
  }
  return {
    className: "xor-box homogeneous",
    html:
      "<strong>Homogeneous implications</strong><br>" +
      "Stock LibreWolf RFP anonymity set. Expect " +
      "<code>privacy.resistFingerprinting</code> <strong>true</strong>; leave FPP on LibreWolf defaults.<br>" +
      "<strong>No RFP metric customization</strong> — do not tweak letterboxing / spoof RFP surfaces. " +
      "Persona and chaff stay idle.",
  };
}

function paintXor(mode) {
  const x = xorCopy(mode);
  xorImplications.className = x.className;
  xorImplications.innerHTML = x.html;
}

function paintSiteList(sitesMap) {
  const sites = Object.keys(sitesMap || {}).sort();
  siteSummary.textContent = "sites=" + sites.length;
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
    btn.className = "btn";
    btn.textContent = "Remove";
    btn.addEventListener("click", async () => {
      const state = await B.runtime.sendMessage({
        type: "removeNativeCompatSite",
        etld1,
      });
      paint(state);
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
  paintXor(mode);

  const act = state.activation || {};
  modeHint.textContent = act.rfpConflict
    ? "Pollution gated: Homogeneous XOR Pollution — RFP stack refused."
    : act.nativeCompatible
      ? "Native-Compatible on — persona / DNR / chaff stay off. Mode unchanged."
      : mode === "pollution"
        ? "Pollution selected. On stock LibreWolf, turn RFP/FPP off manually if not already."
        : "Homogeneous. LibreWolf RFP owns the fingerprint path. Extension surfaces off.";

  const sitesMap =
    state.prefs["darkstr.nativeCompatSites"] || state.nativeCompatSites || {};
  const siteCount = Object.keys(sitesMap).length;
  prefsLine.textContent =
    "darkstr.mode=" +
    mode +
    " · darkstr.nativeCompatible=" +
    String(state.prefs["darkstr.nativeCompatible"] === true) +
    " · sites=" +
    siteCount +
    " · strictFirstDoc=" +
    String(state.prefs["darkstr.strictFirstDoc"] !== false);

  paintSiteList(sitesMap);
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

strictFirstDoc.addEventListener("change", async () => {
  const state = await B.runtime.sendMessage({
    type: "setStrictFirstDoc",
    enabled: strictFirstDoc.checked,
  });
  paint(state);
});

refresh();
setInterval(refresh, 2500);
