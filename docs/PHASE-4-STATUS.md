# Phase 4 status — LibreWolf / Firefox **156.0.1-1** train

**Date:** 2026-09-23 (CDT)  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.  
**Prior train:** Phase 3 eng gate CLOSED on **155.0.1-1** (main tip through `0029` / PR #54; exit checklist in [`PHASE-3-STATUS.md`](PHASE-3-STATUS.md)).

## Goal

Re-pin the darkstr native Firefox-persona surface (`patches/0002`–`0029` + apply helpers) onto LibreWolf **156.0.1-1** (Mozilla `FIREFOX_156_0_1_RELEASE` context), Proof-XOR the Phase 3 exit checklist on the new train, then close packaging on 156.

## Product train

| Item | Value |
|------|-------|
| LibreWolf | **156.0.1-1** (source tag `156.0.1-1`) |
| Upstream Firefox | **156.0.1** |
| Mini gecko root (target) | `$DARKSTR_GECKO_ROOT` → `…/librewolf-source/librewolf-156.0.1-1` |
| Keep 155 tree | Yes until 156 Proof PASS + Mini dist cutover |

## Kickoff checklist

- [ ] LibreWolf source repo checked out at tag `156.0.1-1`
- [ ] `make fetch` + `make dir` → `librewolf-156.0.1-1` present (155 tree retained)
- [ ] Point `DARKSTR_GECKO_ROOT.env` at 156 for port work (document; do not delete 155)
- [ ] Dry-run `patches/scripts/apply-darkstr-patches.sh` (or per-patch) on 156; log fails
- [ ] Port / refresh broken hunks (BrowserGlue, DocShell, Navigator, ModeXor, …) as `0030+` or train-refresh notes
- [ ] Mini subdirectory builds + install-dist_bin as needed
- [ ] Proof: Phase 3 exit checklist on 156 seed-42 Pollution+hooks
- [ ] Optional: fresh `mach package` DMG when disk allows
- [ ] Cutover docs: PHASE-3 remains historical; this file is SoT for 156

## Explicit non-claims (unchanged)

ServiceWorker/Worklets, fonts, screen/DPR, CF/TLS/JA3, Chrome cosplay, full WebGL extension-list / shader-precision (WebExt richer). Homogeneous WebGL may stay Mozilla/Mozilla (RFP).

## Next (this PR)

Docs kickoff only. Bootstrap + patch dry-run land as follow-up commits / PRs once the Mini tree exists.
