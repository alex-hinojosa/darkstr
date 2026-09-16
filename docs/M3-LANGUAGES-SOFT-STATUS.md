# Soft residual — `navigator.languages` vs FFI snapshot

**Brand:** darkstr — not official LibreWolf.  
**Train:** 155.0.1-1. Soft only — not a product flip.

## Symptom (Proof #29 soft re-skim)

FFI `darkstr.persona.snapshot` matched seed-42 golden (langs include `es`), but live `navigator.languages` sometimes stayed `en-US,en`.

## Fix (`0010`)

- Register `pageshow` on `DarkstrNativePersona` JSWindowActor child.
- Child re-queries `GetSnapshot` and re-applies Navigator spoofs (including languages) so a late FFI fill wins over a sticky `DOMWindowCreated` spoof.

## Not claimed

- Accept-Language HTTP header rewrite
- `nativePersonaHooks` default-on
