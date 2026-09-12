//! `duppel-chaff` — tracking-pollution beacon schedules for darkstr Pollution mode.
//!
//! Phase 2 stub. No native network scheduler yet.
//!
//! Responsibilities (planned):
//! - Quiet / Balanced / Loud schedules (parity with Phase 1 `poisoner.js`)
//! - Endpoint lists + pollution metrics
//! - Gating: Pollution active XOR Homogeneous; respect Native-Compatible
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

/// Placeholder until Phase 2 wires the native chaff scheduler.
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
