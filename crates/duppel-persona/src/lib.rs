//! `duppel-persona` — correlated fingerprint persona families for darkstr Pollution mode.
//!
//! Phase 2 stub. No Gecko FFI yet.
//!
//! Responsibilities (planned):
//! - Persona family definitions (UA, platform, screen, TZ, languages, HW, GPU…)
//! - Seeded generation + session rotation
//! - Coherence validators (HTTP ↔ JS surface agreement)
//! - Mode awareness: inactive when Homogeneous or Native-Compatible
//!
//! Prefs (chrome / about:config, mirrored from Phase 1 WebExt storage keys):
//! - `darkstr.mode` = `homogeneous` | `pollution`
//! - `darkstr.nativeCompatible` = bool
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

/// Placeholder until Phase 2 wires persona generation behind prefs.
pub fn stub_version() -> &'static str {
    "0.0.0-phase2-stub"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_version_is_nonzero() {
        assert!(!stub_version().is_empty());
    }
}
