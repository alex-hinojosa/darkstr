# Mini smoke checklist — darkstr fork (operator)

**Brand:** darkstr — not official LibreWolf.  
**Soft residual / operator smoke** — not a product ship gate.  
`darkstr.nativePersonaHooks` stays **default-off** until Product Manager first-run/settings copy is wired and Proof signs the flip.

## Preflight

1. Mini SSD tree + objdir present (`DARKSTR_GECKO_ROOT`).
2. Patches through **0009** applied; `libduppel_ffi.dylib` next to `LibreWolf.app/Contents/MacOS/librewolf`.
3. Launcher: `~/src/darkstr-gecko/headed-hooks-on-skim.sh` (temp profile: pollution + hooks=true + seed=42 + empty snapshot).

## A — Pollution + hooks-on + FFI (seed 42)

1. Run the launcher (or equivalent temp profile).
2. Navigate first top-level page, then a subsequent page (`docShellPhase` → `subsequent_nav`).
3. **Expect**
   - `darkstr.persona.snapshot` **non-empty** and matches seed-42 macos golden (UA Firefox/140, MacIntel, HW=8, langs include `es`, timezone `Europe/Berlin`).
   - `darkstr.ffi.lastError` empty.
   - HTTP UA / platform mirrors match snapshot.
4. Soft (non-blocking): live `navigator.languages` may lag snapshot `es`.

## B — Homogeneous XOR

1. Set `darkstr.mode=homogeneous`, hooks off (or unused).
2. **Expect:** RFP path stock (persona idle); no Duppel persona/chaff.

## C — Native-Compatible escape

1. Pollution + hooks as needed; add a banking eTLD+1 via NC (popup / sites list) or global NC.
2. **Expect:** that eTLD+1 skips persona; mode stays `pollution`; other sites still polluted.
3. See `docs/NC-BANKING-SMOKE.md`.

## Out of scope tonight

- CreepJS full matrix (optional soft).
- Product default hooks-on / packaged installer.
- WebExt Settings ↔ chrome prefs bridge shipped (#39): on the fork, Settings is authoritative for chrome `darkstr.*` (experiment). Soft residual: harness storage.local live read.

## Proof XOR

Proof: sign steps A–C before Alex runs as primary operator smoke. Soft residuals stay soft.
