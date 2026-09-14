# Phase 2 M1 status — prefs/cfg first apply (skim)

**Date:** 2026-09-14  
**Owner:** Builder  
**Audience:** Meridian / Proof / Product Manager skim  
**Brand:** darkstr — not official LibreWolf. Pollution browser, not Cloudflare bypass.

## Confirmed (operator / Mini SSD — 2026-09-14)

| Item | Value |
|------|-------|
| Clean gecko root | `/Users/alexander/src/darkstr-gecko/librewolf-source/librewolf-155.0.1-1` |
| Env file | `/Users/alexander/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env` → `DARKSTR_GECKO_ROOT=…/librewolf-155.0.1-1` |
| Overnight `make dir` | `EXIT:0` ~01:36 CDT; ~5.0G; has `client.mk`, `browser/`, `lw/librewolf.cfg` |
| Mesh | `/Volumes/Mesh` — rsync **to** Mesh of finished tree (background). **Atlas:** never `mv` under Mesh (smbfs panic). Prefer local SSD. |
| Bootstrap / build | **Not started** for this skim (multi-hour; not required for M1 prefs drop) |

> Live re-verify on Mini before claiming “patches applied.” This doc plans the first drop; do not claim apply without `grep` proof on the tree.

## M1 goal (narrow)

Prove merge-train + first **non-destructive** prefs surface on the clean tree:

1. Tree path confirmed.
2. `darkstr.cfg` / `defaultPref("darkstr.*")` layered on LibreWolf baseline.
3. Homogeneous default; **no** RFP metric customization; **no** Duppel spoof yet.
4. Proof pin notes updated for chrome key names (already in PROOF-PIN / PREF-BRIDGE).

**Out of scope for this skim:** `make bootstrap`, `make build`, branding icons/about, XOR pref observers (M2), nsHttp/DocShell (M3+).

## First concrete patch (smallest real apply)

**Prefer prefs/cfg, not a full rebuild.**

1. Source env:
   ```bash
   source /Users/alexander/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env
   # or: export $(grep -v '^#' …/DARKSTR_GECKO_ROOT.env | xargs)  # if file is KEY=val only
   test -f "$DARKSTR_GECKO_ROOT/client.mk"
   test -d "$DARKSTR_GECKO_ROOT/browser"
   test -f "$DARKSTR_GECKO_ROOT/lw/librewolf.cfg"
   ```
2. From a checkout of this repo (or `gh` sparse files):
   ```bash
   ./patches/scripts/apply-darkstr-patches.sh --require-root
   # dry-run first:
   ./patches/scripts/apply-darkstr-patches.sh --dry-run --require-root
   ```
3. Script actions:
   - Copy `patches/stubs/darkstr.cfg` → `$DARKSTR_GECKO_ROOT/lw/darkstr.cfg`
   - Idempotently append a marked `defaultPref` block into `lw/librewolf.cfg` (so prefs actually load; a lone cfg file is not autoconfig unless pointed at)
   - Leave `.patch.stub` files **unapplied**
   - Do **not** run bootstrap/build
4. Verify (required before claiming apply):
   ```bash
   test -f "$DARKSTR_GECKO_ROOT/lw/darkstr.cfg"
   grep -n 'darkstr.mode\|BEGIN darkstr-m1-prefs' "$DARKSTR_GECKO_ROOT/lw/librewolf.cfg"
   ```

Prefs shipped:

| Pref | Default |
|------|---------|
| `darkstr.mode` | `"homogeneous"` |
| `darkstr.nativeCompatible` | `false` |
| `darkstr.strictFirstDoc` | `true` |

XOR auto-RFP remains **M2** (`0002-darkstr-mode-xor-rfp.patch.stub`).

## Stub → real patch map

| Stub | M1 action |
|------|-----------|
| `stubs/darkstr.cfg` | **Apply now** (copy + librewolf.cfg append) |
| `0001-…prefs-defaults.patch.stub` | Satisfied by script append; replace with unified diff once train pin is CI-locked |
| `0002-…xor-rfp.patch.stub` | **Defer M2** (pref observer) |
| `0003-…hook-sites.patch.stub` | M3 enums/docs landed (`M3-STATUS.md`); live C++ still private-fork |

## Mesh / Atlas

- Do not kill background rsync unless stuck (`~/src/darkstr-gecko/rsync-out.log`).
- Never `mv` under `/Volumes/Mesh`. Use `rsync` / `cp`+`rm` / `nas_write.sh` remote mv only if cleanup needed.
- Local SSD tree is authoritative for M1 apply.

## Exact skim paths

| Who | Read |
|-----|------|
| Meridian | `docs/PHASE-2-PLAN.md` §M1, this file, `docs/GECKO-HOOKS.md` §1 |
| Proof | `docs/PROOF-PIN.md`, `docs/PREF-BRIDGE.md` §6, `docs/PROOF-XOR-CHECKLIST.md`, this file |
| PM | README positioning + this file “M1 goal” (Homogeneous default; no CF/bypass claims) |
| Builder Mini | `$DARKSTR_GECKO_ROOT`, `~/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env`, `~/src/darkstr-gecko/rsync-out.log`, `~/src/darkstr-gecko/M1-STATUS.local.md` (optional mirror of this doc) |

## Blockers / open

| Item | Status |
|------|--------|
| Mini live tree + rsync check from box-only executor | May need Builder Shell on machineId `e1a9473e-2bb1-4a3f-9a80-9e2d583b7e25` |
| gh auth | Available for doc/branch PRs |
| Disk / bootstrap | Bootstrap **not** required for prefs skim |
| Claim “patches applied” | Only after Mini `grep` proof above |

## Next after prefs drop verified

1. Record apply proof in `~/src/darkstr-gecko/M1-STATUS.local.md` (paths + `grep` output + timestamp).
2. Land this branch / PR notes on `main`.
3. Schedule M2 XOR observer (still no full spoof).
4. Linux CI Docker clean build remains M1 exit criterion for “fork builds” — separate from this prefs skim.
