# darkstr WebExtension experiments (fork-only)

**Brand:** darkstr — not official LibreWolf. Pollution tool, not Cloudflare bypass.

| API | Purpose |
|-----|---------|
| `darkstrPrefs` | get/set Proof-pin `darkstr.*` via `Services.prefs` |

## Honesty

- Available when `experiment_apis` load (darkstr fork builds / temporary-load with experiments).
- On stock LibreWolf / Firefox without experiments: API absent → companion stays **storage-only**. Soft no-op; no errors required.
- Never writes `privacy.*` (ModeXor / patch `0002` owns RFP/FPP XOR on the fork).
- Never flips `darkstr.nativePersonaHooks` default-on.

See [`docs/PREF-BRIDGE.md`](../../docs/PREF-BRIDGE.md) §8.
