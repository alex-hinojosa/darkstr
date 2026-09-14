//! `duppel-bridge` — prefs applicator trait for future darkstr XPCOM / Gecko glue.
//!
//! Phase 2 sketch: no FFI, no `unsafe`. Chrome-process observers will call
//! [`PrefsApplicator::apply_mode_effects`] when `darkstr.mode` /
//! `darkstr.nativeCompatible` change. See `docs/GECKO-HOOKS.md`.
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

use duppel_persona::{
    cached_snapshot_readable, mode_pref_effects, prefs, Activation, ClientHintsPolicy,
    DocShellNavPhase, Mode, ModePrefEffects, NativePersonaPlan, PersonaSnapshot,
    WebExtMainInjectPolicy,
};

/// Crate API version string.
pub const VERSION: &str = "0.1.0-phase2-m3";

/// Re-export pref name constants for glue that only depends on this crate.
pub use duppel_persona::prefs as pref_names;

/// Gecko / LibreWolf call sites documented in `docs/GECKO-HOOKS.md`.
/// Used as labels for future wiring — not an FFI boundary by themselves.
///
/// M3 strengthens applicator surfaces for nsHttp / Navigator / DocShell; live
/// C++/XPCOM patches against a pinned train are **not** claimed in this public drop.
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

    /// Milestone label for docs / Proof skim (M2 prefs, M3 first native wins, M4 depth).
    pub fn milestone(self) -> &'static str {
        match self {
            HookSite::PrefObserver => "M2",
            HookSite::NsHttp | HookSite::Navigator | HookSite::DocShell => "M3",
            HookSite::CanvasAudio => "M4",
        }
    }

    /// Illustrative Gecko areas for Mini path checks (155.x train; verify locally).
    pub fn gecko_path_hints(self) -> &'static [&'static str] {
        match self {
            HookSite::PrefObserver => &[
                "modules/libpref/init/StaticPrefList.yaml",
                "browser/app/profile",
            ],
            HookSite::NsHttp => &[
                "netwerk/protocol/http/nsHttpHandler.cpp",
                "netwerk/protocol/http/nsHttpChannel.cpp",
            ],
            HookSite::Navigator => &[
                "dom/base/Navigator.cpp",
                "dom/webidl/Navigator.webidl",
            ],
            HookSite::DocShell => &[
                "docshell/base/nsDocShell.cpp",
                "docshell/base/nsDocShellLoadState.cpp",
            ],
            HookSite::CanvasAudio => &[
                "dom/canvas/CanvasRenderingContext2D.cpp",
                "dom/media/webaudio",
            ],
        }
    }
}

/// nsHttp applicator actions for M3 (Firefox host).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NsHttpAction {
    /// Override channel User-Agent from cached persona seed.
    OverrideUserAgent,
    /// REMOVE / omit Client Hints — never SET on Firefox personas.
    RemoveClientHints,
}

impl NsHttpAction {
    pub fn as_str(self) -> &'static str {
        match self {
            NsHttpAction::OverrideUserAgent => "override_user_agent",
            NsHttpAction::RemoveClientHints => "remove_client_hints",
        }
    }
}

/// Navigator DOM fields driven from the same persona seed as HTTP UA (M3 minimum set).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NavigatorField {
    UserAgent,
    Platform,
    HardwareConcurrency,
    DeviceMemory,
    Languages,
    // Screen / GPU / timezone deepen later; listed for coherence planning.
}

impl NavigatorField {
    pub fn as_str(self) -> &'static str {
        match self {
            NavigatorField::UserAgent => "userAgent",
            NavigatorField::Platform => "platform",
            NavigatorField::HardwareConcurrency => "hardwareConcurrency",
            NavigatorField::DeviceMemory => "deviceMemory",
            NavigatorField::Languages => "languages",
        }
    }
}

/// Typed applicator surface: which hook + what it does (M3 encoding of GECKO-HOOKS §2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HookApplicatorSurface {
    NsHttpUa,
    NsHttpClientHintsRemove,
    NavigatorBindings,
    DocShellStrictFirstDoc,
    WebExtMainInjectGate,
}

