/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * darkstr 0049 — parent side of the DarkstrWorkerPersona JSProcessActor.
 * Resolution is a sync ppmm message (DarkstrWorkerHooks:Resolve) handled by
 * DarkstrWorkerHooks; this actor only exists so the child can observe the
 * C++ "darkstr-worker-persona-resolve" topic in every content process.
 */
export class DarkstrWorkerPersonaParent extends JSProcessActorParent {
  receiveMessage(_message) {
    return null;
  }
}

/** Retired (0049) window-actor parent; no-op for a pre-0049 registration. */
export class DarkstrWorkerHooksParent extends JSWindowActorParent {
  receiveMessage(_message) {
    return null;
  }
}
