//! `duppel-bridge` — prefs applicator trait for future darkstr XPCOM / Gecko glue.
//!
//! Phase 2 sketch: no FFI, no `unsafe`. Chrome-process observers will call
//! [`PrefsApplicator::apply_mode_effects`] when `darkstr.mode` /
//! `darkstr.nativeCompatible` change. See `docs/GECKO-HOOKS.md`.
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

use duppel_persona::{
    mode_pref_effects, prefs, Mode, ModePrefEffects,
};

/// Crate API version string.
pub const VERSION: &str = "0.1.0-phase2-m2";

/// Re-export pref name constants for glue that only depends on this crate.
pub use duppel_persona::prefs as pref_names;

/// Gecko / LibreWolf call sites documented in `docs/GECKO-HOOKS.md`.
/// Used as labels for future wiring — not an FFI boundary by themselves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HookSite {
    /// Chrome pref observer / static prefs callback.
    PrefObserver,
    /// nsHttp / channel User-Agent + Client Hints policy.
    NsHttp,
    /// DOM Navigator / platform / HW surfaces.
    Navigator,
    /// DocShell navigation (strict-first-doc / next-nav).
    DocShell,
    /// Canvas 2D / WebGL / Audio (M4+ depth).
    CanvasAudio,
}

impl HookSite {
    pub fn as_str(self) -> &'static str {
        match self {
            HookSite::PrefObserver => "pref_observer",
            HookSite::NsHttp => "nsHttp",
            HookSite::Navigator => "navigator",
            HookSite::DocShell => "docshell",
            HookSite::CanvasAudio => "canvas_audio",
        }
    }

    /// Which crate is the primary consumer of this hook (documentation aid).
    pub fn primary_crate(self) -> &'static str {
        match self {
            HookSite::PrefObserver => "duppel-bridge",
            HookSite::NsHttp | HookSite::Navigator | HookSite::DocShell | HookSite::CanvasAudio => {
                "duppel-persona"
            }
        }
    }
}

/// A single chrome pref write the fork must perform.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrefWrite {
    pub name: &'static str,
    pub value: PrefValue,
}

/// Typed pref values we need for XOR enforcement (extend cautiously).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrefValue {
    Bool(bool),
    Str(&'static str),
}

/// Full plan produced from mode + native-compatible (Proof-facing).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrefApplyPlan {
    pub mode: Mode,
    pub native_compatible: bool,
    pub effects: ModePrefEffects,
    pub writes: Vec<PrefWrite>,
}

impl PrefApplyPlan {
    /// Build the authoritative write list for a mode transition.
    ///
    /// Pollution → force RFP/FPP off.  
    /// Homogeneous → restore stock RFP/FPP expectations (no metric customization).  
    /// Always records `darkstr.mode` / `darkstr.nativeCompatible` for mirror sync.
    pub fn for_mode(mode: Mode, native_compatible: bool) -> Self {
        let effects = mode_pref_effects(mode, native_compatible);
        let writes = vec![
            PrefWrite {
                name: prefs::MODE,
                value: PrefValue::Str(mode.as_str()),
            },
            PrefWrite {
                name: prefs::NATIVE_COMPATIBLE,
                value: PrefValue::Bool(native_compatible),
            },
            PrefWrite {
                name: prefs::PRIVACY_RFP,
                value: PrefValue::Bool(effects.resist_fingerprinting),
            },
            PrefWrite {
                name: prefs::PRIVACY_FPP,
                value: PrefValue::Bool(effects.fingerprinting_protection),
            },
        ];
        Self {
            mode,
            native_compatible,
            effects,
            writes,
        }
    }

    /// True when persona/chaff must stay idle after this plan is applied.
    pub fn crates_idle(&self) -> bool {
        self.effects.crates_idle
    }