impl HookApplicatorSurface {
    pub fn as_str(self) -> &'static str {
        match self {
            HookApplicatorSurface::NsHttpUa => "nshttp_ua",
            HookApplicatorSurface::NsHttpClientHintsRemove => "nshttp_ch_remove",
            HookApplicatorSurface::NavigatorBindings => "navigator_bindings",
            HookApplicatorSurface::DocShellStrictFirstDoc => "docshell_strict_first_doc",
            HookApplicatorSurface::WebExtMainInjectGate => "webext_main_inject_gate",
        }
    }

    pub fn hook_site(self) -> HookSite {
        match self {
            HookApplicatorSurface::NsHttpUa | HookApplicatorSurface::NsHttpClientHintsRemove => {
                HookSite::NsHttp
            }
            HookApplicatorSurface::NavigatorBindings => HookSite::Navigator,
            HookApplicatorSurface::DocShellStrictFirstDoc => HookSite::DocShell,
            HookApplicatorSurface::WebExtMainInjectGate => HookSite::PrefObserver,
        }
    }
}

/// M3 first-native-wins applicator surfaces (excludes M4 canvas depth).
pub fn m3_applicator_surfaces() -> &'static [HookApplicatorSurface] {
    &[
        HookApplicatorSurface::NsHttpUa,
        HookApplicatorSurface::NsHttpClientHintsRemove,
        HookApplicatorSurface::NavigatorBindings,
        HookApplicatorSurface::DocShellStrictFirstDoc,
        HookApplicatorSurface::WebExtMainInjectGate,
    ]
}

/// nsHttp actions for Firefox host (UA override + CH REMOVE only).
pub fn firefox_nshttp_actions() -> &'static [NsHttpAction] {
    &[
        NsHttpAction::OverrideUserAgent,
        NsHttpAction::RemoveClientHints,
    ]
}

/// Minimum Navigator fields from the same seed as HTTP UA.
pub fn m3_navigator_fields() -> &'static [NavigatorField] {
    &[
        NavigatorField::UserAgent,
        NavigatorField::Platform,
        NavigatorField::HardwareConcurrency,
        NavigatorField::DeviceMemory,
        NavigatorField::Languages,
    ]
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

/// M3 hook sites only (excludes M4 canvas/audio depth).
pub fn m3_persona_hook_sites() -> &'static [HookSite] {
    &[HookSite::NsHttp, HookSite::Navigator, HookSite::DocShell]
}

/// Gate: glue may return a cached snapshot reference only when `pollution_active`.
///
/// Homogeneous / Native-Compatible / RFP-conflict → `None` (crates idle; no second seed).
pub fn read_cached_persona<'a>(
    activation: &Activation,
    cached: Option<&'a PersonaSnapshot>,
) -> Option<&'a PersonaSnapshot> {
    if cached_snapshot_readable(activation) {
        cached
    } else {
        None
    }
}

/// Firefox CH policy constant for nsHttp glue (never SET on darkstr host).
pub fn firefox_client_hints_policy() -> ClientHintsPolicy {
    ClientHintsPolicy::Remove
}

/// Build M3 native persona plan from activation + prefs (DocShell phase included).
pub fn native_persona_plan(
    activation: &Activation,
    native_persona_hooks: bool,
    strict_first_doc: bool,
    nav_phase: DocShellNavPhase,
) -> NativePersonaPlan {
    NativePersonaPlan::resolve(
        activation,
        native_persona_hooks,
        strict_first_doc,
        nav_phase,
    )
}

