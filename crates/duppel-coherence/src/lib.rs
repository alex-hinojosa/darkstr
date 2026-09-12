//! `duppel-coherence` — HTTP ↔ JS assertion harness for darkstr Proof gates.
//!
//! Phase 2 control-plane API. Feeds Proof’s “no split-brain” release criterion
//! and XOR exclusivity fixtures used by future wiring PRs.
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

use duppel_persona::{
    mode_pref_effects, resolve_activation, ActivationInput, ClientHintsPolicy, CoherenceError,
    Mode, ModePrefEffects, PersonaSnapshot,
};

/// Crate API version string.
pub const VERSION: &str = "0.1.0-phase2-m0.5";

/// Observed HTTP + JS probe fields (subset) for coherence checks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObservedSurfaces {
    pub http_user_agent: String,
    pub js_user_agent: String,
    pub js_platform: String,
    pub js_timezone: String,
    /// True if any Sec-CH-UA* header was present on the wire.
    pub http_client_hints_present: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssertError {
    HttpJsUaMismatch,
    PlatformMismatch,
    TimezoneMismatch,
    ClientHintsPresentOnFirefox,
    PersonaInternal(CoherenceError),
    PollutionWithRfp,
    HomogeneousCratesNotIdle,
}

/// Assert a persona snapshot is internally coherent and matches observed probes.
pub fn assert_http_js_coherent(
    persona: &PersonaSnapshot,
    observed: &ObservedSurfaces,
) -> Result<(), AssertError> {
    persona
        .validate_internal()
        .map_err(AssertError::PersonaInternal)?;

    if persona.user_agent != observed.http_user_agent {
        return Err(AssertError::HttpJsUaMismatch);
    }
    if observed.http_user_agent != observed.js_user_agent {
        return Err(AssertError::HttpJsUaMismatch);
    }
    if persona.platform != observed.js_platform {
        return Err(AssertError::PlatformMismatch);
    }
    if persona.timezone != observed.js_timezone {
        return Err(AssertError::TimezoneMismatch);
    }
    if persona.client_hints_policy() == ClientHintsPolicy::Remove
        && observed.http_client_hints_present
    {
        return Err(AssertError::ClientHintsPresentOnFirefox);
    }
    Ok(())
}

/// XOR gate: Pollution must not run with RFP on (release-fail).
pub fn assert_mode_exclusivity(input: ActivationInput) -> Result<(), AssertError> {
    let act = resolve_activation(input);
    if input.mode == Mode::Pollution && input.rfp_likely {
        if act.pollution_active {
            return Err(AssertError::PollutionWithRfp);
        }
        return Ok(());
    }
    if input.mode == Mode::Pollution && act.rfp_conflict {
        return Err(AssertError::PollutionWithRfp);
    }
    Ok(())
}

/// Homogeneous must idle crates and restore stock RFP prefs (no metric customization).
pub fn assert_homogeneous_stock_rfp() -> Result<ModePrefEffects, AssertError> {
    let effects = mode_pref_effects(Mode::Homogeneous, false);
    if !effects.crates_idle || !effects.resist_fingerprinting {
        return Err(AssertError::HomogeneousCratesNotIdle);
    }
    Ok(effects)
}

/// Pollution must auto-kill RFP and FPP.
pub fn assert_pollution_kills_rfp() -> Result<ModePrefEffects, AssertError> {
    let effects = mode_pref_effects(Mode::Pollution, false);
    if effects.resist_fingerprinting || effects.fingerprinting_protection {
        return Err(AssertError::PollutionWithRfp);
    }
    Ok(effects)
}

/// Build a synthetic “observed” surface set that matches a persona (fixture helper).
pub fn observed_matching(persona: &PersonaSnapshot) -> ObservedSurfaces {
    ObservedSurfaces {
        http_user_agent: persona.user_agent.to_string(),
        js_user_agent: persona.user_agent.to_string(),
        js_platform: persona.platform.to_string(),
        js_timezone: persona.timezone.to_string(),
        http_client_hints_present: false,
    }
}

/// Proof matrix row for CI / checklist automation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct XorMatrixRow {
    pub mode: Mode,
    pub native_compatible: bool,
    pub rfp_likely: bool,
    pub expect_pollution_active: bool,
}

/// Canonical XOR activation matrix (mirrors Phase 1 Proof pin).
pub fn xor_matrix() -> &'static [XorMatrixRow] {
    &[
        XorMatrixRow {
            mode: Mode::Homogeneous,
            native_compatible: false,
            rfp_likely: true,
            expect_pollution_active: false,
        },
        XorMatrixRow {
            mode: Mode::Homogeneous,
            native_compatible: true,
            rfp_likely: true,
            expect_pollution_active: false,
        },
        XorMatrixRow {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
            expect_pollution_active: true,
        },
        XorMatrixRow {
            mode: Mode::Pollution,
            native_compatible: true,
            rfp_likely: false,
            expect_pollution_active: false,
        },
        XorMatrixRow {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: true,
            expect_pollution_active: false,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use duppel_persona::{generate_persona, Engine, HostOs, PersonaSeed};

    #[test]
    fn version_nonzero() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn linked_persona_generation() {
        let p = generate_persona(PersonaSeed(7), Engine::Firefox, HostOs::Linux).unwrap();
        let obs = observed_matching(&p);
        assert_http_js_coherent(&p, &obs).unwrap();
    }

    #[test]
    fn split_brain_ua_fails() {
        let p = generate_persona(PersonaSeed(7), Engine::Firefox, HostOs::Macos).unwrap();
        let mut obs = observed_matching(&p);
        obs.js_user_agent = "tampered".into();
        assert_eq!(
            assert_http_js_coherent(&p, &obs),
            Err(AssertError::HttpJsUaMismatch)
        );
    }

    #[test]
    fn firefox_client_hints_must_be_absent() {
        let p = generate_persona(PersonaSeed(3), Engine::Firefox, HostOs::Windows).unwrap();
        let mut obs = observed_matching(&p);
        obs.http_client_hints_present = true;
        assert_eq!(
            assert_http_js_coherent(&p, &obs),
            Err(AssertError::ClientHintsPresentOnFirefox)
        );
    }

    #[test]
    fn xor_matrix_holds() {
        for row in xor_matrix() {
            let act = resolve_activation(ActivationInput {
                mode: row.mode,
                native_compatible: row.native_compatible,
                rfp_likely: row.rfp_likely,
            });
            assert_eq!(
                act.pollution_active, row.expect_pollution_active,
                "row {:?}",
                row
            );
            assert_mode_exclusivity(ActivationInput {
                mode: row.mode,
                native_compatible: row.native_compatible,
                rfp_likely: row.rfp_likely,
            })
            .unwrap();
        }
    }

    #[test]
    fn pref_side_effects_documented() {
        assert_pollution_kills_rfp().unwrap();
        let h = assert_homogeneous_stock_rfp().unwrap();
        assert!(h.resist_fingerprinting);
        assert!(h.crates_idle);
    }
}
