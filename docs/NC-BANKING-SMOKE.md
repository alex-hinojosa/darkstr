# Native-Compatible banking / SSO smoke

**Brand:** darkstr — not official LibreWolf.  
**Goal:** Phase 2 exit — Native-Compatible usable for banking/SSO **without** manual `about:config` for the NC toggle itself (fork prefs / WebExt UI).

## Honesty

- This is an **escape hatch** so Pollution mode can leave a banking/SSO eTLD+1 on native identity.
- Not Cloudflare bypass, not anti-detect marketing, not a TLS/JA3 claim.
- `darkstr.nativePersonaHooks` stays **default-off** until Product Manager first-run / settings copy lands.
- Chrome privacy-pane NC site list may still be Phase 2→3; Phase 1 WebExt list + `darkstr.nativeCompatible` / `darkstr.nativeCompatSites` remain valid.

## Prefs (PREF-BRIDGE names)

| Pref | Role |
|------|------|
| `darkstr.mode` | Stay `pollution` for this smoke |
| `darkstr.nativeCompatible` | Global NC (all sites native) — optional arm |
| `darkstr.nativeCompatSites` | Per-site map (eTLD+1) — preferred for banking |
| `darkstr.nativePersonaHooks` | Fork native path; default `false` |

## Operator checklist (headed Mini / fork build)

1. Start fork build with `0002`+`0003` applied (C++ `0005`–`0007` optional for this NC UI smoke).
2. Set `darkstr.mode=pollution` via settings panel or popup (not required to hand-edit RFP/FPP — ModeXor / applicator SoT).
3. Confirm Pollution → RFP/FPP false via ModeXor (about:config skim after CB settle).
4. **Add banking eTLD+1** via Native-Compatible **This site** (or sites list) — e.g. a bank you actually use in a test profile.
5. Expect: that eTLD+1 skips persona/chaff; **mode stays `pollution`**; other sites still polluted.
6. Open a second non-NC site → persona still applies (hooks on) or WebExt MAIN inject (hooks off).
7. **Remove** the banking site from NC list → surfaces return on that eTLD+1.
8. Toggle global Native-Compatible on while Pollution selected → surfaces off everywhere; mode stays `pollution`. Toggle off → restore.

## Proof XOR notes

- Pass = steps 4–7 behave without requiring manual `privacy.resistFingerprinting` edits for NC itself.
- Soft: full live first→subsequent DocShell skim is separate (`M3-CPP-DOCSHELL-STATUS.md`).
- Soft: if hooks default-off, WebExt path still proves NC map; record hooks on/off in the Proof note.

## Script

See [`NC-BANKING-MINI-VERIFY.sh`](NC-BANKING-MINI-VERIFY.sh) for pref-key / doc presence checks (not a live headed browser).