    /// Release-fail guard for the prefs path (M2 observer XOR gate).
    ///
    /// Pollution plans must never write `privacy.resistFingerprinting=true`
    /// (forbidden frankenstein). Homogeneous plans must idle crates and
    /// restore stock RFP (`resistFingerprinting=true`) without enabling
    /// persona/chaff.
    pub fn is_xor_safe(&self) -> bool {
        match self.mode {
            Mode::Pollution => {
                if self.effects.resist_fingerprinting || self.effects.fingerprinting_protection {
                    return false;
                }
                let rfp_writes_ok = self.writes.iter().all(|w| {
                    if w.name == prefs::PRIVACY_RFP || w.name == prefs::PRIVACY_FPP {
                        w.value == PrefValue::Bool(false)
                    } else {
                        true
                    }
                });
                rfp_writes_ok
            }
            Mode::Homogeneous => {
                self.effects.crates_idle
                    && self.effects.resist_fingerprinting
                    && self.writes.iter().any(|w| {
                        w.name == prefs::PRIVACY_RFP && w.value == PrefValue::Bool(true)
                    })
            }
        }
    }

    /// Persona/chaff may run only when Pollution, not native-compatible, and XOR-safe.
    pub fn allow_persona_chaff(&self) -> bool {
        self.mode == Mode::Pollution && !self.native_compatible && self.is_xor_safe()
    }
}

/// Error from a prefs applicator (glue may map to nsresult later).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyError {
    /// Implementors use this when a write was rejected by the host.
    PrefWriteRejected,
}

/// Trait used by future XPCOM / chrome observers to apply XOR pref side-effects.
///
/// Implement on a thin Gecko-facing adapter. Unit tests use [`RecordingApplicator`].
pub trait PrefsApplicator {
    fn apply_mode_effects(
        &mut self,
        mode: Mode,
        native_compatible: bool,
    ) -> Result<PrefApplyPlan, ApplyError>;
}

/// Default helper: compute plan then push each write through [`PrefsApplicatorHost`].
pub trait PrefsApplicatorHost {
    fn write_pref(&mut self, write: &PrefWrite) -> Result<(), ApplyError>;
}

impl<T: PrefsApplicatorHost> PrefsApplicator for T {
    fn apply_mode_effects(
        &mut self,
        mode: Mode,
        native_compatible: bool,
    ) -> Result<PrefApplyPlan, ApplyError> {
        let plan = PrefApplyPlan::for_mode(mode, native_compatible);
        for w in &plan.writes {
            self.write_pref(w)?;
        }
        Ok(plan)
    }
}

/// Test / dry-run applicator that records writes without touching a browser.
#[derive(Debug, Default, Clone)]
pub struct RecordingApplicator {
    pub writes: Vec<PrefWrite>,
}

impl PrefsApplicatorHost for RecordingApplicator {
    fn write_pref(&mut self, write: &PrefWrite) -> Result<(), ApplyError> {
        self.writes.push(write.clone());
        Ok(())
    }
}

