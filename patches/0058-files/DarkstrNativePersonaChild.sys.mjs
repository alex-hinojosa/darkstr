/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr M3 — JSWindowActor child. Navigator persona fields for one document,
 * from the same per-document decision the parent uses for that document's
 * HTTP User-Agent / Accept-Language (pins 0003 / 0030 / 0051).
 * Brand: darkstr — not official LibreWolf. No Client Hints SET (Firefox host).
 *
 * 0051 surface rules (Rowan QA N2–N4):
 *   - Install is synchronous at DOMWindowCreated (and DOMDocElementInserted
 *     for a document that reuses an initial about:blank inner window), before
 *     page script, keyed by innerWindowId so the parent answers for THIS
 *     document (tab phase + top-level site), never from a global pref.
 *   - Only fields stock Firefox has: userAgent, platform, hardwareConcurrency,
 *     language, languages, and (0058) appVersion / oscpu, which follow the
 *     snapshot's OS. No deviceMemory, no userAgentData.
 *   - Overrides replace the accessor on Navigator.prototype (where the native
 *     one lives) — never own properties of navigator. Getter name / length /
 *     toString / attributes match the native accessor. `this` decides: this
 *     window's navigator gets the persona value; any other receiver is
 *     forwarded to the original native getter (same value, same TypeError).
 *   - languages is one frozen page-compartment array per document, so
 *     navigator.languages === navigator.languages like the [Cached] binding.
 *   - Native decision (first document in a tab under strictFirstDoc, idle,
 *     unarmed) restores the native accessors.
 */

const MSG_INSTALL = "DarkstrNativePersona:Install";
const MSG_REFRESH = "DarkstrNativePersona:Refresh";
const PROPS = [
  "userAgent",
  "platform",
  "appVersion",
  "oscpu",
  "hardwareConcurrency",
  "language",
  "languages",
];

/** unwaived navigator → { values: Map(prop → value) } */
const navValues = new WeakMap();
/** unwaived Navigator.prototype → Map(prop → original descriptor) */
const protoOriginals = new WeakMap();
/** Documents whose decision was already fetched (one sync IPC per document). */
const checkedDocuments = new WeakSet();

function waive(obj) {
  try {
    const w = Cu.waiveXrays(obj);
    if (w) {
      return w;
    }
  } catch (_e) {}
  if (obj?.wrappedJSObject) {
    return obj.wrappedJSObject;
  }
  return obj;
}

function unwaive(obj) {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) {
    return obj;
  }
  try {
    return Cu.unwaiveXrays(obj);
  } catch (_e) {
    return obj;
  }
}

function isPersonaPrincipal(principal) {
  try {
    if (!principal?.isContentPrincipal) {
      return false;
    }
    return (
      principal.schemeIs("http") ||
      principal.schemeIs("https") ||
      principal.schemeIs("file")
    );
  } catch (_e) {
    return false;
  }
}

function hooksPrefOn() {
  try {
    return (
      Services.prefs.getBoolPref("darkstr.nativePersonaHooks", false) &&
      Services.prefs.getBoolPref("darkstr.pollutionActive", false) &&
      !Services.prefs.getBoolPref("darkstr.nativeCompatible", false)
    );
  } catch (_e) {
    return false;
  }
}

/**
 * Accessors named like the native ones ("get userAgent"). Static accessor
 * names, not computed keys: exportFunction keeps the compiled function name
 * (a computed key would export as an anonymous function). The forwarded
 * `this` picks persona vs native.
 */
function makeGetters(originals) {
  const read = (self, prop) => {
    const entry = navValues.get(unwaive(self));
    if (entry && entry.values.has(prop)) {
      return entry.values.get(prop);
    }
    return Reflect.apply(originals.get(prop).get, self, []);
  };
  const holder = {
    get userAgent() {
      return read(this, "userAgent");
    },
    get platform() {
      return read(this, "platform");
    },
    get appVersion() {
      return read(this, "appVersion");
    },
    get oscpu() {
      return read(this, "oscpu");
    },
    get hardwareConcurrency() {
      return read(this, "hardwareConcurrency");
    },
    get language() {
      return read(this, "language");
    },
    get languages() {
      return read(this, "languages");
    },
  };
  return prop => Object.getOwnPropertyDescriptor(holder, prop).get;
}

function hookPrototype(pageWindow, navProto) {
  const key = unwaive(navProto);
  if (protoOriginals.has(key)) {
    return true;
  }
  const originals = new Map();
  for (const prop of PROPS) {
    const desc = Object.getOwnPropertyDescriptor(navProto, prop);
    if (!desc?.get || !desc.configurable) {
      continue;
    }
    originals.set(prop, desc);
  }
  if (!originals.size) {
    return false;
  }
  protoOriginals.set(key, originals);
  const getterFor = makeGetters(originals);
  for (const [prop, desc] of originals) {
    try {
      Object.defineProperty(navProto, prop, {
        configurable: desc.configurable,
        enumerable: desc.enumerable,
        get: Cu.exportFunction(getterFor(prop), pageWindow),
        set: desc.set,
      });
    } catch (e) {
      originals.delete(prop);
      console.error("darkstr 0051: navigator hook failed", prop, e);
    }
  }
  return true;
}

