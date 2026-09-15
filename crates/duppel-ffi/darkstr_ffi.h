/* darkstr_ffi.h — C ABI sketch for Gecko link-in (Phase 2).
 * Not official LibreWolf. Live moz.build wiring is a follow-up train-pinned patch.
 */
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

uint32_t darkstr_ffi_abi_version(void);
char *darkstr_ffi_persona_snapshot_json(uint32_t seed, const char *os);
void darkstr_ffi_string_free(char *s);

#ifdef __cplusplus
}
#endif