/// Which hook sites are expected to consult persona state once native wins land.
pub fn persona_hook_sites() -> &'static [HookSite] {
    &[
        HookSite::NsHttp,
        HookSite::Navigator,
        HookSite::DocShell,
        HookSite::CanvasAudio,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use duppel_persona::Mode;

    #[test]
    fn version_nonzero() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn pollution_plan_kills_rfp_fpp() {
        let plan = PrefApplyPlan::for_mode(Mode::Pollution, false);
        assert!(!plan.effects.resist_fingerprinting);
        assert!(!plan.effects.fingerprinting_protection);
        assert!(!plan.crates_idle());
        assert!(plan.writes.iter().any(|w| {
            w.name == prefs::PRIVACY_RFP && w.value == PrefValue::Bool(false)
        }));
        assert!(plan.writes.iter().any(|w| {
            w.name == prefs::PRIVACY_FPP && w.value == PrefValue::Bool(false)
        }));
    }

    #[test]
    fn homogeneous_plan_restores_stock_rfp() {
        let plan = PrefApplyPlan::for_mode(Mode::Homogeneous, false);
        assert!(plan.effects.resist_fingerprinting);
        assert!(plan.effects.fingerprinting_protection);
        assert!(plan.crates_idle());
        assert_eq!(
            plan.writes
                .iter()
                .find(|w| w.name == prefs::MODE)
                .map(|w| &w.value),
            Some(&PrefValue::Str("homogeneous"))
        );
    }

    #[test]
    fn pollution_native_compatible_idles_crates_keeps_rfp_off() {
        let plan = PrefApplyPlan::for_mode(Mode::Pollution, true);
        assert!(!plan.effects.resist_fingerprinting);
        assert!(plan.crates_idle());
    }

    #[test]
    fn recording_applicator_receives_all_writes() {
        let mut app = RecordingApplicator::default();
        let plan = app
            .apply_mode_effects(Mode::Pollution, false)
            .expect("apply");
        assert_eq!(app.writes.len(), plan.writes.len());
        assert_eq!(app.writes, plan.writes);
    }

    #[test]
    fn hook_sites_labeled() {
        assert_eq!(HookSite::NsHttp.as_str(), "nsHttp");
        assert_eq!(HookSite::DocShell.primary_crate(), "duppel-persona");
        assert!(persona_hook_sites().contains(&HookSite::CanvasAudio));
    }

    #[test]
    fn pref_names_match_proof_pin() {
        assert_eq!(pref_names::MODE, "darkstr.mode");
        assert_eq!(pref_names::NATIVE_COMPATIBLE, "darkstr.nativeCompatible");
        assert_eq!(pref_names::PRIVACY_RFP, "privacy.resistFingerprinting");
    }

    /// M2 observer table: Pollution → RFP/FPP false; enable crates unless nativeCompatible.
    #[test]
    fn m2_pollution_xor_table() {
        let armed = PrefApplyPlan::for_mode(Mode::Pollution, false);
        assert!(armed.is_xor_safe());
        assert!(armed.allow_persona_chaff());
        assert!(!armed.crates_idle());
        assert!(!armed.effects.resist_fingerprinting);
        assert!(!armed.effects.fingerprinting_protection);

        let escaped = PrefApplyPlan::for_mode(Mode::Pollution, true);
        assert!(escaped.is_xor_safe());
        assert!(!escaped.allow_persona_chaff());
        assert!(escaped.crates_idle());
        assert!(!escaped.effects.resist_fingerprinting);
        assert!(!escaped.effects.fingerprinting_protection);
    }

    /// M2 observer table: Homogeneous → stock RFP true / FPP stock; idle crates; no persona.
    #[test]
    fn m2_homogeneous_stock_rfp_table() {
        let plan = PrefApplyPlan::for_mode(Mode::Homogeneous, false);
        assert!(plan.is_xor_safe());
        assert!(!plan.allow_persona_chaff());
        assert!(plan.crates_idle());
        assert!(plan.effects.resist_fingerprinting);
        assert!(plan.effects.fingerprinting_protection);
        // Native-Compatible does not rewrite Homogeneous RFP restore.
        let with_native = PrefApplyPlan::for_mode(Mode::Homogeneous, true);
        assert!(with_native.is_xor_safe());
        assert!(with_native.crates_idle());
        assert!(with_native.effects.resist_fingerprinting);
    }

    /// Forbidden: Pollution with RFP still true via prefs applicator path.
    #[test]
    fn m2_forbidden_pollution_with_rfp_true_impossible_via_applicator() {
        for native in [false, true] {
            let mut app = RecordingApplicator::default();
            let plan = app
                .apply_mode_effects(Mode::Pollution, native)
                .expect("apply");
            assert!(
                plan.is_xor_safe(),
                "Pollution plan must be XOR-safe (native={native})"
            );
            assert!(
                !app.writes.iter().any(|w| {
                    w.name == prefs::PRIVACY_RFP && w.value == PrefValue::Bool(true)
                }),
                "applicator must never write RFP=true under Pollution"
            );
            assert!(
                !app.writes.iter().any(|w| {
                    w.name == prefs::PRIVACY_FPP && w.value == PrefValue::Bool(true)
                }),
                "applicator must never write FPP=true under Pollution"
            );
        }
    }

    #[test]
    fn apply_mode_effects_matches_persona_mode_pref_effects() {
        use duppel_persona::mode_pref_effects;
        for mode in [Mode::Homogeneous, Mode::Pollution] {
            for native in [false, true] {
                let mut app = RecordingApplicator::default();
                let plan = app.apply_mode_effects(mode, native).expect("apply");
                assert_eq!(plan.effects, mode_pref_effects(mode, native));
                assert!(plan.is_xor_safe());
            }
        }
    }
}