function unhookPrototype(navProto) {
  const key = unwaive(navProto);
  const originals = protoOriginals.get(key);
  if (!originals) {
    return;
  }
  for (const [prop, desc] of originals) {
    try {
      Object.defineProperty(navProto, prop, desc);
    } catch (_e) {}
  }
  protoOriginals.delete(key);
}

/** Persona values for one window's navigator (page-compartment values). */
export function installNavigatorPersona(window, snapshot) {
  if (!window || !snapshot?.userAgent) {
    return "skipped";
  }
  const pageWindow = waive(window);
  const navProto = pageWindow?.Navigator?.prototype;
  const nav = pageWindow?.navigator;
  if (!navProto || !nav) {
    return "no-navigator";
  }
  const langs =
    Array.isArray(snapshot.languages) && snapshot.languages.length
      ? snapshot.languages.map(String)
      : ["en-US", "en"];
  let pageLangs;
  try {
    pageLangs = Cu.cloneInto(langs, pageWindow);
    pageWindow.Object.freeze(pageLangs);
  } catch (_e) {
    pageLangs = Object.freeze(langs.slice());
  }
  const values = new Map([
    ["userAgent", String(snapshot.userAgent)],
    ["platform", String(snapshot.platform || "MacIntel")],
    ["hardwareConcurrency", Number(snapshot.hardwareConcurrency) || 8],
    ["language", langs[0]],
    ["languages", pageLangs],
  ]);
  // 0058: absent (older parent) → the native getter answers.
  for (const prop of ["appVersion", "oscpu"]) {
    if (typeof snapshot[prop] === "string" && snapshot[prop]) {
      values.set(prop, snapshot[prop]);
    }
  }
  if (!hookPrototype(pageWindow, navProto)) {
    return "no-hookable-accessor";
  }
  navValues.set(unwaive(nav), { values, proto: navProto });
  return "installed";
}

export function uninstallNavigatorPersona(window) {
  let pageWindow;
  try {
    pageWindow = waive(window);
  } catch (_e) {
    return "idle";
  }
  const nav = pageWindow?.navigator;
  const entry = nav ? navValues.get(unwaive(nav)) : null;
  if (!entry) {
    return "idle";
  }
  navValues.delete(unwaive(nav));
  // One navigator per inner window: the prototype has no other user.
  unhookPrototype(entry.proto);
  return "uninstalled";
}

/** Test hook. */
export function personaValuesFor(window) {
  try {
    const nav = waive(window)?.navigator;
    const entry = nav ? navValues.get(unwaive(nav)) : null;
    return entry ? Object.fromEntries(entry.values) : null;
  } catch (_e) {
    return null;
  }
}

export class DarkstrNativePersonaChild extends JSWindowActorChild {
  _decisionSync() {
    try {
      const results = Services.cpmm.sendSyncMessage(MSG_INSTALL, {
        innerWindowId: this.manager.innerWindowId,
      });
      return results?.[0] || null;
    } catch (e) {
      console.error("darkstr 0051: persona install IPC failed", e);
      return null;
    }
  }

  _install(eventType) {
    let document;
    let window;
    try {
      document = this.document;
      window = this.contentWindow;
    } catch (_e) {}
    if (!document || !window) {
      return;
    }
    const hooked = !!personaValuesFor(window);
    if (!isPersonaPrincipal(document.nodePrincipal)) {
      if (hooked) {
        uninstallNavigatorPersona(window);
      }
      return;
    }
    if (eventType !== MSG_REFRESH && !hooked && !hooksPrefOn()) {
      // Idle: no IPC, native navigator.
      return;
    }
    const decision = this._decisionSync();
    if (!decision || decision.decision === "retry") {
      return;
    }
    checkedDocuments.add(document);
    if (decision.decision !== "persona" || !decision.snapshot) {
      uninstallNavigatorPersona(window);
      return;
    }
    try {
      installNavigatorPersona(window, decision.snapshot);
    } catch (e) {
      console.error("darkstr 0051: navigator persona install failed", e);
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "DOMWindowCreated":
        this._install(event.type);
        break;
      case "DOMDocElementInserted": {
        // Same-origin navigation of an initial about:blank reuses the inner
        // window: no second DOMWindowCreated for the new document.
        let document = null;
        try {
          document = this.document;
        } catch (_e) {}
        if (document && !checkedDocuments.has(document)) {
          this._install(event.type);
        }
        break;
      }
      case "pageshow":
        if (event.persisted) {
          this._install(event.type);
        }
        break;
      default:
        break;
    }
  }

  receiveMessage(message) {
    if (message.name === MSG_REFRESH) {
      this._install(MSG_REFRESH);
    }
    return null;
  }
}
