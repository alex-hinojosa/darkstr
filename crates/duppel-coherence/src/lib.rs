//! `duppel-coherence` — HTTP ↔ JS assertion harness for darkstr Proof gates.
//!
//! Phase 2 stub. Feeds Proof’s “no split-brain” release criterion.
//!
//! Responsibilities (planned):
//! - Assert UA / Client-Hints / JS navigator / screen / TZ agreement for a persona
//! - Mode exclusivity checks (Homogeneous XOR Pollution; Native-Compatible escape)
//! - Fixtures for CreepJS / BrowserLeaks / phase-b style matrices
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

use duppel_persona::stub_version as persona_stub_version;

/// Placeholder until Phase 2 adds assertion fixtures.
pub fn stub_version() -> &'static str {
    "0.0.0-phase2-stub"
}

/// Smoke link to `duppel-persona` so the workspace dependency graph is real.
pub fn linked_persona_stub() -> &'static str {
    persona_stub_version()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_and_persona_link() {
        assert!(!stub_version().is_empty());
        assert!(!linked_persona_stub().is_empty());
    }
}
