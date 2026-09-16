"use strict";

const B = typeof browser !== "undefined" ? browser : chrome;

const rfpSteps = document.getElementById("rfpSteps");
const forkHooksHint = document.getElementById("forkHooksHint");
const permStatus = document.getElementById("permStatus");
const formError = document.getElementById("formError");
const nativeCompatible = document.getElementById("nativeCompatible");

function selectedMode() {
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : "homogeneous";
}

function syncRfpHint() {
  const pollution = selectedMode() === "pollution";
  rfpSteps.classList.toggle("hidden", !pollution);
  if (forkHooksHint) {
    forkHooksHint.classList.toggle("hidden", !pollution);
  }
}

document.querySelectorAll('input[name="mode"]').forEach((el) => {
  el.addEventListener("change", syncRfpHint);
});
syncRfpHint();

document.getElementById("grantPerms").addEventListener("click", async () => {
  formError.textContent = "";
  try {
    const resp = await B.runtime.sendMessage({ type: "requestHostPermissions" });
    permStatus.textContent = resp && resp.granted
      ? "Site access granted."
      : "Site access was not granted. You can continue; Pollution surfaces will stay gated.";
  } catch (err) {
    formError.textContent = String(err && err.message ? err.message : err);
  }
});

document.getElementById("continue").addEventListener("click", async () => {
  formError.textContent = "";
  try {
    const resp = await B.runtime.sendMessage({
      type: "completeFirstRun",
      mode: selectedMode(),
      nativeCompatible: nativeCompatible.checked,
    });
    if (!resp || !resp.ok) {
      formError.textContent = (resp && resp.error) || "Could not save mode.";
      return;
    }
    window.close();
  } catch (err) {
    formError.textContent = String(err && err.message ? err.message : err);
  }
});
