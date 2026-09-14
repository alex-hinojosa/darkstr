//! `duppel-persona` — correlated fingerprint persona families for darkstr Pollution mode.
//!
//! Phase 2 control-plane API (no Gecko FFI yet). Source of truth for persona seed /
//! snapshot types that the fork will consume behind chrome prefs.
//!
//! Prefs (chrome / about:config, mirrored from Phase 1 WebExt storage keys):
//! - `darkstr.mode` = `homogeneous` | `pollution`
//! - `darkstr.nativeCompatible` = bool
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

/// Crate API version string (bumps when snapshot fields change).
pub const VERSION: &str = "0.1.0-phase2-m2";

/// Chrome / about:config pref names (stable Phase 1 → 2 Proof pin).
pub mod prefs {
    /// XOR mode: `"homogeneous"` | `"pollution"`.
    pub const MODE: &str = "darkstr.mode";
    /// Global Native-Compatible escape (bool). Independent of mode.
    pub const NATIVE_COMPATIBLE: &str = "darkstr.nativeCompatible";
    /// Per-site escape map (JSON object / profile file). Still WebExt-primary early.
    pub const NATIVE_COMPAT_SITES: &str = "darkstr.nativeCompatSites";
    /// Strict-first-document / next-nav coherence (bool, default true).
    pub const STRICT_FIRST_DOC: &str = "darkstr.strictFirstDoc";

    /// Browser prefs the fork auto-manages on mode change (not darkstr.* keys).
    pub const PRIVACY_RFP: &str = "privacy.resistFingerprinting";
    pub const PRIVACY_FPP: &str = "privacy.fingerprintingProtection";

    /// Legal string values for [`MODE`].
    pub const MODE_HOMOGENEOUS: &str = "homogeneous";
    pub const MODE_POLLUTION: &str = "pollution";
}

/// Product XOR mode. Illegal strings coerce to Homogeneous (safe default).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Mode {
    Homogeneous,
    Pollution,
}

impl Mode {
    pub fn parse(raw: &str) -> Self {
        match raw {
            prefs::MODE_POLLUTION => Mode::Pollution,
            _ => Mode::Homogeneous,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Homogeneous => prefs::MODE_HOMOGENEOUS,
            Mode::Pollution => prefs::MODE_POLLUTION,
        }
    }
}

/// Host engine filter. darkstr Phase 1/2 ships on Firefox/LibreWolf → Firefox families.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Engine {
    Firefox,
    Chromium,
}

impl Engine {
    pub fn as_str(self) -> &'static str {
        match self {
            Engine::Firefox => "firefox",
            Engine::Chromium => "chromium",
        }
    }
}

/// Host OS filter for persona family selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostOs {
    Windows,
    Macos,
    Linux,
}

impl HostOs {
    pub fn as_str(self) -> &'static str {
        match self {
            HostOs::Windows => "windows",
            HostOs::Macos => "macos",
            HostOs::Linux => "linux",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.to_ascii_lowercase().as_str() {
            "windows" | "win32" | "win64" => Some(HostOs::Windows),
            "macos" | "mac" | "darwin" | "macintosh" => Some(HostOs::Macos),
            "linux" | "chromeos" | "cros" | "x11" => Some(HostOs::Linux),
            _ => None,
        }
    }
}

/// Session seed that drives deterministic persona generation (Phase 1 `darkstr.sessionSeed`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PersonaSeed(pub u32);

impl PersonaSeed {
    pub fn new(value: u32) -> Self {
        Self(value)
    }

    pub fn value(self) -> u32 {
        self.0
    }
}

/// GPU vendor/renderer pair correlated with the UA family.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuInfo {
    pub vendor: &'static str,
    pub renderer: &'static str,
}

/// Screen geometry correlated into the persona snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub avail_height: u32,
}

/// Correlated persona snapshot — HTTP UA and JS navigator surfaces must agree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersonaSnapshot {
    pub seed: PersonaSeed,
    pub engine: Engine,
    pub os: HostOs,
    pub user_agent: &'static str,
    pub platform: &'static str,
    pub hardware_concurrency: u32,
    pub device_memory: u32,
    pub screen: ScreenInfo,
    pub color_depth: u32,
    pub gpu: GpuInfo,
    pub languages: &'static [&'static str],
    pub timezone: &'static str,
    pub canvas_seed: u32,
    pub audio_seed: u32,
}