/// Convenience: whether WebExt MAIN inject should stay off under native path.
pub fn should_disable_webext_main_inject(plan: &NativePersonaPlan) -> bool {
    matches!(
        plan.main_inject,
        WebExtMainInjectPolicy::DisableNativePathActive
    )
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

    #[test]
    fn m3_hook_milestones_and_path_hints() {
        assert_eq!(HookSite::NsHttp.milestone(), "M3");
        assert_eq!(HookSite::PrefObserver.milestone(), "M2");
        assert_eq!(HookSite::CanvasAudio.milestone(), "M4");
        assert!(HookSite::NsHttp
            .gecko_path_hints()
            .iter()
            .any(|p| p.contains("nsHttpHandler")));
        assert!(HookSite::Navigator
            .gecko_path_hints()
            .iter()
            .any(|p| p.contains("Navigator")));
        assert!(HookSite::DocShell
            .gecko_path_hints()
            .iter()
            .any(|p| p.contains("nsDocShell")));
    }

    #[test]
    fn m3_applicator_surfaces_cover_gecko_hooks_section2() {
        let surfaces = m3_applicator_surfaces();
        assert!(surfaces.contains(&HookApplicatorSurface::NsHttpUa));
        assert!(surfaces.contains(&HookApplicatorSurface::NsHttpClientHintsRemove));
        assert!(surfaces.contains(&HookApplicatorSurface::NavigatorBindings));
        assert!(surfaces.contains(&HookApplicatorSurface::DocShellStrictFirstDoc));
        assert!(surfaces.contains(&HookApplicatorSurface::WebExtMainInjectGate));
        assert_eq!(
            HookApplicatorSurface::NsHttpClientHintsRemove.hook_site(),
            HookSite::NsHttp
        );
        assert!(!m3_persona_hook_sites().contains(&HookSite::CanvasAudio));
    }

    #[test]
    fn m3_firefox_nshttp_ch_remove_never_set() {
        let actions = firefox_nshttp_actions();
        assert!(actions.contains(&NsHttpAction::OverrideUserAgent));
        assert!(actions.contains(&NsHttpAction::RemoveClientHints));
        let ch = firefox_client_hints_policy();
        assert_eq!(ch, ClientHintsPolicy::Remove);
        assert!(!ch.allows_set());
        assert_eq!(ch.nshttp_action(), NsHttpAction::RemoveClientHints.as_str());
    }

    #[test]
    fn m3_read_cached_persona_gated_on_pollution_active() {
        use duppel_persona::{
            generate_persona, resolve_activation, ActivationInput, Engine, HostOs, PersonaSeed,
        };
        let snap = generate_persona(PersonaSeed(3), Engine::Firefox, HostOs::Linux).unwrap();
        let active = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
        });
        assert!(read_cached_persona(&active, Some(&snap)).is_some());

        let homo = resolve_activation(ActivationInput {
            mode: Mode::Homogeneous,
            native_compatible: false,
            rfp_likely: true,
        });
        assert!(read_cached_persona(&homo, Some(&snap)).is_none());

        let native = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: true,
            rfp_likely: false,
        });
        assert!(read_cached_persona(&native, Some(&snap)).is_none());
    }

    #[test]
    fn m3_native_plan_disables_main_inject_when_hooks_on() {
        use duppel_persona::{resolve_activation, ActivationInput};
        let active = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
        });
        let plan = native_persona_plan(
            &active,
            true,
            true,
            DocShellNavPhase::SubsequentNav,
        );
        assert!(plan.apply_native_persona);
        assert!(should_disable_webext_main_inject(&plan));
        assert!(plan.may_read_cached_snapshot());
        assert_eq!(plan.client_hints, ClientHintsPolicy::Remove);

        let first = native_persona_plan(
            &active,
            true,
            true,
            DocShellNavPhase::FirstDocument,
        );
        assert!(!first.apply_native_persona);
        assert!(should_disable_webext_main_inject(&first));
    }

    #[test]
    fn m3_navigator_minimum_fields() {
        let fields = m3_navigator_fields();
        assert!(fields.contains(&NavigatorField::UserAgent));
        assert!(fields.contains(&NavigatorField::Platform));
        assert_eq!(NavigatorField::UserAgent.as_str(), "userAgent");
    }
}
