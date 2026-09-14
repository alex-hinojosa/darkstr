//! `duppel-chaff` — tracking-pollution beacon schedules for darkstr Pollution mode.
//!
//! Phase 2 M4 control-plane API (no native network scheduler / no Gecko FFI yet).
//! Parity target: Phase 1 `poisoner.js` Quiet / Balanced / Loud timing + batch sizing.
//!
//! Gating: Pollution active XOR Homogeneous; respect Native-Compatible.
//! Prefs: `darkstr.mode`, `darkstr.nativeCompatible`, `darkstr.chaosLevel`
//! (see `duppel_persona::prefs`). Scheduler arms only when `pollution_active` /
//! `allow_chaff` (bridge: `PrefApplyPlan::allow_persona_chaff`).
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

use duppel_persona::{
    resolve_activation, Activation, ActivationInput, Mode, PersonaSnapshot,
};

/// Crate API version string.
pub const VERSION: &str = "0.1.0-phase2-m4";

/// Pref name for Quiet/Balanced/Loud (re-export pin).
pub const CHAOS_LEVEL_PREF: &str = duppel_persona::prefs::CHAOS_LEVEL;

/// Chaos / chaff intensity (Phase 1 `darkstr.chaosLevel`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ChaosLevel {
    Quiet,
    Balanced,
    Loud,
}

impl ChaosLevel {
    pub fn parse(raw: &str) -> Self {
        match raw {
            "quiet" | "stealth" => ChaosLevel::Quiet,
            "loud" | "chaos" => ChaosLevel::Loud,
            _ => ChaosLevel::Balanced,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ChaosLevel::Quiet => "quiet",
            ChaosLevel::Balanced => "balanced",
            ChaosLevel::Loud => "loud",
        }
    }
}

/// Inclusive minute range for the next alarm interval (Phase 1 `getNextInterval`).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IntervalRangeMinutes {
    pub min: f64,
    pub max: f64,
}

impl IntervalRangeMinutes {
    pub fn for_level(level: ChaosLevel) -> Self {
        match level {
            // Quiet: 8–20 min. Balanced: 3–8. Loud: 1–3.
            ChaosLevel::Quiet => Self { min: 8.0, max: 20.0 },
            ChaosLevel::Balanced => Self { min: 3.0, max: 8.0 },
            ChaosLevel::Loud => Self { min: 1.0, max: 3.0 },
        }
    }

    /// Pick next interval using `unit` in \[0, 1).
    pub fn sample(self, unit: f64) -> f64 {
        let u = unit.clamp(0.0, 0.999_999);
        self.min + u * (self.max - self.min)
    }
}

/// Inclusive beacon count range for one batch (Phase 1 `buildBatchConfigs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BatchSizeRange {
    pub min: u32,
    pub max: u32,
}

impl BatchSizeRange {
    pub fn for_level(level: ChaosLevel) -> Self {
        match level {
            ChaosLevel::Quiet => Self { min: 1, max: 1 },
            ChaosLevel::Balanced => Self { min: 1, max: 3 },
            ChaosLevel::Loud => Self { min: 5, max: 15 },
        }
    }

    /// Pick count using `unit` in \[0, 1).
    pub fn sample(self, unit: f64) -> u32 {
        if self.min == self.max {
            return self.min;
        }
        let u = unit.clamp(0.0, 0.999_999);
        let span = (self.max - self.min + 1) as f64;
        self.min + (u * span).floor() as u32
    }
}

/// Stagger delay between beacons inside a batch (milliseconds base).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StaggerMs {
    pub base: u32,
}

impl StaggerMs {
    pub fn for_level(level: ChaosLevel) -> Self {
        match level {
            ChaosLevel::Quiet => Self { base: 4000 },
            ChaosLevel::Balanced => Self { base: 1500 },
            ChaosLevel::Loud => Self { base: 500 },
        }
    }

    /// Per-beacon delay: `base * index` (Phase 1 poisoner stagger pattern).
    pub fn delay_for_index(self, index: u32) -> u32 {
        self.base.saturating_mul(index)
    }
}

/// Full schedule description for a chaos level — what the native scheduler will consume.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ChaffSchedule {
    pub level: ChaosLevel,
    pub interval: IntervalRangeMinutes,
    pub batch: BatchSizeRange,
    pub stagger: StaggerMs,
}

impl ChaffSchedule {
    pub fn for_level(level: ChaosLevel) -> Self {
        Self {
            level,
            interval: IntervalRangeMinutes::for_level(level),
            batch: BatchSizeRange::for_level(level),
            stagger: StaggerMs::for_level(level),
        }
    }