impl PersonaSnapshot {
    /// Firefox personas never SET Client Hints (REMOVE / absent) — A1 coherence.
    pub fn client_hints_policy(&self) -> ClientHintsPolicy {
        match self.engine {
            Engine::Firefox => ClientHintsPolicy::Remove,
            Engine::Chromium => ClientHintsPolicy::SetFromUa,
        }
    }

    /// Basic internal coherence: platform string matches OS family; UA mentions Firefox when engine is Firefox.
    pub fn validate_internal(&self) -> Result<(), CoherenceError> {
        let ua = self.user_agent;
        match self.engine {
            Engine::Firefox if !ua.contains("Firefox/") => {
                return Err(CoherenceError::UaEngineMismatch);
            }
            Engine::Chromium if !ua.contains("Chrome/") => {
                return Err(CoherenceError::UaEngineMismatch);
            }
            _ => {}
        }
        match self.os {
            HostOs::Windows if !self.platform.contains("Win") => {
                return Err(CoherenceError::PlatformOsMismatch);
            }
            HostOs::Macos if !self.platform.contains("Mac") => {
                return Err(CoherenceError::PlatformOsMismatch);
            }
            HostOs::Linux if !self.platform.contains("Linux") => {
                return Err(CoherenceError::PlatformOsMismatch);
            }
            _ => {}
        }
        if self.timezone == "UTC" {
            // Pollution must not look like stock RFP UTC letterbox.
            return Err(CoherenceError::UtcTimezoneForbidden);
        }
        Ok(())
    }
}

/// Client Hints wire policy for a persona (Firefox host → REMOVE).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientHintsPolicy {
    Remove,
    SetFromUa,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoherenceError {
    UaEngineMismatch,
    PlatformOsMismatch,
    UtcTimezoneForbidden,
}

/// Inputs that decide whether persona / chaff surfaces may run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ActivationInput {
    pub mode: Mode,
    pub native_compatible: bool,
    /// True when RFP (or fork-equivalent) is still on — Phase 1 heuristic / fork pref.
    pub rfp_likely: bool,
}

/// Resolved activation — mirrors `extension/lib/modes.js` `resolveActivation`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Activation {
    pub mode: Mode,
    pub native_compatible: bool,
    pub rfp_likely: bool,
    pub rfp_conflict: bool,
    pub pollution_active: bool,
    pub homogeneous_active: bool,
    pub allow_persona: bool,
    pub allow_chaff: bool,
    pub reason: ActivationReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivationReason {
    Homogeneous,
    Pollution,
    NativeCompatible,
    RfpXorPollution,
}

impl ActivationReason {
    pub fn as_str(self) -> &'static str {
        match self {
            ActivationReason::Homogeneous => "homogeneous",
            ActivationReason::Pollution => "pollution",
            ActivationReason::NativeCompatible => "native_compatible",
            ActivationReason::RfpXorPollution => "rfp_xor_pollution",
        }
    }
}

/// Decide which Duppel surfaces may run. Crates must no-op unless `pollution_active`.
pub fn resolve_activation(input: ActivationInput) -> Activation {
    let rfp_conflict = input.mode == Mode::Pollution && input.rfp_likely;
    let pollution_active =
        input.mode == Mode::Pollution && !input.native_compatible && !rfp_conflict;
    let homogeneous_active = input.mode == Mode::Homogeneous;
    let reason = if rfp_conflict {
        ActivationReason::RfpXorPollution
    } else if input.native_compatible {
        ActivationReason::NativeCompatible
    } else if homogeneous_active {
        ActivationReason::Homogeneous
    } else {
        ActivationReason::Pollution
    };
    Activation {
        mode: input.mode,
        native_compatible: input.native_compatible,
        rfp_likely: input.rfp_likely,
        rfp_conflict,
        pollution_active,
        homogeneous_active,
        allow_persona: pollution_active,
        allow_chaff: pollution_active,
        reason,
    }
}

