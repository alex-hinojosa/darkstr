# Contributing to darkstr

Hygiene and review norms. Product behavior and positioning stay as pinned in [`docs/PROOF-PIN.md`](docs/PROOF-PIN.md).

## Pull requests

- Prefer **small PRs** — one concern per change set (docs, prefs UI, crates, patches). Easier Proof review, easier revert.
- CI on `main` / PRs runs `npm test` and `cd crates && cargo test` via GitHub Actions (`.github/workflows/ci.yml`). Keep both green locally before asking for review.
- PRs that touch chrome prefs, RFP/FPP, persona/chaff activation, or the WebExt↔chrome bridge: follow the **Proof XOR gate** — copy or link [`docs/PROOF-XOR-CHECKLIST.md`](docs/PROOF-XOR-CHECKLIST.md) and check applicable boxes. Unchecked release-fail items → do not merge.

## Hard product rules (do not “fix” in a drive-by)

- **No RFP + Pollution stack.** Homogeneous XOR Pollution. Pollution requires RFP/FPP off; Homogeneous keeps stock LibreWolf RFP. Native-Compatible is an escape, not a third XOR arm. See the XOR matrix in the Proof checklist.
- **PM copy for UI.** First-run, popup, settings, and user-facing labels stay PM-owned framing (pollution browser; Quiet / Balanced / Loud; not anti-detect / not Cloudflare bypass / not official LibreWolf). Do not invent alternate marketing copy in engineering PRs.
- **Don’t retag casually.** Release tags bind a commit and artifacts. Move forward with a new version / tag after review — do not move an existing tag to a different commit or silently replace release assets.

## Local checks

```bash
npm test
npm run check:positioning
npm run build
cd crates && cargo test
```

`npm test` includes a fail-closed positioning scan of user-facing extension UI (popup, settings, first-run, manifest, background notification copy). It rejects anti-detect / Cloudflare-bypass capability claims (allowlisted honest negations like “not anti-detect” / “Not a Cloudflare bypass”), “Chrome prefs” / “chrome-prefs” product labels, and “crates” in Homogeneous implications UI copy. Standalone: `npm run check:positioning`.

## License

GPL-3.0-only. Contributions are under the same license.