    /// Next fire interval in minutes from a unit random in \[0, 1).
    pub fn next_interval_minutes(self, unit: f64) -> f64 {
        self.interval.sample(unit)
    }

    /// Beacon count for one batch from a unit random in \[0, 1).
    pub fn batch_count(self, unit: f64) -> u32 {
        self.batch.sample(unit)
    }

    /// Volume label for Proof / PM skim (Quiet/Balanced/Loud parity).
    pub fn volume_label(self) -> &'static str {
        self.level.as_str()
    }
}

/// Endpoint class for pollution beacons (templates; no network I/O in this crate).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EndpointClass {
    Analytics,
    Ads,
    Social,
}

/// Static endpoint catalog entry (host + path template). Network fire stays out of crate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EndpointTemplate {
    pub class: EndpointClass,
    pub host: &'static str,
    pub path: &'static str,
}

/// Minimal endpoint list for schedule tests / future native scheduler wiring.
pub static ENDPOINT_TEMPLATES: &[EndpointTemplate] = &[
    EndpointTemplate {
        class: EndpointClass::Analytics,
        host: "www.google-analytics.com",
        path: "/g/collect",
    },
    EndpointTemplate {
        class: EndpointClass::Analytics,
        host: "www.google-analytics.com",
        path: "/collect",
    },
    EndpointTemplate {
        class: EndpointClass::Ads,
        host: "www.googleadservices.com",
        path: "/pagead/conversion",
    },
    EndpointTemplate {
        class: EndpointClass::Social,
        host: "www.facebook.com",
        path: "/tr/",
    },
];

/// In-memory pollution metrics counters (product dashboard / Proof).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PollutionMetrics {
    pub batches_planned: u64,
    pub beacons_planned: u64,
    pub batches_skipped_inactive: u64,
    pub scheduler_arms: u64,
    pub scheduler_cancels: u64,
}

impl PollutionMetrics {
    pub fn record_batch(&mut self, count: u32) {
        self.batches_planned += 1;
        self.beacons_planned += u64::from(count);
    }

    pub fn record_skip_inactive(&mut self) {
        self.batches_skipped_inactive += 1;
    }

    pub fn record_arm(&mut self) {
        self.scheduler_arms += 1;
    }

    pub fn record_cancel(&mut self) {
        self.scheduler_cancels += 1;
    }
}

/// Planned fire: interval + batch size + per-beacon stagger delays (control plane).
#[derive(Debug, Clone, PartialEq)]
pub struct ChaffFirePlan {
    pub level: ChaosLevel,
    pub interval_minutes: f64,
    pub beacon_count: u32,
    /// Delay in ms before each beacon index `0..beacon_count`.
    pub stagger_delays_ms: Vec<u32>,
}

impl ChaffFirePlan {
    pub fn from_schedule(schedule: ChaffSchedule, unit_interval: f64, unit_count: f64) -> Self {
        let beacon_count = schedule.batch_count(unit_count);
        let stagger_delays_ms = (0..beacon_count)
            .map(|i| schedule.stagger.delay_for_index(i))
            .collect();
        Self {
            level: schedule.level,
            interval_minutes: schedule.next_interval_minutes(unit_interval),
            beacon_count,
            stagger_delays_ms,
        }
    }
}

/// Native chaff scheduler arm plan (M4). Idle unless Pollution + allow_chaff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChaffSchedulerPlan {
    pub level: ChaosLevel,
    pub pollution_active: bool,
    pub allow_chaff: bool,
    /// True when a future native timer may schedule batches.
    pub armed: bool,
}

impl ChaffSchedulerPlan {
    /// Resolve from activation + chaos level (primary M4 gate).
    pub fn resolve(activation: &Activation, level: ChaosLevel) -> Self {
        let armed = activation.pollution_active && activation.allow_chaff;
        Self {
            level,
            pollution_active: activation.pollution_active,
            allow_chaff: activation.allow_chaff,
            armed,
        }
    }

    /// Bridge-facing gate: `allow_persona_chaff` from `PrefApplyPlan`.
    pub fn resolve_from_allow(allow_persona_chaff: bool, level: ChaosLevel) -> Self {
        Self {
            level,
            pollution_active: allow_persona_chaff,
            allow_chaff: allow_persona_chaff,
            armed: allow_persona_chaff,
        }
    }

    pub fn schedule(self) -> Option<ChaffSchedule> {
        if self.armed {
            Some(ChaffSchedule::for_level(self.level))
        } else {
            None
        }
    }
}