/// Pref side-effects the fork must apply when `darkstr.mode` changes.
/// Homogeneous restores stock LibreWolf RFP expectations — **no metric customization**.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModePrefEffects {
    pub resist_fingerprinting: bool,
    pub fingerprinting_protection: bool,
    /// When true, persona/chaff crates stay idle.
    pub crates_idle: bool,
}

/// Map mode (+ native escape) to the chrome privacy prefs the fork writes.
///
/// M2 observer XOR gates (authoritative table for prefs-path apply):
/// - **Pollution** → `privacy.resistFingerprinting=false`,
///   `privacy.fingerprintingProtection=false`; enable persona/chaff unless
///   `native_compatible` (crates_idle when escape is on).
/// - **Homogeneous** → stock RFP true / FPP stock-on restore; idle crates;
///   **no** RFP metric customization.
/// - **Forbidden:** Pollution with RFP still true via this prefs path
///   (`resist_fingerprinting` is always false under Pollution).
///
/// Native-Compatible does **not** rewrite mode; it only idles crates under Pollution.
pub fn mode_pref_effects(mode: Mode, native_compatible: bool) -> ModePrefEffects {
    match mode {
        Mode::Pollution => ModePrefEffects {
            resist_fingerprinting: false,
            fingerprinting_protection: false,
            crates_idle: native_compatible,
        },
        Mode::Homogeneous => ModePrefEffects {
            resist_fingerprinting: true,
            // Leave FPP aligned with LibreWolf stock RFP path (do not customize metrics).
            fingerprinting_protection: true,
            crates_idle: true,
        },
    }
}

// --- Seeded generation (mulberry32, parity with Phase 1 profiles.js) ---

struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as u32 as f64) / 4294967296.0
    }

    fn next_u32(&mut self) -> u32 {
        (self.next_f64() * 0xffff_ffff_u32 as f64) as u32
    }

    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        let idx = (self.next_f64() * items.len() as f64).floor() as usize;
        &items[idx.min(items.len() - 1)]
    }
}

#[derive(Clone, Copy)]
struct UaGroup {
    engine: Engine,
    os: HostOs,
    uas: &'static [&'static str],
    platform: &'static str,
    gpus: &'static [GpuInfo],
}

static FIREFOX_WINDOWS: UaGroup = UaGroup {
    engine: Engine::Firefox,
    os: HostOs::Windows,
    uas: &[
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
    ],
    platform: "Win32",
    gpus: &[
        GpuInfo {
            vendor: "Intel",
            renderer: "Intel(R) UHD Graphics 630",
        },
        GpuInfo {
            vendor: "NVIDIA Corporation",
            renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2",
        },
        GpuInfo {
            vendor: "ATI Technologies Inc.",
            renderer: "AMD Radeon RX 580",
        },
    ],
};

static FIREFOX_MACOS: UaGroup = UaGroup {
    engine: Engine::Firefox,
    os: HostOs::Macos,
    uas: &["Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0"],
    platform: "MacIntel",
    gpus: &[
        GpuInfo {
            vendor: "Apple",
            renderer: "Apple M1",
        },
        GpuInfo {
            vendor: "Apple",
            renderer: "Apple M2",
        },
        GpuInfo {
            vendor: "Intel Inc.",
            renderer: "Intel(R) Iris(R) Plus Graphics",
        },
    ],
};

static FIREFOX_LINUX: UaGroup = UaGroup {
    engine: Engine::Firefox,
    os: HostOs::Linux,
    uas: &[
        "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
        "Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0",
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
    ],
    platform: "Linux x86_64",
    gpus: &[
        GpuInfo {
            vendor: "Intel",
            renderer: "Mesa Intel(R) UHD Graphics 630 (CFL GT2)",
        },
        GpuInfo {
            vendor: "NVIDIA Corporation",
            renderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2",
        },
        GpuInfo {
            vendor: "AMD",
            renderer: "AMD Radeon RX 580 (radeonsi, polaris10, LLVM 15.0.7, DRM 3.54, 6.8.0)",
        },
    ],
};

