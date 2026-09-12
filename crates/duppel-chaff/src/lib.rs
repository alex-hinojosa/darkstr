//! `duppel-chaff` — tracking-pollution beacon schedules for darkstr Pollution mode.
//!
//! Phase 2 control-plane API (no native network scheduler yet). Parity target:
//! Phase 1 `poisoner.js` Quiet / Balanced / Loud timing + batch sizing.
//!
//! Gating: Pollution active XOR Homogeneous; respect Native-Compatible.
//! Prefs: `darkstr.mode`, `darkstr.nativeCompatible` (see `duppel_persona::prefs`).
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

#![forbid(unsafe_code)]

use duppel_persona::{resolve_activation, Activation, ActivationInput, Mode};

/// Crate API version string.
pub const VERSION: &str = "0.1.0-phase2-m0.5";

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
}

impl PollutionMetrics {
    pub fn record_batch(&mut self, count: u32) {
        self.batches_planned += 1;
        self.beacons_planned += u64::from(count);
    }

    pub fn record_skip_inactive(&mut self) {
        self.batches_skipped_inactive += 1;
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use duppel_persona::ActivationInput;

    #[test]
    fn version_nonzero() {
        assert!(!VERSION.is_empty());
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

        let b = ChaffSchedule::for_level(ChaosLevel::Balanced);
        assert_eq!(b.interval.min, 3.0);
        assert_eq!(b.batch.max, 3);

        let l = ChaffSchedule::for_level(ChaosLevel::Loud);
        assert_eq!(l.interval.max, 3.0);
        assert_eq!(l.batch.min, 5);
        assert_eq!(l.batch.max, 15);
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
    fn endpoints_catalog_nonempty() {
        assert!(!ENDPOINT_TEMPLATES.is_empty());
    }
}