/// True when the native chaff scheduler may arm (Pollution + allow_chaff).
pub fn scheduler_armed(activation: &Activation) -> bool {
    activation.pollution_active && activation.allow_chaff
}

/// Plan a chaff batch only when Pollution surfaces are active.
pub fn plan_batch(
    level: ChaosLevel,
    activation: &Activation,
    unit_count: f64,
    metrics: &mut PollutionMetrics,
) -> Option<u32> {
    if !activation.allow_chaff {
        metrics.record_skip_inactive();
        return None;
    }
    let schedule = ChaffSchedule::for_level(level);
    let count = schedule.batch_count(unit_count);
    metrics.record_batch(count);
    Some(count)
}

/// Plan a full fire (interval + volume + stagger) when scheduler is armed.
pub fn plan_fire(
    level: ChaosLevel,
    activation: &Activation,
    unit_interval: f64,
    unit_count: f64,
    metrics: &mut PollutionMetrics,
) -> Option<ChaffFirePlan> {
    let plan = ChaffSchedulerPlan::resolve(activation, level);
    if !plan.armed {
        metrics.record_skip_inactive();
        return None;
    }
    let schedule = ChaffSchedule::for_level(level);
    let fire = ChaffFirePlan::from_schedule(schedule, unit_interval, unit_count);
    metrics.record_batch(fire.beacon_count);
    Some(fire)
}

/// Arm or cancel the scheduler bookkeeping (no timers in this crate).
pub fn apply_scheduler_plan(
    plan: &ChaffSchedulerPlan,
    metrics: &mut PollutionMetrics,
) -> bool {
    if plan.armed {
        metrics.record_arm();
        true
    } else {
        metrics.record_cancel();
        false
    }
}

/// Convenience: build activation then plan (tests / call sites without a prior Activation).
pub fn plan_batch_for_mode(
    mode: Mode,
    native_compatible: bool,
    rfp_likely: bool,
    level: ChaosLevel,
    unit_count: f64,
    metrics: &mut PollutionMetrics,
) -> Option<u32> {
    let activation = resolve_activation(ActivationInput {
        mode,
        native_compatible,
        rfp_likely,
    });
    plan_batch(level, &activation, unit_count, metrics)
}

