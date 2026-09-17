# Mini package / artifact pin

**Project:** darkstr — pollution browser; not official LibreWolf.  
**Date:** 2026-09-17 (CDT)  
**Scope:** honest packaging evidence for Phase 2 exit. Does **not** flip hooks
default-on. Does **not** claim a fresh `./mach package` unless one was actually run.

## What this push did (and did not)

| Claim | Truth |
|---|---|
| Fresh `./mach package` this push | **No.** Builder executor for this docs push ran off-Mini (Cursor Linux box). No SSH/local Mini seat → `./mach package` was **not** attempted. |
| Disk ~14 Gi free on Mini | **Operator-reported context** for a future Mini package attempt; **not verified** from this seat. |
| Fresh branded installer / DMG | **Not claimed.** |
| Existing built app as Proof target | **Yes — pin only** (see below). Operator / Mini seat must confirm path + mtime before treating as Proof evidence. |

## Existing app pin (expected Mini layout)

When the Mini objdir already has a built app, Proof should target that binary — **not**
invent a package that was never produced.

| Field | Value |
|---|---|
| Gecko / train root (typical) | `~/src/darkstr-gecko/librewolf-source/librewolf-155.0.1-1` (or `$DARKSTR_GECKO_ROOT`) |
| App glob | `$DARKSTR_GECKO_ROOT/obj-*/dist/LibreWolf.app` |
| Binary (typical) | `LibreWolf.app/Contents/MacOS/librewolf` |
| Brand | darkstr fork work on LibreWolf train — **not** official LibreWolf |
| Fresh package this push | **No** |
| App mtime / exact objdir name | **Unverified from this seat.** On Mini, record with: `ls -ld $DARKSTR_GECKO_ROOT/obj-*/dist/LibreWolf.app` and paste into a follow-up pin edit |

**Do not** clobber the objdir to “make room.” Prefer documenting the existing app.
**Never** `mv` under `/Volumes/Mesh` (Atlas / smbfs panic risk).

## How Proof runs headed XOR on that artifact

1. Confirm the pin path exists on Mini SSD (objdir preserved).
2. Prefer launcher: `~/src/darkstr-gecko/headed-hooks-on-skim.sh`  
   (temp profile; pollution + hooks for skim when intentional — product default
   remains hooks **off**).
3. Matrix (exit gate — still **OPEN** until Proof records PASS):
   - **Homogeneous** — stock RFP path; persona/chaff idle; no RFP metric customization.
   - **Pollution** — RFP/FPP off via ModeXor; no UTC letterbox under active Pollution;
     HTTP ↔ JS coherence when hooks-on skim is intentional.
   - **Native-Compatible (NC)** — escape without flipping `darkstr.mode`; banking/SSO
     site skip as in `docs/NC-BANKING-SMOKE.md`.
4. Soft residual post-#39: harness `storage.local` live read vs chrome mirror stays
   **soft** — see `docs/MINI-SMOKE-CHECKLIST.md`.

Checklists: [`PROOF-XOR-CHECKLIST.md`](PROOF-XOR-CHECKLIST.md),
[`MINI-SMOKE-CHECKLIST.md`](MINI-SMOKE-CHECKLIST.md),
[`PHASE-2-EXIT-STATUS.md`](PHASE-2-EXIT-STATUS.md).

## If Mini later runs `./mach package`

Only then update this file with:

- command + cwd (`$DARKSTR_GECKO_ROOT`)
- exit code / package path under `obj-*/dist/`
- free disk before/after
- whether Proof should switch from the existing `.app` pin to the new package

Until that happens, **do not** check off “reproducible branded fork packaging artifact”
as a fresh package in [`PHASE-2-EXIT-STATUS.md`](PHASE-2-EXIT-STATUS.md).