static ALL_FIREFOX_GROUPS: &[&UaGroup] = &[&FIREFOX_WINDOWS, &FIREFOX_MACOS, &FIREFOX_LINUX];

static SCREENS: &[ScreenInfo] = &[
    ScreenInfo {
        width: 1920,
        height: 1080,
        avail_height: 1040,
    },
    ScreenInfo {
        width: 2560,
        height: 1440,
        avail_height: 1400,
    },
    ScreenInfo {
        width: 1366,
        height: 768,
        avail_height: 728,
    },
    ScreenInfo {
        width: 1536,
        height: 864,
        avail_height: 824,
    },
    ScreenInfo {
        width: 1440,
        height: 900,
        avail_height: 860,
    },
    ScreenInfo {
        width: 1680,
        height: 1050,
        avail_height: 1010,
    },
    ScreenInfo {
        width: 3840,
        height: 2160,
        avail_height: 2120,
    },
    ScreenInfo {
        width: 1280,
        height: 720,
        avail_height: 680,
    },
    ScreenInfo {
        width: 1600,
        height: 900,
        avail_height: 860,
    },
];

static CORES: &[u32] = &[2, 4, 6, 8, 10, 12, 16];
static MEMORY: &[u32] = &[4, 8];
static COLOR_DEPTHS: &[u32] = &[24];

static LANGUAGES: &[&[&str]] = &[
    &["en-US", "en"],
    &["en-US", "en", "es"],
    &["en-GB", "en"],
    &["en-US"],
    &["en-US", "en", "fr"],
    &["en-US", "en", "de"],
];

static TIMEZONES: &[&str] = &[
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "Europe/London",
    "Europe/Berlin",
    "America/Toronto",
];

fn groups_for(engine: Engine, os: HostOs) -> Vec<&'static UaGroup> {
    ALL_FIREFOX_GROUPS
        .iter()
        .copied()
        .filter(|g| g.engine == engine && g.os == os)
        .collect()
}

/// Generate a correlated persona for `engine` + `os` from `seed`.
/// Returns `None` if no family matches (e.g. Chromium requested — not shipped on darkstr host yet).
pub fn generate_persona(seed: PersonaSeed, engine: Engine, os: HostOs) -> Option<PersonaSnapshot> {
    let groups = groups_for(engine, os);
    if groups.is_empty() {
        return None;
    }
    let mut rng = Mulberry32::new(seed.value());
    let group = *rng.pick(&groups);
    let ua = *rng.pick(group.uas);
    let gpu = rng.pick(group.gpus).clone();
    let screen = *rng.pick(SCREENS);
    let languages = *rng.pick(LANGUAGES);
    Some(PersonaSnapshot {
        seed,
        engine: group.engine,
        os: group.os,
        user_agent: ua,
        platform: group.platform,
        hardware_concurrency: *rng.pick(CORES),
        device_memory: *rng.pick(MEMORY),
        screen,
        color_depth: *rng.pick(COLOR_DEPTHS),
        gpu,
        languages,
        timezone: *rng.pick(TIMEZONES),
        canvas_seed: rng.next_u32(),
        audio_seed: rng.next_u32(),
    })
}

