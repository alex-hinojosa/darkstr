# Phase 5 status — eng backlog after Phase 4 depth closed

**Date:** 2026-09-26 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Train:** LibreWolf **156.0.1-1** (Mini SoT via `DARKSTR_GECKO_ROOT`)

Phase 4 depth (through **0034** lastSeeds eTLD diag) is **CLOSED** / Proof PASS.  
Phase 5 pin **0035 cookie firewall MVP** is **MERGED** / Proof XOR **PASS**.  
Phase 5 pin **0036 fonts coherence** is **MERGED** / Proof XOR **PASS** (PR #67; see evidence below).
Phase 5 pin **0037 speech coherence** is **IN PROGRESS** (PR pending; not Proof-PASS).

## Completed — 0036 Fonts coherence / fingerprint farbling

| Item | Status |
|------|--------|
| Pin | **0036** |
| PR | [#67](https://github.com/alex-hinojosa/darkstr/pull/67) **MERGED** as `a49cf98b3f120e5c0d14336f2411c9638d4c0cff` |
| Tip at Proof | `d01038b7d64c3dd95e581263dca2fa47381b8d7c` |
| Branch | `builder/phase5-fonts-0036` |
| Patch | [`patches/0036-darkstr-fonts-coherence.patch`](../patches/0036-darkstr-fonts-coherence.patch) |
| Mini helper | [`scripts/apply-0036-fonts-coherence-mini.sh`](../scripts/apply-0036-fonts-coherence-mini.sh) / [`PHASE-5-FONTS-0036-MINI-APPLY.sh`](PHASE-5-FONTS-0036-MINI-APPLY.sh) |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/darkstr-pr67-0036-xor-20260924-205857/` |

### Design summary

Depth `fontSeed` (from eTLD-effective persona seed via `_generateDepthFromSeed` **after**
`canvasSeed`/`audioSeed` so golden digests stay intact; snapshot may supply
`fontSeed`/`font_seed`; else stable XOR fallback) drives page-compartment farbling
under the same arm gate as other depth hooks:

`pollution && !nativeCompatible && nativePersonaHooks` (plus DocShell SubsequentNav
when `strictFirstDoc`).

Surfaces (Brave-inspired sticky farbling; Firefox/LibreWolf/Gecko persona only):

1. **Canvas / Offscreen `measureText`** — silence-safe multiplicative width fudge
   `[0.999, 1.0)`; width `0` stays `0`; horizontal bounding boxes scaled coherently.
2. **`document.fonts.check`** — Firefox-plausible baseline families passthrough;
   non-baseline keep/drop by deterministic seed hash (no Chrome-only font lists).
3. **DOM probes** — `offsetWidth` / `clientWidth` / `getBoundingClientRect` width
   fudge (same fudge; integer widths rounded). Soft residual: ≤0.1% layout shift risk.

Default-**on** with depth hooks (like audio/WebGL). Homogeneous / hooks-off: idle.
Diag: `darkstr.depth.lastSeeds` JSON gains `fontSeed` (0034 path).

### Prefs / arm gate

| Pref / gate | Role |
|-------------|------|
| `darkstr.mode=pollution` ∧ `!nativeCompatible` ∧ `nativePersonaHooks` | Arm (shared depth) |
| `darkstr.depth.hooksArmed` / `lastSeeds` (incl. `fontSeed`) | Diag |
| Golden lock | non-empty `darkstr.persona.snapshot` **or** `rotatePerSite=false` |

No new default-off arm pref (justified: same risk class as 0031 audio width-style
fudge; DOM residual documented).

### Proof gates — PASS (do not ping from Builder)

1. Hooks-off / Homogeneous → idle (host font metrics)
2. Pollution+hooks: same seed → stable font/measureText digests (double-read)
3. Different eTLD+1 with rotatePerSite → digests diverge
4. Same eTLD two tabs → same digests/seed
5. Golden lock seed-42 coherent; no Chrome-only font names in any surfaced list — **PASS**

### Proof result — PASS

All five font-coherence XOR gates passed on Proof tip `d01038b7d64c3dd95e581263dca2fa47381b8d7c`.

**Soft residuals (not FAIL):**

- DOM width fudge may shift pixel-perfect layouts by **≤0.1%** when hooks are armed.
- `document.fonts.ready` / `FontFaceSet` iteration and full enumeration are not wrapped (only `check`).

### Out of scope (this pin)

- speech / WebGPU
- Native-Compatible privacy-pane UI (PM)
- FontFaceSet full enumeration filtering (soft residual — `check` covered)
- gfx-level font whitelist (Tor-style) — page-compartment only

### Residual risks

- DOM width fudge may shift pixel-perfect layouts by ≤0.1% when hooks armed.
- `document.fonts` iteration / `ready` not wrapped (only `check`).
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini) — 0036 — 2026-09-24 ~20:56 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Markers already present (Builder applied source edits); patch skip OK
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~7s)
- `make install-dist_bin` — Kept existing; moz-src symlinks refreshed
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrDepthHooks*.sys.mjs` → source (fontSeed / Soft residual 0036 present)
- PR [#67](https://github.com/alex-hinojosa/darkstr/pull/67) **MERGED** as `a49cf98b3f120e5c0d14336f2411c9638d4c0cff`; Proof XOR **PASS** on tip `d01038b7d64c3dd95e581263dca2fa47381b8d7c`
- Apply log: `~/src/darkstr-gecko/darkstr-apply-0036-20260924-205605.log`

## IN PROGRESS — 0037 Speech synthesis / SpeechRecognition coherence

| Item | Status |
|------|--------|
| Pin | **0037** |
| PR | *(opened with this pin — see PR URL in apply report)* |
| Tip | *(branch tip SHA)* |
| Branch | `builder/phase5-speech-0037` |
| Patch | [`patches/0037-darkstr-speech-coherence.patch`](../patches/0037-darkstr-speech-coherence.patch) |
| Mini helper | [`scripts/apply-0037-speech-coherence-mini.sh`](../scripts/apply-0037-speech-coherence-mini.sh) / [`PHASE-5-SPEECH-0037-MINI-APPLY.sh`](PHASE-5-SPEECH-0037-MINI-APPLY.sh) |
| Proof | **not claimed** — awaiting Proof XOR ACK |

### Design summary

Depth `speechSeed` (from eTLD-effective persona seed via `_generateDepthFromSeed`
**after** `fontSeed` so golden digests stay intact; snapshot may supply
`speechSeed`/`speech_seed`; else stable XOR fallback from `fontSeed`⊕`canvasSeed`)
drives page-compartment farbling under the same arm gate as other depth hooks:

`pollution && !nativeCompatible && nativePersonaHooks` (plus DocShell SubsequentNav
when `strictFirstDoc`).

Surfaces (Brave-inspired sticky farbling; Firefox/LibreWolf/Gecko persona only):

1. **`speechSynthesis.getVoices()`** — seed-tied filter/reorder of **host native**
   voices only. Empty native list stays empty. Default voice always kept. No
   invented Chrome/Google voice names. Double-read and `voiceschanged` coherent
   via fingerprint-keyed cache of the farbled list.
2. **SpeechRecognition / `webkitSpeechRecognition`** — soft residual only: when the
   pref-gated constructor is already exposed (`media.webspeech.recognition.enable`),
   seed-tie empty `lang` to a Firefox-plausible BCP47 default. Do **not** invent
   the API when absent (would be Chrome cosplay).

Default-**on** with depth hooks (same risk class as fonts/audio list farbling;
justified). Homogeneous / hooks-off: idle. Diag: `darkstr.depth.lastSeeds` JSON
gains `speechSeed` (0034 path).

### Prefs / arm gate

| Pref / gate | Role |
|-------------|------|
| `darkstr.mode=pollution` ∧ `!nativeCompatible` ∧ `nativePersonaHooks` | Arm (shared depth) |
| `darkstr.depth.hooksArmed` / `lastSeeds` (incl. `speechSeed`) | Diag |
| Golden lock | non-empty `darkstr.persona.snapshot` **or** `rotatePerSite=false` |

No new default-off arm pref (justified: read-only voice-list subset/reorder; TTS
still uses real host voices; SpeechRecognition soft and pref-gated upstream).

### Proof gates — propose for Proof ACK (do not claim PASS)

1. Hooks-off / Homogeneous → idle (host voices)
2. Pollution+hooks: same seed → stable getVoices digests (double-read / voiceschanged)
3. Different eTLD+1 with rotatePerSite → digests / speechSeed diverge
4. Same eTLD two tabs → same digests / speechSeed
5. Golden lock seed-42 coherent; no Chrome-only voice names in any surfaced list

### Soft residuals (not FAIL)

- SpeechRecognition surface is best-effort when pref-off / ctor absent.
- Voice-list subset may hide some non-default host voices under Pollution+hooks
  (TTS still works via kept default / first voice).
- `voiceschanged` fires from host; farbled list updates only when native signature
  changes (by design for coherence).

### Out of scope (this pin)

- WebGPU
- Native-Compatible privacy-pane UI (PM)
- Fonts (already **0036** MERGED / PASS)
- Inventing Chrome-only voice names or `webkitSpeechRecognition` when absent
- gfx/C++ speech service farbling

### Residual risks

- Host with very few voices → subset may equal full list (entropy soft).
- Not anti-detect / not Cloudflare bypass.

## Next eng backlog

0037 is **IN PROGRESS** (awaiting Proof). After 0037 PASS:

1. **WebGPU**

No WebGPU engineering in this pin.

## Completed — 0035 Cookie firewall MVP

| Item | Status |
|------|--------|
| Pin | **0035** |
| PR | [#66](https://github.com/alex-hinojosa/darkstr/pull/66) **MERGED** as `79f2e59c6a8bdbd2f3891fc649011698a639c351` |
| Tip at Proof | `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3` |
| Proof | **PASS** |
| Evidence | `~/AgentDocs/proof/pr66-0035-cookie-firewall-xor-20260924-134154/` |
| Branch | `builder/phase5-cookie-firewall-0035` |
| Patch | [`patches/0035-darkstr-cookie-firewall.patch`](../patches/0035-darkstr-cookie-firewall.patch) |
| Mini helper | [`scripts/apply-0035-cookie-firewall-mini.sh`](../scripts/apply-0035-cookie-firewall-mini.sh) |
| Design one-pager | [`COOKIE-SANDBOX-FAKE-JAR.md`](COOKIE-SANDBOX-FAKE-JAR.md) (updated) |

### Design summary (how policy is shared)

Single chrome SoT: `DarkstrCookieFirewall.sys.mjs` owns:

1. **Arm gate (default-off):**  
   `pollution && !nativeCompatible && nativePersonaHooks && darkstr.cookieFirewall.enabled`
2. **Decision:** allowlisted eTLD+1 → **passthrough** (real jar); else **sandbox**.
3. **Mode:** `synthetic` (default) seed-tied rewrite via 0030 eTLD seed / golden lock; `isolate` stores values as-is in sandbox only.
4. **One jar:** in-memory `Map<etld, Map<name,value>>` in parent.
5. **HTTP path:** `http-on-modify-request` replaces `Cookie`; `http-on-examine-response` (+cached) ingests `Set-Cookie` then strips header (best-effort vs CookieService race).
6. **Script path:** JSWindowActor child installs `document.cookie` + `cookieStore` wrappers; all writes IPC to parent jar; child mirror keeps getter sync while using the **same** seed/synthetic function.

No HTTP/JS split-brain by construction: both paths call the same ingest/decision helpers.

### Prefs

| Pref | Default | Role |
|------|---------|------|
| `darkstr.cookieFirewall.enabled` | **false** | Explicit arm (still requires Pollution+hooks) |
| `darkstr.cookieFirewall.mode` | `synthetic` | `synthetic` \| `isolate` |
| `darkstr.cookieFirewall.allowlist` | `""` | CSV eTLD+1 → real jar |
| `darkstr.cookieFirewall.armed` | diag | Effective arm mirror |
| `darkstr.cookieFirewall.lastEtld` / `lastSeed` / `lastDecision` / `lastInstall` | diag | Proof XOR |

### Proof gates (for Proof ACK — do not ping from Builder)

1. Hooks-off / `enabled=false` → real cookies unchanged (idle)
2. Armed Pollution+hooks: `document.cookie` and Cookie Store honor same policy as network Cookie/Set-Cookie for a test eTLD
3. Two eTLD+1 → isolated / different synthetic (when `rotatePerSite`)
4. Same eTLD two tabs → same policy/seed behavior
5. Golden lock seed-42 path still coherent

### Proof result — PASS

Evidence: `~/AgentDocs/proof/pr66-0035-cookie-firewall-xor-20260924-134154/`

All five cookie-firewall XOR gates passed on Proof tip `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3`.

**Soft observation:** the outbound `/echo` Cookie request header was empty (not
`NETWORK_REAL`). The sandbox jar and script surfaces held the synthetic
`net_probe`; this is a soft note only and does not change the PASS verdict.

### Out of scope (this pin) — 0035

- fonts / speech / WebGPU (fonts → **0036**)
- Native-Compatible privacy-pane UI (PM)
- Approach A FFI
- Full browser UI / dual-jar C++ CookieService

### Residual risks

- **CookieService race:** stock jar may still accept Set-Cookie before chrome strip on some channels; follow-up C++ hook if Proof sees jar bleed.
- Child `document.cookie` getter is sync via local mirror; HTTP→script visibility updates on pageshow/DOMWindowCreated hydrate (same-turn write→read coherent).
- Not anti-detect / not Cloudflare bypass.

## Apply status (Mini)

## Apply status (Mini) — 2026-09-24 ~13:38 CDT

- Tree: LibreWolf **156.0.1-1** (`$DARKSTR_GECKO_ROOT`)
- Patch markers present; `lw/librewolf.cfg` 0035 defaults appended (`enabled=false`)
- `./mach build --allow-subdirectory-build browser/components` — **OK** (~17s)
- `make install-dist_bin` — Added/updated 3 CookieFirewall modules
- Symlinks: `dist/LibreWolf.app/.../moz-src/browser/components/DarkstrCookieFirewall*.sys.mjs` → source
- PR #66 **MERGED** as `79f2e59c6a8bdbd2f3891fc649011698a639c351`; Proof XOR **PASS** on tip `d35c5fd8fdec6fba20cf1c08c1f270b8f550ecf3`.