/// Optional: derive a deterministic stagger jitter unit from persona canvas seed.
///
/// Control-plane helper only — does not claim live Gecko hooks. Returns unit in \[0, 1).
pub fn unit_from_persona_seed(snapshot: &PersonaSnapshot) -> f64 {
    let s = snapshot.depth_canvas_seed();
    (s as f64) / (u32::MAX as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use duppel_persona::ActivationInput;

    #[test]
    fn version_nonzero() {
        assert!(!VERSION.is_empty());
        assert!(VERSION.contains("m4"));
    }

    #[test]
    fn chaos_pref_name_pinned() {
        assert_eq!(CHAOS_LEVEL_PREF, "darkstr.chaosLevel");
    }

    #[test]
    fn chaos_aliases() {
        assert_eq!(ChaosLevel::parse("stealth"), ChaosLevel::Quiet);
        assert_eq!(ChaosLevel::parse("chaos"), ChaosLevel::Loud);
        assert_eq!(ChaosLevel::parse("nope"), ChaosLevel::Balanced);
    }

    #[test]
    fn schedule_ranges_match_phase1() {
        let q = ChaffSchedule::for_level(ChaosLevel::Quiet);
        assert_eq!(q.interval.min, 8.0);
        assert_eq!(q.interval.max, 20.0);
        assert_eq!(q.batch.min, 1);
        assert_eq!(q.batch.max, 1);
        assert_eq!(q.stagger.base, 4000);
        assert_eq!(q.volume_label(), "quiet");

        let b = ChaffSchedule::for_level(ChaosLevel::Balanced);
        assert_eq!(b.interval.min, 3.0);
        assert_eq!(b.batch.max, 3);
        assert_eq!(b.stagger.base, 1500);

        let l = ChaffSchedule::for_level(ChaosLevel::Loud);
        assert_eq!(l.interval.max, 3.0);
        assert_eq!(l.batch.min, 5);
        assert_eq!(l.batch.max, 15);
        assert_eq!(l.stagger.base, 500);
    }

    #[test]
    fn quiet_balanced_loud_volume_parity() {
        for (level, min_b, max_b, stagger) in [
            (ChaosLevel::Quiet, 1u32, 1u32, 4000u32),
            (ChaosLevel::Balanced, 1, 3, 1500),
            (ChaosLevel::Loud, 5, 15, 500),
        ] {
            let s = ChaffSchedule::for_level(level);
            assert_eq!(s.batch.min, min_b);
            assert_eq!(s.batch.max, max_b);
            assert_eq!(s.stagger.base, stagger);
            assert_eq!(s.stagger.delay_for_index(2), stagger * 2);
        }
    }

    #[test]
    fn interval_sample_stays_in_range() {
        let r = IntervalRangeMinutes::for_level(ChaosLevel::Balanced);
        let v = r.sample(0.5);
        assert!(v >= r.min && v <= r.max);
    }

    #[test]
    fn batch_gated_on_activation() {
        let mut metrics = PollutionMetrics::default();
        let active = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
        });
        let n = plan_batch(ChaosLevel::Quiet, &active, 0.0, &mut metrics).unwrap();
        assert_eq!(n, 1);
        assert_eq!(metrics.batches_planned, 1);

        let idle = resolve_activation(ActivationInput {
            mode: Mode::Homogeneous,
            native_compatible: false,
            rfp_likely: true,
        });
        assert!(plan_batch(ChaosLevel::Loud, &idle, 0.5, &mut metrics).is_none());
        assert_eq!(metrics.batches_skipped_inactive, 1);
    }

    #[test]
    fn scheduler_plan_gated_pollution_active_and_allow_chaff() {
        let active = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
        });
        assert!(scheduler_armed(&active));
        let plan = ChaffSchedulerPlan::resolve(&active, ChaosLevel::Balanced);
        assert!(plan.armed);
        assert!(plan.pollution_active);
        assert!(plan.allow_chaff);
        assert!(plan.schedule().is_some());

        let native = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: true,
            rfp_likely: false,
        });
        assert!(!scheduler_armed(&native));
        let cancelled = ChaffSchedulerPlan::resolve(&native, ChaosLevel::Loud);
        assert!(!cancelled.armed);
        assert!(cancelled.schedule().is_none());

        let rfp = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: true,
        });
        assert!(!ChaffSchedulerPlan::resolve(&rfp, ChaosLevel::Quiet).armed);

        // Bridge allow_persona_chaff mirror
        assert!(ChaffSchedulerPlan::resolve_from_allow(true, ChaosLevel::Quiet).armed);
        assert!(!ChaffSchedulerPlan::resolve_from_allow(false, ChaosLevel::Loud).armed);
    }

    #[test]
    fn plan_fire_includes_volume_and_timing() {
        let mut metrics = PollutionMetrics::default();
        let active = resolve_activation(ActivationInput {
            mode: Mode::Pollution,
            native_compatible: false,
            rfp_likely: false,
        });
        let fire = plan_fire(ChaosLevel::Loud, &active, 0.0, 0.0, &mut metrics).unwrap();
        assert_eq!(fire.level, ChaosLevel::Loud);
        assert_eq!(fire.beacon_count, 5); // unit 0 → min
        assert_eq!(fire.stagger_delays_ms.len(), 5);
        assert_eq!(fire.stagger_delays_ms[0], 0);
        assert_eq!(fire.stagger_delays_ms[1], 500);
        assert!(fire.interval_minutes >= 1.0 && fire.interval_minutes <= 3.0);

        let idle = resolve_activation(ActivationInput {
            mode: Mode::Homogeneous,
            native_compatible: false,
            rfp_likely: false,
        });
        assert!(plan_fire(ChaosLevel::Balanced, &idle, 0.5, 0.5, &mut metrics).is_none());
    }

    #[test]
    fn apply_scheduler_plan_records_arm_cancel() {
        let mut metrics = PollutionMetrics::default();
        let armed = ChaffSchedulerPlan::resolve_from_allow(true, ChaosLevel::Quiet);
        assert!(apply_scheduler_plan(&armed, &mut metrics));
        assert_eq!(metrics.scheduler_arms, 1);
        let idle = ChaffSchedulerPlan::resolve_from_allow(false, ChaosLevel::Quiet);
        assert!(!apply_scheduler_plan(&idle, &mut metrics));
        assert_eq!(metrics.scheduler_cancels, 1);
    }

    #[test]
    fn endpoints_catalog_nonempty() {
        assert!(!ENDPOINT_TEMPLATES.is_empty());
    }

    #[test]
    fn unit_from_persona_seed_in_unit_interval() {
        use duppel_persona::{generate_persona, Engine, HostOs, PersonaSeed};
        let snap = generate_persona(PersonaSeed(42), Engine::Firefox, HostOs::Linux).unwrap();
        let u = unit_from_persona_seed(&snap);
        assert!(u >= 0.0 && u < 1.0);
    }
}