/// Generate only when Pollution surfaces are active; otherwise `None` (crates idle).
pub fn generate_persona_if_active(
    seed: PersonaSeed,
    engine: Engine,
    os: HostOs,
    activation: &Activation,
) -> Option<PersonaSnapshot> {
    if !activation.allow_persona {
        return None;
    }
    generate_persona(seed, engine, os)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_nonzero() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn pref_names_match_proof_pin() {
        assert_eq!(prefs::MODE, "darkstr.mode");
        assert_eq!(prefs::NATIVE_COMPATIBLE, "darkstr.nativeCompatible");
        assert_eq!(prefs::MODE_HOMOGENEOUS, "homogeneous");
        assert_eq!(prefs::MODE_POLLUTION, "pollution");
    }

    #[test]
    fn mode_parse_coerces_illegal() {
        assert_eq!(Mode::parse("pollution"), Mode::Pollution);
        assert_eq!(Mode::parse("homogeneous"), Mode::Homogeneous);
        assert_eq!(Mode::parse("both"), Mode::Homogeneous);
        assert_eq!(Mode::parse(""), Mode::Homogeneous);
    }

    #[test]
    fn activation_xor_matrix() {
        let pollution_ok = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
        });
        assert!(pollution_ok.pollution_active);
        assert!(pollution_ok.allow_persona);
        assert_eq!(pollution_ok.reason, ActivationReason::Pollution);

        let rfp_conflict = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: true,
        });
        assert!(!rfp_conflict.pollution_active);
        assert!(rfp_conflict.rfp_conflict);
        assert_eq!(rfp_conflict.reason, ActivationReason::RfpXorPollution);

        let native = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: true,
            rfp_likely: false,
        });
        assert!(!native.pollution_active);
        assert_eq!(native.reason, ActivationReason::NativeCompatible);

        let homo = resolve_activation(ActivationInput {
            mode: Mode::Homogeneous,
            native_compatible: false,
            rfp_likely: true,
        });
        assert!(homo.homogeneous_active);
        assert!(!homo.allow_chaff);
    }

    #[test]
    fn pollution_auto_kills_rfp_fpp() {
        let e = mode_pref_effects(Mode::Pollution, false);
        assert!(!e.resist_fingerprinting);
        assert!(!e.fingerprinting_protection);
        assert!(!e.crates_idle);
    }

    #[test]
    fn homogeneous_restores_stock_rfp_no_metric_customization() {
        let e = mode_pref_effects(Mode::Homogeneous, false);
        assert!(e.resist_fingerprinting);
        assert!(e.fingerprinting_protection);
        assert!(e.crates_idle);
    }

    /// M2: Pollution + nativeCompatible keeps RFP/FPP off and idles crates.
    #[test]
    fn m2_pollution_native_compatible_idles_keeps_rfp_off() {
        let e = mode_pref_effects(Mode::Pollution, true);
        assert!(!e.resist_fingerprinting);
        assert!(!e.fingerprinting_protection);
        assert!(e.crates_idle);
    }

    /// M2: Homogeneous never enables persona/chaff regardless of native escape.
    #[test]
    fn m2_homogeneous_always_idles_crates() {
        assert!(mode_pref_effects(Mode::Homogeneous, false).crates_idle);
        assert!(mode_pref_effects(Mode::Homogeneous, true).crates_idle);
    }

    /// M2 forbidden combo: mode_pref_effects never returns RFP=true under Pollution.
    #[test]
    fn m2_forbidden_pollution_rfp_true_not_emitted() {
        for native in [false, true] {
            let e = mode_pref_effects(Mode::Pollution, native);
            assert!(
                !e.resist_fingerprinting,
                "Pollution must not emit RFP=true (native={native})"
            );
            assert!(
                !e.fingerprinting_protection,
                "Pollution must not emit FPP=true (native={native})"
            );
        }
    }

    #[test]
    fn seeded_persona_is_deterministic() {
        let a = generate_persona(PersonaSeed(42), Engine::Firefox, HostOs::Linux).unwrap();
        let b = generate_persona(PersonaSeed(42), Engine::Firefox, HostOs::Linux).unwrap();
        assert_eq!(a, b);
        a.validate_internal().unwrap();
        assert_eq!(a.client_hints_policy(), ClientHintsPolicy::Remove);
        assert!(a.user_agent.contains("Firefox/"));
        assert!(a.platform.contains("Linux"));
    }

    #[test]
    fn different_seeds_diverge() {
        let a = generate_persona(PersonaSeed(1), Engine::Firefox, HostOs::Windows).unwrap();
        let b = generate_persona(PersonaSeed(2), Engine::Firefox, HostOs::Windows).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn chromium_host_has_no_families_yet() {
        assert!(generate_persona(PersonaSeed(1), Engine::Chromium, HostOs::Linux).is_none());
    }

    #[test]
    fn inactive_mode_emits_no_persona() {
        let act = resolve_activation(ActivationInput {
            mode: Mode::Homogeneous,
            native_compatible: false,
            rfp_likely: true,
        });
        assert!(
            generate_persona_if_active(PersonaSeed(9), Engine::Firefox, HostOs::Linux, &act)
                .is_none()
        );
    }
}
