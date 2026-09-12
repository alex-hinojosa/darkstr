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
pub const VERSION: &str = "0.1.0-phase2-gecko-hooks";

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
}
